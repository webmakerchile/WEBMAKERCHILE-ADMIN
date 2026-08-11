import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { TEAM_ROLES, ROLES } from "@workspace/roles";

/**
 * Gate de las secciones wmc.
 *
 * `hasWmcAccess`/`WMC_ALLOWED_ROLES` quedan congelados a propósito: hoy solo
 * los usa el modo "acotado" de Agencia (`puedeProyectos` en
 * routes/panel/index.ts), una decisión de producto aparte de Permisos por rol.
 *
 * `requireWmcAccess` (la puerta real de /api/wmc/*) YA NO depende de esa
 * lista fija: sigue Permisos por rol (`role_permissions` vía
 * `getAllEffectiveRoutes`), igual que el resto de las secciones del panel.
 * Por default dev, ventas y ceo mantienen acceso porque sus rutas estáticas
 * en @workspace/roles incluyen `/admin/proposals` y `/admin/projects`, pero
 * dirección puede cambiar eso desde Ajustes → Permisos para cualquier rol.
 *
 * El gate es POR PANTALLA, no "alcanza con una casilla cualquiera": cada
 * sub-path de wmc está clasificado como propio de `/admin/proposals`, propio
 * de `/admin/projects`, o compartido (`clients`) — ver `isSubPathAllowed` en
 * ./access.ts. Un rol con SOLO una de las dos casillas queda afuera de los
 * sub-paths de la otra pantalla; un prefijo que no reconocemos exige las DOS
 * (mismo nivel que dev/ventas/ceo ya tienen).
 */

let usuarioDb: { id: number; role: string; teamRole: string | null } | null = null;
let overridesDb: Array<{ role: string; routes: string[] }> = [];

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => {
        // Híbrido: `getAllEffectiveRoutes` hace `await db.select().from(rolePermissions)`
        // directo (sin .where), mientras que este mismo gate hace
        // `.from(users).where(eq(...)).limit(1)` — el mock de `.from()` cubre
        // ambas formas a la vez.
        const promesa = Promise.resolve(overridesDb.map((r) => ({ ...r }))) as Promise<unknown> & {
          where?: (...args: unknown[]) => { limit: (n: number) => Promise<unknown[]> };
        };
        promesa.where = vi.fn(() => ({
          limit: vi.fn(async () => (usuarioDb ? [usuarioDb] : [])),
        }));
        return promesa;
      }),
    })),
  },
}));
vi.mock("@workspace/db/schema", () => ({ users: { id: "id" }, rolePermissions: { role: "role" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => ({})) }));

const { hasWmcAccess, requireWmcAccess, WMC_ALLOWED_ROLES } = await import("./access");

function mockRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as unknown as Response["json"];
  return res;
}

beforeEach(() => {
  usuarioDb = null;
  overridesDb = [];
});

describe("hasWmcAccess", () => {
  it("solo dev, ventas y ceo tienen acceso (lista congelada, usada solo por Agencia)", () => {
    for (const role of TEAM_ROLES) {
      expect(hasWmcAccess(role), role).toBe(["dev", "ventas", "ceo"].includes(role));
    }
  });

  it("WMC_ALLOWED_ROLES es exactamente {dev, ventas, ceo}", () => {
    expect([...WMC_ALLOWED_ROLES].sort()).toEqual(["ceo", "dev", "ventas"]);
  });
});

