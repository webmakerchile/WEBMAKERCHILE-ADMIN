import { clienteGoogleDe, MENSAJE_SIN_GOOGLE, type UsuarioConGoogle } from "../../lib/google-auth";
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubState, users } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { ALL_HUB_SCOPES, canSeeMoney, hubScopesFor, hubWriteScopesFor, normalizeRole, type HubScope } from "@workspace/roles";
import { google } from "googleapis";
import { PDFParse } from "pdf-parse";
import OpenAI from "openai";
import { z } from "zod";
import { mergeCollection, type HubEntity } from "../../lib/hub-merge";
import { resolveBoard, saveBoard } from "../../lib/hub-board";
import { recordActivity } from "../../lib/activity";
import { redactContracts, stripMoneyFromText } from "../../lib/contract-view";
import { handoffContractClosed, handoffProjectDelivered } from "../../lib/handoffs";
import { buildCeoAvisos, diffHubEntities, entityLabel, entityState } from "../../lib/hub-diff";
import { notifyCeos } from "../../lib/notifications";

const router: IRouter = Router();

// Estructura mínima del blob hub_state.data que persiste el Hub Ejecutivo
// (ver HubState en admin-panel/src/pages/ejecutivo.tsx). Cada colección es un
// array de objetos; se dejan opcionales para tolerar blobs antiguos parciales.
const hubEntityArray = z.array(z.record(z.unknown()));
const hubDataSchema = z
  .object({
    projects: hubEntityArray.optional(),
    clients: hubEntityArray.optional(),
    meetings: hubEntityArray.optional(),
    notes: hubEntityArray.optional(),
    tasks: hubEntityArray.optional(),
    contracts: hubEntityArray.optional(),
  })
  .passthrough();
const MAX_HUB_BYTES = 2 * 1024 * 1024; // 2 MB

type AuthedUser = { id: number; email?: string; name?: string; googleAccessToken?: string; googleRefreshToken?: string };
function getUser(req: Request): AuthedUser {
  return req.user as AuthedUser;
}

/** Carga al usuario autenticado desde la DB: el rol se verifica siempre contra la base, no contra la sesión. */
async function loadMe(req: Request) {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) return null;
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  return me ?? null;
}

/**
 * Cliente OAuth del usuario, o null si su cuenta no tiene Google conectado.
 * Construir uno con tokens nulos hacía que googleapis reventara mucho después,
 * a mitad de flujo, con un mensaje que no le dice nada a nadie.
 */
function getGoogleAuth(user: AuthedUser) {
  return clienteGoogleDe(user as UsuarioConGoogle);
}

/* ------------------------------------------------------------------
   Tablero compartido.

   El Hub es UN solo tablero para toda la agencia — el de la dirección. Cada
   rol lee las colecciones de su `hubScopes` y solo puede modificar las de su
   `hubWrite`; lo que llegue fuera de eso se ignora en el servidor.

   Como varias personas escriben a la vez, no se sobrescribe el blob completo:
   se fusiona entidad por entidad (ver `mergeCollection`). Así dos personas
   trabajando en pestañas distintas no se borran el trabajo mutuamente.
   ------------------------------------------------------------------ */

/**
 * Recorta el tablero a las colecciones que el rol puede leer y censura los
 * montos cuando no le corresponde verlos (ver lib/contract-view).
 */
function scopeBoard(data: Record<string, unknown>, scopes: readonly HubScope[], seeMoney: boolean) {
  const out: Record<string, unknown> = {};
  for (const scope of scopes) {
    const list = Array.isArray(data[scope]) ? (data[scope] as unknown[]) : [];
    out[scope] = scope === "contracts" && !seeMoney ? redactContracts(list) : list;
  }
  return out;
}

router.get("/hub", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const role = normalizeRole(me.teamRole, me.role === "superadmin");
  const scopes = hubScopesFor(role);
  if (scopes.length === 0) {
    res.status(403).json({ error: "Tu rol no tiene acceso al tablero" });
    return;
  }

  const board = await resolveBoard();
  res.json({
    data: board?.exists ? scopeBoard(board.data, scopes, canSeeMoney(role)) : null,
    version: board?.version ?? 0,
    scopes,
    writeScopes: hubWriteScopesFor(role),
    owner: board?.owner ? { name: board.owner.name, email: board.owner.email } : null,
  });
});

