import { describe, it, expect } from "vitest";
import { TEAM_ROLES, isTeamRole, normalizeRole, roleHome, canAccessRoute } from "@workspace/roles";
import { areaOfRole } from "@workspace/areas";

/**
 * Equipo y Ajustes escriben el MISMO campo (`users.team_role`). Cuando cada una
 * usaba su propio vocabulario, cambiar el rol en una deshacía lo hecho en la
 * otra: en Equipo decía "Programador" y en Ajustes "dev", y al tocarlo ahí se
 * perdía el rol. Estas pruebas fijan que ambos caminos converjan.
 */
describe("sincronía de roles entre pantallas", () => {
  it("todo valor guardado por Ajustes es un rol válido para Equipo", () => {
    for (const role of TEAM_ROLES) {
      expect(isTeamRole(role)).toBe(true);
      expect(normalizeRole(role)).toBe(role);
    }
  });

  it("los valores del vocabulario viejo de áreas se resuelven a un rol", () => {
    // Lo que quedó en la base cuando Ajustes escribía áreas.
    expect(normalizeRole("ejecutivo")).toBe("ventas");
    expect(normalizeRole("edicion")).toBe("editora");
    expect(normalizeRole("marketing")).toBe("marketing");
    expect(normalizeRole("rrhh")).toBe("rrhh");
    expect(normalizeRole("ceo")).toBe("ceo");
  });

  it("normalizar es estable: aplicarlo dos veces no cambia el resultado", () => {
    for (const valor of [...TEAM_ROLES, "ejecutivo", "edicion", "editor", "reviewer", "inventado", ""]) {
      const una = normalizeRole(valor);
      expect(normalizeRole(una), `${valor} no es estable`).toBe(una);
    }
  });

  it("cada rol tiene área equivalente, así las guardas del backend no lo dejan fuera", () => {
    for (const role of TEAM_ROLES) {
      expect(areaOfRole(role), `${role} no tiene área`).not.toBeNull();
    }
  });

  it("ida y vuelta rol → área → rol nunca deja a alguien sin su pantalla", () => {
    // El área es una vista derivada: convertir de vuelta debe seguir dando un
    // rol que pueda entrar a su propio inicio.
    for (const role of TEAM_ROLES) {
      const area = areaOfRole(role)!;
      const devuelta = normalizeRole(area);
      expect(canAccessRoute(devuelta, roleHome(devuelta)), `${role} → ${area} rompe su inicio`).toBe(true);
    }
  });

  it("un rol desconocido nunca cae en dirección", () => {
    // Caer en 'ceo' por defecto daría acceso completo a quien no debe tenerlo.
    expect(normalizeRole("pasante")).not.toBe("ceo");
    expect(normalizeRole(undefined)).not.toBe("ceo");
    expect(areaOfRole("pasante")).toBeNull();
  });
});
