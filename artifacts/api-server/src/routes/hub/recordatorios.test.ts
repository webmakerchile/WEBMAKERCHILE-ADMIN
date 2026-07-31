// Lo que se prueba aquí es sobre todo QUIÉN puede cambiar estas reglas.
//
// Son cuatro números, pero de ellos depende a cuánta gente le escribe el panel:
// bajar un umbral a un día convierte los recordatorios en spam para todo el
// equipo, y desde ahí ya no sirven. Y el que las lee no puede ser solo el área
// ejecutivo, porque quien recibe los avisos —Programación, Edición— tiene que
// poder ver por qué le llegan.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { hubNeedsAreaGate } from "../../lib/hub-gate";

const USERS = { __table: "users", id: "users.id" };
const HUB_STATE = { __table: "hub_state", userId: "hub_state.user_id" };

vi.mock("@workspace/db/schema", () => ({ users: USERS, hubState: HUB_STATE }));
vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => ({ a, b }), asc: (a: unknown) => a }));
vi.mock("googleapis", () => ({ google: { auth: { OAuth2: class {} }, drive: vi.fn() } }));
vi.mock("pdf-parse", () => ({ PDFParse: class {} }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create: vi.fn() } }; } }));

const rows: {
  users: Record<string, unknown>[];
  me: Record<string, unknown>[];
  hub: Record<string, unknown>[];
} = { users: [], me: [], hub: [] };

let guardado: Record<string, unknown> | null = null;

vi.mock("@workspace/db", () => {
  const from = (table: unknown) => {
    let filtered = false;
    const chain = {
      where: () => { filtered = true; return chain; },
      limit: async () => (table === HUB_STATE ? rows.hub : filtered ? rows.me : rows.users),
      orderBy: async () => (table === HUB_STATE ? rows.hub : rows.users),
      then: (resolve: (v: unknown) => unknown) => resolve(table === HUB_STATE ? rows.hub : rows.users),
    };
    return chain;
  };
  const insert = () => ({
    values: (v: { data: Record<string, unknown> }) => {
      guardado = v.data;
      return { onConflictDoUpdate: () => ({ returning: async () => [{ data: v.data }] }) };
    },
  });
  return { db: { select: () => ({ from }), insert } };
});

