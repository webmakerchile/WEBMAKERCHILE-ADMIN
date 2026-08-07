// Historias sigue exclusivo de marketing/dirección aunque Editora (área
// "edicion") ya puede entrar a `/community` para Posts IA. El path
// `/community/historias/*` la bloquea, pero `borradores` es un endpoint
// TRANSVERSAL por id que sirve filas de ambos productos — así que además de
// filtrar por path hace falta comprobar el `kind` de cada fila. Este archivo
// prueba justo esa comprobación por fila, no el gate por path (ese vive en
// `routes/index.ts` + `community-gate.ts` y no pasa por este router solo).

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db } from "@workspace/db";

const editoraUser = { id: 2, role: "user", teamRole: "editora", email: "ed@test.com" };
const marketingUser = { id: 3, role: "user", teamRole: "marketing", email: "mk@test.com" };

type TestUser = typeof editoraUser | typeof marketingUser;

async function buildApp(user: TestUser) {
  const mod = await import("./index.js");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user: unknown }).user = user;
    next();
  });
  app.use(mod.default);
  return app;
}

/** A thenable select chain — resolves to `rows` no matter which method is awaited last. */
function makeSelectChain(rows: unknown[]) {
  const then = (resolve: (v: unknown) => void) => resolve(rows);
  const chain: Record<string, unknown> = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then,
  };
  return chain;
}

function mockSelectOnce(rows: unknown[]) {
  const chain = makeSelectChain(rows);
  vi.mocked(db.select).mockReturnValueOnce(chain as never);
  return chain;
}

function mockDelete() {
  const then = (resolve: (v: unknown) => void) => resolve(undefined);
  const chain: Record<string, unknown> = { where: vi.fn().mockReturnThis(), then };
  vi.mocked(db.delete).mockReturnValue(chain as never);
}

const historiaRow = {
  id: 5,
  kind: "historia",
  subtype: "dato",
  topic: "Historia de marketing",
  data: { thumb: "data:image/png;base64,AAA", frames: [] },
  imageUrl: null,
  createdAt: new Date(),
};

const postRow = {
  id: 7,
  kind: "descripcion",
  subtype: "portada_reel",
  topic: "Reel de edición",
  data: { thumb: "data:image/png;base64,BBB", tipo_contenido: "portada_reel" },
  imageUrl: null,
  createdAt: new Date(),
};

beforeEach(() => vi.clearAllMocks());

describe("GET /community/borradores?tipo=historia", () => {
  it("403 para Editora (área edicion): no puede ni listar borradores de Historias", async () => {
    const app = await buildApp(editoraUser);
    const res = await request(app).get("/community/borradores?tipo=historia");
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("200 para marketing", async () => {
    mockSelectOnce([historiaRow]);
    const app = await buildApp(marketingUser);
    const res = await request(app).get("/community/borradores?tipo=historia");
    expect(res.status).toBe(200);
  });

  it("200 para Editora en tipo=post (Posts IA, su acceso real)", async () => {
    mockSelectOnce([postRow]);
    const app = await buildApp(editoraUser);
    const res = await request(app).get("/community/borradores?tipo=post");
    expect(res.status).toBe(200);
    expect(res.body.data.borradores[0].id).toBe(7);
  });
});

describe("GET /community/borradores/:id", () => {
  it("403 para Editora al abrir por id una fila de Historias", async () => {
    mockSelectOnce([historiaRow]);
    const app = await buildApp(editoraUser);
    const res = await request(app).get("/community/borradores/5");
    expect(res.status).toBe(403);
  });

  it("200 para Editora al abrir por id una fila de Posts IA", async () => {
    mockSelectOnce([postRow]);
    const app = await buildApp(editoraUser);
    const res = await request(app).get("/community/borradores/7");
    expect(res.status).toBe(200);
    expect(res.body.data.tipo_contenido).toBe("portada_reel");
  });

  it("200 para marketing al abrir por id una fila de Historias", async () => {
    mockSelectOnce([historiaRow]);
    const app = await buildApp(marketingUser);
    const res = await request(app).get("/community/borradores/5");
    expect(res.status).toBe(200);
  });
});

describe("DELETE /community/borradores/:id", () => {
  it("403 para Editora al borrar una fila de Historias — y NO la borra", async () => {
    mockSelectOnce([{ kind: "historia" }]);
    mockDelete();
    const app = await buildApp(editoraUser);
    const res = await request(app).delete("/community/borradores/5");
    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("200 para Editora al borrar una fila de Posts IA", async () => {
    mockSelectOnce([{ kind: "descripcion" }]);
    mockDelete();
    const app = await buildApp(editoraUser);
    const res = await request(app).delete("/community/borradores/7");
    expect(res.status).toBe(200);
    expect(db.delete).toHaveBeenCalled();
  });

  it("200 para marketing al borrar una fila de Historias", async () => {
    mockSelectOnce([{ kind: "historia" }]);
    mockDelete();
    const app = await buildApp(marketingUser);
    const res = await request(app).delete("/community/borradores/5");
    expect(res.status).toBe(200);
    expect(db.delete).toHaveBeenCalled();
  });
});
