import { describe, it, expect } from "vitest";
import {
  construirSystemPrompt,
  construirUserPrompt,
  parseReparto,
  TIPOS_REDACCION,
  TONOS,
} from "./redactar.js";

const IDIOMA = "REGLA DE IDIOMA DE PRUEBA";

describe("construirSystemPrompt", () => {
  it("cada tipo trae su propia guía y todos la regla de idioma", () => {
    for (const tipo of TIPOS_REDACCION) {
      const p = construirSystemPrompt({ tipo, tono: "profesional", reglaIdioma: IDIOMA });
      expect(p, tipo).toContain(IDIOMA);
      expect(p, tipo).toContain("REGLAS INNEGOCIABLES");
      expect(p.length, tipo).toBeGreaterThan(300);
    }
  });

  it("prohíbe inventar el fondo, que es la regla central", () => {
    const p = construirSystemPrompt({ tipo: "tarea", tono: "directo", reglaIdioma: IDIOMA });
    expect(p).toContain("NO INVENTES el fondo");
    expect(p).toContain("entre corchetes");
  });

  it("los tonos cambian de verdad la instrucción", () => {
    const textos = TONOS.map((tono) => construirSystemPrompt({ tipo: "meta", tono, reglaIdioma: IDIOMA }));
    expect(new Set(textos).size).toBe(TONOS.length);
  });

  it("solo el reparto pide JSON", () => {
    expect(construirSystemPrompt({ tipo: "reparto", tono: "profesional", reglaIdioma: IDIOMA }))
      .toContain('"tareas"');
    expect(construirSystemPrompt({ tipo: "meta", tono: "profesional", reglaIdioma: IDIOMA }))
      .not.toContain('"tareas"');
  });

  it("la evaluación exige conductas observables, no rasgos de personalidad", () => {
    const p = construirSystemPrompt({ tipo: "evaluacion", tono: "profesional", reglaIdioma: IDIOMA });
    expect(p).toContain("conductas observables");
  });
});

describe("construirUserPrompt", () => {
  it("lleva el borrador y omite lo que no vino", () => {
    const p = construirUserPrompt({ borrador: "hay que subir ventas" });
    expect(p).toContain("hay que subir ventas");
    expect(p).not.toContain("CONTEXTO");
    expect(p).not.toContain("AJUSTE");
  });

  it("incluye contexto y ajuste cuando vienen", () => {
    const p = construirUserPrompt({ borrador: "b", contexto: "cliente Kori", ajuste: "más corto" });
    expect(p).toContain("cliente Kori");
    expect(p).toContain("más corto");
  });
});

describe("parseReparto", () => {
  const equipo = ["Danhiara Julio", "Lucas Olivares", "Ana Pérez"];
  const json = (tareas: unknown) => JSON.stringify({ tareas });

  it("parsea un reparto correcto", () => {
    const r = parseReparto(
      json([
        { persona: "Ana Pérez", titulo: "Escribir el guion", detalle: "Para el viernes" },
        { persona: "Lucas Olivares", titulo: "Editar el video", detalle: "" },
      ]),
      equipo,
    );
    expect(r).toHaveLength(2);
    expect(r[0]!.persona).toBe("Ana Pérez");
    expect(r[1]!.titulo).toBe("Editar el video");
  });

  it("acepta JSON envuelto en markdown", () => {
    const r = parseReparto("```json\n" + json([{ persona: "Ana Pérez", titulo: "X" }]) + "\n```", equipo);
    expect(r).toHaveLength(1);
  });

  it("descarta tareas asignadas a alguien que no está en el equipo", () => {
    // El modelo inventa nombres; una tarea asignada a un fantasma no se puede
    // guardar y aparecería como si se hubiera repartido.
    const r = parseReparto(json([{ persona: "Pedro Fantasma", titulo: "X" }]), equipo);
    expect(r).toEqual([]);
  });

  it("empareja sin depender de tildes ni mayúsculas, pero devuelve la grafía original", () => {
    const r = parseReparto(json([{ persona: "ana perez", titulo: "X" }]), equipo);
    expect(r).toHaveLength(1);
    expect(r[0]!.persona).toBe("Ana Pérez");
  });

  it("descarta tareas sin título", () => {
    const r = parseReparto(json([{ persona: "Ana Pérez", titulo: "   " }]), equipo);
    expect(r).toEqual([]);
  });

  it("devuelve vacío con basura en vez de romper", () => {
    expect(parseReparto("no soy json", equipo)).toEqual([]);
    expect(parseReparto("{}", equipo)).toEqual([]);
    expect(parseReparto(json("no soy un array"), equipo)).toEqual([]);
    expect(parseReparto("", equipo)).toEqual([]);
  });

  it("recorta títulos y detalles desmedidos", () => {
    const r = parseReparto(
      json([{ persona: "Ana Pérez", titulo: "x".repeat(500), detalle: "y".repeat(2000) }]),
      equipo,
    );
    expect(r[0]!.titulo.length).toBeLessThanOrEqual(200);
    expect(r[0]!.detalle.length).toBeLessThanOrEqual(600);
  });
});
