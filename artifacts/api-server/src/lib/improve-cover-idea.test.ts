import { describe, it, expect } from "vitest";
import { ImproveCoverIdeaBody } from "@workspace/api-zod";
import {
  buildImproveIdeaPrompt,
  parseImprovedIdea,
  IMPROVE_TITLE_MAX,
  IMPROVE_IDEA_MAX,
} from "./improve-cover-idea";

describe("ImproveCoverIdeaBody (límites de costo)", () => {
  it("acepta entradas dentro de los máximos", () => {
    expect(() =>
      ImproveCoverIdeaBody.parse({ title: "t".repeat(200), idea: "i".repeat(2000) })
    ).not.toThrow();
    expect(() => ImproveCoverIdeaBody.parse({})).not.toThrow();
  });

  it("rechaza título o idea demasiado largos (control de costo del prompt)", () => {
    expect(() => ImproveCoverIdeaBody.parse({ title: "t".repeat(201) })).toThrow();
    expect(() => ImproveCoverIdeaBody.parse({ idea: "i".repeat(2001) })).toThrow();
  });
});

describe("buildImproveIdeaPrompt", () => {
  it("incluye el material del usuario (título e idea en bruto)", () => {
    const p = buildImproveIdeaPrompt("Mi título", "vender más en diciembre");
    expect(p).toContain('"Mi título"');
    expect(p).toContain('"vender más en diciembre"');
  });

  it("mantiene la dirección de arte: JSON estricto y prohibición de stickers", () => {
    const p = buildImproveIdeaPrompt("", "algo");
    expect(p).toContain("JSON");
    expect(p).toMatch(/nunca stickers/i);
    expect(p).toMatch(/símbolos flotantes/i);
    expect(p).toMatch(/zorro Webi/i);
  });

  it("pide conservar el tema original del usuario", () => {
    const p = buildImproveIdeaPrompt("t", "i");
    expect(p).toMatch(/no inventes un tema distinto/i);
  });
});

describe("parseImprovedIdea", () => {
  it("parsea JSON directo", () => {
    const r = parseImprovedIdea('{"title": "Vende más hoy", "idea": "El zorro sonríe."}');
    expect(r).toEqual({ title: "Vende más hoy", idea: "El zorro sonríe." });
  });

  it("parsea JSON con fences de markdown", () => {
    const r = parseImprovedIdea('```json\n{"title": "Hola", "idea": "Escena."}\n```');
    expect(r).toEqual({ title: "Hola", idea: "Escena." });
  });

  it("extrae JSON embebido en texto extra", () => {
    const r = parseImprovedIdea('Claro, aquí está:\n{"title": "T", "idea": "I"}\nEspero que sirva.');
    expect(r).toEqual({ title: "T", idea: "I" });
  });

  it("devuelve null si no hay JSON", () => {
    expect(parseImprovedIdea("no puedo ayudarte con eso")).toBeNull();
  });

  it("devuelve null si ambos campos faltan o vienen vacíos", () => {
    expect(parseImprovedIdea('{"otra": "cosa"}')).toBeNull();
    expect(parseImprovedIdea('{"title": "  ", "idea": ""}')).toBeNull();
  });

  it("acepta solo idea (title queda vacío)", () => {
    const r = parseImprovedIdea('{"idea": "Solo la escena."}');
    expect(r).toEqual({ title: "", idea: "Solo la escena." });
  });

  it("recorta título e idea a los máximos permitidos", () => {
    const r = parseImprovedIdea(
      JSON.stringify({ title: "x".repeat(200), idea: "y".repeat(2000) })
    );
    expect(r?.title).toHaveLength(IMPROVE_TITLE_MAX);
    expect(r?.idea).toHaveLength(IMPROVE_IDEA_MAX);
  });
});
