import fs from "fs";
import os from "os";
import multer from "multer";
import type { Request, Response } from "express";
import { decidirArchivo, LIMITE_SUBIDA_BYTES } from "../lib/transcripcion";
import { shrinkForApi, transcribeWithGroq, SIZE_LIMIT } from "./transcriber";

/**
 * Audio de las pantallas del panel wmc (Propuestas y Complementos).
 *
 * Esos endpoints nunca se implementaron del otro lado, asi que el proxy ciego
 * devolvia el HTML del SPA con 200 y el navegador no encontraba el texto.
 * Se atienden aca reusando el mismo Whisper que ya usa el dictado.
 */

/** Error con mensaje apto para mostrarle al usuario tal cual. */
export class AudioError extends Error {}

/**
 * El panel manda el audio con distinto nombre de campo segun la pantalla,
 * asi que aceptamos cualquiera en vez de casarnos con uno solo.
 */
export const recibirAudioWmc = multer({
  dest: os.tmpdir(),
  limits: { fileSize: LIMITE_SUBIDA_BYTES },
}).any();

function archivoDe(req: Request) {
  const varios = req.files;
  if (Array.isArray(varios) && varios.length > 0) return varios[0];
  return req.file;
}

/** Audio -> texto con Whisper (Groq), limpiando siempre los temporales. */
export async function transcribirAudioWmc(req: Request): Promise<string> {
  const archivo = archivoDe(req);
  if (!archivo) throw new AudioError("No llego ningun audio.");

  const limpieza: string[] = [archivo.path];
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new AudioError("Falta configurar GROQ_API_KEY.");

    const nombreOriginal = Buffer.from(archivo.originalname, "latin1").toString(
      "utf8",
    );
    const decision = decidirArchivo({
      nombre: nombreOriginal,
      mime: archivo.mimetype,
      bytes: archivo.size,
    });
    if (!decision.ok) throw new AudioError(decision.motivo);

    let ruta = archivo.path;
    let nombre = decision.nombre;
    if (archivo.size > SIZE_LIMIT) {
      const reducido = await shrinkForApi(archivo.path, limpieza);
      ruta = reducido.path;
      nombre = decision.nombre.replace(/\.[^.]+$/, "") + reducido.ext;
    }

    const texto = await transcribeWithGroq(ruta, nombre, apiKey);
    if (!texto.trim()) {
      throw new AudioError(
        "No se detecto voz en el audio. Revisa el microfono e intenta de nuevo.",
      );
    }
    return texto;
  } finally {
    for (const f of limpieza) fs.promises.unlink(f).catch(() => {});
  }
}

/** Respuesta de error uniforme para las rutas de audio del panel wmc. */
export function responderErrorAudio(
  res: Response,
  e: unknown,
  etiqueta: string,
  generico: string,
) {
  if (e instanceof AudioError) {
    res.status(422).json({ error: e.message });
    return;
  }
  console.error("[" + etiqueta + "]", e instanceof Error ? e.message : e);
  res.status(500).json({ error: generico });
}
