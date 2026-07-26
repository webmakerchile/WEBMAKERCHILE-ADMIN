// Portadas del Studio: delega en el sistema compartido de direcciones de
// arte (lib/cover-style) — dirección + pose + detalle rotativos, ilustración
// del zorro master vía Gemini y titular compuesto con Sharp (scrim + acentos).
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import {
  prepararPortada,
  generateFoxIllustration,
  composeVerticalCover,
} from "../../lib/cover-style.js";

const COVERS_DIR = path.join(process.cwd(), "public", "uploads", "covers");

async function ensureCoversDir() {
  await mkdir(COVERS_DIR, { recursive: true });
}

export async function generateCoverImage(videoTitle: string, videoDescription: string): Promise<string>;
export async function generateCoverImage(videoTitle: string, videoDescription: string, returnBuffer: true): Promise<{ servePath: string; imageBuffer: Buffer; mimeType: string }>;
export async function generateCoverImage(videoTitle: string, videoDescription: string, returnBuffer?: boolean): Promise<string | { servePath: string; imageBuffer: Buffer; mimeType: string }> {
  console.log(`[CoverGen] Generando portada para: "${videoTitle}"`);

  const tema = (videoDescription || videoTitle).trim();
  const { direccion, prompt } = prepararPortada(tema);
  const illustration = await generateFoxIllustration(prompt);
  const finalImage = await composeVerticalCover(illustration, videoTitle, direccion);

  const mimeType = "image/png";
  await ensureCoversDir();
  const fileName = `${randomUUID()}.png`;
  await writeFile(path.join(COVERS_DIR, fileName), finalImage);

  const servePath = `/uploads/covers/${fileName}`;
  console.log(`[CoverGen] Portada guardada: ${servePath} (dirección: ${direccion.id})`);

  if (returnBuffer) {
    return { servePath, imageBuffer: finalImage, mimeType };
  }
  return servePath;
}