/** Arranca el router con una persona de un rol dado y devuelve un fetch listo. */
async function servidor(teamRole: string, role = "admin", datosTablero: Record<string, unknown> = {}) {
  const ceo = { id: 1, name: "CEO", email: "ceo@x.cl", role: "superadmin", teamRole: "reviewer" };
  const persona = { id: 7, name: "Quien sea", email: "p@x.cl", role, teamRole };
  rows.users = [ceo, persona];
  rows.me = [role === "superadmin" ? ceo : persona];
  rows.hub = [{
    userId: 1,
    // Con contenido: si no, `resolveBoard` no lo da por existente.
    data: { projects: [{ id: "p1" }], ...datosTablero },
    updatedAt: new Date("2026-07-01T00:00:00Z"),
  }];

  const router = (await import("./recordatorios")).default;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user =
      role === "superadmin" ? { id: 1, role: "superadmin", teamRole: "reviewer" } : { id: 7, role, teamRole };
    next();
  });
  app.use("/api", router);
  const port = await new Promise<number>((resolve) => {
    const s = app.listen(0, () => {
      const a = s.address();
      if (typeof a === "object" && a) resolve(a.port);
    });
  });
  return {
    leer: () => fetch(`http://127.0.0.1:${port}/api/hub/recordatorios`),
    guardar: (body: unknown) =>
      fetch(`http://127.0.0.1:${port}/api/hub/recordatorios`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}

interface Cuerpo {
  reglas: Record<string, unknown>;
  porDefecto: Record<string, unknown>;
  maxPorPersona: number;
  puedeEditar: boolean;
  error?: string;
}
const leerJson = (r: { json(): Promise<unknown> }) => r.json() as Promise<Cuerpo>;

describe("/api/hub/recordatorios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows.users = []; rows.me = []; rows.hub = [];
    guardado = null;
  });

  it("sin nada configurado devuelve los valores por defecto", async () => {
    const { leer } = await servidor("dev");
    const r = await leer();
    expect(r.status).toBe(200);
    const body = await leerJson(r);
    expect(body.reglas.diasTareaEstancada).toBe(3);
    expect(body.reglas.prioridadMinima).toBe("media");
    expect(body.maxPorPersona).toBeGreaterThan(0);
  });

  it("lo lee cualquiera del equipo, no solo quien puede editarlo", async () => {
    for (const rol of ["dev", "edicion", "marketing", "ventas"]) {
      const { leer } = await servidor(rol);
      expect((await leer()).status, `${rol} debería poder leerlas`).toBe(200);
    }
  });

  // El fallo clásico de este panel: el rol tiene permiso pero el gate por ÁREA
  // lo bloquea antes, y el menú enseña algo que al pulsarlo da 403. Aquí pasaría
  // con Programación y Edición, que reciben los avisos y no son área ejecutivo.
  it("no queda detrás del gate por área del Hub", () => {
    expect(hubNeedsAreaGate("/recordatorios")).toBe(false);
  });

  it("dirección y Programación pueden cambiarlas", async () => {
    for (const [rol, role] of [["reviewer", "superadmin"], ["dev", "admin"]] as const) {
      const { guardar } = await servidor(rol, role);
      const r = await guardar({ diasTareaEstancada: 5 });
      expect(r.status, `${rol} debería poder guardar`).toBe(200);
      expect((await leerJson(r)).reglas.diasTareaEstancada).toBe(5);
    }
  });

  // Estas reglas escriben notificaciones a OTRAS personas: quien las cambia
  // decide cuántos avisos recibe todo el equipo.
  it("los demás roles no las cambian", async () => {
    for (const rol of ["edicion", "marketing", "ventas", "contador"]) {
      const { guardar } = await servidor(rol);
      const r = await guardar({ diasTareaEstancada: 1 });
      expect(r.status, `${rol} no debería poder guardar`).toBe(403);
    }
    expect(guardado).toBeNull();
  });

  it("la lectura dice si se puede editar", async () => {
    expect((await (await servidor("dev")).leer().then(leerJson)).puedeEditar).toBe(true);
    expect((await (await servidor("edicion")).leer().then(leerJson)).puedeEditar).toBe(false);
  });

  it("guarda las reglas en el tablero sin tocar el resto", async () => {
    const { guardar } = await servidor("dev", "admin", { contracts: [{ id: "c1" }] });
    await guardar({ diasProyectoParado: 21, prioridadMinima: "alta" });
    expect(guardado?.recordatorios).toMatchObject({ diasProyectoParado: 21, prioridadMinima: "alta" });
    expect(guardado?.projects).toEqual([{ id: "p1" }]);
    expect(guardado?.contracts).toEqual([{ id: "c1" }]);
  });

  // Un PUT con un solo campo no puede resetear los otros tres en silencio:
  // quien ajusta un plazo perdería los que configuró la semana pasada.
  it("un cambio parcial conserva lo demás", async () => {
    const { guardar } = await servidor("dev", "admin", {
      recordatorios: { diasTareaEstancada: 9, diasEnCola: 60, diasVencida: 4, diasProyectoParado: 21, prioridadMinima: "alta" },
    });
    await guardar({ diasVencida: 2 });
    expect(guardado?.recordatorios).toMatchObject({
      diasTareaEstancada: 9, diasEnCola: 60, diasVencida: 2, diasProyectoParado: 21, prioridadMinima: "alta",
    });
  });

  // Un 0 avisaría de todo el tablero en cada pasada del job. El mensaje dice el
  // rango en vez de "datos inválidos", porque el 0 es justo lo que deja un
  // campo vacío.
  it("rechaza plazos de cero o negativos, y lo explica", async () => {
    const { guardar } = await servidor("dev");
    const r = await guardar({ diasTareaEstancada: 0 });
    expect(r.status).toBe(400);
    expect((await leerJson(r)).error).toContain("1 a 365");
    expect(guardado).toBeNull();
  });

  it("rechaza plazos absurdamente largos", async () => {
    const { guardar } = await servidor("dev");
    expect((await guardar({ diasProyectoParado: 5000 })).status).toBe(400);
  });

  // La columna guarda "crítica" con tilde: aceptarla sin normalizar dejaría la
  // regla en un valor que el filtro no reconoce y que degrada a "media".
  it("normaliza la prioridad al guardarla", async () => {
    const { guardar } = await servidor("dev");
    const r = await guardar({ prioridadMinima: "critica" });
    expect((await leerJson(r)).reglas.prioridadMinima).toBe("crítica");
  });

  it("una prioridad inventada no se guarda tal cual", async () => {
    const { guardar } = await servidor("dev");
    const r = await guardar({ prioridadMinima: "urgentísimo" });
    expect((await leerJson(r)).reglas.prioridadMinima).toBe("media");
  });
});
