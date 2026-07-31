// Adjuntar archivos a proyectos, tareas, tickets y contratos.
//
// Lo que había era `/drive/upload-pdf`: aceptaba SOLO PDF, SOLO para contratos,
// y no guardaba nada en la base — el archivo iba a Drive y el enlace se pegaba
// a mano en un campo de texto del blob. Los archivos del trabajo diario
// (mockups, logos del cliente, capturas de un bug) no tenían dónde ir, así que
// circulaban por WhatsApp.
//
// El archivo sigue viviendo en Drive. Esta tabla guarda a qué está adjunto,
// quién lo subió y cuándo: sin eso no hay forma de listar "los archivos de este
// ticket" salvo recorrer Drive adivinando por el nombre.

import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { Readable } from "stream";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { attachments } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  clienteGoogleDe,
  mensajeErrorGoogle,
  MENSAJE_SIN_GOOGLE,
  RUTA_CONECTAR_DRIVE,
  type UsuarioConGoogle,
} from "../../lib/google-auth";
import {
  tipoValido,
  idValido,
  motivoRechazo,
  nombreSeguro,
  MAX_BYTES,
  NOMBRE_TIPO,
} from "../../lib/adjuntos";
import { resolveBoard } from "../../lib/hub-board";
import { normalizarRaices, type RaicesDrive } from "../../lib/raices-drive";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

type AuthUser = { id: number; role?: string; teamRole?: string };

function driveDe(user: unknown) {
  const auth = clienteGoogleDe(user as UsuarioConGoogle);
  return auth ? google.drive({ version: "v3", auth }) : null;
}

/**
 * Dónde se guarda el archivo.
 *
 * En la carpeta del proyecto si la tiene; si no, en la raíz de clientes. Nunca
 * suelto en "Mi unidad" de quien sube: ahí solo lo ve esa persona, que es
 * exactamente lo que hacía que los archivos se perdieran.
 */
async function carpetaDestino(tipo: string, entidadId: string): Promise<string | undefined> {
  const board = await resolveBoard().catch(() => null);
  const raices = normalizarRaices((board?.data?.driveRaices ?? null) as Partial<RaicesDrive> | null);
  if (tipo === "project") {
    const proyectos = Array.isArray(board?.data?.projects) ? (board!.data!.projects as Record<string, unknown>[]) : [];
    const p = proyectos.find((x) => String(x?.id) === entidadId);
    const propia = String(p?.driveFolderId ?? "").trim();
    if (propia) return propia;
  }
  return raices.hub;
}

/** GET /adjuntos?tipo=project&id=abc — los archivos de una entidad. */
router.get("/adjuntos", async (req: Request, res: Response) => {
  const tipo = tipoValido(req.query.tipo);
  const entidadId = idValido(req.query.id);
  if (!tipo || !entidadId) {
    res.status(400).json({ error: "Faltan 'tipo' y 'id' válidos" });
    return;
  }
  const filas = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityType, tipo), eq(attachments.entityId, entidadId)))
    .orderBy(desc(attachments.createdAt));
  res.json({ adjuntos: filas });
});

/** POST /adjuntos — sube el archivo a Drive y lo registra. */
router.post("/adjuntos", upload.single("file"), async (req: Request, res: Response) => {
  const usuario = req.user as AuthUser | undefined;
  if (!usuario) { res.status(401).json({ error: "No autenticado" }); return; }

  const cuerpo = req.body as { tipo?: string; id?: string };
  const tipo = tipoValido(cuerpo.tipo);
  const entidadId = idValido(cuerpo.id);
  if (!tipo || !entidadId) {
    res.status(400).json({ error: "Falta indicar a qué se adjunta ('tipo' e 'id')" });
    return;
  }

  // Se valida ANTES de tocar Drive: no tiene sentido gastar una subida para
  // rechazarla después, y el error llega más rápido.
  const motivo = motivoRechazo(req.file);
  if (motivo) { res.status(400).json({ error: motivo }); return; }

  const drive = driveDe(usuario);
  if (!drive) {
    // Se dice qué falta y cómo arreglarlo. Un 500 genérico aquí fue lo que hizo
    // que "no permite adjuntar" pareciera un fallo del botón.
    res.status(409).json({
      error: MENSAJE_SIN_GOOGLE,
      code: "google_no_conectado",
      conectar: RUTA_CONECTAR_DRIVE,
    });
    return;
  }

  const archivo = req.file!;
  const nombre = nombreSeguro(archivo.originalname);

  try {
    const parents = await carpetaDestino(tipo, entidadId);
    const cuerpoStream = new Readable();
    cuerpoStream.push(archivo.buffer);
    cuerpoStream.push(null);

    const subido = await drive.files.create({
      requestBody: {
        name: nombre,
        ...(parents ? { parents: [parents] } : {}),
      },
      media: { mimeType: archivo.mimetype || "application/octet-stream", body: cuerpoStream },
      fields: "id,name,mimeType,size,webViewLink",
    });

    const driveFileId = subido.data.id;
    if (!driveFileId) throw new Error("Drive no devolvió el id del archivo");

    const [fila] = await db
      .insert(attachments)
      .values({
        entityType: tipo,
        entityId: entidadId,
        name: subido.data.name || nombre,
        mimeType: subido.data.mimeType || archivo.mimetype || null,
        size: Number(subido.data.size) || archivo.size || null,
        driveFileId,
        driveLink: subido.data.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`,
        uploadedById: usuario.id,
      })
      .returning();

    res.status(201).json({ adjunto: fila });
  } catch (error: unknown) {
    const msg = mensajeErrorGoogle(error);
    console.error(`[Adjuntos] fallo subiendo a ${tipo}:${entidadId}:`, msg);
    res.status(502).json({ error: `No se pudo subir el archivo a ${NOMBRE_TIPO[tipo]}: ${msg}` });
  }
});

/**
 * DELETE /adjuntos/:id — desvincula el archivo.
 *
 * NO se borra de Drive a propósito: el archivo puede ser del cliente, estar
 * compartido o enlazado desde otro sitio, y un borrado remoto no se deshace.
 * Se quita de la ficha, que es lo que se pidió.
 */
router.delete("/adjuntos/:id", async (req: Request, res: Response) => {
  const usuario = req.user as AuthUser | undefined;
  if (!usuario) { res.status(401).json({ error: "No autenticado" }); return; }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Id no válido" }); return; }

  const [fila] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (!fila) { res.status(404).json({ error: "Ese adjunto ya no existe" }); return; }

  // Quien lo subió, o la dirección. Cualquiera podría quitar el brief que otro
  // acaba de dejar y no quedaría rastro de quién fue.
  const esSuyo = fila.uploadedById === usuario.id;
  const esDireccion = usuario.role === "superadmin" || usuario.teamRole === "ceo";
  if (!esSuyo && !esDireccion) {
    res.status(403).json({ error: "Solo quien lo subió (o la dirección) puede quitarlo" });
    return;
  }

  await db.delete(attachments).where(eq(attachments.id, id));
  res.json({ ok: true, sigueEnDrive: fila.driveLink });
});

export default router;
