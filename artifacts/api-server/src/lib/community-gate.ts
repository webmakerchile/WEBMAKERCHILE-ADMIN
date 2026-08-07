import { hasArea, type AreaCheckUser } from "./require-area";

/**
 * Quién entra a `/community`.
 *
 * `/community` reúne dos productos distintos detrás del mismo prefijo:
 * "Posts IA" (descripciones, interactivo, portada para reel) e Historias.
 * Por defecto el área es "marketing" (+ ceo), pero Editora (área "edicion")
 * necesita Posts IA — Historias NO se pidió abrirle, así que sigue exclusivo
 * de marketing/dirección.
 *
 * Los helpers compartidos entre ambos productos (sorprendeme, set-options,
 * borradores) no se pueden partir sin cambiar su forma — igual que
 * `/hub/tasks` es transversal en `hub-gate.ts` — así que quedan del lado
 * abierto a Editora. Pero eso solo exime el PATH; los endpoints de
 * `borradores` sirven filas de ambos productos por id, así que además deben
 * comprobar el `kind` de cada fila con `puedeVerHistorias` antes de servir o
 * borrar una fila de Historias — de lo contrario Editora podría leer o
 * destruir contenido de Historias por ese endpoint compartido aunque el path
 * en sí no sea `/historias`.
 */
export function communityIsHistoriasOnly(path: string): boolean {
  return path === "/historias" || path.startsWith("/historias/");
}

/** Puede ver/gestionar filas de Historias (kind "historia") en endpoints compartidos como `borradores`. */
export function puedeVerHistorias(user: AreaCheckUser): boolean {
  return hasArea(user, "ceo", "marketing");
}
