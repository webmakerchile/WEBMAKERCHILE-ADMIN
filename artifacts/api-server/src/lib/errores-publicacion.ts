// Traducción de los errores de publicación a algo que se pueda accionar.
//
// El aviso de "Publicación parcial" mostraba el error crudo de cada API. Este
// es un ejemplo real de lo que veía el equipo:
//
//   FB: (#200) If posting to a group, requires app being installed in the group,
//   and either publish_to_groups permission with user token, or both
//   pages_read_engagement and pages_manage_posts permission with page token…
//
// Eso no le dice a nadie qué hacer. Aquí los fallos conocidos se convierten en
// una frase con el paso siguiente; lo que no reconocemos se deja tal cual,
// porque un mensaje inventado sería peor que el técnico.

export type RedPublicacion = "youtube" | "tiktok" | "instagram" | "linkedin" | "x" | "facebook";

export const NOMBRE_RED: Record<RedPublicacion, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
};

interface Regla {
  red?: RedPublicacion;
  prueba: RegExp;
  mensaje: string;
}

const REGLAS: Regla[] = [
  // Facebook: permisos de página. Es configuración de la app de Meta, no algo
  // que se arregle reintentando, así que el mensaje tiene que decirlo.
  {
    red: "facebook",
    prueba: /#200|pages_manage_posts|pages_read_engagement|publish_to_groups/i,
    mensaje:
      "Falta autorizar la publicación en la página. En Meta Business, la app de WebMaker necesita los permisos pages_read_engagement y pages_manage_posts sobre la página, y quien conecta debe ser administrador. Reintentar no lo arregla hasta que se conceda el permiso.",
  },
  {
    red: "facebook",
    prueba: /#190|access token|session has expired|OAuthException/i,
    mensaje: "La conexión con Facebook caducó. Vuelve a conectar la página desde Cuentas Sociales.",
  },
  // X: cuota agotada. El plan de la API tiene un tope mensual de posts.
  {
    prueba: /credits? depleted|usage cap|too many requests|rate limit exceeded/i,
    mensaje:
      "Se agotó la cuota del plan de la API. No es un fallo del panel: hay que esperar a que se renueve el ciclo o subir de plan en la plataforma.",
  },
  {
    red: "x",
    prueba: /401|unauthorized|invalid token/i,
    mensaje: "La conexión con X caducó. Vuelve a conectarla desde Cuentas Sociales.",
  },
  // Instagram: token de servidor inválido o vencido. Meta devuelve mensajes
  // técnicos distintos según el caso ("Cannot parse access token", "Invalid
  // OAuth access token", #190) pero todos significan lo mismo: hay que pegar
  // un token nuevo en Ajustes, no reintentar.
  {
    red: "instagram",
    prueba: /access token|OAuthException|cannot parse|#190/i,
    mensaje:
      "El token de acceso de Instagram no es válido o venció. Hay que generar uno nuevo en Meta Business y actualizarlo en Ajustes → Instagram; reintentar no lo arregla.",
  },
  {
    red: "instagram",
    prueba: /aspect ratio|not supported.*(format|ratio)/i,
    mensaje:
      "Instagram rechazó el formato de la imagen. El feed solo acepta entre 4:5 y 1.91:1; lo más vertical va como historia.",
  },
  {
    red: "instagram",
    prueba: /media type|invalid.*(image|video)|unsupported/i,
    mensaje: "Instagram no aceptó el archivo. Revisa que sea una imagen JPG o PNG, o un video MP4.",
  },
  // Google / YouTube.
  {
    red: "youtube",
    prueba: /quotaExceeded|dailyLimitExceeded/i,
    mensaje: "Se agotó la cuota diaria de la API de YouTube. Vuelve a intentarlo mañana.",
  },
  {
    prueba: /invalid_grant|No access, refresh token|Invalid Credentials/i,
    mensaje: "La conexión con esta red caducó o fue revocada. Vuelve a conectarla desde Cuentas Sociales.",
  },
  // Genéricos de red.
  {
    prueba: /ETIMEDOUT|ECONNRESET|ENOTFOUND|socket hang up|network/i,
    mensaje: "La red no respondió a tiempo. Se reintenta solo; si insiste, vuelve a lanzarlo en unos minutos.",
  },
];

/**
 * Convierte el error crudo de una plataforma en una frase accionable.
 *
 * Si no reconocemos el error se devuelve el original: inventar una explicación
 * mandaría a la persona a arreglar lo que no está roto.
 */
export function explicarErrorPublicacion(red: RedPublicacion, crudo: string): string {
  const texto = String(crudo || "").trim();
  if (!texto) return "Falló sin decir por qué.";
  for (const r of REGLAS) {
    if (r.red && r.red !== red) continue;
    if (r.prueba.test(texto)) return r.mensaje;
  }
  return texto;
}

/** true si reintentar no puede funcionar hasta que alguien cambie algo. */
export function requiereIntervencion(red: RedPublicacion, crudo: string): boolean {
  const texto = String(crudo || "");
  return /#200|pages_manage_posts|pages_read_engagement|#190|invalid_grant|credits? depleted|usage cap|quotaExceeded|unauthorized|Invalid Credentials|access token|OAuthException|cannot parse/i.test(
    texto,
  );
}

/** Resumen legible de una publicación parcial, red por red. */
export function resumirFallos(fallos: Array<{ red: RedPublicacion; error: string }>): string[] {
  return fallos.map((f) => `${NOMBRE_RED[f.red]}: ${explicarErrorPublicacion(f.red, f.error)}`);
}
