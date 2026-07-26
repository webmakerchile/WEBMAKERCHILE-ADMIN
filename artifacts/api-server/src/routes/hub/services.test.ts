import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

import { db } from "@workspace/db";

const mockCeoUser = { id: 1, role: "admin", teamRole: "ceo", email: "ceo@test.com" };
const mockEjecutivoUser = { id: 3, role: "user", teamRole: "ejecutivo", email: "ej@test.com" };
const mockEditorUser = { id: 2, role: "user", teamRole: "edicion", email: "ed@test.com" };
const mockOwnerUser = { id: 9, role: "superadmin", teamRole: "ceo", email: "owner@test.com" };

type TestUser =
  | typeof mockCeoUser
  | typeof mockEjecutivoUser
  | typeof mockEditorUser
  | typeof mockOwnerUser;

async function buildApp(user: TestUser) {
  const mod = await import("./services");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user: unknown }).user = user;
    next();
  });
  app.use(mod.default);
  return app;
}

const now = new Date();
const sampleService = {
  id: 1,
  category: "🌐 Sitios Web",
  name: "Landing Page",
  description: "Landing pages que convierten.",
  includes: "UI/UX, SEO, hosting.",
  note: "",
  tiers: [
    { plan: "Inicia", price: "$100.000", detail: "one-page" },
    { plan: "Escala", price: "$290.000", detail: "custom" },
  ],
  sortOrder: 10,
  archived: false,
  createdAt: now,
  updatedAt: now,
};

/** Cadena select thenable: resuelve en cualquier método terminal y también con await directo. */
function thenableSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "leftJoin", "innerJoin", "where", "orderBy", "groupBy", "limit", "offset"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain["then"] = (onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onF, onR);
  return chain;
}

/** Cada llamada a db.select() consume el siguiente set de filas. */
function mockSelectSeq(...rowSets: unknown[][]) {
  let i = 0;
  vi.mocked(db.select).mockImplementation(() => {
    const rows = rowSets[Math.min(i, rowSets.length - 1)] ?? [];
    i++;
    return thenableSelectChain(rows) as never;
  });
}

/** insert(...).values(...) awaitable directo y con .returning(). */
function mockInsertChain(rows: unknown[]) {
  const valuesResult: Record<string, unknown> = {
    returning: vi.fn().mockResolvedValue(rows),
  };
  valuesResult["then"] = (onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onF, onR);
  const chain = { values: vi.fn().mockReturnValue(valuesResult) };
  vi.mocked(db.insert).mockReturnValue(chain as never);
  return chain;
}

/** update(...).set(...).where(...) awaitable directo y con .returning(). */
function mockUpdateChain(rows: unknown[] = []) {
  const whereResult: Record<string, unknown> = {
    returning: vi.fn().mockResolvedValue(rows),
  };
  whereResult["then"] = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(undefined).then(onF, onR);
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(whereResult),
  };
  vi.mocked(db.update).mockReturnValue(chain as never);
  return chain;
}

/** Mock de la tx que recibe el callback de db.transaction (execute/select/insert/update). */
function makeTxMock(opts: { selectRows?: unknown[][]; insertRows?: unknown[] } = {}) {
  let si = 0;
  const selectSets = opts.selectRows ?? [[]];
  const insertValuesResult: Record<string, unknown> = {
    returning: vi.fn().mockResolvedValue(opts.insertRows ?? []),
  };
  insertValuesResult["then"] = (onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(opts.insertRows ?? []).then(onF, onR);
  const insertChain = { values: vi.fn().mockReturnValue(insertValuesResult) };
  const updateWhereResult: Record<string, unknown> = { returning: vi.fn().mockResolvedValue([]) };
  updateWhereResult["then"] = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(undefined).then(onF, onR);
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(updateWhereResult),
  };
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockImplementation(() => {
      const rows = selectSets[Math.min(si, selectSets.length - 1)] ?? [];
      si++;
      return thenableSelectChain(rows);
    }),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
  };
  vi.mocked(db.transaction).mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx) as never);
  return { tx, insertChain, updateChain };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /hub/services", () => {
  it("siembra el catálogo inicial cuando la tabla está vacía", async () => {
    mockSelectSeq([{ n: 0 }], [sampleService]);
    const bundle = makeTxMock({ selectRows: [[{ n: 0 }]] });
    const app = await buildApp(mockEditorUser);
    const res = await request(app).get("/hub/services");
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(1);
    expect(bundle.tx.execute).toHaveBeenCalledTimes(1); // advisory lock
    expect(bundle.insertChain.values).toHaveBeenCalledTimes(1);
    const seeded = bundle.insertChain.values.mock.calls[0]![0] as Array<{ name: string; sortOrder: number }>;
    expect(seeded.length).toBe(10);
    expect(seeded[0]!.name).toBe("Landing Page");
    expect(seeded[0]!.sortOrder).toBe(10);
  });

  it("no vuelve a sembrar cuando ya hay filas", async () => {
    mockSelectSeq([{ n: 5 }], [sampleService]);
    const app = await buildApp(mockEditorUser);
    const res = await request(app).get("/hub/services");
    expect(res.status).toBe(200);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("no siembra dos veces si otra petición sembró mientras esperaba el lock", async () => {
    mockSelectSeq([{ n: 0 }], [sampleService]);
    // El re-check dentro de la transacción ya ve filas sembradas por la otra petición.
    const bundle = makeTxMock({ selectRows: [[{ n: 10 }]] });
    const app = await buildApp(mockEditorUser);
    const res = await request(app).get("/hub/services");
    expect(res.status).toBe(200);
    expect(bundle.tx.execute).toHaveBeenCalledTimes(1);
    expect(bundle.insertChain.values).not.toHaveBeenCalled();
  });

  it("la lectura está abierta a cualquier rol con acceso al hub", async () => {
    mockSelectSeq([{ n: 1 }], [sampleService]);
    const app = await buildApp(mockEditorUser);
    const res = await request(app).get("/hub/services");
    expect(res.status).toBe(200);
    expect(res.body.services[0].name).toBe("Landing Page");
  });
});

