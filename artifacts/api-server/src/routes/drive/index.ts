import { Router, type IRouter, type Response } from "express";
import { google } from "googleapis";
import {
  clienteGoogleDe,
  mensajeErrorGoogle,
  MENSAJE_SIN_GOOGLE,
  RUTA_CONECTAR_DRIVE,
  type UsuarioConGoogle,
} from "../../lib/google-auth";
import multer from "multer";
import { Readable } from "stream";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Cliente de Drive del usuario, o `null` si su cuenta no tiene Google conectado.
 *
 * Antes se construía siempre un cliente aunque los tokens fueran null:
 * googleapis lo acepta y revienta al hacer la petición con "No access, refresh
 * token, API key or refresh handler callback is set", que llegaba tal cual a la
 * pantalla a mitad de crear un contrato.
 */
function driveDe(user: unknown) {
  const auth = clienteGoogleDe(user as UsuarioConGoogle);
  return auth ? google.drive({ version: "v3", auth }) : null;
}

/** Responde 409 con el motivo si no hay Google conectado. */
function sinGoogle(res: Response): void {
  res.status(409).json({
    error: MENSAJE_SIN_GOOGLE,
    code: "google_no_conectado",
    conectar: RUTA_CONECTAR_DRIVE,
  });
}

/**
 * Id de carpeta listo para meter en una query de Drive.
 *
 * La query se arma concatenando, así que una comilla en el id rompe la
 * expresión o cuela condiciones ajenas. Drive escapa con barra invertida.
 */
function idSeguro(id: string): string {
  return id.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * ¿Tiene esta cuenta permiso de Drive?
 *
 * La UI lo necesita para poder ofrecer "Conectar Google Drive" ANTES de que
 * falle algo. Sin esto, lo único que veía la persona era una carpeta vacía.
 */
router.get("/drive/estado", (req, res) => {
  const conectado = Boolean(clienteGoogleDe(req.user as UsuarioConGoogle));
  res.json({ conectado, conectar: RUTA_CONECTAR_DRIVE, mensaje: conectado ? null : MENSAJE_SIN_GOOGLE });
});

router.get("/drive/files", async (req, res) => {
  const folderId = (req.query.folderId as string) || undefined;
  const pageToken = (req.query.pageToken as string) || undefined;

  try {
    const drive = driveDe(req.user);
    if (!drive) { sinGoogle(res); return; }

    let query = "trashed = false";
    if (folderId) {
      query += ` and '${idSeguro(folderId)}' in parents`;
    }

    const response = await drive.files.list({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,parents)",
      orderBy: "name",
      pageSize: 100,
      pageToken: pageToken || undefined,
    });

    res.json({
      files: response.data.files || [],
      nextPageToken: response.data.nextPageToken || undefined,
    });
  } catch (error: any) {
    console.error("[Drive] Error listing files:", error.message);
    res.status(500).json({ error: mensajeErrorGoogle(error) });
  }
});

router.get("/drive/folders", async (req, res) => {
  const parentId = (req.query.parentId as string) || undefined;

  try {
    const drive = driveDe(req.user);
    if (!drive) { sinGoogle(res); return; }

    let query = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    if (parentId) {
      query += ` and '${idSeguro(parentId)}' in parents`;
    }

    const response = await drive.files.list({
      q: query,
      fields: "files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents)",
      orderBy: "name",
      pageSize: 100,
    });

    res.json(response.data.files || []);
  } catch (error: any) {
    console.error("[Drive] Error listing folders:", error.message);
    res.status(500).json({ error: mensajeErrorGoogle(error) });
  }
});

router.get("/drive/search", async (req, res) => {
  const searchQuery = (req.query.q as string) || "";

  try {
    const drive = driveDe(req.user);
    if (!drive) { sinGoogle(res); return; }

    const query = `name contains '${searchQuery.replace(/'/g, "\\'")}' and trashed = false`;

    const response = await drive.files.list({
      q: query,
      fields: "files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,parents)",
      orderBy: "modifiedTime desc",
      pageSize: 50,
    });

    res.json(response.data.files || []);
  } catch (error: any) {
    console.error("[Drive] Error searching:", error.message);
    res.status(500).json({ error: mensajeErrorGoogle(error) });
  }
});

router.post("/drive/upload-pdf", upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }
  if (req.file.mimetype !== "application/pdf") { res.status(400).json({ error: "Solo se aceptan archivos PDF" }); return; }

  const { parentId } = req.body as { parentId?: string };

  try {
    const drive = driveDe(req.user);
    if (!drive) { sinGoogle(res); return; }

    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);

    const fileMetadata: { name: string; mimeType: string; parents?: string[] } = {
      name: req.file.originalname,
      mimeType: "application/pdf",
    };
    if (parentId) fileMetadata.parents = [parentId];

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: { mimeType: "application/pdf", body: bufferStream },
      fields: "id,name,webViewLink",
    });

    res.json({
      id: response.data.id,
      name: response.data.name,
      webViewLink: response.data.webViewLink,
      uploadedAt: Date.now(),
    });
  } catch (error: any) {
    console.error("[Drive] Error uploading PDF:", error.message);
    res.status(500).json({ error: mensajeErrorGoogle(error) });
  }
});

router.post("/drive/mkdir", async (req, res) => {
  const { name, parentId } = req.body as { name?: string; parentId?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    const drive = driveDe(req.user);
    if (!drive) { sinGoogle(res); return; }

    const fileMetadata: { name: string; mimeType: string; parents?: string[] } = {
      name: name.trim(),
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) {
      fileMetadata.parents = [parentId];
    }

    const response = await drive.files.create({
      requestBody: fileMetadata,
      fields: "id,name,webViewLink",
    });

    res.json({
      id: response.data.id,
      name: response.data.name,
      webViewLink: response.data.webViewLink,
    });
  } catch (error: any) {
    console.error("[Drive] Error creating folder:", error.message);
    res.status(500).json({ error: mensajeErrorGoogle(error) });
  }
});

export default router;
