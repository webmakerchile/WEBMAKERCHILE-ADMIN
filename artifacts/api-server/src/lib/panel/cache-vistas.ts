/**
 * Caché en memoria (60s) de las vistas en vivo del panel (resumen,
 * mantención, finanzas, vistas 360). Se limpia tras CADA sync exitoso —
 * programado o manual — y tras cada escritura delegada, para que lo recién
 * sincronizado/escrito se vea al tiro.
 *
 * Es por instancia de proceso: el TTL corto acota el desfase máximo entre
 * instancias a 60s, que para estas vistas de lectura es aceptable.
 */

const cache = new Map<string, { hasta: number; datos: unknown }>();
const TTL_MS = 60_000;

export function vistaEnCache(clave: string): unknown {
  const hit = cache.get(clave);
  return hit && hit.hasta > Date.now() ? hit.datos : undefined;
}

export function guardarVista(clave: string, datos: unknown): void {
  if (cache.size > 200) cache.clear();
  cache.set(clave, { hasta: Date.now() + TTL_MS, datos });
}

export function limpiarCacheVistas(): void {
  cache.clear();
}
