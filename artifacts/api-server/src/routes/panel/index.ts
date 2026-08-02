import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { canSeeMoney } from "@workspace/roles";
import { PanelError, panelConfigurado, panelGet, panelPatch, panelPost } from "../../lib/panel/cliente";
import {
  conteoPorRecurso,
  esRecursoPanel,
  estadoSyncFila,
  guardarRegistros,
  leerEspejo,
  leerRegistro,
} from "../../lib/panel/espejo";
import { sincronizarPanel } from "../../lib/panel/sync";
import { guardarVista, limpiarCacheVistas, vistaEnCache } from "../../lib/panel/cache-vistas";

/**
 * Sección Agencia: espejo del panel autoadministrable de webmakerlatam.com.
 *
 * Lecturas: del espejo local (listados) o del panel en vivo con caché corta
 * (vistas y resúmenes, que ya vienen calculados — acá no se re-hace ninguna
 * matemática de plata). Escrituras: SIEMPRE delegadas al panel, que es la
 * única fuente de verdad; lo que devuelve se refleja al instante en el espejo.
 */

const router: IRouter = Router();

/* ------------------------------------------------------------------ */
/* Permisos: datos del negocio → solo roles que ven dinero.            */
/* El rol se lee SIEMPRE de la base, nunca de la sesión (como el Hub). */
/* ------------------------------------------------------------------ */

async function puedeVerAgencia(req: Request): Promise<boolean> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) return false;
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!me) return false;
  return canSeeMoney(me.teamRole, me.role === "superadmin");
}

router.use("/panel", (req: Request, res: Response, next: NextFunction) => {
  puedeVerAgencia(req)
    .then((ok) => {
      if (!ok) {
        res.status(403).json({ error: "Tu rol no tiene acceso a los datos del negocio" });
        return;
      }
      next();
    })
    .catch(next);
});

/** Envuelve una ruta: PanelError y Zod se traducen a respuestas honestas. */
const conPanel =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof PanelError) {
        res.status(e.status).json({ error: e.codigo, mensaje: e.message });
        return;
      }
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: "datos_invalidos", mensaje: "Revisá los campos del formulario.", detalles: e.issues.slice(0, 5) });
        return;
      }
      next(e);
    }
  };

/* ------------------------------------------------------------------ */
/* Caché corta para vistas en vivo (el sync manual la limpia).          */
/* ------------------------------------------------------------------ */

async function vistaCacheada(res: Response, clave: string, carga: () => Promise<unknown>): Promise<void> {
  const hit = vistaEnCache(clave);
  if (hit !== undefined) {
    res.json(hit);
    return;
  }
  const datos = await carga();
  guardarVista(clave, datos);
  res.json(datos);
}

/* ------------------------------------------------------------------ */
/* Estado del sync + sync manual                                        */
/* ------------------------------------------------------------------ */

router.get(
  "/panel/estado",
  conPanel(async (_req, res) => {
    const [fila, porRecurso] = await Promise.all([estadoSyncFila(), conteoPorRecurso()]);
    res.json({
      configurado: panelConfigurado(),
      cursor: fila.cursor,
      ultimaCorrida: fila.ultimaCorrida,
      ultimoExito: fila.ultimoExito,
      ultimoError: fila.ultimoError,
      detalle: fila.detalle,
      porRecurso,
    });
  })
);

router.post(
  "/panel/sync",
  conPanel(async (_req, res) => {
    const resultado = await sincronizarPanel("manual");
    limpiarCacheVistas();
    res.json(resultado);
  })
);

/* ------------------------------------------------------------------ */
/* Espejo local: listados y registro puntual                            */
/* ------------------------------------------------------------------ */

