// Decisiones del transcriptor: qué archivo se acepta y cómo se explica un fallo.
//
// Vive fuera de la ruta para poder probarlo sin Groq ni ffmpeg — que es la
// única forma de comprobar los casos que hacían que "a veces falle":
//
//  · Un audio sin extensión en el nombre se rechazaba con "Formato no
//    soportado: desconocido", aunque el tipo MIME lo identificara
//    perfectamente. Pasa todo el rato con notas de voz descargadas de
//    WhatsApp o Telegram, y desde fuera parece que el panel falla al azar.
//  · Los errores de Groq llegaban crudos a la pantalla ("Groq error 401:
//    Invalid API Key"), que no le dice a nadie qué hacer.

/** Extensiones que Groq acepta directamente. */
export const EXTENSIONES_SOPORTADAS = [
  ".mp3", ".m4a", ".ogg", ".wav", ".opus", ".aac", ".flac", ".webm", ".mp4", ".mpeg", ".mpga",
] as const;

/**
 * Tipos MIME que valen cuando el nombre no trae extensión utilizable.
 *
 * Se compara por prefijo: los navegadores y los mensajeros añaden parámetros
 * ("audio/ogg; codecs=opus") y hacer una comparación exacta los descartaba.
 */
const MIMES_SOPORTADOS = [
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac",
  "audio/ogg", "audio/opus", "audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave",
  "audio/flac", "audio/x-flac", "audio/webm",
  "video/mp4", "video/webm", "video/quicktime",
];

/** Extensión que se le pone a un archivo identificado solo por su MIME. */
const EXT_POR_MIME: Array<[string, string]> = [
  ["audio/mpeg", ".mp3"], ["audio/mp3", ".mp3"],
  ["audio/mp4", ".m4a"], ["audio/m4a", ".m4a"], ["audio/x-m4a", ".m4a"],
  ["audio/aac", ".aac"],
  ["audio/opus", ".opus"], ["audio/ogg", ".ogg"],
  ["audio/wav", ".wav"], ["audio/x-wav", ".wav"], ["audio/wave", ".wav"], ["audio/vnd.wave", ".wav"],
  ["audio/flac", ".flac"], ["audio/x-flac", ".flac"],
  ["audio/webm", ".webm"], ["video/webm", ".webm"],
  ["video/mp4", ".mp4"], ["video/quicktime", ".mp4"],
];

export interface ArchivoEntrante {
  nombre: string;
  mime?: string | null;
  bytes: number;
}

export type DecisionArchivo =
  | { ok: true; nombre: string; extension: string; renombrado: boolean }
  | { ok: false; motivo: string };

function extensionDe(nombre: string): string {
  const m = /\.[^.\\/]+$/.exec(nombre.trim());
  return m ? m[0].toLowerCase() : "";
}

function mimeSoportado(mime: string): string | null {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  if (!MIMES_SOPORTADOS.includes(base)) return null;
  return EXT_POR_MIME.find(([m]) => m === base)?.[1] ?? null;
}

/** Tope de subida (coincide con el límite de multer y con el aviso de la UI). */
export const LIMITE_SUBIDA_BYTES = 150 * 1024 * 1024;

/**
 * ¿Se puede transcribir este archivo?
 *
 * Cuando el nombre no trae una extensión utilizable pero el MIME sí identifica
 * el formato, se RENOMBRA en vez de rechazar. Groq usa la extensión para
 * decidir el decodificador, así que darle un nombre correcto es todo lo que
 * hacía falta — rechazarlo era tirar un archivo perfectamente válido.
 */
export function decidirArchivo(archivo: ArchivoEntrante): DecisionArchivo {
  const nombre = archivo.nombre.trim() || "audio";
  if (archivo.bytes <= 0) {
    return { ok: false, motivo: "El archivo llegó vacío. Vuelve a subirlo." };
  }
  if (archivo.bytes > LIMITE_SUBIDA_BYTES) {
    const mb = (archivo.bytes / 1048576).toFixed(0);
    return {
      ok: false,
      motivo: `El archivo pesa ${mb} MB y el máximo son ${LIMITE_SUBIDA_BYTES / 1048576} MB. Divídelo en partes o comprímelo antes de subirlo.`,
    };
  }

  const ext = extensionDe(nombre);
  if ((EXTENSIONES_SOPORTADAS as readonly string[]).includes(ext)) {
    return { ok: true, nombre, extension: ext, renombrado: false };
  }

  const porMime = archivo.mime ? mimeSoportado(archivo.mime) : null;
  if (porMime) {
    const base = ext ? nombre.slice(0, -ext.length) : nombre;
    return { ok: true, nombre: `${base}${porMime}`, extension: porMime, renombrado: true };
  }

  return {
    ok: false,
    motivo: ext
      ? `No podemos transcribir archivos ${ext}. Formatos aceptados: ${EXTENSIONES_SOPORTADAS.slice(0, 9).join(", ")}.`
      : `No pudimos reconocer el formato del archivo${archivo.mime ? ` (${archivo.mime})` : ""}. Guárdalo como MP3 o M4A y vuelve a subirlo.`,
  };
}

/**
 * Traduce un fallo a algo accionable.
 *
 * Lo que no reconocemos se devuelve tal cual: un mensaje inventado manda a la
 * persona a arreglar lo que no está roto.
 */
export function explicarFalloTranscripcion(crudo: string): string {
  const t = String(crudo || "").trim();
  if (!t) return "Falló sin decir por qué. Vuelve a intentarlo.";

  if (/401|invalid api key|unauthorized/i.test(t)) {
    return "La clave de Groq no es válida o caducó. Hay que actualizar GROQ_API_KEY en el servidor; reintentar no lo arregla.";
  }
  if (/rate limit|429|quota|capacity/i.test(t)) {
    return "Groq está limitando las peticiones ahora mismo. Espera un par de minutos y reintenta — el archivo sigue en la lista.";
  }
  if (/413|too large|maximum.*size|file size/i.test(t)) {
    return "El audio supera el tamaño que acepta el servicio incluso comprimido. Divídelo en partes más cortas.";
  }
  if (/ffmpeg/i.test(t) && /tiempo máximo|timeout/i.test(t)) {
    return "La conversión del audio tardó demasiado. Suele pasar con grabaciones muy largas: divídela en partes.";
  }
  if (/ffmpeg/i.test(t)) {
    return "No se pudo convertir el audio: puede estar dañado o incompleto. Prueba a reexportarlo como MP3.";
  }
  if (/no respondió en 5 minutos|timeouterror/i.test(t)) {
    return "Groq no respondió a tiempo. Reintenta; si vuelve a pasar, divide el audio en partes más cortas.";
  }
  if (/error de red|fetch failed|econnreset|enotfound|socket hang up/i.test(t)) {
    return "Se cortó la conexión con el servicio de transcripción. Reintenta en un momento.";
  }
  if (/ENOSPC|no space left/i.test(t)) {
    return "El servidor se quedó sin espacio temporal. Avisa al equipo técnico: no es algo que se arregle reintentando.";
  }
  return t;
}

/** true si reintentar no puede funcionar hasta que alguien cambie algo. */
export function requiereIntervencion(crudo: string): boolean {
  return /401|invalid api key|unauthorized|ENOSPC|no space left|GROQ_API_KEY/i.test(String(crudo || ""));
}
