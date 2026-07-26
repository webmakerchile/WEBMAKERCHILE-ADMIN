import { describe, it, expect } from "vitest";
import { hubNeedsAreaGate } from "./hub-gate";
import { areaOfRole } from "@workspace/areas";
import { TEAM_ROLES, hubScopesFor, hubWriteScopesFor } from "@workspace/roles";

/** Áreas que el gate de /hub deja pasar (ver routes/index.ts). */
const AREAS_PERMITIDAS = new Set(["ceo", "ejecutivo", "rrhh"]);

describe("gate de /hub", () => {
  it("el tablero y su vista de lectura los gatea el rol, no el área", () => {
    expect(hubNeedsAreaGate("/")).toBe(false);
    expect(hubNeedsAreaGate("/owner")).toBe(false);
  });

  it("todo lo demás de /hub sigue gateado por área", () => {
    for (const p of ["/contracts/brief", "/contracts/ai-chat", "/contracts/c1/cobro", "/projects/ai-extract-tasks"]) {
      expect(hubNeedsAreaGate(p), `${p} debería seguir gateado`).toBe(true);
    }
  });

  it("ningún rol con scopes queda fuera del tablero por su área", () => {
    // Esta es la regresión concreta que motivó la excepción: marketing tiene
    // hubScopes pero su área no está en la lista, así que el gate lo dejaba
    // con un 403 en una pantalla que sí debe ver.
    for (const role of TEAM_ROLES) {
      if (hubScopesFor(role).length === 0) continue;
      const area = areaOfRole(role);
      const pasaPorArea = area !== null && AREAS_PERMITIDAS.has(area);
      expect(
        pasaPorArea || !hubNeedsAreaGate("/owner"),
        `el rol "${role}" tiene scopes pero no llegaría al tablero`,
      ).toBe(true);
    }
  });

  it("quien puede escribir el tablero también puede leerlo", () => {
    for (const role of TEAM_ROLES) {
      const escritura = hubWriteScopesFor(role);
      const lectura = hubScopesFor(role);
      for (const scope of escritura) {
        expect(lectura, `"${role}" escribe "${scope}" sin poder leerlo`).toContain(scope);
      }
    }
  });
});