router.patch("/hub", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const role = normalizeRole(me.teamRole, me.role === "superadmin");
  const scopes = hubScopesFor(role);
  const writeScopes = hubWriteScopesFor(role);
  if (writeScopes.length === 0) {
    res.status(403).json({ error: "Tu rol no puede modificar el tablero" });
    return;
  }

  const { data, baseVersion } = req.body as { data: unknown; baseVersion?: unknown };
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    res.status(400).json({ error: "Campo 'data' requerido (objeto)" });
    return;
  }

  if (Buffer.byteLength(JSON.stringify(data), "utf8") > MAX_HUB_BYTES) {
    res.status(400).json({ error: "El estado del Hub supera el límite de 2 MB" });
    return;
  }

  const parsed = hubDataSchema.safeParse(data);
  if (!parsed.success) {
    res.status(400).json({
      error: "Estructura de 'data' no válida: projects/clients/meetings/notes/tasks/contracts deben ser arrays de objetos",
    });
    return;
  }
  const incoming = parsed.data as Record<string, unknown>;

  const board = await resolveBoard();
  if (!board) {
    res.status(409).json({ error: "Todavía no hay un tablero de dirección al que escribir" });
    return;
  }
  const stored = board.data;
  // Sin baseVersion asumimos que el cliente cargó recién: solo se conservan las
  // entidades ajenas creadas desde ahora, nunca se borra trabajo de otros.
  const base = Number(baseVersion);
  const safeBase = Number.isFinite(base) && base > 0 ? base : Date.now();

  const merged: Record<string, unknown> = { ...stored };
  for (const scope of ALL_HUB_SCOPES) {
    const storedList = Array.isArray(stored[scope]) ? (stored[scope] as HubEntity[]) : [];
    if (!writeScopes.includes(scope) || !Array.isArray(incoming[scope])) {
      merged[scope] = storedList;
      continue;
    }
    merged[scope] = mergeCollection(storedList, incoming[scope] as HubEntity[], safeBase);
  }

  const saved = await saveBoard(board.boardUserId, merged);

  // Bitácora + avisos a dirección: contratos y proyectos nuevos, con cambio de
  // estado o eliminados. El tablero es un blob, así que el "diff" se hace aquí
  // comparando lo almacenado antes del merge con lo que quedó guardado.
  try {
    const actorName = String(me.name || me.email || "Alguien").slice(0, 80);
    const esDireccion = role === "ceo";
    for (const scope of ["contracts", "projects", "clients"] as const) {
      if (!writeScopes.includes(scope)) continue;
      const before = Array.isArray(stored[scope]) ? (stored[scope] as HubEntity[]) : [];
      const after = Array.isArray(saved.data[scope]) ? (saved.data[scope] as HubEntity[]) : [];
      const entityType = scope === "contracts" ? "contract" : scope === "projects" ? "project" : "client";
      const diff = diffHubEntities(before, after);

      for (const e of diff.created) {
        recordActivity({ actorId: me.id, entityType, entityId: String(e.id), entityLabel: entityLabel(e), action: "created" });
      }
      for (const c of diff.statusChanged) {
        recordActivity({
          actorId: me.id,
          entityType,
          entityId: String(c.entity.id),
          entityLabel: entityLabel(c.entity),
          action: "status_change",
          detail: { from: c.from, to: c.to },
        });
      }
      for (const e of diff.deleted) {
        recordActivity({ actorId: me.id, entityType, entityId: String(e.id), entityLabel: entityLabel(e), action: "deleted" });
      }

      // Handoffs automáticos entre áreas (idempotentes vía handoff_log):
      // venta cerrada → proyecto+tareas; proyecto entregado → cobranza.
      const becameNow = (target: string): HubEntity[] => [
        ...diff.created.filter((e) => entityState(e) === target),
        ...diff.statusChanged.filter((c) => c.to === target).map((c) => c.entity),
      ];
      if (scope === "contracts") {
        for (const e of becameNow("activo")) {
          void handoffContractClosed(e as Record<string, unknown>, me.id).catch((err) =>
            console.error("[handoff venta_cerrada]", err),
          );
        }
      }
      if (scope === "projects") {
        for (const e of becameNow("done")) {
          void handoffProjectDelivered(e as Record<string, unknown>, me.id).catch((err) =>
            console.error("[handoff proyecto_entregado]", err),
          );
        }
      }

      // Dirección informada sin ser cuello de botella: cuando alguien que NO
      // es CEO crea, cambia o elimina contratos, proyectos o clientes, el CEO
      // recibe el aviso (panel + push + DM si lo activó). Fire-and-forget:
      // jamás frena el guardado del tablero. Los títulos usan el nombre de la
      // entidad, que no lleva montos.
      if (!esDireccion) {
        for (const aviso of buildCeoAvisos(scope, diff, actorName)) {
          void notifyCeos({ ...aviso, link: "/ejecutivo", excludeUserId: me.id }).catch((err) =>
            console.error("[hub PATCH] aviso a dirección falló", err),
          );
        }
      }
    }
  } catch (err) {
    console.error("[hub PATCH] activity diff failed", err);
  }

  res.json({
    data: scopeBoard(saved.data, scopes, canSeeMoney(role)),
    version: saved.version,
    scopes,
    writeScopes,
  });
});

