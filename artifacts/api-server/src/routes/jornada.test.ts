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
import { addDays, localDate, sessionMinutes, weekStartOf, MAX_SESSION_MIN } from "./jornada";

const ceoUser = { id: 1, role: "admin", teamRole: "ceo", email: "ceo@test.com" };
const ejecutivoUser = { id: 3, role: "user", teamRole: "ejecutivo", email: "ej@test.com" };
const editorUser = { id: 2, role: "user", teamRole: "edicion", email: "ed@test.com" };
const rrhhUser = { id: 4, role: "user", teamRole: "rrhh", email: "rh@test.com" };

type TestUser = typeof ceoUser | typeof ejecutivoUser | typeof editorUser | typeof rrhhUser;

async function buildApp(user: TestUser) {
  const mod = await import("./jornada");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user: unknown }).user = user;
    next();
  });
  app.use(mod.default);
  return app;
}

/** Cadena select thenable: resuelve en cualquier método terminal y con await directo. */
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

function mockDeleteChain() {
  const whereResult: Record<string, unknown> = {};
  whereResult["then"] = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(undefined).then(onF, onR);
  const chain = { where: vi.fn().mockReturnValue(whereResult) };
  vi.mocked(db.delete).mockReturnValue(chain as never);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ============================ Helpers de fecha ============================ */

describe("helpers de fecha y minutos", () => {
  it("weekStartOf devuelve el lunes de la semana", () => {
    expect(weekStartOf("2026-07-24")).toBe("2026-07-20"); // viernes → lunes
    expect(weekStartOf("2026-07-20")).toBe("2026-07-20"); // lunes → mismo
    expect(weekStartOf("2026-07-26")).toBe("2026-07-20"); // domingo → lunes previo
  });

  it("addDays suma y resta días", () => {
    expect(addDays("2026-07-24", 1)).toBe("2026-07-25");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("localDate devuelve YYYY-MM-DD", () => {
    expect(localDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sessionMinutes calcula cerradas, abiertas y aplica tope de 16 h", () => {
    const now = new Date("2026-07-24T18:00:00Z");
    expect(sessionMinutes({ checkIn: "2026-07-24T10:00:00Z", checkOut: "2026-07-24T12:30:00Z" }, now)).toBe(150);
    expect(sessionMinutes({ checkIn: "2026-07-24T16:00:00Z", checkOut: null }, now)).toBe(120);
    // abierta hace 20 h → tope 960
    expect(sessionMinutes({ checkIn: "2026-07-23T22:00:00Z", checkOut: null }, now)).toBe(MAX_SESSION_MIN);
    // checkOut anterior al checkIn → 0
    expect(sessionMinutes({ checkIn: "2026-07-24T12:00:00Z", checkOut: "2026-07-24T11:00:00Z" }, now)).toBe(0);
  });
});

/* ============================== GET /jornada/me =========================== */

describe("GET /jornada/me", () => {
  it("devuelve estado de hoy, semana y checklist", async () => {
    const today = localDate();
    const closed = {
      id: 1, userId: 2, workDate: today,
      checkIn: new Date(Date.now() - 3 * 3600_000), checkOut: new Date(Date.now() - 2 * 3600_000),
      onDiscord: true, createdAt: new Date(),
    };
    const open = {
      id: 2, userId: 2, workDate: today,
      checkIn: new Date(Date.now() - 30 * 60_000), checkOut: null,
      onDiscord: true, createdAt: new Date(),
    };
    mockSelectSeq([closed, open], [open], [{ id: 5, userId: 2, logDate: today, text: "Edité video", done: false, createdAt: new Date() }]);

    const app = await buildApp(editorUser);
    const res = await request(app).get("/jornada/me");
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(today);
    expect(res.body.open).not.toBeNull();
    expect(res.body.open.stale).toBe(false);
    expect(res.body.todaySessions).toHaveLength(2);
    expect(res.body.todayMinutes).toBeGreaterThanOrEqual(89); // ~60 + ~30
    expect(res.body.week.days).toHaveLength(7);
    expect(res.body.week.start).toBe(weekStartOf(today));
    expect(res.body.logs).toHaveLength(1);
  });

  it("marca stale cuando la sesión abierta es de otro día", async () => {
    const yesterday = addDays(localDate(), -1);
    const open = { id: 9, userId: 2, workDate: yesterday, checkIn: new Date(Date.now() - 20 * 3600_000), checkOut: null, onDiscord: false, createdAt: new Date() };
    mockSelectSeq([open], [open], []);
    const app = await buildApp(editorUser);
    const res = await request(app).get("/jornada/me");
    expect(res.status).toBe(200);
    expect(res.body.open.stale).toBe(true);
  });
});

/* ============================ check-in / check-out ======================== */

describe("POST /jornada/check-in", () => {
  it("crea la sesión con la fecha local y el flag de Discord", async () => {
    mockSelectSeq([]);
    const insert = mockInsertChain([{ id: 1, userId: 2, workDate: localDate(), checkIn: new Date(), checkOut: null, onDiscord: true }]);
    const app = await buildApp(editorUser);
    const res = await request(app).post("/jornada/check-in").send({ onDiscord: true });
    expect(res.status).toBe(201);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, workDate: localDate(), onDiscord: true }),
    );
    expect(res.body.session.id).toBe(1);
  });

  it("rechaza doble check-in con 409", async () => {
    mockSelectSeq([{ id: 7 }]);
    const app = await buildApp(editorUser);
    const res = await request(app).post("/jornada/check-in").send({});
    expect(res.status).toBe(409);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rechaza body inválido con 400", async () => {
    const app = await buildApp(editorUser);
    const res = await request(app).post("/jornada/check-in").send({ onDiscord: "sí" });
    expect(res.status).toBe(400);
  });
});

describe("POST /jornada/check-out", () => {
  it("cierra la sesión abierta", async () => {
    const open = { id: 3, userId: 2, workDate: localDate(), checkIn: new Date(Date.now() - 60 * 60_000), checkOut: null, onDiscord: false };
    mockSelectSeq([open]);
    mockUpdateChain([{ ...open, checkOut: new Date() }]);
    const app = await buildApp(editorUser);
    const res = await request(app).post("/jornada/check-out");
    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(res.body.minutes).toBeGreaterThanOrEqual(59);
  });

  it("devuelve 409 si no hay jornada abierta", async () => {
    mockSelectSeq([]);
    const app = await buildApp(editorUser);
    const res = await request(app).post("/jornada/check-out");
    expect(res.status).toBe(409);
    expect(db.update).not.toHaveBeenCalled();
  });
});

/* ============================== Checklist diario ========================== */

describe("checklist diario /jornada/logs", () => {
  it("agrega un ítem al día de hoy", async () => {
    const insert = mockInsertChain([{ id: 11, userId: 2, logDate: localDate(), text: "Publiqué reel", done: false }]);
    const app = await buildApp(editorUser);
    const res = await request(app).post("/jornada/logs").send({ text: "  Publiqué reel  " });
    expect(res.status).toBe(201);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, logDate: localDate(), text: "Publiqué reel" }),
    );
  });

  it("rechaza texto vacío", async () => {
    const app = await buildApp(editorUser);
    const res = await request(app).post("/jornada/logs").send({ text: "   " });
    expect(res.status).toBe(400);
  });

  it("PATCH marca como hecho un ítem propio", async () => {
    mockSelectSeq([{ id: 11, userId: 2, logDate: localDate(), text: "x", done: false }]);
    mockUpdateChain([{ id: 11, userId: 2, logDate: localDate(), text: "x", done: true }]);
    const app = await buildApp(editorUser);
    const res = await request(app).patch("/jornada/logs/11").send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body.item.done).toBe(true);
  });

  it("PATCH de un ítem ajeno devuelve 404", async () => {
    mockSelectSeq([{ id: 11, userId: 99, logDate: localDate(), text: "x", done: false }]);
    const app = await buildApp(editorUser);
    const res = await request(app).patch("/jornada/logs/11").send({ done: true });
    expect(res.status).toBe(404);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("DELETE elimina un ítem propio", async () => {
    mockSelectSeq([{ id: 11, userId: 2, logDate: localDate(), text: "x", done: false }]);
    const del = mockDeleteChain();
    const app = await buildApp(editorUser);
    const res = await request(app).delete("/jornada/logs/11");
    expect(res.status).toBe(204);
    expect(del.where).toHaveBeenCalledTimes(1);
  });

  it("DELETE de un ítem ajeno devuelve 404", async () => {
    mockSelectSeq([{ id: 11, userId: 99, logDate: localDate(), text: "x", done: false }]);
    const app = await buildApp(editorUser);
    const res = await request(app).delete("/jornada/logs/11");
    expect(res.status).toBe(404);
    expect(db.delete).not.toHaveBeenCalled();
  });
});

