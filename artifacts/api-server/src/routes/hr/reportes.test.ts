import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

/* Tablas centinela para que el mock de `db` sepa a cuál se apunta. */
const USERS = { __t: "users", id: "users.id", name: "users.name", email: "users.email" };
const REPORTES = {
  __t: "hr_daily_reports",
  id: "r.id", reportDate: "r.report_date", content: "r.content",
  emailStatus: "r.email_status", emailDetail: "r.email_detail",
  createdAt: "r.created_at", updatedAt: "r.updated_at",
};
const INFORMES = {
  __t: "hr_weekly_reports",
  weekKey: "w.week_key", resumen: "w.resumen", destacadas: "w.destacadas",
  analisis: "w.analisis", updatedAt: "w.updated_at", updatedBy: "w.updated_by",
};

vi.mock("@workspace/db/schema", () => ({
  users: USERS,
  hrDailyReports: REPORTES,
  hrWeeklyReports: INFORMES,
}));
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  desc: (a: unknown) => a,
}));

const notifyCeos = vi.fn(async (_args: unknown) => {});
vi.mock("../../lib/notifications", () => ({
  notifyCeos: (args: unknown) => notifyCeos(args),
}));

const enviarCorreo = vi.fn(async (_c: unknown): Promise<Record<string, unknown>> => ({ ok: true }));
vi.mock("../../lib/correo", () => ({
  CORREO_DIRECCION: "webmakerchile@gmail.com",
  enviarCorreo: (c: unknown) => enviarCorreo(c),
}));

/** Estado del mock: quién llama, qué listas devuelve cada tabla y qué se escribió. */
const state: {
  me: Record<string, unknown>[];
  reportes: Record<string, unknown>[];
  informes: Record<string, unknown>[];
  informeRow: Record<string, unknown>[];
  inserted: { tbl: unknown; v: Record<string, unknown> } | null;
  upserted: { tbl: unknown; v: Record<string, unknown> } | null;
  updates: { tbl: unknown; v: Record<string, unknown> }[];
  updateEmpty: boolean;
} = {
  me: [], reportes: [], informes: [], informeRow: [],
  inserted: null, upserted: null, updates: [], updateEmpty: false,
};

vi.mock("@workspace/db", () => {
  const resolveFor = (table: unknown, ordered: boolean): Record<string, unknown>[] => {
    if (table === USERS) return state.me;
    if (table === REPORTES) return state.reportes;
    if (table === INFORMES) return ordered ? state.informes : state.informeRow;
    return [];
  };
  const chain = () => {
    let table: unknown = null;
    let ordered = false;
    const c: Record<string, unknown> = {};
    c.from = (t: unknown) => { table = t; return c; };
    c.leftJoin = () => c;
    c.where = () => c;
    c.orderBy = () => { ordered = true; return c; };
    c.limit = async () => resolveFor(table, ordered);
    return c;
  };
  return {
    db: {
      select: () => chain(),
      insert: (tbl: unknown) => ({
        values: (v: Record<string, unknown>) => ({
          returning: async () => { state.inserted = { tbl, v }; return [{ id: 77, ...v }]; },
          onConflictDoUpdate: () => ({
            returning: async () => { state.upserted = { tbl, v }; return [{ id: 88, ...v }]; },
          }),
        }),
      }),
      update: (tbl: unknown) => ({
        set: (v: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              if (state.updateEmpty) return [];
              state.updates.push({ tbl, v });
              return [{ id: 77, ...v }];
            },
          }),
        }),
      }),
    },
  };
});

async function startApp(callerId = 5) {
  const router = (await import("./reportes")).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { id: number } }).user = { id: callerId };
    next();
  });
  app.use("/api", router);
  return await new Promise<number>((resolve) => {
    const s = app.listen(0, () => {
      const a = s.address();
      if (typeof a === "object" && a) resolve(a.port);
    });
  });
}

function reset(callerRole: string, callerRootRole = "admin") {
  state.me = [{ id: 5, teamRole: callerRole, role: callerRootRole, name: "Caro RRHH", email: "caro@x.cl" }];
  state.reportes = [];
  state.informes = [];
  state.informeRow = [];
  state.inserted = null;
  state.upserted = null;
  state.updates = [];
  state.updateEmpty = false;
  notifyCeos.mockClear();
  enviarCorreo.mockClear();
  enviarCorreo.mockResolvedValue({ ok: true });
}

