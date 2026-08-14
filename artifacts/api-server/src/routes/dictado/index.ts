import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import { db } from "@workspace/db";
import { hubState, users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { findBoardOwner } from "../../lib/hub-board";
import {
  decidirArchivo,
  explicarFalloTranscripcion,
  LIMITE_SUBIDA_BYTES,
} from "../../lib/transcripcion";
import { shrinkForApi, transcribeWithGroq, SIZE_LIMIT } from "../transcriber";
import {
  extraerTareas,
  extraerTickets,
  DictadoError,
  type ProyectoParaDictado,
  type PersonaEquipo,
} from "../../lib/dictado-ia";

/**
 * Dictado: audio -> transcripcion -> items estructurados.
 *
 * Devuelve una propuesta para revisar; NO crea nada. La creacion la hacen
 * POST /tickets y POST /hub/tasks, que ya tienen sus permisos y notificaciones.
 */
const router: IRouter = Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: LIMITE_SUBIDA_BYTES },
});

type UsuarioReq = { id?: number; role?: string; teamRole?: string } | undefined;

function recibirAudio(req: Request, res: Response, next: () => void) {
  upload.single("audio")(req, res, (err: unknown) => {
    if (!err) return next();
    const codigo = (err as { code?: string }).code;
    res.status(400).json({
      error:
        codigo === "LIMIT_FILE_SIZE"
          ? `El audio supera los ${Math.round(LIMITE_SUBIDA_BYTES / 1048576)} MB. Grabalo en partes mas cortas.`
          : "No se pudo leer el audio.",
    });
  });
}

/** Transcribe el archivo subido y limpia los temporales. */
async function transcribir(req: Request): Promise<string> {
  const archivo = req.file;
  if (!archivo) throw new DictadoError("No llego ningun audio.");
  const limpieza: string[] = [archivo.path];
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new DictadoError("Falta configurar GROQ_API_KEY para transcribir.");

    const nombreOriginal = Buffer.from(archivo.originalname, "latin1").toString("utf8");
    const decision = decidirArchivo({
      nombre: nombreOriginal,
      mime: archivo.mimetype,
      bytes: archivo.size,
    });
    if (!decision.ok) throw new DictadoError(decision.motivo);

    let ruta = archivo.path;
    let nombre = decision.nombre;
    if (archivo.size > SIZE_LIMIT) {
      const reducido = await shrinkForApi(archivo.path, limpieza);
      ruta = reducido.path;
      nombre = decision.nombre.replace(/\.[^.]+$/, "") + reducido.ext;
    }

    const texto = await transcribeWithGroq(ruta, nombre, apiKey);
    if (!texto.trim()) {
      throw new DictadoError("No se detecto voz en el audio. Revisa el microfono e intenta de nuevo.");
    }
    return texto;
  } finally {
    for (const f of limpieza) fs.promises.unlink(f).catch(() => {});
  }
}

function responderError(res: Response, e: unknown) {
  if (e instanceof DictadoError) {
    res.status(422).json({ error: e.message });
    return;
  }
  const mensaje = e instanceof Error ? e.message : String(e);
  console.error("[dictado]", mensaje);
  res.status(500).json({ error: explicarFalloTranscripcion(mensaje) });
}

/** Carga el equipo para que la IA pueda resolver "encargado a ...". */
async function cargarEquipo(): Promise<PersonaEquipo[]> {
  const filas = await db
    .select({ id: users.id, nombre: users.name, email: users.email, rol: users.teamRole })
    .from(users);
  return filas
    .map((u) => ({
      id: u.id,
      nombre: (u.nombre || u.email || "").trim(),
      rol: u.rol || undefined,
    }))
    .filter((p) => p.nombre.length > 0);
}

/** Proyectos del tablero compartido (board owner), no del usuario que dicta. */
async function cargarProyectos(): Promise<ProyectoParaDictado[]> {
  const owner = await findBoardOwner();
  if (!owner) return [];
  const [fila] = await db
    .select({ datos: hubState.data })
    .from(hubState)
    .where(eq(hubState.userId, owner.id))
    .limit(1);
  const datos = (fila?.datos ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(datos.projects)
    ? (datos.projects as Record<string, unknown>[])
    : [];
  return lista
    .map((p) => ({
      ref: p?.id != null ? String(p.id) : "",
      nombre: p?.name != null ? String(p.name) : "",
      cliente: p?.client != null ? String(p.client) : undefined,
    }))
    .filter((p) => p.ref && p.nombre);
}

/** Dictado -> tickets propuestos con area, prioridad, encargado y fecha limite. */
router.post("/dictado/tickets", recibirAudio, async (req: Request, res: Response) => {
  try {
    const equipo = await cargarEquipo();
    const texto = await transcribir(req);
    const items = await extraerTickets(texto, equipo);
    res.json({ texto, items, equipo });
  } catch (e) {
    responderError(res, e);
  }
});

/** Dictado -> tareas del tablero con proyecto, encargado, prioridad y fecha limite. */
router.post("/dictado/tareas", recibirAudio, async (req: Request, res: Response) => {
  try {
    const [proyectos, equipo] = await Promise.all([cargarProyectos(), cargarEquipo()]);
    const texto = await transcribir(req);
    const items = await extraerTareas(texto, proyectos, equipo);
    res.json({ texto, items, proyectos, equipo });
  } catch (e) {
    responderError(res, e);
  }
});

export default router;
