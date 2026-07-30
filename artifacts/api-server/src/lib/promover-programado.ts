// Poner fecha a un video tiene que dejarlo PROGRAMADO.
//
// Arrastrar un video en el calendario mandaba solo `{scheduledAt}`, y la ruta
// escribía la fecha sin tocar `status`. Pero el publicador solo mira los que
// están en `scheduled`, así que un borrador arrastrado al martes se quedaba en
// borrador: la fecha se veía en el calendario, la hora llegaba, y no pasaba
// nada. Desde fuera eso es exactamente "programar videos no funciona".
//
// La regla vive aquí, separada de la ruta, para poder probarla sin base de
// datos: equivocarse aquí no rompe una pantalla, hace que no se publique nada.

/** Estados que puede tener un video en la tabla. */
export type EstadoVideo = "draft" | "scheduled" | "uploaded" | "published" | "error" | string;

/**
 * Estados desde los que poner fecha significa "quiero que esto se publique".
 *
 * `published` y `uploaded` quedan fuera a propósito: ya salieron, y volver a
 * programarlos sin querer los publicaría dos veces. Para eso está la
 * reprogramación explícita, que además limpia el estado de cada red.
 */
const PROMOVIBLES: ReadonlySet<string> = new Set(["draft", "scheduled", "error"]);

export interface CambioProgramacion {
  /** Nuevo `status`, o null si no hay que tocarlo. */
  status: "scheduled" | null;
  /** Por qué, para el registro. Null cuando no cambia nada. */
  motivo: string | null;
}

/**
 * Qué hacer con `status` cuando se le pone (o quita) fecha a un video.
 *
 * Quitar la fecha NO devuelve a borrador: alguien puede estar limpiando el
 * calendario de un video que ya se publicó, y degradarlo perdería el registro
 * de que salió.
 */
export function cambioAlProgramar(
  estadoActual: EstadoVideo,
  nuevaFecha: Date | string | null | undefined,
): CambioProgramacion {
  if (!nuevaFecha) return { status: null, motivo: null };
  if (estadoActual === "scheduled") return { status: null, motivo: null };
  if (!PROMOVIBLES.has(estadoActual)) {
    return { status: null, motivo: null };
  }
  return {
    status: "scheduled",
    motivo: `pasó de "${estadoActual}" a programado al ponerle fecha`,
  };
}

/* ==================== Validación previa ================================== */

/**
 * Redes que necesitan el archivo de video subido para poder publicar.
 *
 * Sin archivo el publicador las marca `skipped` con un motivo, pero eso se ve
 * DESPUÉS y en otra pantalla: quien programó cree que quedó todo listo.
 */
const REDES_CON_ARCHIVO = ["youtube", "tiktok", "instagram"] as const;

/** Texto que cada red necesita para tener algo que publicar. */
const TEXTO_REQUERIDO: Record<string, string[]> = {
  youtube: ["youtubeTitle", "youtubeDescription"],
  tiktok: ["tiktokDescription"],
  instagram: ["instagramDescription"],
  linkedin: ["linkedinDescription"],
  x: ["xDescription"],
  facebook: ["facebookDescription"],
};

export interface VideoProgramable {
  videoFileDriveId?: string | null;
  [campo: string]: unknown;
}

export interface AvisoProgramacion {
  red: string;
  /** Qué falta, en palabras de quien lo va a leer. */
  falta: string;
}

/**
 * Qué redes NO van a publicar aunque se programe, y por qué.
 *
 * Devuelve avisos, no errores: programar un video al que le falta el archivo
 * sigue siendo legítimo —se sube después—, pero hay que DECIRLO en el momento
 * en vez de dejar que se descubra cuando ya pasó la hora.
 */
export function avisosDeProgramacion(
  video: VideoProgramable,
  redesElegidas: readonly string[],
): AvisoProgramacion[] {
  const avisos: AvisoProgramacion[] = [];
  const tieneArchivo = Boolean(String(video.videoFileDriveId ?? "").trim());

  for (const red of redesElegidas) {
    if (!tieneArchivo && (REDES_CON_ARCHIVO as readonly string[]).includes(red)) {
      avisos.push({ red, falta: "el archivo de video" });
      continue;
    }
    const campos = TEXTO_REQUERIDO[red];
    if (!campos) continue;
    const tieneTexto = campos.some((c) => String(video[c] ?? "").trim().length > 0);
    if (!tieneTexto) avisos.push({ red, falta: "la descripción" });
  }
  return avisos;
}

/** Resumen legible de los avisos, para mostrarlo de una vez. */
export function resumirAvisos(avisos: readonly AvisoProgramacion[]): string {
  if (avisos.length === 0) return "";
  const porFalta = new Map<string, string[]>();
  for (const a of avisos) {
    porFalta.set(a.falta, [...(porFalta.get(a.falta) ?? []), a.red]);
  }
  return [...porFalta.entries()]
    .map(([falta, redes]) => `${redes.join(", ")}: falta ${falta}`)
    .join(" · ");
}