const post = (port: number, path: string, body: unknown, method = "POST") =>
  fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/hr/reportes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloquea a los roles que no gestionan personas, también al escribir", async () => {
    for (const role of ["editora", "social", "ventas", "dev", "marketing", "contador"]) {
      reset(role);
      const port = await startApp();
      expect((await fetch(`http://127.0.0.1:${port}/api/hr/reportes`)).status, role).toBe(403);
      const w = await post(port, "/api/hr/reportes", { reportDate: "2026-08-04", content: "x" });
      expect(w.status, `${role} POST`).toBe(403);
      expect(state.inserted).toBeNull();
    }
  });

  it("deja entrar a RRHH y al superadministrador", async () => {
    reset("rrhh");
    let port = await startApp();
    expect((await fetch(`http://127.0.0.1:${port}/api/hr/reportes`)).status).toBe(200);

    reset("contador", "superadmin");
    port = await startApp();
    expect((await fetch(`http://127.0.0.1:${port}/api/hr/reportes`)).status).toBe(200);
  });

  it("emite un reporte: guarda, avisa a la dirección y manda la copia por correo", async () => {
    reset("rrhh");
    const port = await startApp();
    const r = await post(port, "/api/hr/reportes", {
      reportDate: "2026-08-04",
      content: "Entrevista con candidata a diseño; dos licencias médicas nuevas.",
    });
    expect(r.status).toBe(201);
    expect(state.inserted?.tbl).toBe(REPORTES);
    expect(state.inserted?.v).toMatchObject({ reportDate: "2026-08-04", authorId: 5 });

    expect(notifyCeos).toHaveBeenCalledTimes(1);
    const aviso = notifyCeos.mock.calls[0][0] as { title: string; excludeUserId: number };
    expect(aviso.title).toContain("2026-08-04");
    expect(aviso.excludeUserId).toBe(5);

    expect(enviarCorreo).toHaveBeenCalledTimes(1);
    const correo = enviarCorreo.mock.calls[0][0] as { to: string; html: string };
    expect(correo.to).toBe("webmakerchile@gmail.com");

    // El resultado del correo queda en la fila.
    expect(state.updates.at(-1)?.v).toMatchObject({ emailStatus: "enviado" });
    const body = (await r.json()) as { emailStatus: string };
    expect(body.emailStatus).toBe("enviado");
  });

  it("escapa el contenido en el HTML del correo", async () => {
    reset("rrhh");
    const port = await startApp();
    await post(port, "/api/hr/reportes", { reportDate: "2026-08-04", content: `<script>alert("x")</script>` });
    const correo = enviarCorreo.mock.calls[0][0] as { html: string };
    expect(correo.html).not.toContain("<script>");
    expect(correo.html).toContain("&lt;script&gt;");
  });

  it("un correo fallido (o que lanza) jamás bloquea el reporte", async () => {
    reset("rrhh");
    enviarCorreo.mockResolvedValueOnce({ ok: false, motivo: "fallido", detalle: "Resend 500" });
    let port = await startApp();
    let r = await post(port, "/api/hr/reportes", { reportDate: "2026-08-04", content: "día normal" });
    expect(r.status).toBe(201);
    expect(state.updates.at(-1)?.v).toMatchObject({ emailStatus: "fallido", emailDetail: "Resend 500" });

    reset("rrhh");
    enviarCorreo.mockRejectedValueOnce(new Error("kaput"));
    port = await startApp();
    r = await post(port, "/api/hr/reportes", { reportDate: "2026-08-04", content: "día normal" });
    expect(r.status).toBe(201);
    expect(state.updates.at(-1)?.v).toMatchObject({ emailStatus: "fallido" });
  });

  it("la caída del aviso interno tampoco tumba la emisión", async () => {
    reset("rrhh");
    notifyCeos.mockRejectedValueOnce(new Error("discord caído"));
    const port = await startApp();
    const r = await post(port, "/api/hr/reportes", { reportDate: "2026-08-04", content: "x" });
    expect(r.status).toBe(201);
  });

  it("rechaza fecha mal formada y contenido vacío", async () => {
    reset("rrhh");
    let port = await startApp();
    expect((await post(port, "/api/hr/reportes", { reportDate: "04-08-2026", content: "x" })).status).toBe(400);

    reset("rrhh");
    port = await startApp();
    expect((await post(port, "/api/hr/reportes", { reportDate: "2026-08-04", content: "   " })).status).toBe(400);
    expect(state.inserted).toBeNull();

    // Fecha que el calendario no tiene: Date la normalizaría a marzo.
    reset("rrhh");
    port = await startApp();
    expect((await post(port, "/api/hr/reportes", { reportDate: "2026-02-30", content: "x" })).status).toBe(400);
    expect(state.inserted).toBeNull();
  });

  it("editar corrige la fila sin re-avisar ni re-mandar correo", async () => {
    reset("rrhh");
    const port = await startApp();
    const r = await post(port, "/api/hr/reportes/12", { content: "texto corregido" }, "PATCH");
    expect(r.status).toBe(200);
    expect(state.updates.at(-1)?.v).toMatchObject({ content: "texto corregido" });
    expect(notifyCeos).not.toHaveBeenCalled();
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("editar sin cambios o un reporte inexistente falla con claridad", async () => {
    reset("rrhh");
    let port = await startApp();
    expect((await post(port, "/api/hr/reportes/12", {}, "PATCH")).status).toBe(400);

    reset("rrhh");
    state.updateEmpty = true;
    port = await startApp();
    expect((await post(port, "/api/hr/reportes/999", { content: "x" }, "PATCH")).status).toBe(404);
  });
});

