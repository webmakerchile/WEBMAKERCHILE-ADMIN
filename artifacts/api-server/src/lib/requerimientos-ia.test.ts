// La extensión del brief técnico: del contrato salen tareas accionables.
// Lo que se defiende aquí: (1) NI UN monto viaja al modelo ni vuelve de él,
// (2) lo que devuelve el modelo se normaliza a los valores del sistema
// (prioridades, áreas, largos), y (3) un resultado vacío es un ERROR, no un
// éxito silencioso — la misma lección que ya pagó el brief.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
    constructor(_opts: unknown) {}
  },
}));

import { parsearRequerimientos, armarContexto, generarRequerimientos } from "./requerimientos-ia";

beforeEach(() => {
  createMock.mockReset();
  vi.stubEnv("OPENAI_API_KEY", "clave-de-test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parsearRequerimientos", () => {
  it("normaliza una respuesta válida y descarta tareas sin título", () => {
    const out = parsearRequerimientos({
      tareas: [
        { titulo: "  Desarrollar home  ", descripcion: "Hero + CTA", checklist: ["Diseño", " Responsive "], prioridad: "alta", area: "desarrollo" },
        { titulo: "", descripcion: "sin título, fuera" },
        { titulo: "Lanzar campaña", prioridad: "urgentísima", area: "ventas" },
      ],
    });
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({
      titulo: "Desarrollar home",
      descripcion: "Hero + CTA",
      checklist: ["Diseño", "Responsive"],
      prioridad: "alta",
      area: "desarrollo",
    });
    // Prioridad y área desconocidas caen a los valores por defecto del sistema.
    expect(out[1]!.prioridad).toBe("media");
    expect(out[1]!.area).toBe("desarrollo");
  });

  it("si el modelo cuela un monto, no viaja a la tarea", () => {
    const out = parsearRequerimientos({
      tareas: [{
        titulo: "Cobrar el anticipo de $1.200.000",
        descripcion: "El proyecto vale 990 UF en total",
        checklist: ["Facturar $500.000"],
      }],
    });
    expect(out[0]!.titulo).not.toContain("1.200.000");
    expect(out[0]!.descripcion).not.toContain("990");
    expect(out[0]!.checklist[0]).not.toContain("500.000");
  });

  it("acota: máximo 20 tareas y 8 pasos de checklist", () => {
    const out = parsearRequerimientos({
      tareas: Array.from({ length: 30 }, (_, i) => ({
        titulo: `Tarea ${i}`,
        checklist: Array.from({ length: 15 }, (_, j) => `Paso ${j}`),
      })),
    });
    expect(out.length).toBe(20);
    expect(out[0]!.checklist.length).toBe(8);
  });

  it("basura del modelo → lista vacía, sin reventar", () => {
    expect(parsearRequerimientos(null)).toEqual([]);
    expect(parsearRequerimientos("texto suelto")).toEqual([]);
    expect(parsearRequerimientos({ tareas: "no es un array" })).toEqual([]);
  });
});

describe("armarContexto", () => {
  it("de los módulos viajan nombre y descripción, JAMÁS el precio", () => {
    const ctx = armarContexto({
      title: "Web Acme",
      client: "Acme",
      doc: {
        project: "Tienda online",
        client: "Acme SpA",
        scope: "Tienda completa por $2.500.000 con pasarela",
        modules: [
          { name: "Catálogo", desc: "Con filtros", price: 500000 },
          { name: "", desc: "módulo sin nombre, fuera" },
        ],
      },
      brief: { objetivo: "Vender online" },
    });
    expect(ctx).toContain("Catálogo");
    expect(ctx).toContain("Con filtros");
    expect(ctx).toContain("Vender online"); // el brief existente es fuente principal
    expect(ctx).not.toContain("500000");
    expect(ctx).not.toContain("2.500.000");
  });

  it("sin doc usa la ficha del contrato, con las notas limpias de montos", () => {
    const ctx = armarContexto({ title: "Branding Beta", client: "Beta", notes: "Total $800.000 en dos cuotas" });
    expect(ctx).toContain("Branding Beta");
    expect(ctx).not.toContain("800.000");
  });
});

describe("generarRequerimientos", () => {
  it("sin API key lanza de inmediato (el handoff cae al brief)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(generarRequerimientos({ title: "X" })).rejects.toThrow("OPENAI_API_KEY");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("con respuesta buena devuelve la lista parseada", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        tareas: [{ titulo: "Desarrollar home", descripcion: "Hero", checklist: ["CTA"], prioridad: "alta", area: "desarrollo" }],
      }) } }],
    });
    const out = await generarRequerimientos({ title: "Web Acme", client: "Acme" });
    expect(out.length).toBe(1);
    expect(out[0]!.titulo).toBe("Desarrollar home");
    // El prompt pide JSON y lleva el contexto del contrato.
    const llamada = createMock.mock.calls[0]![0] as { messages: Array<{ content: string }> };
    expect(llamada.messages[1]!.content).toContain("Web Acme");
  });

  it("respuesta sin tareas usables → ERROR, nunca un éxito vacío", async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: '{"tareas":[]}' } }] });
    await expect(generarRequerimientos({ title: "X" })).rejects.toThrow("usables");

    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "esto no es JSON" } }] });
    await expect(generarRequerimientos({ title: "X" })).rejects.toThrow("usables");
  });
});
