import type { Request, Response } from "express";
import { createReadStream, existsSync } from "fs";
import path from "path";

const TEMP_DIR = path.join(process.cwd(), "tmp-ig-videos");

const activeTokens = new Map<string, { filePath: string; createdAt: number }>();

export function registerTempFile(token: string, filePath: string) {
  activeTokens.set(token, { filePath, createdAt: Date.now() });
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
  if (!entry) {
    const filePath = path.join(TEMP_DIR, `${token}.mp4`);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: "Video no encontrado o expirado" });
      return;
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "no-store");
    const stream = createReadStream(filePath);
    stream.pipe(res);
    return;
  }

  if (!existsSync(entry.filePath)) {
    res.status(404).json({ error: "Video no encontrado o expirado" });
    return;
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "no-store");
  const stream = createReadStream(entry.filePath);
  stream.pipe(res);
}