/* ------------------------------------------------------------------
   Estado de cobro de un contrato.

   El contador necesita llevar la cobranza (facturado, pagado, nº de factura)
   sin poder tocar precios, módulos ni alcance: por eso NO se le da escritura
   sobre `contracts` y se le da este PATCH acotado, que solo escribe el sub-
   objeto `cobro`. Dirección y ventas lo comparten porque también ven montos.
   ------------------------------------------------------------------ */

export const COBRO_STATES = ["pendiente", "facturado", "pagado", "incobrable"] as const;

const cobroSchema = z.object({
  estado: z.enum(COBRO_STATES),
  factura: z.string().max(60).optional().default(""),
  fechaPago: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Usa formato YYYY-MM-DD").optional().default(""),
  nota: z.string().max(500).optional().default(""),
});

router.patch("/hub/contracts/:id/cobro", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const role = normalizeRole(me.teamRole, me.role === "superadmin");
  if (!canSeeMoney(role)) {
    res.status(403).json({ error: "Tu rol no puede gestionar la cobranza" });
    return;
  }

  const parsed = cobroSchema.safeParse((req.body as { cobro?: unknown })?.cobro ?? req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map(i => i.message).join("; ") });
    return;
  }

  const board = await resolveBoard();
  if (!board) { res.status(409).json({ error: "Todavía no hay un tablero de dirección" }); return; }

  const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Record<string, unknown>[]) : [];
  const idx = contracts.findIndex(c => String(c?.id ?? "") === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Contrato no encontrado" }); return; }

  const cobro = {
    ...parsed.data,
    updatedAt: Date.now(),
    by: me.name || me.email,
  };
  // Se toca UNA entidad y se sube su `updatedAt`, para que la fusión por
  // entidad del tablero respete este cambio frente a ediciones simultáneas.
  const prevEstado = String((contracts[idx]?.cobro as Record<string, unknown> | undefined)?.["estado"] ?? "");
  const next = [...contracts];
  next[idx] = { ...contracts[idx], cobro, updatedAt: Date.now() };

  await saveBoard(board.boardUserId, { ...board.data, contracts: next });

  // Bitácora + aviso a dirección: la cobranza es movimiento sensible. El aviso
  // dice el estado (pendiente/pagado/…), nunca montos.
  const label = entityLabel(contracts[idx] as HubEntity);
  recordActivity({
    actorId: me.id,
    entityType: "contract",
    entityId: String(req.params.id),
    entityLabel: label,
    action: "status_change",
    detail: { cobranza: true, from: prevEstado || null, to: parsed.data.estado },
  });
  if (role !== "ceo") {
    void notifyCeos({
      title: `Cobranza de ${label}: ${prevEstado || "sin gestión"} → ${parsed.data.estado}`,
      body: `${String(me.name || me.email || "Alguien").slice(0, 80)} actualizó la cobranza.`,
      link: "/reportes",
      excludeUserId: me.id,
    }).catch((err) => console.error("[hub cobro] aviso a dirección falló", err));
  }
  res.json({ ok: true, cobro });
});

