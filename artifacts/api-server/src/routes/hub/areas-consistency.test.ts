/**
 * Single-source-of-truth consistency test for @workspace/areas.
 *
 * PURPOSE: Fails if someone adds a new area value anywhere in the codebase
 * without fully registering it in lib/areas/src/index.ts.
 * All area-related records MUST have an entry for every value in AREAS.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AREAS,
  AREA_LABELS,
  AREA_BADGE,
  AREA_PAGES,
  AREA_API_PREFIXES,
  AREA_HOME,
  areaCanAccessPage,
  toArea,
} from "@workspace/areas";

describe("@workspace/areas — single source of truth invariants", () => {
  it("AREAS contains the required base areas (add rrhh here if it disappears)", () => {
    const required = ["ceo", "ejecutivo", "edicion", "marketing", "rrhh"];
    for (const a of required) {
      expect(Array.from(AREAS), `AREAS must contain "${a}"`).toContain(a);
    }
  });

  it("every area in AREAS has an AREA_LABELS entry with non-empty string", () => {
    for (const area of AREAS) {
      expect(AREA_LABELS, `AREA_LABELS missing "${area}"`).toHaveProperty(area);
      expect(typeof AREA_LABELS[area]).toBe("string");
      expect(AREA_LABELS[area].length, `AREA_LABELS["${area}"] empty`).toBeGreaterThan(0);
    }
  });

  it("every area in AREAS has an AREA_BADGE entry with bg and text", () => {
    for (const area of AREAS) {
      expect(AREA_BADGE, `AREA_BADGE missing "${area}"`).toHaveProperty(area);
      const b = AREA_BADGE[area];
      expect(b).toHaveProperty("bg");
      expect(b).toHaveProperty("text");
    }
  });

  it("every area in AREAS has an AREA_PAGES entry (string[] or '*')", () => {
    for (const area of AREAS) {
      expect(AREA_PAGES, `AREA_PAGES missing "${area}"`).toHaveProperty(area);
      const pages = AREA_PAGES[area];
      const valid = pages === "*" || (Array.isArray(pages) && pages.length > 0);
      expect(valid, `AREA_PAGES["${area}"] must be "*" or a non-empty array`).toBe(true);
    }
  });

  it("every area in AREAS has an AREA_API_PREFIXES entry", () => {
    for (const area of AREAS) {
      expect(AREA_API_PREFIXES, `AREA_API_PREFIXES missing "${area}"`).toHaveProperty(area);
    }
  });

  it("every area in AREAS has an AREA_HOME entry", () => {
    for (const area of AREAS) {
      expect(AREA_HOME, `AREA_HOME missing "${area}"`).toHaveProperty(area);
      expect(typeof AREA_HOME[area]).toBe("string");
    }
  });

  it("no extra keys exist in the records beyond what AREAS lists", () => {
    const areaSet = new Set<string>(AREAS);
    const records = [AREA_LABELS, AREA_BADGE, AREA_PAGES, AREA_API_PREFIXES, AREA_HOME];
    for (const record of records) {
      for (const key of Object.keys(record)) {
        expect(areaSet, `Record has extra key "${key}" not in AREAS — remove it or add the area`).toContain(key);
      }
    }
  });

  it("ceo has unrestricted access on pages and api", () => {
    expect(AREA_PAGES.ceo).toBe("*");
    expect(AREA_API_PREFIXES.ceo).toBe("*");
  });

  it("rrhh can access /ejecutivo and /equipo pages", () => {
    expect(areaCanAccessPage("rrhh", "/ejecutivo")).toBe(true);
    expect(areaCanAccessPage("rrhh", "/equipo")).toBe(true);
    expect(areaCanAccessPage("rrhh", "/")).toBe(true);
  });

  it("rrhh cannot access marketing or edicion-only pages", () => {
    expect(areaCanAccessPage("rrhh", "/insights")).toBe(false);
    expect(areaCanAccessPage("rrhh", "/videos")).toBe(false);
    expect(areaCanAccessPage("rrhh", "/historias")).toBe(false);
  });

  it("toArea returns ceo for unknown/null values", () => {
    expect(toArea(null)).toBe("ceo");
    expect(toArea(undefined)).toBe("ceo");
    expect(toArea("not_an_area")).toBe("ceo");
    expect(toArea("")).toBe("ceo");
  });

  it("toArea is identity for all valid AREAS values", () => {
    for (const area of AREAS) {
      expect(toArea(area)).toBe(area);
    }
  });
});

/**
 * Invariantes del flujo de ventas: si alguien cambia los gates de área en
 * routes/index.ts y deja al rol ventas (área ejecutivo) fuera del wizard de
 * contratos, estos tests fallan antes de que el bloqueo llegue a producción.
 */
describe("gates de área del flujo de ventas (routes/index.ts)", () => {
  const routesSrc = readFileSync(fileURLToPath(new URL("../index.ts", import.meta.url)), "utf8");

  it("/cotizaciones permite al área ejecutivo — autonomía del rol ventas", () => {
    expect(routesSrc).toContain('router.use("/cotizaciones", requireArea("ceo", "ejecutivo"))');
  });

  it("el gate de /hub incluye al área ejecutivo", () => {
    expect(routesSrc).toContain('requireArea("ceo", "ejecutivo", "rrhh")');
  });

  it("AREA_API_PREFIXES.ejecutivo documenta /hub y /cotizaciones", () => {
    expect(AREA_API_PREFIXES.ejecutivo).toContain("/hub");
    expect(AREA_API_PREFIXES.ejecutivo).toContain("/cotizaciones");
  });

  it("AREA_API_PREFIXES documenta /hub/tasks para las áreas transversales de tareas", () => {
    expect(AREA_API_PREFIXES.marketing).toContain("/hub/tasks");
    expect(AREA_API_PREFIXES.edicion).toContain("/hub/tasks");
    expect(AREA_API_PREFIXES.rrhh).toContain("/hub/tasks");
  });
});
