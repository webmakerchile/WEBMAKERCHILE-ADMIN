import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/**
 * Segundo candado del CEO (clave extra tras el login con Google):
 * - sin CEO_PANEL_SECRET el candado queda APAGADO (fail-open: nunca bloquea)
 * - solo aplica a la cuenta de dirección; al resto del equipo ni le aparece
 * - clave buena → 12h de pase en la sesión; mala → 401 sin pistas
 * - requireClaveCeo corta /api con 403 clave_requerida mientras esté pendiente
 */

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
  },
}));
vi.mock("@workspace/db/schema", () => ({ users: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("../../lib/connections", () => ({ clearNetworkRevoked: vi.fn() }));
vi.mock("../../lib/notifications", () => ({ createNotification: vi.fn() }));

const CEO = { id: 1, email: "webmakerchile@gmail.com", name: "Lucas", role: "superadmin", teamRole: "ceo" };
const DEV = { id: 2, email: "dev@webmaker.cl", name: "Dev", role: "admin", teamRole: "dev" };

let usuario: Record<string, unknown> | null = null;
let sesion: Record<string, unknown> = {};

let puerto = 0;
let servidor: ReturnType<typeof express.application.listen> | null = null;

async function arrancar(): Promise<number> {
  if (puerto) return puerto;
  const modulo = await import("./index");
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // Sesión y usuario simulados: acá se prueba el candado, no passport.
    const r = req as unknown as { user?: unknown; isAuthenticated?: () => boolean; session?: Record<string, unknown> };
    r.user = usuario ?? undefined;
    r.isAuthenticated = () => !!usuario;
    r.session = sesion;
    next();
  });
  app.use("/api", modulo.default);
  app.get("/api/sonda", modulo.requireClaveCeo, (_req, res) => {
    res.json({ ok: true });
  });
  puerto = await new Promise<number>((resolve) => {
    servidor = app.listen(0, () => {
      const a = servidor!.address();
      if (typeof a === "object" && a) resolve(a.port);
    });
  });
  return puerto;
}

afterAll(() => {
  servidor?.close();
  vi.unstubAllEnvs();
});

const llamar = async (metodo: string, ruta: string, body?: unknown) => {
  const p = await arrancar();
  const r = await fetch(`http://127.0.0.1:${p}/api${ruta}`, {
    method: metodo,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, cuerpo: (await r.json().catch(() => null)) as any };
};

beforeEach(() => {
  vi.unstubAllEnvs();
  usuario = { ...CEO };
  sesion = {};
});

describe("sin secreto configurado (fail-open)", () => {
  it("el candado queda apagado: /auth/me no lo pide y la sonda pasa", async () => {
    vi.stubEnv("CEO_PANEL_SECRET", "");
    const me = await llamar("GET", "/auth/me");
    expect(me.status).toBe(200);
    expect(me.cuerpo.claveRequerida).toBe(false);
    const sonda = await llamar("GET", "/sonda");
    expect(sonda.status).toBe(200);
    const clave = await llamar("POST", "/auth/clave", { clave: "lo-que-sea" });
    expect(clave.status).toBe(200);
    expect(clave.cuerpo.activa).toBe(false);
  });
});

describe("con secreto y cuenta de dirección", () => {
  beforeEach(() => {
    vi.stubEnv("CEO_PANEL_SECRET", "super-clave-2026");
  });

  it("bloquea /api hasta poner la clave; /auth/me lo avisa", async () => {
    const me = await llamar("GET", "/auth/me");
    expect(me.cuerpo.claveRequerida).toBe(true);
    const sonda = await llamar("GET", "/sonda");
    expect(sonda.status).toBe(403);
    expect(sonda.cuerpo.error).toBe("clave_requerida");
  });

  it("clave mala → 401 sin pistas; la sesión sigue bloqueada", async () => {
    const r = await llamar("POST", "/auth/clave", { clave: "adivino" });
    expect(r.status).toBe(401);
    expect(r.cuerpo.error).toBe("clave_incorrecta");
    expect(sesion.claveOkHasta).toBeUndefined();
    const sonda = await llamar("GET", "/sonda");
    expect(sonda.status).toBe(403);
  });

  it("clave buena → pase por 12 horas y se abre todo", async () => {
    const r = await llamar("POST", "/auth/clave", { clave: "super-clave-2026" });
    expect(r.status).toBe(200);
    expect(r.cuerpo.ok).toBe(true);
    const hasta = sesion.claveOkHasta as number;
    expect(hasta).toBeGreaterThan(Date.now() + 11 * 60 * 60 * 1000);
    expect(hasta).toBeLessThanOrEqual(Date.now() + 12 * 60 * 60 * 1000);
    const sonda = await llamar("GET", "/sonda");
    expect(sonda.status).toBe(200);
    const me = await llamar("GET", "/auth/me");
    expect(me.cuerpo.claveRequerida).toBe(false);
  });

  it("pase vencido → vuelve a pedir la clave", async () => {
    sesion.claveOkHasta = Date.now() - 1000;
    const sonda = await llamar("GET", "/sonda");
    expect(sonda.status).toBe(403);
    const me = await llamar("GET", "/auth/me");
    expect(me.cuerpo.claveRequerida).toBe(true);
  });

  it("cuerpo sin clave o no-string → 401, jamás 500", async () => {
    const sinClave = await llamar("POST", "/auth/clave", {});
    expect(sinClave.status).toBe(401);
    const rara = await llamar("POST", "/auth/clave", { clave: 12345 });
    expect(rara.status).toBe(401);
  });
});

describe("con secreto pero otra cuenta del equipo", () => {
  beforeEach(() => {
    vi.stubEnv("CEO_PANEL_SECRET", "super-clave-2026");
    usuario = { ...DEV };
  });

  it("el candado no aplica: pasa directo y /auth/me no lo pide", async () => {
    const me = await llamar("GET", "/auth/me");
    expect(me.cuerpo.claveRequerida).toBe(false);
    const sonda = await llamar("GET", "/sonda");
    expect(sonda.status).toBe(200);
    const clave = await llamar("POST", "/auth/clave", { clave: "x" });
    expect(clave.status).toBe(200);
  });

  it("sin sesión → 401", async () => {
    usuario = null;
    const r = await llamar("POST", "/auth/clave", { clave: "x" });
    expect(r.status).toBe(401);
  });
});
