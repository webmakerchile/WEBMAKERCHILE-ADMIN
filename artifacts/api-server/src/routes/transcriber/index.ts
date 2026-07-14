import { Router, type IRouter } from "express";
import multer from "multer";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const router: IRouter = Router();

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";
const SIZE_LIMIT = 24 * 1024 * 1024; // 24MB Groq limit
const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

const ALLOWED_EXT = new Set([".mp3", ".m4a", ".ogg", ".wav", ".opus", ".aac", ".flac", ".webm", ".mp4"]);

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("La conversión con ffmpeg excedió el tiempo máximo (5 min)"));
    }, FFMPEG_TIMEOUT_MS);
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg falló (código ${code}): ${stderr.slice(-400)}`));
    });
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

/**
 * Reduce the file below the 24MB API limit. First try WAV 16kHz mono; if the
 * WAV is still too big (uncompressed PCM grows for long audio), fall back to
 * Opus 32kbps mono 16kHz which compresses ~40x vs PCM.
 */
async function shrinkForApi(inputPath: string): Promise<{ path: string; ext: string; extra: string[] }> {
  const wavPath = path.join(os.tmpdir(), `${randomUUID()}.wav`);
  await runFfmpeg(["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath]);
  const wavSize = (await fs.promises.stat(wavPath)).size;
  if (wavSize <= SIZE_LIMIT) return { path: wavPath, ext: ".wav", extra: [] };

  const oggPath = path.join(os.tmpdir(), `${randomUUID()}.ogg`);
  await runFfmpeg(["-y", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "libopus", "-b:a", "32k", oggPath]);
  const oggSize = (await fs.promises.stat(oggPath)).size;
  if (oggSize > SIZE_LIMIT) {
    throw new Error("El audio es demasiado largo incluso después de comprimirlo (más de 24MB en Opus 32kbps). Divídelo en partes más cortas.");
  }
  return { path: oggPath, ext: ".ogg", extra: [wavPath] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function transcribeWithGroq(filePath: string, filename: string, apiKey: string): Promise<string> {
  const MAX_ATTEMPTS = 5;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const form = new FormData();
    // openAsBlob streams from disk lazily instead of buffering the file in RAM
    const blob = await fs.openAsBlob(filePath);
    form.append("file", blob, filename);
    form.append("model", MODEL);
    form.append("language", "es");
    form.append("response_format", "json");

    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(5 * 60 * 1000),
      });
    } catch (err) {
      const e = err as Error;
      lastErr = new Error(e.name === "TimeoutError" ? "Groq no respondió en 5 minutos" : `Error de red: ${e.message}`);
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    if (res.ok) {
      const data = (await res.json()) as { text?: string };
      return data.text || "";
    }

    const bodyText = await res.text().catch(() => "");
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = parseFloat(res.headers.get("retry-after") || "0");
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      lastErr = new Error(`Groq respondió ${res.status}. Reintentando...`);
      console.log(`[transcriber] ${filename}: ${res.status}, intento ${attempt}/${MAX_ATTEMPTS}, esperando ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
      continue;
    }

    let detail = bodyText.slice(0, 300);
    try { detail = (JSON.parse(bodyText) as { error?: { message?: string } })?.error?.message || detail; } catch {}
    throw new Error(`Groq error ${res.status}: ${detail}`);
  }
  throw lastErr || new Error("Se agotaron los reintentos");
}

router.get("/transcriber/health", (_req, res) => {
  res.json({ ok: true, groqConfigured: !!(process.env.GROQ_API_KEY || "").trim() });
});

router.post("/transcriber/transcribe", upload.single("audio"), async (req, res) => {
  const cleanup: string[] = [];
  try {
    const apiKey = (process.env.GROQ_API_KEY || "").trim();
    if (!apiKey) {
      res.status(500).json({ error: "GROQ_API_KEY no está configurada en el servidor" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ningún archivo" });
      return;
    }
    cleanup.push(req.file.path);

    const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      res.status(400).json({ error: `Formato no soportado: ${ext || "desconocido"}` });
      return;
    }

    let sendPath = req.file.path;
    let sendName = originalName;

    if (req.file.size > SIZE_LIMIT) {
      console.log(`[transcriber] ${originalName} pesa ${(req.file.size / 1048576).toFixed(1)}MB > 24MB, convirtiendo...`);
      const shrunk = await shrinkForApi(req.file.path);
      cleanup.push(shrunk.path, ...shrunk.extra);
      sendPath = shrunk.path;
      sendName = originalName.replace(/\.[^.]+$/, "") + shrunk.ext;
    }

    const text = await transcribeWithGroq(sendPath, sendName, apiKey);
    res.json({ text });
  } catch (err) {
    const e = err as Error;
    console.error("[transcriber] Error:", e.message);
    res.status(500).json({ error: e.message });
  } finally {
    for (const p of cleanup) {
      fs.promises.unlink(p).catch(() => {});
    }
  }
});

export default router;