/* ------------------------------------------------------------------
   Vista de solo lectura del Hub para el resto del equipo.

   El Hub Ejecutivo vive en un blob por usuario (el de la dirección). Los
   demás roles necesitan ver su parte (ventas: contratos/clientes/reuniones,
   programador: proyectos/tareas, contador: contratos) sin poder escribir
   sobre el tablero — así no hay dos personas pisándose el blob.
   ------------------------------------------------------------------ */

router.get("/hub/owner", async (req: Request, res: Response) => {
  const user = getUser(req);
  const [meRow] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!meRow) { res.status(401).json({ error: "No autenticado" }); return; }

  const role = normalizeRole(meRow.teamRole, meRow.role === "superadmin");
  const scopes = hubScopesFor(role);
  if (scopes.length === 0) {
    res.status(403).json({ error: "Tu rol no tiene acceso a los datos del Hub" });
    return;
  }

  const board = await resolveBoard();
  if (!board) { res.json({ data: {}, owner: null, updatedAt: null, scopes }); return; }

  res.json({
    data: scopeBoard(board.data, scopes, canSeeMoney(role)),
    owner: board.owner ? { name: board.owner.name, email: board.owner.email } : null,
    updatedAt: board.version ? new Date(board.version).toISOString() : null,
    scopes,
  });
});

router.post("/hub/contracts/extract-pdf", async (req: Request, res: Response) => {
  const { fileId } = req.body as { fileId?: string };
  if (!fileId) { res.status(400).json({ error: "fileId requerido" }); return; }

  try {
    const user = getUser(req);
    const auth = getGoogleAuth(user);
    if (!auth) {
      res.status(409).json({ error: MENSAJE_SIN_GOOGLE, code: "google_no_conectado" });
      return;
    }
    const drive = google.drive({ version: "v3", auth });

    // Download PDF buffer from Drive
    const dlRes = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    const buffer = Buffer.from(dlRes.data as ArrayBuffer);

    // Extract text with pdf-parse v2
    let pdfText = "";
    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      pdfText = result.text;
    } catch {
      pdfText = "";
    }

    if (pdfText.trim().length < 50) {
      res.status(422).json({ error: "El PDF no contiene texto extraíble (puede ser un PDF escaneado). Por favor rellena los campos manualmente." });
      return;
    }

    // Call OpenAI to extract structured fields
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_API_BASE || undefined,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Eres un asistente que extrae información de contratos y cotizaciones. Responde SOLO con JSON válido, sin markdown.",
        },
        {
          role: "user",
          content: `Extrae los siguientes campos de este documento. Si no encuentras un campo, usa string vacío. Responde SOLO con JSON.

Campos:
- title (string): título o descripción del servicio/contrato
- client (string): nombre del cliente o empresa
- value (string): valor o precio total (ej: "$290.000 / mes" o "$1.500.000")
- status (string): uno de "borrador", "activo", "vencido", "cancelado". Por defecto "borrador".
- signedAt (string): fecha de firma en formato YYYY-MM-DD, vacío si no aparece
- expiresAt (string): fecha de vencimiento en formato YYYY-MM-DD, vacío si no aparece
- notes (string): resumen breve del alcance o términos (máx 200 caracteres)

Texto del documento:
${pdfText.slice(0, 6000)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let extracted: Record<string, string> = {};
    try { extracted = JSON.parse(raw); } catch { /* leave empty */ }

    res.json(extracted);
  } catch (err: any) {
    console.error("[Hub] Error extracting PDF:", err.message);
    res.status(500).json({ error: err.message || "Failed to extract PDF" });
  }
});

router.post("/hub/contracts/extract-from-meeting", async (req: Request, res: Response) => {
  const { notes } = req.body as { notes?: string };
  if (!notes || notes.trim().length < 10) {
    res.status(400).json({ error: "Se necesita al menos una descripción de la reunión" });
    return;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Eres un asistente de negocios especializado en contratos de agencias de marketing digital. Extraes información de notas de reuniones y la conviertes en datos estructurados para contratos. Responde SOLO con JSON válido.",
      },
      {
        role: "user",
        content: `Analiza estas notas de reunión y extrae los datos relevantes para crear un contrato de servicios. Si no encuentras un campo, usa string vacío.

Campos a extraer:
- title (string): nombre o descripción del servicio contratado
- client (string): nombre del cliente o empresa
- value (string): valor o precio acordado (ej: "$290.000 / mes", "$1.500.000")
- status (string): uno de "borrador", "activo", "vencido", "cancelado" — usa "borrador" por defecto
- signedAt (string): fecha de firma en formato YYYY-MM-DD (vacío si no se menciona)
- expiresAt (string): fecha de vencimiento o fin del servicio en formato YYYY-MM-DD (vacío si no se menciona)
- notes (string): resumen del alcance o términos importantes (máx 200 caracteres)
- client_contact (string): nombre del contacto o representante del cliente (si se menciona)
- scope_detail (string): descripción detallada del alcance del proyecto (para el campo "scope" del wizard)
- project_name (string): nombre específico del proyecto o servicio

Notas de la reunión:
${notes.slice(0, 4000)}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let extracted: Record<string, string> = {};
  try { extracted = JSON.parse(raw); } catch { /* leave empty */ }

  res.json(extracted);
});

