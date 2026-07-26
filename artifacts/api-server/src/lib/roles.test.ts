import { describe, it, expect } from "vitest";
import {
  ROLES, TEAM_ROLES, canAccessRoute, canManageTeam, canReview,
  hubScopesFor, isTeamRole, normalizeRole, roleHome,
} from "@workspace/roles";

describe("roles del equipo", () => {
  it("cada rol puede entrar a su propia pantalla de inicio", () => {
    for (const role of TEAM_ROLES) {
      expect(canAccessRoute(role, roleHome(role)), `${role} no puede ver su home`).toBe(true);
    }
  });

  it("solo el CEO administra el equipo y ve todo el panel", () => {
    expect(canManageTeam("ceo")).toBe(true);
    expect(canAccessRoute("ceo", "/cualquier-cosa-nueva")).toBe(true);
    for (const role of TEAM_ROLES.filter(r => r !== "ceo")) {
      expect(canManageTeam(role), `${role} no debería administrar el equipo`).toBe(false);
      expect(canAccessRoute(role, "/equipo"), `${role} no debería ver /equipo`).toBe(false);
    }
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

  it("cada rol declara solo los datos del Hub que necesita", () => {
    expect(hubScopesFor("ventas")).toEqual(["contracts", "clients", "meetings"]);
    expect(hubScopesFor("dev")).toEqual(["projects", "tasks"]);
    // Los roles de contenido no leen el tablero ejecutivo.
    expect(hubScopesFor("editora")).toEqual([]);
    expect(hubScopesFor("social")).toEqual([]);
    expect(hubScopesFor("marketing")).toEqual([]);
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
