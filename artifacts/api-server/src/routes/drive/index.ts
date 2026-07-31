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
import { normalizeRole } from "@workspace/roles";
import { resolveBoard, saveBoard } from "../../lib/hub-board";
import {
  normalizarRaices,
  idDeRaiz,
  RAICES_POR_DEFECTO,
  type RaicesDrive,
} from "../../lib/raices-drive";

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
export function driveDe(user: unknown) {
  const auth = clienteGoogleDe(user as UsuarioConGoogle);
  return auth ? google.drive({ version: "v3", auth }) : null;
}

/** Responde 409 con el motivo si no hay Google conectado. */
export function sinGoogle(res: Response): void {
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

/* ---------------- Carpetas raíz configurables ----------------

   Estaban escritas a fuego en tres archivos, y dos de ellas ni coincidían. Ver
   lib/raices-drive.ts. Leerlas puede cualquiera: el explorador las necesita
   para abrir. Cambiarlas, solo dirección o Programación — apuntar la raíz a
   otra carpeta le cambia la pantalla a todo el equipo. */

function puedeConfigurarRaices(req: { user?: unknown }): boolean {
  const u = req.user as { role?: string; teamRole?: string } | undefined;
  if (!u) return false;
  if (u.role === "superadmin") return true;
  const rol = normalizeRole(u.teamRole);
  return rol === "ceo" || rol === "dev";
}

router.get("/drive/raices", async (req, res) => {
  const board = await resolveBoard().catch(() => null);
  res.json({
    raices: normalizarRaices((board?.data?.driveRaices ?? null) as Partial<RaicesDrive> | null),
    porDefecto: RAICES_POR_DEFECTO,
    puedeEditar: puedeConfigurarRaices(req),
  });
});

router.put("/drive/raices", async (req, res) => {
  if (!puedeConfigurarRaices(req)) {
    res.status(403).json({ error: "Solo la dirección o Programación pueden cambiar las carpetas raíz" });
    return;
  }
  const cuerpo = req.body as Partial<RaicesDrive> | undefined;
  // Se valida CADA campo que venga: un id que no lo es dejaría el explorador
  // apuntando a nada, y eso se ve exactamente igual que una carpeta vacía.
  for (const clave of ["equipo", "hub"] as const) {
    if (cuerpo?.[clave] !== undefined && idDeRaiz(cuerpo[clave]) === null) {
      res.status(400).json({
        error: `La carpeta "${clave}" no parece un id ni un enlace de Drive. Copia la URL de la carpeta desde el navegador.`,
      });
      return;
    }
  }

  const board = await resolveBoard();
  if (!board) {
    res.status(409).json({ error: "Todavía no hay un tablero de dirección donde guardarlas" });
    return;
  }
  // Se parte de lo guardado: un PUT con una sola raíz no puede resetear la otra.
  const guardadas = normalizarRaices((board.data?.driveRaices ?? null) as Partial<RaicesDrive> | null);
  const raices = normalizarRaices({ ...guardadas, ...(cuerpo ?? {}) });
  await saveBoard(board.boardUserId, { ...board.data, driveRaices: raices });
  res.json({ raices });
});

/**
 * Resuelve un `parentId` que puede ser un alias.
 *
 * El panel mandaba el id de la carpeta del Hub escrito a fuego en cuatro
 * sitios distintos. Ahora manda el alias "hub" (o "equipo") y lo resuelve
 * quien sabe la respuesta: el servidor, que es donde vive la configuración.
 * Un id de verdad sigue funcionando igual.
 */
export async function resolverCarpeta(valor: string | undefined): Promise<string | undefined> {
  if (valor !== "hub" && valor !== "equipo") return valor;
  const board = await resolveBoard().catch(() => null);
  return normalizarRaices((board?.data?.driveRaices ?? null) as Partial<RaicesDrive> | null)[valor];
}

router.get("/drive/files", async (req, res) => {
  const folderId = await resolverCarpeta((req.query.folderId as string) || undefined);
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
  const parentId = await resolverCarpeta((req.query.parentId as string) || undefined);

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

  const parentId = await resolverCarpeta((req.body as { parentId?: string }).parentId);

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
  const { name } = req.body as { name?: string; parentId?: string };
  const parentId = await resolverCarpeta((req.body as { parentId?: string }).parentId);
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
