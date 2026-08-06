import { describe, expect, it } from "vitest";
import { jornadaLink } from "./jornada-link";

/**
 * A dónde llevan los avisos de jornada, sin importar el rol: todo el equipo
 * marca su jornada desde el mismo "Mi día" del panel — ya no vive dentro del
 * Hub Ejecutivo, así que ningún rol necesita un destino aparte.
 */
describe("jornadaLink", () => {
  const PANEL = "/mi-dia";

  it.each(["ceo", "ventas", "dev", "contador", "rrhh", "tester", "editora", "social", "marketing"])(
    "rol %s → Mi día del panel",
    (rol) => expect(jornadaLink(rol)).toBe(PANEL),
  );

  it("rol desconocido, vacío o ausente → también Mi día del panel", () => {
    expect(jornadaLink("algo-raro")).toBe(PANEL);
    expect(jornadaLink(null)).toBe(PANEL);
    expect(jornadaLink(undefined)).toBe(PANEL);
    expect(jornadaLink()).toBe(PANEL);
  });
});
