// Reprogramar una publicación: mover la fecha y decidir qué redes se reintentan.
//
// No existía. Una vez programada, la publicación era de un solo uso: si fallaba
// una red, si se publicaba a medias o si simplemente había que correr la fecha,
// no había nada que tocar. El scheduler tampoco lo permitía por su cuenta,
// porque una red que falla de forma permanente queda en status "error" y
// `isTerminalError` la bloquea para siempre, y una red que se omitió por
// faltarle la descripción queda en "skipped", que es indistinguible de "el
// usuario no la eligió". Reprogramar tiene que limpiar ESO, no solo la fecha.
//
// La decisión de qué redes entran es explícita y del usuario. Adivinarla es
// justo lo que no se puede hacer: reintentar sola una red que alguien excluyó
// a propósito significa publicar en una cuenta real que nadie eligió.
//
// La lógica vive aquí, fuera de la ruta, para poder probarla sin base de datos.

export const PLATAFORMAS_PUBLICACION = [
  "youtube",
  "tiktok",
  "instagram",
  "linkedin",
  "x",
  "facebook",
] as const;

export type PlataformaPublicacion = (typeof PLATAFORMAS_PUBLICACION)[number];

export const NOMBRE_PLATAFORMA: Record<PlataformaPublicacion, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
};

interface CamposPlataforma {
  status: string;
  retries: string;
  error: string;
  nextRetryAt: string;
  /** Id del post ya publicado: si existe, la red no se puede volver a publicar. */
  postId: string;
}

export const CAMPOS_PLATAFORMA: Record<PlataformaPublicacion, CamposPlataforma> = {
  youtube:   { status: "youtubeStatus",   retries: "youtubeRetries",   error: "youtubeError",   nextRetryAt: "youtubeNextRetryAt",   postId: "youtubeVideoId" },
  tiktok:    { status: "tiktokStatus",    retries: "tiktokRetries",    error: "tiktokError",    nextRetryAt: "tiktokNextRetryAt",    postId: "tiktokPublishId" },
  instagram: { status: "instagramStatus", retries: "instagramRetries", error: "instagramError", nextRetryAt: "instagramNextRetryAt", postId: "instagramMediaId" },
  linkedin:  { status: "linkedinStatus",  retries: "linkedinRetries",  error: "linkedinError",  nextRetryAt: "linkedinNextRetryAt",  postId: "linkedinPostId" },
  x:         { status: "xStatus",         retries: "xRetries",         error: "xError",         nextRetryAt: "xNextRetryAt",         postId: "xPostId" },
  facebook:  { status: "facebookStatus",  retries: "facebookRetries",  error: "facebookError",  nextRetryAt: "facebookNextRetryAt",  postId: "facebookPostId" },
};

/** Motivo que queda escrito en una red que el usuario dejó fuera al reprogramar. */
export const MOTIVO_FUERA_DE_REPROGRAMACION =
  "No se incluyó en la reprogramación. Vuelve a reprogramar marcándola si quieres publicarla.";

export type EstadoRed = "publicada" | "error" | "omitida" | "reintentando" | "pendiente";

export interface RedReprogramable {
  plataforma: PlataformaPublicacion;
  nombre: string;
  estado: EstadoRed;
  /** false cuando ya se publicó: volver a intentarlo no haría nada. */
  reprogramable: boolean;
  /** Último error o motivo de omisión, tal como lo dejó el scheduler. */
  detalle: string | null;
}

type FilaVideo = Record<string, unknown>;

function leer<T>(video: FilaVideo, campo: string): T | null {
  const v = video[campo];
  return (v ?? null) as T | null;
}

export function estadoDeRed(video: FilaVideo, p: PlataformaPublicacion): EstadoRed {
  const f = CAMPOS_PLATAFORMA[p];
  if (leer<string>(video, f.postId)) return "publicada";
  const status = leer<string>(video, f.status);
  // "uploaded" es publicada a medias en TikTok/YouTube (el archivo ya se
  // subió). Repetirlo duplicaría el video, así que cuenta como publicada.
  if (status === "published" || status === "uploaded") return "publicada";
  if (status === "error") return "error";
  if (status === "skipped") return "omitida";
  if (status === "retrying") return "reintentando";
  return "pendiente";
}

