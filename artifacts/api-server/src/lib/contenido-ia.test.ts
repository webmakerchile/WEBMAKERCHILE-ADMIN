// El plan semanal de contenido: pares redes ↔ edición, nunca tareas sueltas.
// Lo que se defiende aquí: (1) un par cojo (sin una de las dos caras) se
// descarta entero, (2) NI UN monto viaja al modelo ni vuelve de él, (3) los
// límites de items/checklist se respetan, y (4) un plan vacío es un ERROR,
// no un éxito silencioso — la misma lección del arranque de proyectos.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
    constructor(_opts: unknown) {}
  },
}));

import { parsearPlanContenido, armarContextoContenido, generarPlanContenido } from "./contenido-ia";

beforeEach(() => {
  createMock.mockReset();
  vi.stubEnv("OPENAI_API_KEY", "clave-de-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const item = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  tema: "Detrás de cámaras",
  prioridad: "alta",
  dia: "2026-08-03",
  redes: { titulo: "Grabar detrás de cámaras", descripcion: "En la oficina", checklist: ["Guion", "Grabar"] },
  edicion: { titulo: "Editar detrás de cámaras", descripcion: "Cortes dinámicos", checklist: ["Montaje", "Subtítulos"] },
  ...extra,
});

describe("parsearPlanContenido", () => {
  it("normaliza un item válido con sus dos caras", () => {
    const out = parsearPlanContenido({ items: [item()] });
    expect(out).toHaveLength(1);
    expect(out[0]!.tema).toBe("Detrás de cámaras");
    expect(out[0]!.prioridad).toBe("alta");
    expect(out[0]!.dia).toBe("2026-08-03");
    expect(out[0]!.redes.titulo).toBe("Grabar detrás de cámaras");
    expect(out[0]!.edicion.checklist).toEqual(["Montaje", "Subtítulos"]);
  });

  it("un par cojo se descarta ENTERO: sin edición no hay tarea de redes", () => {
    const out = parsearPlanContenido({
      items: [
        item({ edicion: { titulo: "", descripcion: "x", checklist: [] } }),
        item({ redes: { titulo: "  ", descripcion: "", checklist: [] } }),
        item(),
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.redes.titulo).toBe("Grabar detrás de cámaras");
  });

  it("si el modelo cuela montos, no viajan a ninguna cara", () => {
    const out = parsearPlanContenido({
      items: [item({
        tema: "Campaña de $1.200.000",
        redes: { titulo: "Grabar video del plan de $500.000", descripcion: "Vale 990 UF", checklist: ["Cobrar $100.000"] },
        edicion: { titulo: "Editar video de $500.000", descripcion: "ok", checklist: [] },
      })],
    });
    expect(out[0]!.tema).not.toContain("1.200.000");
    expect(out[0]!.redes.titulo).not.toContain("500.000");
    expect(out[0]!.redes.descripcion).not.toContain("990");
    expect(out[0]!.redes.checklist[0]).not.toContain("100.000");
    expect(out[0]!.edicion.titulo).not.toContain("500.000");
  });

  it("acota: máximo 7 items y 6 pasos de checklist por cara", () => {
    const out = parsearPlanContenido({
      items: Array.from({ length: 12 }, (_, i) =>
        item({
          redes: { titulo: `Grabar ${i}`, descripcion: "", checklist: Array.from({ length: 10 }, (_, j) => `Paso ${j}`) },
          edicion: { titulo: `Editar ${i}`, descripcion: "", checklist: [] },
        }),
      ),
    });
    expect(out).toHaveLength(7);
    expect(out[0]!.redes.checklist).toHaveLength(6);
  });

  it("prioridad desconocida cae a media; día mal formado cae a null", () => {
    const out = parsearPlanContenido({
      items: [item({ prioridad: "urgentísima", dia: "el martes que viene" })],
    });
    expect(out[0]!.prioridad).toBe("media");
    expect(out[0]!.dia).toBeNull();
  });

  it("basura del modelo → lista vacía, sin reventar", () => {
    expect(parsearPlanContenido(null)).toEqual([]);
    expect(parsearPlanContenido("texto suelto")).toEqual([]);
    expect(parsearPlanContenido({ items: "no es un array" })).toEqual([]);
  });
});

describe("armarContextoContenido", () => {
  it("incluye semana, videos con estado/fecha y tareas existentes, sin montos", () => {
    const ctx = armarContextoContenido({
      semana: "2026-W32",
      videos: [
        { title: "Testimonio cliente $2.000.000", scheduledAt: new Date("2026-08-04T15:00:00Z"), workflowStatus: "aprobado" },
        { title: "Tips de branding", scheduledAt: null, workflowStatus: "borrador" },
      ],
      existentes: ["Grabar testimonio"],
    });
    expect(ctx).toContain("2026-W32");
    expect(ctx).toContain("aprobado");
    expect(ctx).toContain("2026-08-04");
    expect(ctx).toContain("sin fecha");
    expect(ctx).toContain("Grabar testimonio");
    expect(ctx).not.toContain("2.000.000");
  });

  it("sin videos lo dice explícito, para que el modelo proponga contenido nuevo", () => {
    const ctx = armarContextoContenido({ semana: "2026-W32", videos: [], existentes: [] });
    expect(ctx).toContain("No hay videos planificados");
  });
});

describe("generarPlanContenido", () => {
  const entrada = { semana: "2026-W32", videos: [], existentes: [], tono: "" };

  it("sin API key → error, no un plan vacío silencioso", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(generarPlanContenido(entrada)).rejects.toThrow(/OPENAI_API_KEY/);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("modelo sin items usables → error", async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ items: [] }) } }] });
    await expect(generarPlanContenido(entrada)).rejects.toThrow(/items usables/);
  });

  it("camino feliz: devuelve el plan y el prompt lleva contexto y tono de marca", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ items: [item()] }) } }],
    });
    const out = await generarPlanContenido({
      semana: "2026-W32",
      videos: [{ title: "Testimonio cliente", scheduledAt: null, workflowStatus: "aprobado" }],
      existentes: ["Grabar reel antiguo"],
      tono: "TONO DE MARCA: cercano y directo.",
    });
    expect(out).toHaveLength(1);
    const llamada = createMock.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
      response_format: { type: string };
    };
    expect(llamada.response_format.type).toBe("json_object");
    expect(llamada.messages[0]!.content).toContain("TONO DE MARCA: cercano y directo.");
    expect(llamada.messages[1]!.content).toContain("Testimonio cliente");
    expect(llamada.messages[1]!.content).toContain("Grabar reel antiguo");
  });
});
