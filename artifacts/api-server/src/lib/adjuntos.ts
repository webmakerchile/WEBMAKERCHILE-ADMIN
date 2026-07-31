// Reglas de los archivos adjuntos.
//
// Hasta ahora adjuntar significaba UNA cosa: subir un PDF a un contrato. La
// ruta rechazaba cualquier otro tipo, no guardaba nada en la base y el enlace
// se pegaba a mano en un campo de texto. Proyectos, tareas y tickets no tenían
// nada, así que los archivos del trabajo diario circulaban por WhatsApp.
//
// Esto es la parte que se puede probar sin Drive ni base de datos: qué se
// acepta, a qué se puede adjuntar y cómo se llama el archivo al llegar. Son
// decisiones que, si fallan, no dan error — dan un archivo que nadie encuentra
// o un nombre que rompe la carpeta.

/** A qué se puede adjuntar algo. */
export const TIPOS_ADJUNTABLES = ["project", "task", "ticket", "contract", "empresa"] as const;
export type TipoAdjuntable = (typeof TIPOS_ADJUNTABLES)[number];

export function tipoValido(v: unknown): TipoAdjuntable | null {
  const s = String(v ?? "").trim().toLowerCase();
  return (TIPOS_ADJUNTABLES as readonly string[]).includes(s) ? (s as TipoAdjuntable) : null;
}

/**
 * Id de la entidad, como texto.
 *
 * Las entidades no comparten tipo de id: proyectos y contratos viven en el blob
 * con ids de texto, tareas y tickets son enteros. Se guarda como texto para no
 * necesitar una tabla por tipo, pero se acota: un id vacío adjuntaría el
 * archivo a "nada" y no volvería a aparecer en ninguna ficha.
 */
export function idValido(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s.length > 120) return null;
  return /^[A-Za-z0-9_.:-]+$/.test(s) ? s : null;
}

/** Tope por archivo. Drive aguanta más; el límite es el de multer y la memoria. */
export const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Tipos que NO se aceptan.
 *
 * Es una lista de exclusión, no de inclusión: el reporte era justamente que
 * solo se aceptaba PDF, así que una lista blanca repetiría el problema con
 * otro nombre. Lo que se corta es lo ejecutable, que no es un adjunto de
 * trabajo y sí es lo que convierte una carpeta compartida en un problema.
 */
const EXTENSIONES_BLOQUEADAS = new Set([
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "cpl",
  "jar", "app", "dmg", "sh", "ps1", "vbs", "js", "jse", "wsf", "hta",
]);

export function extensionDe(nombre: string): string {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(String(nombre ?? "").trim());
  return m ? m[1].toLowerCase() : "";
}

/** Motivo por el que no se acepta el archivo, o null si se acepta. */
export function motivoRechazo(archivo: { originalname?: string; size?: number } | null | undefined): string | null {
  if (!archivo || !archivo.originalname) return "No llegó ningún archivo.";
  const tam = Number(archivo.size ?? 0);
  if (!Number.isFinite(tam) || tam <= 0) return "El archivo llegó vacío.";
  if (tam > MAX_BYTES) {
    return `El archivo pesa ${Math.round(tam / 1024 / 1024)} MB y el máximo son ${MAX_BYTES / 1024 / 1024} MB. Súbelo a Drive y pega el enlace.`;
  }
  const ext = extensionDe(archivo.originalname);
  if (EXTENSIONES_BLOQUEADAS.has(ext)) {
    return `No se aceptan archivos .${ext}: son ejecutables, no documentos de trabajo.`;
  }
  return null;
}

/**
 * Nombre con el que se guarda en Drive.
 *
 * Se limpia lo que Drive no admite y se acota el largo. Un nombre vacío —que
 * pasa con archivos subidos desde el móvil— dejaría un archivo sin nombre en la
 * carpeta compartida, imposible de distinguir de los demás.
 */
export function nombreSeguro(nombre: string): string {
  const limpio = String(nombre ?? "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpio) return "archivo";
  // Se recorta por delante conservando la extensión: cortar por el final la
  // perdería y el archivo dejaría de abrirse con su programa.
  if (limpio.length <= 200) return limpio;
  const ext = extensionDe(limpio);
  return ext ? `${limpio.slice(0, 200 - ext.length - 1)}.${ext}` : limpio.slice(0, 200);
}

/** Etiqueta legible del tipo, para los mensajes. */
export const NOMBRE_TIPO: Record<TipoAdjuntable, string> = {
  project: "el proyecto",
  task: "la tarea",
  ticket: "la solicitud",
  contract: "el contrato",
  // La bóveda de documentos de la empresa (e-RUT, escritura, certificados):
  // una sola "entidad" fija, con id "webmaker".
  empresa: "la empresa",
};

/** Tamaño legible. `null` cuando Drive no lo devolvió. */
export function tamanoLegible(bytes: number | null | undefined): string | null {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
