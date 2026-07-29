// Los presets del set existen para que elegir con un clic tenga efecto real.
//
// El riesgo de esta función no es que se caiga: es que el botón se pinte, se
// pueda tocar, se quede marcado, y no cambie nada en la imagen. Eso se ve
// exactamente igual que funcionar. Por eso lo que se comprueba aquí es que el
// texto de cada opción llegue al prompt que se le manda al modelo.

import { describe, it, expect } from "vitest";
import {
  GESTOS_WEBI,
  ENCUADRES,
  UTILERIA_PRESETS,
  ESTILO_PRESETS,
  listarPresetsSet,
  posesCompatibles,
  textoEncuadre,
  textoGesto,
} from "./set-presets.js";
import { PORTADA_POSES, POSES_PRIMER_PLANO, bloquePoseRequerida } from "./pose-bank.js";
import { prepararPortada } from "./cover-style.js";

const todosLosPresets = [
  ...GESTOS_WEBI,
  ...ENCUADRES,
  ...UTILERIA_PRESETS.flatMap((g) => g.opciones),
  ...ESTILO_PRESETS,
];

describe("catálogo de presets", () => {
  it("ningún preset viaja sin texto", () => {
    // Un preset con texto vacío es un botón que se marca y no hace nada.
    const mudos = todosLosPresets.filter((p) => !p.texto.trim());
    expect(mudos.map((p) => p.id)).toEqual([]);
  });

  it("los ids no se repiten dentro de cada catálogo", () => {
    for (const [nombre, lista] of [
      ["gestos", GESTOS_WEBI],
      ["encuadres", ENCUADRES],
      ["estilos", ESTILO_PRESETS],
      ["utilería", UTILERIA_PRESETS.flatMap((g) => g.opciones)],
    ] as const) {
      const ids = lista.map((p) => p.id);
      expect(new Set(ids).size, `ids repetidos en ${nombre}`).toBe(ids.length);
    }
  });

  it("el catálogo que ve la UI no pierde ninguna opción", () => {
    const c = listarPresetsSet();
    expect(c.gestos).toHaveLength(GESTOS_WEBI.length);
    expect(c.encuadres).toHaveLength(ENCUADRES.length);
    expect(c.estilos).toHaveLength(ESTILO_PRESETS.length);
    expect(c.utileria.flatMap((g) => g.opciones)).toHaveLength(
      UTILERIA_PRESETS.flatMap((g) => g.opciones).length,
    );
    // La UI necesita el texto de utilería y estilo para poder componer el
    // campo libre; sin él los botones no podrían escribir nada.
    expect(c.utileria[0]!.opciones[0]!.texto).toBeTruthy();
    expect(c.estilos[0]!.texto).toBeTruthy();
  });

  it("un id inventado no resuelve a texto", () => {
    expect(textoGesto("no_existe")).toBeNull();
    expect(textoEncuadre("no_existe")).toBeNull();
    expect(textoGesto(null)).toBeNull();
  });
});

describe("el gesto y el encuadre llegan al prompt", () => {
  it("el bloque de pose los incluye y los pone por encima de la pose", () => {
    const pose = { id: PORTADA_POSES[0]!.id, descripcion: PORTADA_POSES[0]!.descripcion, emocion: null };
    const bloque = bloquePoseRequerida(pose, {
      gesto: "guiñando un ojo",
      encuadre: "primer plano cerrado",
    });
    expect(bloque).toContain("guiñando un ojo");
    expect(bloque).toContain("primer plano cerrado");
    // Sin el "manda sobre", el modelo se queda con la expresión que arrastra
    // la pose y el gesto elegido se pierde en silencio.
    expect(bloque).toMatch(/manda sobre/i);
  });

  it("sin gesto ni encuadre el bloque no inventa secciones", () => {
    const pose = { id: PORTADA_POSES[0]!.id, descripcion: PORTADA_POSES[0]!.descripcion, emocion: null };
    const bloque = bloquePoseRequerida(pose);
    expect(bloque).not.toMatch(/EXPRESIÓN OBLIGATORIA/);
    expect(bloque).not.toMatch(/ENCUADRE OBLIGATORIO/);
  });

  it("prepararPortada mete los dos textos en el prompt final", () => {
    const gesto = GESTOS_WEBI.find((g) => g.id === "guino")!;
    const encuadre = ENCUADRES.find((e) => e.id === "contrapicado")!;
    const { prompt } = prepararPortada("tener página web propia", null, {
      gestoId: gesto.id,
      encuadreId: encuadre.id,
    });
    expect(prompt).toContain(gesto.texto);
    expect(prompt).toContain(encuadre.texto);
  });
});

describe("encuadre cerrado y pose incompatible", () => {
  it("el primer plano restringe las poses; los demás encuadres no", () => {
    expect(posesCompatibles("primer_plano")).toEqual(POSES_PRIMER_PLANO);
    expect(posesCompatibles("cuerpo_entero")).toBeNull();
    expect(posesCompatibles(null)).toBeNull();
  });

  it("en primer plano la pose automática cabe en el encuadre", () => {
    // Sin este filtro salía "brazos cruzados" en un plano que no muestra el
    // torso: la imagen contradecía lo que se había elegido.
    for (let i = 0; i < 12; i++) {
      const { pose } = prepararPortada("cómo vender más", null, { encuadreId: "primer_plano" });
      expect(POSES_PRIMER_PLANO, `pose "${pose.id}" no cabe en primer plano`).toContain(pose.id);
    }
  });

  it("una pose elegida a mano manda sobre el encuadre", () => {
    // Las dos son decisiones explícitas del usuario. Descartar la pose en
    // silencio sería cambiarle la elección sin decírselo.
    const { pose } = prepararPortada("cómo vender más", null, {
      encuadreId: "primer_plano",
      poseId: "superhero_stance",
    });
    expect(pose.id).toBe("superhero_stance");
  });
});