router.get(
  "/panel/espejo/:recurso",
  conPanel(async (req, res) => {
    const recurso = String(req.params.recurso);
    if (!esRecursoPanel(recurso)) {
      res.status(404).json({ error: "recurso_desconocido", mensaje: `No existe el recurso "${recurso}".` });
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const num = (v: string | undefined) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
    res.json(
      await leerEspejo(recurso, {
        q: q.q,
        status: q.status,
        clientId: q.clientId,
        projectId: q.projectId,
        contractId: q.contractId,
        limite: num(q.limite),
        offset: num(q.offset),
      })
    );
  })
);

router.get(
  "/panel/espejo/:recurso/:id",
  conPanel(async (req, res) => {
    const recurso = String(req.params.recurso);
    if (!esRecursoPanel(recurso)) {
      res.status(404).json({ error: "recurso_desconocido", mensaje: `No existe el recurso "${recurso}".` });
      return;
    }
    const datos = await leerRegistro(recurso, String(req.params.id));
    if (!datos) {
      res.status(404).json({ error: "no_encontrado", mensaje: "Ese registro todavía no está en el espejo." });
      return;
    }
    res.json({ datos });
  })
);

/* ------------------------------------------------------------------ */
/* Vistas en vivo del panel (ya calculadas allá; acá solo se muestran)  */
/* ------------------------------------------------------------------ */

router.get(
  "/panel/resumen",
  conPanel(async (_req, res) => {
    await vistaCacheada(res, "resumen", () => panelGet("/resumen"));
  })
);

router.get(
  "/panel/mantenimiento/resumen",
  conPanel(async (_req, res) => {
    await vistaCacheada(res, "mantenimiento", () => panelGet("/mantenimiento/resumen"));
  })
);

router.get(
  "/panel/finanzas/resumen",
  conPanel(async (req, res) => {
    const anio = String(req.query.anio ?? "");
    await vistaCacheada(res, `finanzas:${anio}`, () => panelGet("/finanzas/resumen", { params: { anio: anio || undefined } }));
  })
);

router.get(
  "/panel/contratos",
  conPanel(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const params = { tipo: q.tipo, estado: q.estado, q: q.q, limite: q.limite, offset: q.offset };
    await vistaCacheada(res, `contratos:${JSON.stringify(params)}`, () => panelGet("/contratos", { params }));
  })
);

router.get(
  "/panel/plantillas-contrato",
  conPanel(async (_req, res) => {
    await vistaCacheada(res, "plantillas", () => panelGet("/plantillas-contrato"));
  })
);

/** Detalle en vivo de un registro (el endpoint de detalle trae textos completos). */
router.get(
  "/panel/vistas/:recurso/:id",
  conPanel(async (req, res) => {
    const recurso = String(req.params.recurso);
    if (!esRecursoPanel(recurso)) {
      res.status(404).json({ error: "recurso_desconocido", mensaje: `No existe el recurso "${recurso}".` });
      return;
    }
    const id = encodeURIComponent(String(req.params.id));
    await vistaCacheada(res, `vista:${recurso}:${id}`, () => panelGet(`/${recurso}/${id}`));
  })
);

/* ------------------------------------------------------------------ */
/* Escritura delegada: el panel genera todo (ids, links, PDFs, cascada) */
/* ------------------------------------------------------------------ */

const esqCliente = z
  .object({
    companyName: z.string().trim().min(1, "Falta el nombre de la empresa"),
    rut: z.string().trim().optional(),
    billingRut: z.string().trim().optional(),
    contactName: z.string().trim().optional(),
    contactEmail: z.string().trim().optional(),
    contactPhone: z.string().trim().optional(),
    address: z.string().trim().optional(),
  })
  .strip();

router.post(
  "/panel/clientes",
  conPanel(async (req, res) => {
    const cuerpo = esqCliente.parse(req.body ?? {});
    const resp = await panelPost<{ ok: boolean; creado?: boolean; datos: Record<string, unknown> }>("/clientes", cuerpo);
    if (resp?.datos?.id) await guardarRegistros("clientes", [resp.datos]);
    limpiarCacheVistas();
    res.json(resp);
  })
);

const esqItem = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

/** El panel calcula subtotal/IVA/total — acá jamás se manda plata calculada. */
const esqPresupuesto = z
  .object({
    clienteId: z.string().trim().optional(),
    cliente: esqCliente.optional(),
    items: z.array(esqItem).min(1, "Agregá al menos un ítem"),
    hasIVA: z.boolean().optional(),
    discount: z.number().min(0).optional(),
    paymentModality: z.string().trim().optional(),
    installmentCount: z.number().int().positive().optional(),
    customPaymentTerms: z.string().trim().optional(),
    maintenanceType: z.string().trim().optional(),
    monthlyMaintenance: z.number().min(0).optional(),
    notes: z.string().trim().optional(),
    validUntil: z.string().trim().optional(),
    includeContract: z.boolean().optional(),
    estado: z.enum(["DRAFT", "SENT"]).optional(),
  })
  .strip()
  .refine((v) => v.clienteId || v.cliente, { message: "Elegí un cliente o creá uno nuevo" });

