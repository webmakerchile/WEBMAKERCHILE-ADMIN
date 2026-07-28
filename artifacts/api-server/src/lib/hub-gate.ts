/**
 * Quién entra a `/hub`.
 *
 * Conviven dos vocabularios de permisos: las ÁREAS (que gatean familias de
 * endpoints) y los ROLES (que definen `hubScopes`/`hubWrite` por colección).
 * Para el tablero en sí el control fino es el del rol: el servidor ya recorta
 * las colecciones y censura los montos antes de responder, así que sumarle el
 * gate por área solo dejaría fuera a roles que sí tienen scopes — le pasaba a
 * marketing, que lee proyectos, tareas y cartera pero no es del área ejecutivo.
 *
 * El resto de `/hub` (generación con IA, briefs, cobranza) sigue gateado por
 * área, porque ahí no hay un recorte por colección que lo cubra.
 */
export const HUB_ROLE_GATED_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/owner",
  // Redacta tareas a partir de un proyecto y NO escribe nada: lo que se haga
  // con la propuesta pasa después por /hub/tasks, que ya se guarda solo.
  // Estaba gateado por área, así que marketing —que sí crea tareas y sí lee
  // proyectos— recibía un 403 al pedir ayuda para redactarlas.
  "/projects/ai-extract-tasks",
]);

/** ¿Este sub-path de `/hub` necesita además el gate por área? */
export function hubNeedsAreaGate(path: string): boolean {
  if (HUB_ROLE_GATED_PATHS.has(path)) return false;
  // Las tareas son transversales al equipo: cada endpoint del router se guarda
  // solo (canWriteTasks, isCeoOrEjecutivo, asignado/creador). Gatearlas por
  // área dejaría fuera a marketing (crea tareas) y a los asignados de edición.
  return path !== "/tasks" && !path.startsWith("/tasks/");
}
