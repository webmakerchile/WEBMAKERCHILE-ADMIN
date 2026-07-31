/**
 * PDFs del contrato generados en el SERVIDOR con la plantilla WebMaker.
 *
 * Antes el navegador dibujaba estos documentos con jspdf y salían con otra
 * pinta que la cotización oficial. Ahora hay dos rutas:
 *
 *  - POST /hub/contracts/docs/pdf        → renderiza y DEVUELVE un PDF
 *    (descarga directa; funciona aunque Google Drive no esté conectado).
 *  - POST /hub/contracts/docs/regenerar  → renderiza cliente y/o técnico,
 *    los sube a Drive (carpeta del Hub) y devuelve enlaces + hashes de
 *    frescura. Sin Google conectado responde 409 `google_no_conectado`
 *    para que el panel lo diga claro y ofrezca conectar.
 *
 * Permisos: además del gate de área de /hub (routes/index.ts), aquí se
 * verifica el rol contra la base: se exige el scope "contracts" y, para el
 * documento CLIENTE (lleva precios impresos), poder ver montos. La censura
 * de dinero de lib/contract-view quedaría en nada si esta ruta imprimiera
 * los precios para cualquiera.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { canSeeMoney, hubScopesFor, normalizeRole } from "@workspace/roles";
import { z } from "zod";
import { htmlToPdf, SinChromiumError } from "../cotizaciones/pdf";
import {
  renderContratoClienteHTML,
  renderContratoTecnicoHTML,
  type BriefContrato,
  type DocContrato,
} from "../cotizaciones/contrato-template";
import { hashBriefContrato, hashDocContrato } from "../../lib/contrato-hash";
import { driveDe, resolverCarpeta, sinGoogle } from "../drive";
import { mensajeErrorGoogle } from "../../lib/google-auth";

const router: IRouter = Router();

/* ------------------------------------------------------------------ */

const moduloSchema = z.object({
  id: z.string().optional(),
  name: z.coerce.string().default(""),
  desc: z.coerce.string().default(""),
  price: z.coerce.number().catch(0).default(0),
});

const docSchema = z.object({
  client: z.coerce.string().default(""),
  project: z.coerce.string().default(""),
  scope: z.coerce.string().default(""),
  date: z.coerce.string().default(""),
  advisor: z.coerce.string().default(""),
  modules: z.array(moduloSchema).default([]),
  downPct: z.coerce.number().catch(50).default(50),
  notes: z.coerce.string().default(""),
  monthly: z.coerce.string().default(""),
  monthlyPrice: z.coerce.string().default(""),
  validityDays: z.coerce.number().catch(15).default(15),
});

const briefSchema = z.object({
  objetivo: z.coerce.string().default(""),
  contexto: z.coerce.string().default(""),
  alcance: z
    .array(
      z.object({
        modulo: z.coerce.string().default(""),
        descripcion: z.coerce.string().default(""),
        entregables: z.array(z.coerce.string()).default([]),
        requisitos: z.array(z.coerce.string()).default([]),
      })
    )
    .default([]),
  criteriosAceptacion: z.array(z.coerce.string()).default([]),
  fueraDeAlcance: z.array(z.coerce.string()).default([]),
  stackSugerido: z.array(z.coerce.string()).default([]),
  hitos: z.array(z.object({ nombre: z.coerce.string().default(""), detalle: z.coerce.string().default("") })).default([]),
});

/* ------------------------------------------------------------------ */

/** Rol real desde la base (nunca desde la sesión), como el resto del Hub. */
async function rolDe(req: Request): Promise<string | null> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) return null;
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!me) return null;
  return normalizeRole(me.teamRole, me.role === "superadmin");
}

interface Permisos {
  role: string;
  contratos: boolean;
  dinero: boolean;
}

async function permisosDe(req: Request): Promise<Permisos | null> {
  const role = await rolDe(req);
  if (!role) return null;
  return {
    role,
    contratos: (hubScopesFor(role) as readonly string[]).includes("contracts"),
    dinero: canSeeMoney(role),
  };
}

const nombreArchivo = (prefijo: string, cliente: string): string =>
  `${prefijo}-${(cliente || "cliente").trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, "") || "cliente"}-${new Date().toISOString().slice(0, 10)}.pdf`;

function responderErrorPdf(res: Response, e: unknown, contexto: string): void {
  if (e instanceof SinChromiumError) {
    res.status(503).json({ error: e.message, code: e.code });
    return;
  }
  console.error(`[${contexto}]`, e);
  res.status(500).json({
    error: e instanceof Error ? e.message : "No se pudo generar el PDF",
    code: "pdf_fallo",
  });
}

/* ------------------------------------------------------------------
   POST /hub/contracts/docs/pdf — render directo (descarga)
   ------------------------------------------------------------------ */

