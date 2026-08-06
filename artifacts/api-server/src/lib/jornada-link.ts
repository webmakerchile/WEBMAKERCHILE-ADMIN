/**
 * A dónde llevan los avisos de jornada (bot de Discord, marcaje por
 * supervisión): todo el equipo marca su jornada desde el mismo "Mi día" del
 * panel, sin importar el área — ya no vive dentro del Hub Ejecutivo.
 */
export function jornadaLink(_teamRole?: string | null): string {
  return "/mi-dia";
}