describe("POST /hub/services (crear)", () => {
  it("rechaza a roles sin permiso de gestión", async () => {
    const app = await buildApp(mockEditorUser);
    const res = await request(app).post("/hub/services").send({ name: "X", category: "Y" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CEO o Ejecutivo/);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("permite crear al CEO", async () => {
    mockSelectSeq([{ maxOrder: 100 }]);
    mockInsertChain([{ ...sampleService, id: 11, name: "Nuevo", sortOrder: 110 }]);
    const app = await buildApp(mockCeoUser);
    const res = await request(app).post("/hub/services").send({ name: "Nuevo", category: "💻 Software" });
    expect(res.status).toBe(201);
    expect(res.body.service.name).toBe("Nuevo");
  });

  it("permite crear al ejecutivo y al superadmin", async () => {
    for (const user of [mockEjecutivoUser, mockOwnerUser]) {
      vi.clearAllMocks();
      mockSelectSeq([{ maxOrder: 0 }]);
      mockInsertChain([{ ...sampleService, id: 12 }]);
      const app = await buildApp(user);
      const res = await request(app).post("/hub/services").send({ name: "Otro", category: "Cat" });
      expect(res.status).toBe(201);
    }
  });

  it("valida nombre y categoría requeridos", async () => {
    const app = await buildApp(mockCeoUser);
    const res1 = await request(app).post("/hub/services").send({ category: "Cat" });
    expect(res1.status).toBe(400);
    const res2 = await request(app).post("/hub/services").send({ name: "X", category: "  " });
    expect(res2.status).toBe(400);
  });

  it("rechaza más de 6 planes y planes sin nombre", async () => {
    const app = await buildApp(mockCeoUser);
    const many = Array.from({ length: 7 }, (_, i) => ({ plan: `P${i}`, price: "", detail: "" }));
    const res1 = await request(app).post("/hub/services").send({ name: "X", category: "C", tiers: many });
    expect(res1.status).toBe(400);
    const res2 = await request(app)
      .post("/hub/services")
      .send({ name: "X", category: "C", tiers: [{ plan: "", price: "$1", detail: "" }] });
    expect(res2.status).toBe(400);
  });
});

describe("PATCH /hub/services/:id", () => {
  it("rechaza a roles sin permiso", async () => {
    const app = await buildApp(mockEditorUser);
    const res = await request(app).patch("/hub/services/1").send({ name: "Z" });
    expect(res.status).toBe(403);
  });

  it("actualiza campos parciales", async () => {
    mockUpdateChain([{ ...sampleService, name: "Renombrado" }]);
    const app = await buildApp(mockEjecutivoUser);
    const res = await request(app).patch("/hub/services/1").send({ name: "Renombrado" });
    expect(res.status).toBe(200);
    expect(res.body.service.name).toBe("Renombrado");
  });

  it("archiva y restaura con el campo archived", async () => {
    const chain = mockUpdateChain([{ ...sampleService, archived: true }]);
    const app = await buildApp(mockCeoUser);
    const res = await request(app).patch("/hub/services/1").send({ archived: true });
    expect(res.status).toBe(200);
    expect(res.body.service.archived).toBe(true);
    expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ archived: true }));
  });

  it("404 cuando el servicio no existe", async () => {
    mockUpdateChain([]);
    const app = await buildApp(mockCeoUser);
    const res = await request(app).patch("/hub/services/999").send({ name: "Z" });
    expect(res.status).toBe(404);
  });

  it("400 con cuerpo vacío o id inválido", async () => {
    const app = await buildApp(mockCeoUser);
    const res1 = await request(app).patch("/hub/services/1").send({});
    expect(res1.status).toBe(400);
    const res2 = await request(app).patch("/hub/services/abc").send({ name: "Z" });
    expect(res2.status).toBe(400);
  });
});