router.post("/hub/contracts/docs/pdf", async (req: Request, res: Response) => {
  const permisos = await permisosDe(req);
  if (!permisos) { res.status(401).json({ error: "No autenticado" }); return; }
  if (!permisos.contratos) { res.status(403).json({ error: "Tu rol no tiene acceso a contratos" }); return; }

  const { tipo } = (req.body ?? {}) as { tipo?: string };
  if (tipo !== "cliente" && tipo !== "tecnico") {
    res.status(400).json({ error: 'tipo debe ser "cliente" o "tecnico"' });
    return;
  }

  try {
    let html: string;
    let nombre: string;

    if (tipo === "cliente") {
      if (!permisos.dinero) {
        res.status(403).json({ error: "Tu rol no puede generar el documento comercial (lleva montos)" });
        return;
      }
      const doc = docSchema.safeParse((req.body as { doc?: unknown }).doc ?? null);
      if (!doc.success) { res.status(400).json({ error: "Falta el documento estructurado de la cotización" }); return; }
      html = renderContratoClienteHTML(doc.data as DocContrato);
      nombre = nombreArchivo("Cotizacion", doc.data.client);
    } else {
      const brief = briefSchema.safeParse((req.body as { brief?: unknown }).brief ?? null);
      if (!brief.success) { res.status(400).json({ error: "Falta el brief técnico del contrato" }); return; }
      const docLoose = docSchema.safeParse((req.body as { doc?: unknown }).doc ?? {});
      const meta = docLoose.success ? (docLoose.data as Partial<DocContrato>) : null;
      html = renderContratoTecnicoHTML(brief.data as BriefContrato, meta);
      nombre = nombreArchivo("Documento-Tecnico", meta?.client || "");
    }

    const pdf = await htmlToPdf(html);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.send(pdf);
  } catch (e) {
    // Un documento incompleto (sin módulos, brief vacío) llega como Error
    // normal: es culpa de los datos, no del servidor.
    if (e instanceof Error && !(e instanceof SinChromiumError) && /documento|brief/i.test(e.message)) {
      res.status(400).json({ error: e.message });
      return;
    }
    responderErrorPdf(res, e, "hub/contracts/docs/pdf");
  }
});

/* ------------------------------------------------------------------
   POST /hub/contracts/docs/regenerar — render + subida a Drive
   ------------------------------------------------------------------ */

interface ArchivoSubido {
  url: string;
  title: string;
  uploadedAt: number;
}

router.post("/hub/contracts/docs/regenerar", async (req: Request, res: Response) => {
  const permisos = await permisosDe(req);
  if (!permisos) { res.status(401).json({ error: "No autenticado" }); return; }
  if (!permisos.contratos) { res.status(403).json({ error: "Tu rol no tiene acceso a contratos" }); return; }

  const body = (req.body ?? {}) as { doc?: unknown; brief?: unknown; meta?: unknown };
  const conDoc = body.doc != null;
  const conBrief = body.brief != null;
  // `meta` solo aporta encabezado (cliente/proyecto/fecha) al PDF técnico
  // cuando se regenera únicamente el brief; nunca imprime montos.
  let meta: Partial<DocContrato> | null = null;
  if (body.meta != null) {
    const m = docSchema.safeParse(body.meta);
    if (m.success) meta = m.data as Partial<DocContrato>;
  }
  if (!conDoc && !conBrief) {
    res.status(400).json({ error: "Se requiere el documento y/o el brief técnico" });
    return;
  }
  if (conDoc && !permisos.dinero) {
    res.status(403).json({ error: "Tu rol no puede regenerar el documento comercial (lleva montos)" });
    return;
  }

  const drive = driveDe(req.user);
  if (!drive) { sinGoogle(res); return; }

  // 1) Renderizar TODO primero: si falta Chromium o el documento está
  //    incompleto, no queda nada a medio subir en Drive.
  let doc: DocContrato | null = null;
  let brief: BriefContrato | null = null;
  let pdfCliente: Buffer | null = null;
  let pdfTecnico: Buffer | null = null;
  try {
    if (conDoc) {
      const parsed = docSchema.safeParse(body.doc);
      if (!parsed.success) { res.status(400).json({ error: "El documento de la cotización no es válido" }); return; }
      doc = parsed.data as DocContrato;
      pdfCliente = await htmlToPdf(renderContratoClienteHTML(doc));
    }
    if (conBrief) {
      const parsed = briefSchema.safeParse(body.brief);
      if (!parsed.success) { res.status(400).json({ error: "El brief técnico no es válido" }); return; }
      brief = parsed.data as BriefContrato;
      pdfTecnico = await htmlToPdf(renderContratoTecnicoHTML(brief, doc ?? meta ?? undefined));
    }
  } catch (e) {
    if (e instanceof Error && !(e instanceof SinChromiumError) && /documento|brief/i.test(e.message)) {
      res.status(400).json({ error: e.message });
      return;
    }
    responderErrorPdf(res, e, "hub/contracts/docs/regenerar");
    return;
  }

  // 2) Subir a la carpeta del Hub. Si algo falla aquí, se devuelve lo que
  //    alcanzó a subir para que el panel no pierda esos enlaces.
  const out: {
    pdf?: ArchivoSubido;
    brief?: ArchivoSubido;
    docHash?: string;
    briefHash?: string;
  } = {};
  if (doc) out.docHash = hashDocContrato(doc);
  if (brief) out.briefHash = hashBriefContrato(brief);

  const parentId = await resolverCarpeta("hub");

  const subir = async (buffer: Buffer, nombre: string): Promise<ArchivoSubido> => {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    const meta: { name: string; mimeType: string; parents?: string[] } = {
      name: nombre,
      mimeType: "application/pdf",
    };
    if (parentId) meta.parents = [parentId];
    const r = await drive.files.create({
      requestBody: meta,
      media: { mimeType: "application/pdf", body: stream },
      fields: "id,name,webViewLink",
    });
    return {
      url: r.data.webViewLink || "",
      title: r.data.name || nombre,
      uploadedAt: Date.now(),
    };
  };

  try {
    if (pdfCliente && doc) out.pdf = await subir(pdfCliente, nombreArchivo("Cotizacion", doc.client));
    if (pdfTecnico) out.brief = await subir(pdfTecnico, nombreArchivo("Documento-Tecnico", doc?.client || meta?.client || ""));
    res.json(out);
  } catch (e) {
    console.error("[hub/contracts/docs/regenerar] subida a Drive:", e instanceof Error ? e.message : e);
    res.status(502).json({
      error: mensajeErrorGoogle(e),
      code: "drive_fallo",
      // Lo que sí alcanzó a subir (y sus hashes) para no perderlo.
      parcial: out,
    });
  }
});

export default router;
