// Qué carpeta de Drive abre cada explorador.
//
// Había TRES ids escritos a fuego, en tres archivos distintos, y dos de ellos
// ni siquiera coincidían. Quien no tuviera acceso a ese id concreto —que es lo
// normal: son carpetas de una cuenta— veía el explorador vacío, sin ninguna
// pista de que estaba mirando la carpeta de otra persona. Y cambiarlo pedía
// tocar código y volver a desplegar.
//
// Son dos raíces de verdad, no una: el Drive del equipo (archivos generales,
// videos) y el del Hub Ejecutivo (carpetas de cliente). Meterlas en la misma
// haría que el explorador de videos se llenara de contratos.

export interface RaicesDrive {
  /** Drive general del equipo: /drive y el selector de videos. */
  equipo: string;
  /** Carpetas de cliente del Hub Ejecutivo. */
  hub: string;
}

/**
 * Valores de arranque: los ids que estaban escritos en el código.
 *
 * Se conservan para que nada cambie de sitio el día del despliegue. En cuanto
 * alguien guarde los suyos desde el panel, estos dejan de usarse.
 */
export const RAICES_POR_DEFECTO: RaicesDrive = {
  equipo: "1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB",
  hub: "15cBDWdrC2IIN6OlD4rP0fBCImGOh39--",
};

/**
 * Id de carpeta de Drive válido, o null.
 *
 * Acepta la URL entera además del id porque es lo que se copia del navegador:
 * pedir "solo el id" garantiza que alguien pegue la URL y el explorador quede
 * apuntando a nada.
 */
export function idDeRaiz(valor: unknown): string | null {
  const s = String(valor ?? "").trim();
  if (!s) return null;
  const enUrl = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(s) ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
  if (enUrl?.[1]) return enUrl[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}

/**
 * Carpeta propia de un proyecto (no la raíz general del Hub).
 *
 * Prioriza el id ya extraído (`driveFolderId`) y cae al enlace guardado en
 * `link` — que es lo único que tienen los proyectos vinculados a mano o
 * creados antes de que existiera `driveFolderId`. Sin este fallback esos
 * proyectos no resolvían carpeta propia y sus archivos subidos caían en la
 * raíz del Hub en vez de en la carpeta que la persona sí vinculó.
 */
export function carpetaPropiaDe(p: { driveFolderId?: unknown; link?: unknown } | null | undefined): string | null {
  return idDeRaiz(p?.driveFolderId) ?? idDeRaiz(p?.link);
}

/** Normaliza lo guardado, cayendo a los valores de arranque. */
export function normalizarRaices(crudas: Partial<RaicesDrive> | null | undefined): RaicesDrive {
  return {
    equipo: idDeRaiz(crudas?.equipo) ?? RAICES_POR_DEFECTO.equipo,
    hub: idDeRaiz(crudas?.hub) ?? RAICES_POR_DEFECTO.hub,
  };
}

/** URL para abrir una raíz en Drive y comprobar a ojo que es la correcta. */
export function urlDeRaiz(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}
