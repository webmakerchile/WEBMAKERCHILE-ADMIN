import { describe, expect, it } from "vitest";
import { jornadaLink } from "./jornada-link";

/**
 * A dónde llevan los avisos de jornada según el rol: quienes pueden entrar al
 * Hub Ejecutivo van a su "Mi día" dentro del Hub; el resto, al del panel.
 * Cubre también los roles del vocabulario viejo para que un valor legado no
 * mande a alguien a una página que su área tiene vedada.
 */
describe("jornadaLink", () => {
  const HUB = "/ejecutivo?tab=midia";
  const PANEL = "/mi-dia";

  it.each(["ceo", "ventas", "dev", "contador", "rrhh", "tester", "reviewer", "ejecutivo"])(
    "rol %s (área con acceso al Hub) → Mi día del Hub",
    (rol) => expect(jornadaLink(rol)).toBe(HUB),
  );

  it.each(["editora", "editor", "edicion", "social", "marketing"])(
    "rol %s (sin acceso al Hub) → Mi día del panel",
    (rol) => expect(jornadaLink(rol)).toBe(PANEL),
  );

  it("rol desconocido o vacío → Mi día del panel (nunca a una página vedada)", () => {
    expect(jornadaLink("algo-raro")).toBe(PANEL);
    expect(jornadaLink(null)).toBe(PANEL);
    expect(jornadaLink(undefined)).toBe(PANEL);
  });
});
