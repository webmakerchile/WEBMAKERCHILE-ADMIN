import express from "express";
import multer from "multer";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";
const SIZE_LIMIT = 24 * 1024 * 1024; // 24MB

const ALLOWED_EXT = new Set([".mp3", ".m4a", ".ogg", ".wav", ".opus", ".aac", ".flac", ".webm", ".mp4"]);

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname, "../public")));

function convertToWav16kMono(inputPath) {
  return new Promise((resolve, reject) => {
    const outPath = path.join(os.tmpdir(), `${randomUUID()}.wav`);
    const proc = spawn("ffmpeg", [
      "-y", "-i", inputPath,
      "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
      outPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`ffmpeg falló (código ${code}): ${stderr.slice(-400)}`));
    });
    proc.on("error", reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function transcribeWithGroq(filePath, filename) {
  const MAX_ATTEMPTS = 5;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const form = new FormData();
    const buf = await fs.promises.readFile(filePath);
    form.append("file", new Blob([buf]), filename);
    form.append("model", MODEL);
    form.append("language", "es");
    form.append("response_format", "json");

    let res;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: form,
      });
    } catch (err) {
      lastErr = new Error(`Error de red: ${err.message}`);
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    if (res.ok) {
      const data = await res.json();
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

    // Non-retryable error
    let detail = bodyText.slice(0, 300);
    try { detail = JSON.parse(bodyText)?.error?.message || detail; } catch {}
    throw new Error(`Groq error ${res.status}: ${detail}`);
  }
  throw lastErr || new Error("Se agotaron los reintentos");
}

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  const cleanup = [];
  try {
    if (!GROQ_API_KEY) {
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
      console.log(`[transcriber] ${originalName} pesa ${(req.file.size / 1048576).toFixed(1)}MB > 24MB, convirtiendo a WAV 16kHz mono...`);
      sendPath = await convertToWav16kMono(req.file.path);
      cleanup.push(sendPath);
      sendName = originalName.replace(/\.[^.]+$/, "") + ".wav";
      const newSize = (await fs.promises.stat(sendPath)).size;
      console.log(`[transcriber] Convertido: ${(newSize / 1048576).toFixed(1)}MB`);
    }

    const text = await transcribeWithGroq(sendPath, sendName);
    res.json({ text });
  } catch (err) {
    console.error("[transcriber] Error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    for (const p of cleanup) {
      fs.promises.unlink(p).catch(() => {});
    }
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, groqConfigured: !!GROQ_API_KEY });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[transcriber] Servidor corriendo en puerto ${PORT}`);
  if (!GROQ_API_KEY) console.warn("[transcriber] ADVERTENCIA: GROQ_API_KEY no configurada");
});