router.post(
  "/panel/presupuestos",
  conPanel(async (req, res) => {
    const cuerpo = esqPresupuesto.parse(req.body ?? {});
    const resp = await panelPost<{ ok: boolean; datos: Record<string, unknown>; calculo?: unknown; items?: unknown }>(
      "/presupuestos",
      cuerpo
    );
    if (resp?.datos?.id) await guardarRegistros("presupuestos", [resp.datos]);
    limpiarCacheVistas();
    res.json(resp);
  })
);

const esqContrato = z
  .object({
    presupuestoId: z.string().trim().min(1, "Falta el presupuesto"),
    clientRepresentativeName: z.string().trim().optional(),
    clientRepresentativeRut: z.string().trim().optional(),
    plantillaId: z.string().trim().optional(),
    contenido: z.string().optional(),
    estado: z.enum(["DRAFT", "PENDING_SIGNATURE"]).optional(),
    forzarNuevo: z.boolean().optional(),
  })
  .strip();

router.post(
  "/panel/contratos-servicio",
  conPanel(async (req, res) => {
    const cuerpo = esqContrato.parse(req.body ?? {});
    const resp = await panelPost<{ ok: boolean; creado?: boolean; datos: Record<string, unknown> }>(
      "/contratos-servicio",
      cuerpo
    );
    if (resp?.datos?.id) await guardarRegistros("contratos-servicio", [resp.datos]);
    limpiarCacheVistas();
    res.json(resp);
  })
);

/** SIGNED y APPROVED no existen acá a propósito: esos pasos son del cliente. */
const esqPatchPresupuesto = z
  .object({
    estado: z.enum(["DRAFT", "SENT", "REJECTED", "EXPIRED"]).optional(),
    notes: z.string().optional(),
    validUntil: z.string().nullable().optional(),
  })
  .strip();

router.patch(
  "/panel/presupuestos/:id",
  conPanel(async (req, res) => {
    const cuerpo = esqPatchPresupuesto.parse(req.body ?? {});
    const id = encodeURIComponent(String(req.params.id));
    const resp = await panelPatch<{ ok: boolean; datos: Record<string, unknown> }>(`/presupuestos/${id}`, cuerpo);
    if (resp?.datos?.id) await guardarRegistros("presupuestos", [resp.datos]);
    limpiarCacheVistas();
    res.json(resp);
  })
);

const esqPatchContrato = z
  .object({
    estado: z.enum(["DRAFT", "PENDING_SIGNATURE", "EXPIRED"]).optional(),
    contenido: z.string().optional(),
  })
  .strip();

router.patch(
  "/panel/contratos-servicio/:id",
  conPanel(async (req, res) => {
    const cuerpo = esqPatchContrato.parse(req.body ?? {});
    const id = encodeURIComponent(String(req.params.id));
    const resp = await panelPatch<{ ok: boolean; datos: Record<string, unknown> }>(`/contratos-servicio/${id}`, cuerpo);
    if (resp?.datos?.id) await guardarRegistros("contratos-servicio", [resp.datos]);
    limpiarCacheVistas();
    res.json(resp);
  })
);

const esqLead = z
  .object({
    name: z.string().trim().min(1, "Falta el nombre"),
    email: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    message: z.string().trim().optional(),
    serviceInterest: z.string().trim().optional(),
  })
  .strip();

router.post(
  "/panel/leads",
  conPanel(async (req, res) => {
    const cuerpo = esqLead.parse(req.body ?? {});
    const resp = await panelPost<{ ok: boolean; datos: Record<string, unknown> }>("/leads", cuerpo);
    if (resp?.datos?.id) await guardarRegistros("leads", [resp.datos]);
    res.json(resp);
  })
);

export default router;