router.post("/hub/contracts/ai-extract-project", async (req: Request, res: Response) => {
  const { contract } = req.body as { contract?: Record<string, string> };
  if (!contract || typeof contract !== "object") {
    res.status(400).json({ error: "Se requiere el objeto 'contract'" });
    return;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });

  const contractStr = [
    contract.title && `Título: ${contract.title}`,
    contract.client && `Cliente: ${contract.client}`,
    contract.value && `Valor: ${contract.value}`,
    contract.notes && `Notas/Alcance: ${contract.notes}`,
  ].filter(Boolean).join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Eres un asistente de agencia de marketing digital. A partir de la información de un contrato, extraes los datos necesarios para crear un proyecto interno de gestión. Responde SOLO con JSON válido.",
      },
      {
        role: "user",
        content: `Analiza este contrato y extrae los datos para crear un proyecto en nuestro sistema de gestión.

Contrato:
${contractStr}

Devuelve un JSON con estos campos (string vacío si no aplica):
- name (string): nombre del proyecto, derivado del servicio contratado
- client (string): nombre del cliente
- type (string): tipo de proyecto (ej: "Sitio Web", "Marketing Digital", "Branding", "E-Commerce", "Software", "Redes Sociales", "SEO", "Diseño Gráfico", etc.)
- prio (string): prioridad sugerida — solo "alta", "media" o "baja"
- due (string): fecha de entrega estimada en formato YYYY-MM-DD (calcula ~3 meses desde hoy si no se menciona una fecha explícita; usa "" solo si no hay ninguna referencia)
- notes (string): resumen detallado de los requerimientos, alcance y entregables del proyecto (máx 400 caracteres)`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let extracted: Record<string, string> = {};
  try { extracted = JSON.parse(raw); } catch { /* leave empty */ }

  res.json(extracted);
});

/* ------------------------------------------------------------------
   Brief técnico: la segunda versión del contrato.

   De la misma cotización salen dos documentos: el comercial (con precios, para
   el cliente) y este brief (sin un solo monto, para quien construye). Se genera
   automáticamente al crear o modificar el contrato, así el equipo técnico nunca
   depende de que alguien recuerde escribir los requerimientos.
   ------------------------------------------------------------------ */
const briefSchema = z.object({
  objetivo: z.coerce.string().default(""),
  contexto: z.coerce.string().default(""),
  alcance: z.array(z.object({
    modulo: z.coerce.string().default(""),
    descripcion: z.coerce.string().default(""),
    entregables: z.array(z.coerce.string()).default([]),
    requisitos: z.array(z.coerce.string()).default([]),
  })).default([]),
  criteriosAceptacion: z.array(z.coerce.string()).default([]),
  fueraDeAlcance: z.array(z.coerce.string()).default([]),
  stackSugerido: z.array(z.coerce.string()).default([]),
  hitos: z.array(z.object({
    nombre: z.coerce.string().default(""),
    detalle: z.coerce.string().default(""),
  })).default([]),
});

