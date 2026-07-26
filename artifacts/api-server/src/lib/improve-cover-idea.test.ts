import { describe, it, expect } from "vitest";
import { ImproveCoverIdeaBody } from "@workspace/api-zod";
import {
  buildImproveIdeaPrompt,
  parseImprovedIdea,
  IMPROVE_TITLE_MAX,
  IMPROVE_IDEA_MAX,
  IMPROVE_UTILERIA_MAX,
  IMPROVE_ESTILO_MAX,
  type DireccionResumen,
} from "./improve-cover-idea";

const DIRS: DireccionResumen[] = [
  { id: "estudio_spotlight", nombre: "Estudio spotlight ámbar", descripcion: "El clásico aprobado." },
  { id: "estudio_carmesi", nombre: "Estudio carmesí", descripcion: "Luz roja dramática." },
];
const DIR_IDS = DIRS.map((d) => d.id);

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
    const p = buildImproveIdeaPrompt("Mi título", "vender más en diciembre", DIRS);
    expect(p).toContain('"Mi título"');
    expect(p).toContain('"vender más en diciembre"');
  });

  it("mantiene la dirección de arte: JSON estricto y prohibición de stickers", () => {
    const p = buildImproveIdeaPrompt("", "algo", DIRS);
    expect(p).toContain("JSON");
    expect(p).toMatch(/nunca stickers/i);
    expect(p).toMatch(/símbolos/i);
    expect(p).toMatch(/zorro Webi/i);
  });

  it("pide conservar el tema original del usuario", () => {
    const p = buildImproveIdeaPrompt("t", "i", DIRS);
    expect(p).toMatch(/no inventes un tema distinto/i);
  });

  it("ofrece el catálogo de iluminaciones con sus ids exactos y pide el set completo", () => {
    const p = buildImproveIdeaPrompt("t", "i", DIRS);
    expect(p).toContain('"estudio_spotlight"');
    expect(p).toContain('"estudio_carmesi"');
    expect(p).toContain("Luz roja dramática.");
    expect(p).toContain('"utileria"');
    expect(p).toContain('"estiloExtra"');
    expect(p).toContain('"direccionId"');
  });
});

describe("parseImprovedIdea", () => {
  it("parsea JSON directo (campos del set vacíos si faltan)", () => {
    const r = parseImprovedIdea('{"title": "Vende más hoy", "idea": "El zorro sonríe."}');
    expect(r).toEqual({
      title: "Vende más hoy",
      idea: "El zorro sonríe.",
      utileria: "",
      estiloExtra: "",
      direccionId: "",
    });
  });

  it("parsea JSON con fences de markdown", () => {
    const r = parseImprovedIdea('```json\n{"title": "Hola", "idea": "Escena."}\n```');
    expect(r?.title).toBe("Hola");
    expect(r?.idea).toBe("Escena.");
  });

  it("extrae JSON embebido en texto extra", () => {
    const r = parseImprovedIdea('Claro, aquí está:\n{"title": "T", "idea": "I"}\nEspero que sirva.');
    expect(r?.title).toBe("T");
    expect(r?.idea).toBe("I");
  });

  it("devuelve null si no hay JSON", () => {
    expect(parseImprovedIdea("no puedo ayudarte con eso")).toBeNull();
  });

  it("devuelve null si título e idea faltan o vienen vacíos", () => {
    expect(parseImprovedIdea('{"otra": "cosa"}')).toBeNull();
    expect(parseImprovedIdea('{"title": "  ", "idea": ""}')).toBeNull();
  });

  it("acepta solo idea (title queda vacío)", () => {
    const r = parseImprovedIdea('{"idea": "Solo la escena."}');
    expect(r?.title).toBe("");
    expect(r?.idea).toBe("Solo la escena.");
  });

  it("devuelve el set completo cuando la IA lo propone", () => {
    const r = parseImprovedIdea(
      JSON.stringify({
        title: "T",
        idea: "I",
        utileria: "un notebook abierto, una taza de café",
        estiloExtra: "tono dramático",
        direccionId: "estudio_carmesi",
      }),
      DIR_IDS,
    );
    expect(r).toEqual({
      title: "T",
      idea: "I",
      utileria: "un notebook abierto, una taza de café",
      estiloExtra: "tono dramático",
      direccionId: "estudio_carmesi",
    });
  });

  it("descarta una iluminación fuera del catálogo (queda vacía)", () => {
    const r = parseImprovedIdea(
      '{"title": "T", "idea": "I", "direccionId": "estudio_inventado"}',
      DIR_IDS,
    );
    expect(r?.direccionId).toBe("");
  });

  it("recorta todos los campos a sus máximos permitidos", () => {
    const r = parseImprovedIdea(
      JSON.stringify({
        title: "x".repeat(200),
        idea: "y".repeat(2000),
        utileria: "u".repeat(500),
        estiloExtra: "e".repeat(500),
      }),
    );
    expect(r?.title).toHaveLength(IMPROVE_TITLE_MAX);
    expect(r?.idea).toHaveLength(IMPROVE_IDEA_MAX);
    expect(r?.utileria).toHaveLength(IMPROVE_UTILERIA_MAX);
    expect(r?.estiloExtra).toHaveLength(IMPROVE_ESTILO_MAX);
  });
});

describe("buildImproveIdeaPrompt — formato youtube", () => {
  const dirs = [{ id: "estudio_spotlight", nombre: "Spotlight ámbar", descripcion: "foco cálido" }];

  it("por defecto (o vertical) habla de portada vertical con Webi", () => {
    const p = buildImproveIdeaPrompt("t", "i", dirs);
    expect(p).toContain("PORTADA vertical");
    expect(p).not.toContain("YOUTUBE");
  });

  it("youtube sin persona: miniatura horizontal 16:9 protagonizada por Webi", () => {
    const p = buildImproveIdeaPrompt("t", "i", dirs, { formato: "youtube" });
    expect(p).toContain("MINIATURA HORIZONTAL");
    expect(p).toContain("16:9");
    expect(p).toContain("YOUTUBE");
    expect(p).toContain("zorro Webi");
    expect(p).not.toContain("PERSONA REAL");
  });

  it("youtube con persona: pide expresión youtuber de la persona real", () => {
    const p = buildImproveIdeaPrompt("t", "i", dirs, { formato: "youtube", conPersona: true });
    expect(p).toContain("PERSONA REAL");
    expect(p).toContain("youtuber");
    expect(p).toContain("EXPRESIÓN exagerada");
  });

  it("youtube mantiene el catálogo de luces y las reglas anti-sticker", () => {
    const p = buildImproveIdeaPrompt("t", "i", dirs, { formato: "youtube", conPersona: true });
    expect(p).toContain("estudio_spotlight");
    expect(p).toContain("nunca stickers");
  });
});
