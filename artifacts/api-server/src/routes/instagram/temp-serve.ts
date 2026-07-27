import type { Request, Response } from "express";
import { createReadStream, existsSync } from "fs";
import path from "path";

const TEMP_DIR = path.join(process.cwd(), "tmp-ig-videos");

/**
 * Archivos temporales que Instagram descarga por URL pública.
 *
 * Cada entrada guarda su tipo MIME porque el endpoint servía TODO como
 * `video/mp4`: al añadir publicación de imágenes, Instagram rechazaba el
 * contenedor porque el Content-Type no correspondía al medio.
 */
const activeTokens = new Map<string, { filePath: string; createdAt: number; mimeType: string }>();

export function registerTempFile(token: string, filePath: string, mimeType = "video/mp4") {
  activeTokens.set(token, { filePath, createdAt: Date.now(), mimeType });
}

export function unregisterTempFile(token: string) {
  activeTokens.delete(token);
}

export function serveTempVideo(req: Request, res: Response) {
  const tokenRaw = req.params.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    res.status(400).json({ error: "Token inválido" });
    return;
  }

  const entry = activeTokens.get(token);
  // Sin entrada en memoria (el proceso se reinició a media publicación) se
  // busca el .mp4 histórico: era el único nombre posible antes de que
  // existieran las imágenes.
  const filePath = entry?.filePath ?? path.join(TEMP_DIR, `${token}.mp4`);
  const mimeType = entry?.mimeType ?? "video/mp4";

  if (!existsSync(filePath)) {
    res.status(404).json({ error: "Archivo no encontrado o expirado" });
    return;
  }

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "no-store");
  createReadStream(filePath).pipe(res);
}
