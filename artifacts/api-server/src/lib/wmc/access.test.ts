import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { TEAM_ROLES } from "@workspace/roles";

/**
 * Gate de las secciones wmc: dev, ventas y ceo ven exactamente lo mismo
 * (sin redacción de precios/márgenes/comisiones); cualquier otro rol, o
 * ninguna sesión, se corta con 403 ANTES de reenviar nada al origen.
 */

let usuarioDb: { id: number; role: string; teamRole: string | null } | null = null;

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => (usuarioDb ? [usuarioDb] : [])),
        })),
      })),
    })),
  },
}));
vi.mock("@workspace/db/schema", () => ({ users: { id: "id" } }));
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
});

describe("hasWmcAccess", () => {
  it("solo dev, ventas y ceo tienen acceso", () => {
    for (const role of TEAM_ROLES) {
      expect(hasWmcAccess(role), role).toBe(["dev", "ventas", "ceo"].includes(role));
    }
  });

  it("WMC_ALLOWED_ROLES es exactamente {dev, ventas, ceo}", () => {
    expect([...WMC_ALLOWED_ROLES].sort()).toEqual(["ceo", "dev", "ventas"]);
  });
});

describe("requireWmcAccess", () => {
  it("sin usuario en sesión → 403 sin llamar next", async () => {
    const req = { user: undefined } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("sesión apunta a un usuario que ya no existe en la base → 403, no explota", async () => {
    usuarioDb = null;
    const req = { user: { id: 999 } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  for (const teamRole of ["dev", "ventas", "ceo"] as const) {
    it(`rol ${teamRole} → pasa (next llamado, sin 403)`, async () => {
      usuarioDb = { id: 1, role: "admin", teamRole };
      const req = { user: { id: 1 } } as unknown as Request;
      const res = mockRes();
      const next = vi.fn();
      await requireWmcAccess(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  }

  for (const teamRole of TEAM_ROLES.filter((r) => !["dev", "ventas", "ceo"].includes(r))) {
    it(`rol ${teamRole} → 403 en la puerta, ni reenvía nada`, async () => {
      usuarioDb = { id: 2, role: "admin", teamRole };
      const req = { user: { id: 2 } } as unknown as Request;
      const res = mockRes();
      const next = vi.fn();
      await requireWmcAccess(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });
  }

  it("superadmin manda aunque su teamRole guardado no sea ceo ni esté en la lista", async () => {
    usuarioDb = { id: 3, role: "superadmin", teamRole: "editora" };
    const req = { user: { id: 3 } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("teamRole nulo (nunca configurado) sin superadmin → 403", async () => {
    usuarioDb = { id: 4, role: "admin", teamRole: null };
    const req = { user: { id: 4 } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();
    await requireWmcAccess(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
