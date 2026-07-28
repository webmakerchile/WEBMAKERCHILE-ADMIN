import { describe, it, expect } from "vitest";
import { buildRedactarIdeaPostPrompt, parseIdeaPost, TEMA_MAX, IDEA_MAX } from "./redactar-idea-post";

const PERMITIDOS = {
  direcciones: ["estudio_spotlight", "estudio_medianoche"],
  poses: ["pointing_right", "thinking_hand_chin"],
  estilosTitular: ["impacto_total", "titan_condensada"],
};

const CATALOGOS = {
  direcciones: [
    { id: "estudio_spotlight", nombre: "Estudio Spotlight", descripcion: "foco ámbar" },
    { id: "estudio_medianoche", nombre: "Estudio Medianoche", descripcion: "azul frío" },
  ],
  poses: [
    { id: "pointing_right", nombre: "Señalando a la derecha" },
    { id: "thinking_hand_chin", nombre: "Pensativo" },
  ],
  estilosTitular: [
    { id: "impacto_total", nombre: "Impacto total", descripcion: "grueso" },
    { id: "titan_condensada", nombre: "Titán condensada", descripcion: "estrecho" },
  ],
};

const RESPUESTA_OK = JSON.stringify({
  tema: "5 señales de que tu pyme necesita tienda online",
  idea: "Webi señala una pizarra con cinco marcas. Hay un notebook abierto y una caja de envío.",
  utileria: "un notebook abierto, una caja de envío",
  estiloExtra: "tono cercano, ambiente de taller",
  direccionId: "estudio_spotlight",
  poseId: "pointing_right",
  estiloTitularId: "impacto_total",
});

describe("parseIdeaPost", () => {
  it("parsea la respuesta limpia", () => {
    const r = parseIdeaPost(RESPUESTA_OK, PERMITIDOS);
    expect(r?.tema).toContain("5 señales");
    expect(r?.direccionId).toBe("estudio_spotlight");
    expect(r?.poseId).toBe("pointing_right");
    expect(r?.estiloTitularId).toBe("impacto_total");
  });

  it("acepta el JSON envuelto en fences de markdown", () => {
    const r = parseIdeaPost("```json\n" + RESPUESTA_OK + "\n```", PERMITIDOS);
    expect(r?.utileria).toBe("un notebook abierto, una caja de envío");
  });

  it("acepta JSON incrustado en texto suelto", () => {
    const r = parseIdeaPost(`Claro, aquí va:\n${RESPUESTA_OK}\n¡Espero que sirva!`, PERMITIDOS);
    expect(r?.tema).toContain("5 señales");
  });

  // El modelo inventa ids con nombre plausible. Si se propagaran, el selector
  // de la UI quedaría marcando una opción que no existe en el catálogo.
  it("descarta los ids que no están en el catálogo", () => {
    const r = parseIdeaPost(
      JSON.stringify({
        tema: "Tema",
        idea: "Idea",
        direccionId: "estudio_neon_inventado",
        poseId: "bailando_breakdance",
        estiloTitularId: "comic_sans",
      }),
      PERMITIDOS,
    );
    expect(r?.direccionId).toBe("");
    expect(r?.poseId).toBe("");
    expect(r?.estiloTitularId).toBe("");
  });

  it("recorta tema e idea a su límite", () => {
    const r = parseIdeaPost(
      JSON.stringify({ tema: "t".repeat(TEMA_MAX + 80), idea: "i".repeat(IDEA_MAX + 400) }),
      PERMITIDOS,
    );
    expect(r?.tema).toHaveLength(TEMA_MAX);
    expect(r?.idea).toHaveLength(IDEA_MAX);
  });

  it("devuelve null cuando no hay nada usable", () => {
    expect(parseIdeaPost("lo siento, no puedo ayudarte con eso", PERMITIDOS)).toBeNull();
    expect(parseIdeaPost("{}", PERMITIDOS)).toBeNull();
    expect(parseIdeaPost(JSON.stringify({ tema: "", idea: "" }), PERMITIDOS)).toBeNull();
  });
});

describe("buildRedactarIdeaPostPrompt", () => {
  it("lista los ids reales del catálogo para que la IA elija de ahí", () => {
    const p = buildRedactarIdeaPostPrompt("tema", "idea", CATALOGOS);
    for (const id of [...PERMITIDOS.direcciones, ...PERMITIDOS.poses, ...PERMITIDOS.estilosTitular]) {
      expect(p).toContain(`"${id}"`);
    }
  });

  it("pide conservar la cantidad solo cuando es carrusel", () => {
    const carrusel = buildRedactarIdeaPostPrompt("5 errores", "", CATALOGOS, { tipoPublicacion: "carrusel" });
    const unica = buildRedactarIdeaPostPrompt("5 errores", "", CATALOGOS, { tipoPublicacion: "unica" });
    expect(carrusel).toContain("CARRUSEL");
    expect(carrusel).toContain("consérvala en el tema");
    expect(unica).toContain("PUBLICACIÓN ÚNICA");
    expect(unica).not.toContain("consérvala en el tema");
  });

  it("incluye el material del compañero sin reescribirlo", () => {
    const p = buildRedactarIdeaPostPrompt("Mi tema", "mi idea a lo bruto", CATALOGOS);
    expect(p).toContain('"Mi tema"');
    expect(p).toContain('"mi idea a lo bruto"');
  });
});