describe("POST /hub/services/:id/duplicate", () => {
  it("rechaza a roles sin permiso", async () => {
    const app = await buildApp(mockEditorUser);
    const res = await request(app).post("/hub/services/1/duplicate");
    expect(res.status).toBe(403);
  });

  it("duplica con sufijo (copia) justo después del original", async () => {
    mockSelectSeq([sampleService]);
    const insert = mockInsertChain([{ ...sampleService, id: 22, name: "Landing Page (copia)", sortOrder: 11 }]);
    const app = await buildApp(mockCeoUser);
    const res = await request(app).post("/hub/services/1/duplicate");
    expect(res.status).toBe(201);
    expect(res.body.service.name).toBe("Landing Page (copia)");
    const values = insert.values.mock.calls[0]![0] as { name: string; sortOrder: number; archived: boolean };
    expect(values.name).toBe("Landing Page (copia)");
    expect(values.sortOrder).toBe(11);
    expect(values.archived).toBe(false);
  });

  it("404 cuando el original no existe", async () => {
    mockSelectSeq([]);
    const app = await buildApp(mockCeoUser);
    const res = await request(app).post("/hub/services/999/duplicate");
    expect(res.status).toBe(404);
  });
});

describe("POST /hub/services/reorder", () => {
  it("rechaza a roles sin permiso", async () => {
    const app = await buildApp(mockEditorUser);
    const res = await request(app).post("/hub/services/reorder").send({ ids: [1, 2] });
    expect(res.status).toBe(403);
  });

  it("valida ids requeridos y sin duplicados", async () => {
    const app = await buildApp(mockCeoUser);
    const res1 = await request(app).post("/hub/services/reorder").send({});
    expect(res1.status).toBe(400);
    const res2 = await request(app).post("/hub/services/reorder").send({ ids: [1, 1] });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/duplicados/i);
  });

  it("reordena en transacción con sortOrder espaciado y devuelve el catálogo", async () => {
    const bundle = makeTxMock({ selectRows: [[{ id: 3 }, { id: 1 }, { id: 2 }]] });
    mockSelectSeq([sampleService]);
    const app = await buildApp(mockEjecutivoUser);
    const res = await request(app).post("/hub/services/reorder").send({ ids: [3, 1, 2] });
    expect(res.status).toBe(200);
    expect(bundle.updateChain.set).toHaveBeenCalledTimes(3);
    expect(bundle.updateChain.set).toHaveBeenNthCalledWith(1, expect.objectContaining({ sortOrder: 10 }));
    expect(bundle.updateChain.set).toHaveBeenNthCalledWith(2, expect.objectContaining({ sortOrder: 20 }));
    expect(bundle.updateChain.set).toHaveBeenNthCalledWith(3, expect.objectContaining({ sortOrder: 30 }));
    expect(res.body.services).toHaveLength(1);
  });

  it("409 cuando los ids no cubren exactamente el catálogo actual", async () => {
    // El catálogo real tiene 2 filas; el cliente manda 3 ids (desfasado).
    const bundle = makeTxMock({ selectRows: [[{ id: 1 }, { id: 2 }]] });
    const app = await buildApp(mockCeoUser);
    const res = await request(app).post("/hub/services/reorder").send({ ids: [1, 2, 3] });
    expect(res.status).toBe(409);
    expect(bundle.updateChain.set).not.toHaveBeenCalled();

    // Mismo tamaño pero con un id que no existe.
    const bundle2 = makeTxMock({ selectRows: [[{ id: 1 }, { id: 2 }]] });
    const res2 = await request(app).post("/hub/services/reorder").send({ ids: [1, 99] });
    expect(res2.status).toBe(409);
    expect(bundle2.updateChain.set).not.toHaveBeenCalled();
  });
});