export type ContractBrief = z.infer<typeof briefSchema> & { generatedAt: number };

/** Limpia montos de todos los textos del brief, venga de donde venga. */
function sanitizeBrief(brief: z.infer<typeof briefSchema>): z.infer<typeof briefSchema> {
  const clean = (v: string) => stripMoneyFromText(String(v ?? ""));
  return {
    objetivo: clean(brief.objetivo),
    contexto: clean(brief.contexto),
    alcance: brief.alcance.map(a => ({
      modulo: clean(a.modulo),
      descripcion: clean(a.descripcion),
      entregables: a.entregables.map(clean),
      requisitos: a.requisitos.map(clean),
    })),
    criteriosAceptacion: brief.criteriosAceptacion.map(clean),
    fueraDeAlcance: brief.fueraDeAlcance.map(clean),
    stackSugerido: brief.stackSugerido.map(clean),
    hitos: brief.hitos.map(h => ({ nombre: clean(h.nombre), detalle: clean(h.detalle) })),
  };
}

router.post("/hub/contracts/brief", async (req: Request, res: Response) => {
  try {
    await generarBriefTecnico(req, res);
  } catch (err) {
    // Sin este catch, un fallo del modelo (sin API key, rate limit, timeout)
    // salía como un 500 sin cuerpo. El panel lo leía como "brief null" y
    // guardaba el contrato sin brief sin decir nada.
    console.error("[hub/contracts/brief]", (err as Error)?.message);
    res.status(502).json({
      error: "No se pudo generar el brief técnico ahora mismo. El contrato se puede guardar igual y generarlo después desde su ficha.",
    });
  }
});

