import { describe, it, expect } from "vitest";
import {
  ROLES, TEAM_ROLES, TICKET_AREAS, canAccessRoute, canManagePeople, canManageTeam, canReview,
  hubScopesFor, hubWriteScopesFor, isTeamRole, normalizeRole, roleHome, ticketAreasFor,
} from "@workspace/roles";

describe("roles del equipo", () => {
  it("cada rol puede entrar a su propia pantalla de inicio", () => {
    for (const role of TEAM_ROLES) {
      expect(canAccessRoute(role, roleHome(role)), `${role} no puede ver su home`).toBe(true);
    }
  });

  it("el CEO ve todo el panel; solo dirección y RRHH tocan el equipo", () => {
    expect(canManageTeam("ceo")).toBe(true);
    expect(canManageTeam("rrhh")).toBe(true);
    expect(canAccessRoute("ceo", "/cualquier-cosa-nueva")).toBe(true);
    for (const role of TEAM_ROLES.filter(r => r !== "ceo" && r !== "rrhh")) {
      expect(canManageTeam(role), `${role} no debería administrar el equipo`).toBe(false);
      expect(canAccessRoute(role, "/equipo"), `${role} no debería ver /equipo`).toBe(false);
    }
  });

  it("las fichas laborales solo las ven dirección y RRHH", () => {
    expect(canManagePeople("ceo")).toBe(true);
    expect(canManagePeople("rrhh")).toBe(true);
    for (const role of TEAM_ROLES.filter(r => r !== "ceo" && r !== "rrhh")) {
      expect(canManagePeople(role), `${role} no debería ver fichas laborales`).toBe(false);
      expect(canAccessRoute(role, "/rrhh"), `${role} no debería ver /rrhh`).toBe(false);
    }
    // RRHH gestiona personas, no contenido ni el tablero ejecutivo.
    expect(canReview("rrhh")).toBe(false);
    expect(hubScopesFor("rrhh")).toEqual([]);
    expect(canAccessRoute("rrhh", "/videos")).toBe(false);
  });

  it("aprobar contenido queda en dirección y marketing", () => {
    expect(canReview("ceo")).toBe(true);
    expect(canReview("marketing")).toBe(true);
    expect(canReview("editora")).toBe(false);
    expect(canReview("social")).toBe(false);
  });

  it("mapea los roles antiguos: reviewer → ceo, editor → editora", () => {
    expect(normalizeRole("reviewer")).toBe("ceo");
    expect(normalizeRole("editor")).toBe("editora");
    expect(normalizeRole("no-existe")).toBe("editora");
    expect(normalizeRole(undefined)).toBe("editora");
    expect(isTeamRole("reviewer")).toBe(false);
  });

  it("un superadministrador siempre es CEO, aunque su team_role diga otra cosa", () => {
    expect(normalizeRole("contador", true)).toBe("ceo");
    expect(canManageTeam("contador", true)).toBe(true);
    expect(canAccessRoute("contador", "/equipo", true)).toBe(true);
  });

  it("las rutas anidadas heredan del prefijo, pero no las que solo comparten texto", () => {
    expect(canAccessRoute("social", "/campanas")).toBe(true);
    expect(canAccessRoute("social", "/campanas/42")).toBe(true);
    expect(canAccessRoute("social", "/campanas-privadas")).toBe(false);
    // "/" no puede actuar como comodín para el resto del panel.
    expect(canAccessRoute("social", "/")).toBe(true);
    expect(canAccessRoute("editora", "/")).toBe(false);
  });

  it("ignora query string y barra final", () => {
    expect(canAccessRoute("editora", "/videos?select=12")).toBe(true);
    expect(canAccessRoute("editora", "/videos/")).toBe(true);
    expect(canAccessRoute("editora", "/schedule")).toBe(false);
  });

  it("el contador solo ve su reporte y la ayuda", () => {
    expect(canAccessRoute("contador", "/reportes")).toBe(true);
    expect(canAccessRoute("contador", "/ayuda")).toBe(true);
    expect(canAccessRoute("contador", "/ejecutivo")).toBe(false);
    expect(canAccessRoute("contador", "/videos")).toBe(false);
    expect(hubScopesFor("contador")).toEqual(["contracts"]);
  });

  it("cada rol declara solo los datos del tablero que necesita", () => {
    expect(hubScopesFor("ventas")).toEqual(["contracts", "clients", "meetings", "projects"]);
    expect(hubScopesFor("dev")).toEqual(["projects", "tasks", "notes"]);
    expect(hubScopesFor("marketing")).toEqual(["projects", "tasks", "clients"]);
    // Los roles puramente de producción no entran al tablero: se conectan por tickets.
    expect(hubScopesFor("editora")).toEqual([]);
    expect(hubScopesFor("social")).toEqual([]);
    expect(hubScopesFor("rrhh")).toEqual([]);
  });

  it("nadie puede escribir una colección del tablero que no puede leer", () => {
    for (const role of TEAM_ROLES) {
      const readable = new Set(hubScopesFor(role));
      for (const scope of hubWriteScopesFor(role)) {
        expect(readable.has(scope), `${role} escribe ${scope} sin poder leerlo`).toBe(true);
      }
    }
  });

  it("los permisos de escritura del tablero reflejan quién hace cada trabajo", () => {
    // Ventas cierra contratos y cartera, pero no mueve el tablero de desarrollo.
    expect(hubWriteScopesFor("ventas")).toEqual(["contracts", "clients", "meetings"]);
    expect(hubWriteScopesFor("dev")).toEqual(["projects", "tasks"]);
    // Marketing coordina tareas, no toca contratos.
    expect(hubWriteScopesFor("marketing")).toEqual(["tasks"]);
    // El contador solo mira.
    expect(hubWriteScopesFor("contador")).toEqual([]);
  });

  it("cada rol atiende un área de tickets y nadie queda sin bandeja", () => {
    const areas = new Set<string>();
    for (const role of TEAM_ROLES) {
      const mine = ticketAreasFor(role);
      expect(mine.length, `${role} no atiende ninguna área`).toBeGreaterThan(0);
      mine.forEach(a => areas.add(a));
    }
    // Toda área a la que se puede dirigir un ticket tiene quien la responda.
    for (const area of TICKET_AREAS) {
      expect(areas.has(area), `nadie atiende el área ${area}`).toBe(true);
    }
  });

  it("toda definición de rol es coherente consigo misma", () => {
    for (const role of TEAM_ROLES) {
      const def = ROLES[role];
      expect(def.id).toBe(role);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.home.startsWith("/")).toBe(true);
      expect(def.routes.length).toBeGreaterThan(0);
    }
  });
});
