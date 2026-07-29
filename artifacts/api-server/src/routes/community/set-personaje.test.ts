// Las tres secciones tienen que recibir la MISMA personalización.
//
// Historias ya se quedó atrás una vez: Posts IA tenía pose, utilería y estilo
// extra mientras Historias generaba sin nada de eso, así que el mismo concepto
// salía distinto según dónde se creara. La causa era que cada sección armaba
// su prompt por su cuenta y añadir una opción exigía acordarse de todas.
//
// Este test recorre los tres constructores con el mismo set y exige que las
// opciones aparezcan en los tres. Si mañana se añade una opción y solo se
// cablea en dos, aquí se cae en vez de descubrirse en una imagen publicada.

import { describe, it, expect } from "vitest";
import { buildHistoriaPrompt, buildSlidePrompt, resolverSetEstudio } from "./index.js";
import { prepararPortada } from "../../lib/cover-style.js";
import { GESTOS_WEBI, ENCUADRES, UTILERIA_PRESETS, ESTILO_PRESETS } from "../../lib/set-presets.js";
import { layoutHistoriaPorDefecto } from "../../lib/story-formats.js";

const gesto = GESTOS_WEBI.find((g) => g.id === "picaro")!;
const encuadre = ENCUADRES.find((e) => e.id === "contrapicado")!;
const utileria = UTILERIA_PRESETS[0]!.opciones[0]!;
const estilo = ESTILO_PRESETS[0]!;

const set = resolverSetEstudio({
  direccion_id: "estudio_spotlight",
  pose_id: "thumbs_up_confident",
  gesto_id: gesto.id,
  encuadre_id: encuadre.id,
  utileria: utileria.texto,
  estilo_extra: estilo.texto,
});

/** Los prompts de las tres secciones, con el mismo set aplicado. */
const prompts: Array<[string, string]> = [
  [
    "historias",
    buildHistoriaPrompt("dato", "tener página web propia", {
      layout: layoutHistoriaPorDefecto(),
      set,
    }),
  ],
  [
    "posts IA",
    buildSlidePrompt(
      "tener página web propia",
      "educativo",
      { numero: 1, rol: "portada", titulo: "Titular", subtitulo: "Subtítulo" },
      "4:5",
      3,
      set,
    ),
  ],
  [
    "portadas",
    prepararPortada("tener página web propia", estilo.texto, {
      poseId: "thumbs_up_confident",
      gestoId: gesto.id,
      encuadreId: encuadre.id,
      utileria: utileria.texto,
    }).prompt,
  ],
];

describe("la personalización llega a las tres secciones", () => {
  for (const [seccion, prompt] of prompts) {
    it(`${seccion}: gesto, encuadre, utilería y estilo`, () => {
      expect(prompt, `${seccion} ignora la expresión elegida`).toContain(gesto.texto);
      expect(prompt, `${seccion} ignora el encuadre elegido`).toContain(encuadre.texto);
      expect(prompt, `${seccion} ignora la utilería elegida`).toContain(utileria.texto);
      expect(prompt, `${seccion} ignora el toque de estilo`).toContain(estilo.texto);
    });
  }
});

describe("resolverSetEstudio", () => {
  it("resuelve los ids a los textos del prompt", () => {
    expect(set.gesto).toBe(gesto.texto);
    expect(set.encuadre).toBe(encuadre.texto);
    expect(set.pose?.id).toBe("thumbs_up_confident");
  });

  it("un encuadre cerrado sin pose elegida no deja una pose que no quepa", () => {
    // "pulgar arriba" necesita ver el brazo: en primer plano no cabe.
    const cerrado = resolverSetEstudio({ encuadre_id: "primer_plano" });
    expect(cerrado.pose).not.toBeNull();
    expect(["shocked_front", "thinking_hand_chin", "worried_head_hold", "whispering_secret", "head_tilt_curious"])
      .toContain(cerrado.pose!.id);
  });

  it("sin opciones el set queda limpio y no inventa nada", () => {
    const vacio = resolverSetEstudio({});
    expect(vacio.gesto).toBeNull();
    expect(vacio.encuadre).toBeNull();
    expect(vacio.pose).toBeNull();
    expect(vacio.utileria).toBeNull();
  });
});