async function generarBriefTecnico(req: Request, res: Response): Promise<void> {
  const { doc, contract } = req.body as { doc?: Record<string, unknown>; contract?: Record<string, unknown> };
  if (!doc && !contract) {
    res.status(400).json({ error: "Se requiere el documento o la ficha del contrato" });
    return;
  }

  // A la IA se le manda el documento SIN precios: no los necesita para describir
  // el trabajo, y así tampoco puede colarlos en el texto.
  const source = doc ?? {};
  const mods = Array.isArray((source as { modules?: unknown }).modules)
    ? ((source as { modules: Record<string, unknown>[] }).modules)
        .filter(m => String(m?.name ?? "").trim() !== "")
        .map(m => ({ nombre: m.name, descripcion: m.desc ?? "" }))
    : [];

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Eres un líder técnico de una agencia digital chilena (sitios web, e-commerce, software a medida, branding y contenido). Traduces lo vendido a un brief accionable para quien programa o diseña. PROHIBIDO mencionar precios, montos, presupuestos, formas de pago o cualquier cifra de dinero. Responde SOLO con JSON válido.",
      },
      {
        role: "user",
        content: `Servicio vendido: ${String((source as Record<string, unknown>).project ?? contract?.title ?? "")}
Cliente: ${String((source as Record<string, unknown>).client ?? contract?.client ?? "")}
Alcance acordado: ${String((source as Record<string, unknown>).scope ?? contract?.notes ?? "")}
Módulos contratados: ${JSON.stringify(mods)}

Genera el brief técnico con este JSON exacto:
{
  "objetivo": "qué problema del cliente resuelve esto, en 1-2 frases",
  "contexto": "contexto del cliente y su rubro, en 1-2 frases",
  "alcance": [{ "modulo": "", "descripcion": "qué hay que construir", "entregables": ["…"], "requisitos": ["requisito técnico o funcional"] }],
  "criteriosAceptacion": ["condición verificable para dar por terminado"],
  "fueraDeAlcance": ["lo que NO incluye, para evitar malentendidos"],
  "stackSugerido": ["tecnología recomendada"],
  "hitos": [{ "nombre": "", "detalle": "" }]
}

Un elemento de "alcance" por cada módulo contratado. Sé concreto y accionable: quien lo lea debe poder empezar a trabajar sin preguntar nada más.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let parsedJson: unknown = {};
  try { parsedJson = JSON.parse(raw); } catch { /* deja el brief vacío */ }

  const parsed = briefSchema.safeParse(parsedJson);
  const brief = sanitizeBrief(parsed.success ? parsed.data : briefSchema.parse({}));

  // Un brief sin alcance NO es un brief.
  //
  // Antes se devolvía igual, con arrays vacíos y HTTP 200, y el panel lo
  // guardaba como si fuera bueno. Al cerrar la venta, el handoff no encontraba
  // módulos y caía al arranque genérico ("Kickoff interno", "Levantamiento de
  // requerimientos"), que el equipo de desarrollo recibía como si fuera el
  // alcance real del proyecto. Un vacío que se ve como un éxito es peor que
  // un error.
  if (brief.alcance.length === 0) {
    res.status(502).json({
      error: "La IA no logró armar el brief técnico a partir de este contrato. Revisa que el documento tenga módulos con descripción y vuelve a intentarlo.",
    });
    return;
  }

  res.json({ brief: { ...brief, generatedAt: Date.now() } });
}

router.post("/hub/projects/ai-extract-tasks", async (req: Request, res: Response) => {
  const { project } = req.body as { project?: Record<string, string> };
  if (!project || typeof project !== "object") {
    res.status(400).json({ error: "Se requiere el objeto 'project'" });
    return;
  }
  if (!project.notes && !project.name) {
    res.status(400).json({ error: "El proyecto necesita notas o nombre para generar tareas" });
    return;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });

  const projectStr = [
    project.name && `Nombre del proyecto: ${project.name}`,
    project.client && `Cliente: ${project.client}`,
    project.type && `Tipo: ${project.type}`,
    project.notes && `Requerimientos/Alcance: ${project.notes}`,
  ].filter(Boolean).join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Eres un Scrum Master de una agencia digital. Generas historias de usuario y tareas técnicas bien definidas para el backlog de proyectos. Responde SOLO con JSON válido.",
      },
      {
        role: "user",
        content: `Genera las tareas Scrum para el siguiente proyecto de agencia digital. Crea entre 6 y 14 tareas concretas y accionables que cubran todo el alcance del proyecto.

Proyecto:
${projectStr}

Responde con un JSON que tenga exactamente esta forma:
{
  "tasks": [
    { "title": "...", "crit": "crítica|alta|media|baja", "notes": "..." },
    ...
  ]
}

Reglas:
- title: corto y accionable (máx 80 chars), empieza con verbo (Diseñar, Desarrollar, Configurar, Revisar, etc.)
- crit — usa EXACTAMENTE uno de estos cuatro valores: "crítica" (bloqueante, sin esto nada avanza), "alta" (entregable principal del proyecto), "media" (funcionalidad importante), "baja" (ajuste o mejora final)
- notes: descripción breve de qué implica la tarea (máx 150 chars)
- Cubre fases típicas: kickoff/briefing, diseño, desarrollo/implementación, contenido, pruebas/QA, entrega
- Sé específico según el tipo de proyecto`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || '{"tasks":[]}';
  let result: { tasks: Array<{ title: string; crit: string; notes: string }> } = { tasks: [] };
  try { result = JSON.parse(raw); } catch { /* leave empty */ }
  if (!Array.isArray(result.tasks)) result.tasks = [];

  res.json(result);
});

/* ------------------------------------------------------------------
   Chat IA sobre un contrato.

   Además de la "ficha" (título, cliente, valor, fechas…) el contrato
   puede traer `doc`: los datos estructurados de la cotización con los
   que se generó el PDF (módulos, precios, alcance, forma de pago). Si
   viene `doc`, la IA también lo modifica para que el panel pueda
   regenerar el PDF con los cambios aplicados.
   ------------------------------------------------------------------ */
const contractFicha = z
  .object({
    title: z.string(),
    client: z.string(),
    value: z.string(),
    status: z.enum(["borrador", "activo", "vencido", "cancelado"]),
    signedAt: z.string(),
    expiresAt: z.string(),
    notes: z.string(),
  })
  .partial();

const docModuleSchema = z.object({
  id: z.string().optional(),
  name: z.coerce.string().default(""),
  desc: z.coerce.string().default(""),
  price: z.coerce.number().catch(0).default(0),
});

const contractDocSchema = z
  .object({
    client: z.coerce.string(),
    project: z.coerce.string(),
    scope: z.coerce.string(),
    date: z.coerce.string(),
    advisor: z.coerce.string(),
    modules: z.array(docModuleSchema),
    downPct: z.coerce.number().catch(50),
    notes: z.coerce.string(),
    monthly: z.coerce.string(),
    monthlyPrice: z.coerce.string(),
    validityDays: z.coerce.number().catch(15),
  })
  .partial();

router.post("/hub/contracts/ai-chat", async (req: Request, res: Response) => {
  const { contract, doc, instruction } = req.body as {
    contract?: Record<string, unknown>;
    doc?: Record<string, unknown> | null;
    instruction?: string;
  };
  if (!instruction || instruction.trim().length < 3) {
    res.status(400).json({ error: "Instrucción requerida" });
    return;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });

  const hasDoc = !!doc && typeof doc === "object" && !Array.isArray(doc);
  const contractStr = JSON.stringify(contract || {}, null, 2);
  const docStr = hasDoc ? JSON.stringify(doc, null, 2) : "";

  const docBlock = hasDoc
    ? `
Documento de la cotización (es la fuente del PDF que se le entrega al cliente):
${docStr}

Campos del documento:
- client (string), project (string, nombre del servicio), scope (string, alcance)
- date (YYYY-MM-DD, emisión), advisor (string)
- modules: array de { name, desc, price } — price es el NETO en pesos chilenos, número sin puntos ni símbolos (el IVA 19% se calcula aparte)
- downPct (number 0-100, % de pago al iniciar)
- monthly (string, nombre de la mensualidad o vacío), monthlyPrice (string numérico neto o vacío)
- validityDays (number, días de vigencia), notes (string, notas de cierre)

Aplica la instrucción SOBRE EL DOCUMENTO cuando corresponda: agregar/quitar/renombrar módulos,
cambiar precios, ajustar el alcance, la forma de pago o la vigencia. Mantén los módulos que no
se mencionan tal cual están (mismo id, nombre, descripción y precio).`
    : `
Este contrato no tiene documento estructurado: modifica solo la ficha.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Eres un asistente de contratos y cotizaciones de una agencia digital chilena. El usuario te pide cambios en lenguaje natural y tú devuelves el contrato actualizado en JSON, aplicando SOLO los cambios pedidos y conservando el resto intacto. Responde SOLO con JSON válido, sin markdown.",
      },
      {
        role: "user",
        content: `Ficha del contrato:
${contractStr}
${docBlock}

Instrucción del usuario: ${instruction}

Responde con este JSON exacto:
{
  "contract": { "title": "", "client": "", "value": "", "status": "borrador|activo|vencido|cancelado", "signedAt": "YYYY-MM-DD o vacío", "expiresAt": "YYYY-MM-DD o vacío", "notes": "máx 200 chars" },
  ${hasDoc ? '"doc": { …el documento completo con los cambios aplicados… },' : '"doc": null,'}
  "summary": "una frase corta en español describiendo qué cambiaste"
}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(raw); } catch { /* leave empty */ }

  // La IA a veces devuelve los campos de la ficha en la raíz en vez de
  // dentro de "contract": aceptamos ambas formas.
  const rawContract = (parsed.contract && typeof parsed.contract === "object" ? parsed.contract : parsed) as Record<string, unknown>;
  const contractOut = contractFicha.safeParse(rawContract);

  let docOut: Record<string, unknown> | null = null;
  if (hasDoc) {
    const rawDoc = parsed.doc && typeof parsed.doc === "object" ? parsed.doc : null;
    const parsedDoc = rawDoc ? contractDocSchema.safeParse(rawDoc) : null;
    // Merge sobre el documento original: lo que la IA no devuelve se conserva.
    if (parsedDoc?.success) docOut = { ...doc, ...parsedDoc.data };
  }

  res.json({
    contract: contractOut.success ? contractOut.data : {},
    doc: docOut,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
  });
});

export default router;