describe("/api/hr/informes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloquea a los roles que no gestionan personas", async () => {
    reset("editora");
    const port = await startApp();
    expect((await fetch(`http://127.0.0.1:${port}/api/hr/informes`)).status).toBe(403);
    expect((await post(port, "/api/hr/informes/2026-08-03", { resumen: "x" }, "PUT")).status).toBe(403);
    expect(state.upserted).toBeNull();
  });

  it("la semana se identifica por su lunes: otro día o formato es 400", async () => {
    reset("rrhh");
    const port = await startApp();
    // 2026-08-04 es martes.
    expect((await post(port, "/api/hr/informes/2026-08-04", { resumen: "x" }, "PUT")).status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${port}/api/hr/informes/04-08-2026`)).status).toBe(400);
    // 2026-02-30 no existe; normalizado caería en lunes 2026-03-02 y
    // guardaría una llave corrupta distinta de la fila real de esa semana.
    expect((await post(port, "/api/hr/informes/2026-02-30", { resumen: "x" }, "PUT")).status).toBe(400);
    expect(state.upserted).toBeNull();
  });

  it("crea o actualiza el informe de la semana (una fila por semana)", async () => {
    reset("rrhh");
    const port = await startApp();
    const r = await post(port, "/api/hr/informes/2026-08-03", {
      resumen: "Contenido cerró 12 videos; ventas firmó 2 contratos.",
      destacadas: "Lanzamiento del nuevo panel.",
      analisis: "Reforzar onboarding de edición.",
    }, "PUT");
    expect(r.status).toBe(200);
    expect(state.upserted?.tbl).toBe(INFORMES);
    expect(state.upserted?.v).toMatchObject({ weekKey: "2026-08-03", updatedBy: 5 });
    const body = (await r.json()) as { weekKey: string; resumen: string };
    expect(body.weekKey).toBe("2026-08-03");
  });

  it("devuelve el informe pedido o null si esa semana aún no se escribe", async () => {
    reset("rrhh");
    state.informeRow = [{ weekKey: "2026-08-03", resumen: "a", destacadas: "b", analisis: "c" }];
    let port = await startApp();
    const r = await fetch(`http://127.0.0.1:${port}/api/hr/informes/2026-08-03`);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { weekKey: string }).weekKey).toBe("2026-08-03");

    reset("rrhh");
    port = await startApp();
    const vacio = await fetch(`http://127.0.0.1:${port}/api/hr/informes/2026-07-27`);
    expect(vacio.status).toBe(200);
    expect(await vacio.json()).toBeNull();
  });
});
