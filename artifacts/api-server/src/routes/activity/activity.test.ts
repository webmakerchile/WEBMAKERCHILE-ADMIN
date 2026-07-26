import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "@workspace/db";

const ceoUser = { id: 1, role: "admin", teamRole: "ceo", email: "ceo@test.com" };
const rrhhUser = { id: 5, role: "user", teamRole: "rrhh", email: "rh@test.com" };
const editorUser = { id: 2, role: "user", teamRole: "edicion", email: "ed@test.com" };

async function buildApp(user: Record<string, unknown>) {
  const mod = await import("./index");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user: unknown }).user = user;
    next();
  });
  app.use(mod.default);
  return app;
}

/** Thenable select chain: resolves to `rows` regardless of last chained call. */
function makeChain(rows: unknown[]) {
  const then = (resolve: (v: unknown) => void) => resolve(rows);
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then,
  } as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.select).mockReturnValue(makeChain([]) as never);
});

describe("GET /activity", () => {
  it("cualquier usuario puede ver su propia actividad", async () => {
    const app = await buildApp(editorUser);
    const r = await request(app).get("/activity");
    expect(r.status).toBe(200);
    expect(r.body.items).toEqual([]);
    expect(r.body.canSeeTeam).toBe(false);
  });

  it("un rol sin supervisión NO puede ver la actividad de terceros", async () => {
    const app = await buildApp(editorUser);
    const r = await request(app).get("/activity?userId=1");
    expect(r.status).toBe(403);
  });

  it("un rol sin supervisión NO puede pedir la vista global", async () => {
    const app = await buildApp(editorUser);
    const r = await request(app).get("/activity?userId=all");
    expect(r.status).toBe(403);
  });

  it("el CEO puede ver la vista global", async () => {
    const app = await buildApp(ceoUser);
    const r = await request(app).get("/activity?userId=all");
    expect(r.status).toBe(200);
    expect(r.body.canSeeTeam).toBe(true);
  });

  it("RRHH puede ver la actividad de otra persona", async () => {
    const app = await buildApp(rrhhUser);
    const r = await request(app).get("/activity?userId=2");
    expect(r.status).toBe(200);
  });

  it("rechaza fechas mal formadas", async () => {
    const app = await buildApp(ceoUser);
    const r = await request(app).get("/activity?from=2026-13-40");
    expect(r.status).toBe(400);
  });

  it("rechaza userId no numérico (distinto de 'all')", async () => {
    const app = await buildApp(ceoUser);
    const r = await request(app).get("/activity?userId=pepito");
    expect(r.status).toBe(400);
  });
});

describe("sanitizeLabel", () => {
  it("nunca persiste montos en las etiquetas de la bitácora", async () => {
    const { sanitizeLabel } = await import("../../lib/activity");
    expect(sanitizeLabel("Contrato Acme $1.200.000")).not.toContain("1.200.000");
    expect(sanitizeLabel("Plan 990 UF anual")).not.toContain("990");
    expect(sanitizeLabel("Proyecto 1.500.000 CLP web")).not.toContain("1.500.000");
    expect(sanitizeLabel("Rediseño sitio Acme")).toBe("Rediseño sitio Acme");
    expect(sanitizeLabel("x".repeat(400))).toHaveLength(300);
  });
});

describe("GET /activity/summaries", () => {
  it("propios: permitido para cualquier usuario", async () => {
    const app = await buildApp(editorUser);
    const r = await request(app).get("/activity/summaries");
    expect(r.status).toBe(200);
  });

  it("de terceros: solo supervisores", async () => {
    const app = await buildApp(editorUser);
    const r = await request(app).get("/activity/summaries?userId=1");
    expect(r.status).toBe(403);
    const app2 = await buildApp(ceoUser);
    const r2 = await request(app2).get("/activity/summaries?userId=2");
    expect(r2.status).toBe(200);
  });
});