/** Estado de cada red para que la UI muestre qué se puede reintentar. */
export function redesReprogramables(video: FilaVideo): RedReprogramable[] {
  return PLATAFORMAS_PUBLICACION.map((p) => {
    const estado = estadoDeRed(video, p);
    return {
      plataforma: p,
      nombre: NOMBRE_PLATAFORMA[p],
      estado,
      reprogramable: estado !== "publicada",
      detalle: leer<string>(video, CAMPOS_PLATAFORMA[p].error),
    };
  });
}

export interface PlanReprogramacion {
  /** Campos a escribir en la fila del video. */
  cambios: Record<string, unknown>;
  /** Redes que quedan listas para un intento nuevo. */
  reintentadas: PlataformaPublicacion[];
  /** Redes pedidas que ya estaban publicadas: se ignoran, no se duplican. */
  yaPublicadas: PlataformaPublicacion[];
  /** Redes que quedan fuera con el motivo escrito. */
  excluidas: PlataformaPublicacion[];
}

/**
 * Calcula todo lo que hay que escribir para reprogramar.
 *
 * Reglas:
 * - Una red ya publicada nunca se reintenta, aunque venga marcada: el guardia
 *   del scheduler la cortaría igual, y decirlo aquí permite avisar al usuario.
 * - Una red marcada vuelve a "pending" con error, contador y cooldown limpios.
 *   Sin eso, "error" la bloquea de por vida y "skipped" la excluye en silencio.
 * - Una red NO marcada que seguía viva queda "skipped" con el motivo escrito:
 *   si se dejara en "pending" el scheduler la publicaría igual y la casilla
 *   sin marcar sería mentira.
 */
export function planReprogramacion(
  video: FilaVideo,
  scheduledAt: Date,
  plataformas: readonly PlataformaPublicacion[],
): PlanReprogramacion {
  const pedidas = new Set(plataformas);
  const cambios: Record<string, unknown> = {
    scheduledAt,
    status: "scheduled",
    workflowStatus: "programado",
    // El cooldown global se recalcula solo en el próximo fallo; dejarlo puesto
    // haría que el scheduler tomara el video antes de la fecha nueva.
    nextRetryAt: null,
    updatedAt: new Date(),
  };

  const reintentadas: PlataformaPublicacion[] = [];
  const yaPublicadas: PlataformaPublicacion[] = [];
  const excluidas: PlataformaPublicacion[] = [];

  for (const p of PLATAFORMAS_PUBLICACION) {
    const f = CAMPOS_PLATAFORMA[p];
    const estado = estadoDeRed(video, p);

    if (estado === "publicada") {
      if (pedidas.has(p)) yaPublicadas.push(p);
      continue; // se deja intacta
    }

    if (pedidas.has(p)) {
      cambios[f.status] = "pending";
      cambios[f.error] = null;
      cambios[f.retries] = 0;
      cambios[f.nextRetryAt] = null;
      reintentadas.push(p);
    } else if (estado !== "omitida") {
      cambios[f.status] = "skipped";
      cambios[f.error] = MOTIVO_FUERA_DE_REPROGRAMACION;
      cambios[f.nextRetryAt] = null;
      excluidas.push(p);
    }
  }

  return { cambios, reintentadas, yaPublicadas, excluidas };
}

/** Motivo por el que una reprogramación no se puede aceptar, o null si es válida. */
export function motivoReprogramacionInvalida(
  video: FilaVideo,
  scheduledAt: Date,
  plataformas: readonly PlataformaPublicacion[],
): string | null {
  if (Number.isNaN(scheduledAt.getTime())) return "La fecha de publicación no es válida.";
  if (scheduledAt.getTime() <= Date.now()) {
    return "La fecha tiene que ser futura: una fecha pasada haría que se publique de inmediato.";
  }
  if (plataformas.length === 0) {
    return "Marca al menos una red para reprogramar.";
  }
  const utiles = plataformas.filter((p) => estadoDeRed(video, p) !== "publicada");
  if (utiles.length === 0) {
    return "Las redes que marcaste ya están publicadas. Volver a intentarlas duplicaría la publicación.";
  }
  return null;
}
