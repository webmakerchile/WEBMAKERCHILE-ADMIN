import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubState } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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

router.post("/hub/contracts/ai-chat", async (req: Request, res: Response) => {
  const { contract, instruction } = req.body as { contract?: Record<string, string>; instruction?: string };
  if (!instruction || instruction.trim().length < 3) {
    res.status(400).json({ error: "Instrucción requerida" });
    return;
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });

  const contractStr = JSON.stringify(contract || {}, null, 2);

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Eres un asistente de contratos de marketing digital. El usuario quiere modificar un contrato según sus instrucciones. Devuelve el contrato actualizado como JSON con los mismos campos, aplicando solo los cambios solicitados. Responde SOLO con JSON válido.",
      },
      {
        role: "user",
        content: `Contrato actual:
${contractStr}

Instrucción del usuario: ${instruction}

Devuelve el contrato completo con los cambios aplicados. Campos: title, client, value, status (borrador/activo/vencido/cancelado), signedAt (YYYY-MM-DD o vacío), expiresAt (YYYY-MM-DD o vacío), notes (máx 200 chars).`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let updated: Record<string, string> = {};
  try { updated = JSON.parse(raw); } catch { /* leave empty */ }

  res.json(updated);
});

export default router;