/* ============================ Overview (supervisión) ====================== */

describe("GET /jornada/overview", () => {
  const members = [
    { id: 1, name: "CEO", email: "ceo@test.com", picture: null, teamRole: "ceo" },
    { id: 2, name: "Editor", email: "ed@test.com", picture: null, teamRole: "edicion" },
  ];

  it("bloquea a un integrante sin rol supervisor", async () => {
    const app = await buildApp(editorUser);
    const res = await request(app).get("/jornada/overview");
    expect(res.status).toBe(403);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("devuelve pase de lista + matriz semanal para el CEO", async () => {
    const today = localDate();
    const sess = {
      id: 1, userId: 2, workDate: today,
      checkIn: new Date(Date.now() - 2 * 3600_000), checkOut: new Date(Date.now() - 3600_000),
      onDiscord: true, createdAt: new Date(),
    };
    mockSelectSeq(members, [sess], [{ id: 3, userId: 2, logDate: today, text: "Corté clips", done: true, createdAt: new Date() }]);
    const app = await buildApp(ceoUser);
    const res = await request(app).get(`/jornada/overview?date=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(2);
    const editor = res.body.members.find((m: { id: number }) => m.id === 2);
    expect(editor.today).not.toBeNull();
    expect(editor.today.onDiscord).toBe(true);
    expect(editor.today.open).toBe(false);
    expect(editor.logs).toHaveLength(1);
    expect(editor.weekByDay).toHaveLength(7);
    const ceo = res.body.members.find((m: { id: number }) => m.id === 1);
    expect(ceo.today).toBeNull();
    expect(res.body.summary).toEqual(
      expect.objectContaining({ working: 0, finished: 1, absent: 1 }),
    );
  });

  it("permite acceso a rrhh y valida el parámetro date", async () => {
    mockSelectSeq(members, [], []);
    const app = await buildApp(rrhhUser);
    const ok = await request(app).get("/jornada/overview?date=2026-07-20");
    expect(ok.status).toBe(200);
    const bad = await request(app).get("/jornada/overview?date=hoy");
    expect(bad.status).toBe(400);
    const fakeMonth = await request(app).get("/jornada/overview?date=2026-13-01");
    expect(fakeMonth.status).toBe(400);
    const fakeDay = await request(app).get("/jornada/overview?date=2026-02-30");
    expect(fakeDay.status).toBe(400);
  });
});

/* ============================ History (historial) ========================= */

describe("GET /jornada/history", () => {
  it("cada integrante puede ver su propio historial", async () => {
    const sess = { id: 1, userId: 2, workDate: "2026-07-20", checkIn: new Date("2026-07-20T13:00:00Z"), checkOut: new Date("2026-07-20T17:00:00Z"), onDiscord: true, createdAt: new Date() };
    const log = { id: 2, userId: 2, logDate: "2026-07-20", text: "Diseñé portada", done: true, createdAt: new Date() };
    mockSelectSeq([sess], [log]);
    const app = await buildApp(editorUser);
    const res = await request(app).get("/jornada/history?from=2026-07-15&to=2026-07-21");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(2);
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].minutes).toBe(240);
    expect(res.body.days[0].logs).toHaveLength(1);
    expect(res.body.totalMinutes).toBe(240);
  });

  it("bloquea ver historial ajeno sin rol supervisor", async () => {
    const app = await buildApp(editorUser);
    const res = await request(app).get("/jornada/history?userId=1");
    expect(res.status).toBe(403);
  });

  it("permite al ejecutivo ver historial ajeno", async () => {
    mockSelectSeq([], []);
    const app = await buildApp(ejecutivoUser);
    const res = await request(app).get("/jornada/history?userId=2&from=2026-07-01&to=2026-07-10");
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(0);
  });

  it("rechaza rangos inválidos o mayores a 92 días", async () => {
    const app = await buildApp(ceoUser);
    const tooLong = await request(app).get("/jornada/history?userId=2&from=2026-01-01&to=2026-07-01");
    expect(tooLong.status).toBe(400);
    const inverted = await request(app).get("/jornada/history?userId=2&from=2026-07-10&to=2026-07-01");
    expect(inverted.status).toBe(400);
    const fakeDate = await request(app).get("/jornada/history?userId=2&from=2026-02-30&to=2026-03-05");
    expect(fakeDate.status).toBe(400);
  });
});
