import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubState, users } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { hubScopesFor, normalizeRole } from "@workspace/roles";
import { google } from "googleapis";
import { PDFParse } from "pdf-parse";
import OpenAI from "openai";
import { z } from "zod";

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

function getGoogleAuth(user: AuthedUser) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || "",
    process.env.GOOGLE_CLIENT_SECRET || ""
  );
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });
  return oauth2Client;
}

router.get("/hub", async (req: Request, res: Response) => {
  const user = getUser(req);
  const [row] = await db
    .select()
    .from(hubState)
    .where(eq(hubState.userId, user.id))
    .limit(1);
  res.json({ data: row?.data ?? null });
});

router.patch("/hub", async (req: Request, res: Response) => {
  const user = getUser(req);
  const { data } = req.body as { data: unknown };
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
  const validData = parsed.data;

  const [row] = await db
    .insert(hubState)
    .values({ userId: user.id, data: validData, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: hubState.userId,
      set: { data: validData, updatedAt: new Date() },
    })
    .returning();

  res.json({ data: row!.data });
});

/* ------------------------------------------------------------------
   Vista de solo lectura del Hub para el resto del equipo.

   El Hub Ejecutivo vive en un blob por usuario (el de la dirección). Los
   demás roles necesitan ver su parte (ventas: contratos/clientes/reuniones,
   programador: proyectos/tareas, contador: contratos) sin poder escribir
   sobre el tablero — así no hay dos personas pisándose el blob.
   ------------------------------------------------------------------ */

/** Dueño del tablero: el superadmin, o en su defecto el CEO más antiguo. */
async function findHubOwner() {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, teamRole: users.teamRole })
    .from(users)
    .orderBy(asc(users.id));
  return rows.find(u => u.role === "superadmin")
    ?? rows.find(u => normalizeRole(u.teamRole) === "ceo")
    ?? null;
}

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

  const owner = await findHubOwner();
  if (!owner) { res.json({ data: {}, owner: null, updatedAt: null, scopes }); return; }

  const [row] = await db
    .select()
    .from(hubState)
    .where(eq(hubState.userId, owner.id))
    .limit(1);

  const full = (row?.data ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const scope of scopes) data[scope] = Array.isArray(full[scope]) ? full[scope] : [];

  res.json({
    data,
    owner: { name: owner.name, email: owner.email },
    updatedAt: row?.updatedAt ?? null,
    scopes,
  });
});

router.post("/hub/contracts/extract-pdf", async (req: Request, res: Response) => {
  const { fileId } = req.body as { fileId?: string };
  if (!fileId) { res.status(400).json({ error: "fileId requerido" }); return; }

  try {
    const user = getUser(req);
    const auth = getGoogleAuth(user);
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
