import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubState } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { PDFParse } from "pdf-parse";
import OpenAI from "openai";

const router: IRouter = Router();

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

  const [row] = await db
    .insert(hubState)
    .values({ userId: user.id, data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: hubState.userId,
      set: { data, updatedAt: new Date() },
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
      pdfText = "[No se pudo extraer texto del PDF]";
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

export default router;
