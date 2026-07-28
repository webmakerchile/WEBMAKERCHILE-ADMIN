import { areaOfRole } from "@workspace/areas";

/**
 * A dónde llevan los avisos de jornada (bot de Discord, marcaje por
 * supervisión): quienes trabajan en el Hub Ejecutivo (dirección, ventas,
 * programación, contabilidad, RRHH) aterrizan en su apartado "Mi día" dentro
 * del Hub; el resto (edición, marketing) sigue yendo al "Mi día" del panel,
 * porque el Hub les está vedado por área.
 */
export function jornadaLink(teamRole: string | null | undefined): string {
  const area = areaOfRole(teamRole);
  return area === "ceo" || area === "ejecutivo" || area === "rrhh"
    ? "/ejecutivo?tab=midia"
    : "/mi-dia";
}