describe("requireWmcAccess (Permisos por rol, sin overrides guardados == defaults estáticos)", () => {
  it("sin usuario en sesión → 403 sin llamar next", async () => {
    const req = { user: undefined, path: "/clients" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("sesión apunta a un usuario que ya no existe en la base → 403, no explota", async () => {
    usuarioDb = null;
    const req = { user: { id: 999 }, path: "/clients" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  for (const teamRole of ["dev", "ventas", "ceo"] as const) {
    it(`rol ${teamRole} → pasa por default incluso a un prefijo que no reconocemos (sin fila en role_permissions)`, async () => {
      usuarioDb = { id: 1, role: "admin", teamRole };
      // Prefijo desconocido: exige las DOS casillas. dev/ventas/ceo las
      // tienen ambas por default, así que esta es la prueba más exigente.
      const req = { user: { id: 1 }, path: "/algo-nuevo-del-origen" } as unknown as Request;
      const res = mockRes();
      const next = vi.fn();
      await requireWmcAccess(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  }

  for (const teamRole of TEAM_ROLES.filter((r) => !["dev", "ventas", "ceo"].includes(r))) {
    it(`rol ${teamRole} → 403 por default, ni reenvía nada (ni al prefijo compartido más bajo)`, async () => {
      usuarioDb = { id: 2, role: "admin", teamRole };
      const req = { user: { id: 2 }, path: "/clients" } as unknown as Request;
      const res = mockRes();
      const next = vi.fn();
      await requireWmcAccess(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });
  }

  it("superadmin manda aunque su teamRole guardado no sea ceo ni esté en la lista", async () => {
    usuarioDb = { id: 3, role: "superadmin", teamRole: "editora" };
    const req = { user: { id: 3 }, path: "/algo-nuevo-del-origen" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("teamRole nulo (nunca configurado) sin superadmin → 403", async () => {
    usuarioDb = { id: 4, role: "admin", teamRole: null };
    const req = { user: { id: 4 }, path: "/clients" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireWmcAccess (con overrides guardados en Permisos — ya no manda la lista fija)", () => {
  it("un rol fuera de {dev, ventas, ceo} con /admin/proposals concedido por Permisos → pasa a un sub-path de proposals", async () => {
    usuarioDb = { id: 5, role: "user", teamRole: "rrhh" };
    overridesDb = [{ role: "rrhh", routes: ["/admin/proposals"] }];
    const req = { user: { id: 5 }, path: "/proposals" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("con /admin/projects concedido alcanza igual para un sub-path de projects", async () => {
    usuarioDb = { id: 6, role: "user", teamRole: "contador" };
    overridesDb = [{ role: "contador", routes: ["/admin/projects"] }];
    const req = { user: { id: 6 }, path: "/projects" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("dev con las dos casillas quitadas en Permisos → 403 (la lista fija ya no lo salva)", async () => {
    usuarioDb = { id: 7, role: "user", teamRole: "dev" };
    overridesDb = [
      {
        role: "dev",
        routes: ROLES.dev.routes.filter((r) => r !== "/admin/proposals" && r !== "/admin/projects"),
      },
    ];
    const req = { user: { id: 7 }, path: "/clients" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rol sin ninguna de las dos casillas concedidas → 403 aunque tenga otras rutas de Permisos", async () => {
    usuarioDb = { id: 8, role: "user", teamRole: "marketing" };
    overridesDb = [{ role: "marketing", routes: ["/marketing", "/biblioteca"] }];
    const req = { user: { id: 8 }, path: "/clients" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireWmcAccess (frontera POR PANTALLA — una casilla no debe abrir la otra pantalla)", () => {
  it("rol con SOLO /admin/proposals → pasa al prefijo compartido (clients)", async () => {
    usuarioDb = { id: 9, role: "user", teamRole: "rrhh" };
    overridesDb = [{ role: "rrhh", routes: ["/admin/proposals"] }];
    const req = { user: { id: 9 }, path: "/clients" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rol con SOLO /admin/proposals → pasa a un sub-path anidado de proposals (service-agreements)", async () => {
    usuarioDb = { id: 9, role: "user", teamRole: "rrhh" };
    overridesDb = [{ role: "rrhh", routes: ["/admin/proposals"] }];
    const req = {
      user: { id: 9 },
      path: "/service-agreements/generate-ai-content",
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rol con SOLO /admin/proposals → 403 en un sub-path exclusivo de projects (projects)", async () => {
    usuarioDb = { id: 9, role: "user", teamRole: "rrhh" };
    overridesDb = [{ role: "rrhh", routes: ["/admin/proposals"] }];
    const req = { user: { id: 9 }, path: "/projects" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rol con SOLO /admin/proposals → 403 en un sub-path exclusivo de projects (addons, con id anidado)", async () => {
    usuarioDb = { id: 9, role: "user", teamRole: "rrhh" };
    overridesDb = [{ role: "rrhh", routes: ["/admin/proposals"] }];
    const req = { user: { id: 9 }, path: "/addons/123/send" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rol con SOLO /admin/projects → pasa al prefijo compartido (clients) y a un sub-path de projects", async () => {
    usuarioDb = { id: 10, role: "user", teamRole: "contador" };
    overridesDb = [{ role: "contador", routes: ["/admin/projects"] }];
    const resClients = mockRes();
    await requireWmcAccess(
      { user: { id: 10 }, path: "/clients" } as unknown as Request,
      resClients,
      vi.fn(),
    );
    expect(resClients.status).not.toHaveBeenCalled();

    const nextAddons = vi.fn();
    await requireWmcAccess(
      { user: { id: 10 }, path: "/addons/123/send" } as unknown as Request,
      mockRes(),
      nextAddons,
    );
    expect(nextAddons).toHaveBeenCalledTimes(1);
  });

  it("rol con SOLO /admin/projects → 403 en un sub-path exclusivo de proposals (proposals, coupons)", async () => {
    usuarioDb = { id: 10, role: "user", teamRole: "contador" };
    overridesDb = [{ role: "contador", routes: ["/admin/projects"] }];

    const resProposals = mockRes();
    const nextProposals = vi.fn();
    await requireWmcAccess(
      { user: { id: 10 }, path: "/proposals" } as unknown as Request,
      resProposals,
      nextProposals,
    );
    expect(resProposals.statusCode).toBe(403);
    expect(nextProposals).not.toHaveBeenCalled();

    const resCoupons = mockRes();
    const nextCoupons = vi.fn();
    await requireWmcAccess(
      { user: { id: 10 }, path: "/coupons/validate/ABC" } as unknown as Request,
      resCoupons,
      nextCoupons,
    );
    expect(resCoupons.statusCode).toBe(403);
    expect(nextCoupons).not.toHaveBeenCalled();
  });

  it("prefijo que no reconocemos exige LAS DOS casillas, no alcanza con una sola", async () => {
    usuarioDb = { id: 11, role: "user", teamRole: "rrhh" };
    overridesDb = [{ role: "rrhh", routes: ["/admin/proposals"] }];
    const req = { user: { id: 11 }, path: "/algo-nuevo-del-origen" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("prefijo que no reconocemos pasa si el rol tiene LAS DOS casillas", async () => {
    usuarioDb = { id: 12, role: "user", teamRole: "rrhh" };
    overridesDb = [{ role: "rrhh", routes: ["/admin/proposals", "/admin/projects"] }];
    const req = { user: { id: 12 }, path: "/algo-nuevo-del-origen" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
