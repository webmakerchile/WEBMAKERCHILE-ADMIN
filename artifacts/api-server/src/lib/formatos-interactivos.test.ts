import { describe, it, expect } from "vitest";
import {
  FORMATOS_INTERACTIVOS,
  obtenerFormatoInteractivo,
  listarFormatosInteractivos,
  parseContenidoInteractivo,
  buildPromptInteractivo,
  titularDe,
} from "./formatos-interactivos";

const encuesta = obtenerFormatoInteractivo("encuesta")!;
const quiz = obtenerFormatoInteractivo("quiz")!;
const vf = obtenerFormatoInteractivo("verdadero_falso")!;
const duelo = obtenerFormatoInteractivo("esto_o_aquello")!;
const test = obtenerFormatoInteractivo("test_rapido")!;

describe("catálogo", () => {
  it("los ids no se repiten", () => {
    const ids = FORMATOS_INTERACTIVOS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // El problema original: cinco "tipos de contenido" que producían lo mismo.
  // Si dos formatos piden los mismos campos Y se dibujan igual, vuelve a pasar.
  it("cada formato se distingue de todos los demás", () => {
    const firmas = FORMATOS_INTERACTIVOS.map((f) => `${f.bloque}|${[...f.campos].sort().join(",")}|${f.opciones ?? 0}`);
    expect(new Set(firmas).size, "hay formatos que producen exactamente lo mismo").toBe(firmas.length);
  });

  it("todo formato que pide opciones dice cuántas", () => {
    for (const f of FORMATOS_INTERACTIVOS) {
      if (f.campos.includes("opciones") || f.campos.includes("items")) {
        expect(f.opciones, `${f.id} pide opciones sin decir cuántas`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("todo formato trae guía y CTA propios", () => {
    for (const f of FORMATOS_INTERACTIVOS) {
      expect(f.guia.length, `${f.id} sin guía`).toBeGreaterThan(40);
      expect(f.cta.length, `${f.id} sin CTA`).toBeGreaterThan(4);
    }
  });

  it("el catálogo de la UI no filtra la guía interna", () => {
    const publico = JSON.stringify(listarFormatosInteractivos());
    expect(publico).not.toContain("no se negocian");
    expect(publico).not.toContain(FORMATOS_INTERACTIVOS[0]!.guia);
  });

  it("obtenerFormatoInteractivo aguanta lo que no existe", () => {
    expect(obtenerFormatoInteractivo(null)).toBeNull();
    expect(obtenerFormatoInteractivo("no_existe")).toBeNull();
  });
});

describe("buildPromptInteractivo", () => {
  it("pide los campos de ESE formato y no los de otro", () => {
    const p = buildPromptInteractivo(encuesta, "Tener web");
    expect(p).toContain('"opciones"');
    expect(p).not.toContain('"veredicto"');

    const q = buildPromptInteractivo(vf, "Tener web");
    expect(q).toContain('"veredicto"');
    expect(q).not.toContain('"items"');
  });

  it("incluye la guía del formato: es lo que hace que cambie el resultado", () => {
    expect(buildPromptInteractivo(quiz, "SEO")).toContain(quiz.guia);
  });

  it("mete el contexto del equipo cuando lo hay", () => {
    expect(buildPromptInteractivo(encuesta, "T", "mi idea a lo bruto")).toContain("mi idea a lo bruto");
    expect(buildPromptInteractivo(encuesta, "T")).not.toContain("CONTEXTO que dio el equipo");
  });

  it("prohíbe el lenguaje de España y las fórmulas de manual", () => {
    const p = buildPromptInteractivo(encuesta, "T");
    expect(p).toContain("NEUTRO");
    expect(p).toContain("¿Sabías que");
  });
});

describe("parseContenidoInteractivo", () => {
  const ok = JSON.stringify({
    titular: "¿Ya tienes web?",
    pregunta: "¿Tu negocio ya tiene página web?",
    opciones: ["Sí", "No"],
    explicacion: "La mitad de las pymes todavía no tiene.",
    cta: "Responde arriba",
  });

  it("parsea una encuesta bien formada", () => {
    const c = parseContenidoInteractivo(ok, encuesta)!;
    expect(c.opciones).toEqual(["Sí", "No"]);
    expect(c.titular).toBe("¿Ya tienes web?");
  });

  it("acepta fences de markdown y JSON dentro de texto", () => {
    expect(parseContenidoInteractivo("```json\n" + ok + "\n```", encuesta)).not.toBeNull();
    expect(parseContenidoInteractivo(`Claro:\n${ok}\n¡Listo!`, encuesta)).not.toBeNull();
  });

  // Una encuesta sin opciones es una imagen con una pregunta que no se puede
  // responder. Devolverla en verde es peor que fallar.
  it("rechaza lo que no se podría responder", () => {
    expect(parseContenidoInteractivo(JSON.stringify({ pregunta: "¿Y?" }), encuesta)).toBeNull();
    expect(parseContenidoInteractivo(JSON.stringify({ pregunta: "¿Y?", opciones: ["Sí"] }), encuesta)).toBeNull();
  });

  it("un quiz sin respuesta correcta no pasa", () => {
    const sinCorrecta = JSON.stringify({
      pregunta: "¿Cuánto tarda?", opciones: ["1 día", "1 semana", "1 mes"], explicacion: "x",
    });
    expect(parseContenidoInteractivo(sinCorrecta, quiz)).toBeNull();
  });

  it("descarta un índice de respuesta fuera de rango en vez de romper el render", () => {
    const fuera = JSON.stringify({
      pregunta: "¿Cuánto?", opciones: ["a", "b", "c"], correcta: 9, explicacion: "x",
    });
    expect(parseContenidoInteractivo(fuera, quiz)).toBeNull();
  });

  it("normaliza el veredicto venga como venga", () => {
    const base = { afirmacion: "Con Instagram basta", explicacion: "No basta." };
    for (const [dado, esperado] of [["verdadero", "VERDADERO"], ["Falso", "FALSO"], ["V", "VERDADERO"], ["f", "FALSO"]]) {
      const c = parseContenidoInteractivo(JSON.stringify({ ...base, veredicto: dado }), vf);
      expect(c?.veredicto, `"${dado}"`).toBe(esperado);
    }
    // Lo que no es ni una cosa ni la otra no pasa: el sello no puede quedar vacío.
    expect(parseContenidoInteractivo(JSON.stringify({ ...base, veredicto: "depende" }), vf)).toBeNull();
  });

  it("recorta los textos largos en vez de reventar el layout", () => {
    const c = parseContenidoInteractivo(JSON.stringify({
      titular: "t".repeat(300),
      pregunta: "p".repeat(300),
      opciones: ["o".repeat(200), "b"],
    }), encuesta)!;
    expect(c.titular.length).toBeLessThanOrEqual(70);
    expect(c.pregunta.length).toBeLessThanOrEqual(120);
    expect(c.opciones[0]!.length).toBeLessThanOrEqual(44);
  });

  it("recorta las listas al máximo del formato", () => {
    const c = parseContenidoInteractivo(JSON.stringify({
      pregunta: "¿Cuántas te pasan?",
      items: ["a", "b", "c", "d", "e", "f", "g", "h"],
      explicacion: "x",
    }), test)!;
    expect(c.items.length).toBeLessThanOrEqual(test.opciones!);
  });

  it("cae al CTA del formato si la IA no escribió uno", () => {
    const c = parseContenidoInteractivo(JSON.stringify({
      pregunta: "¿Web o redes?", izquierda: "Web", derecha: "Redes",
    }), duelo)!;
    expect(c.cta).toBe(duelo.cta);
  });

  it("devuelve null con basura en vez de un objeto a medias", () => {
    expect(parseContenidoInteractivo("lo siento, no puedo", encuesta)).toBeNull();
    expect(parseContenidoInteractivo("", encuesta)).toBeNull();
    expect(parseContenidoInteractivo("[]", encuesta)).toBeNull();
  });
});

describe("el parser aguanta un JSON con comentarios", () => {
  // Segundo cinturón: aunque la plantilla ya esté limpia, el modelo puede
  // añadir un comentario por su cuenta. Antes eso era mortal — fallaban el
  // parseo Y el rescate por regex, porque el rescate extrae el mismo texto.
  it("un comentario de línea no tumba la generación", () => {
    const crudo = `{
      "titular": "Un titular",
      "pregunta": "¿Cuánto cuesta una web?",
      "opciones": ["Menos de 100", "Entre 100 y 500", "Más de 500"],
      "correcta": 1,  // la del medio
      "explicacion": "Depende del alcance.",
      "cta": "Responde"
    }`;
    const c = parseContenidoInteractivo(crudo, quiz);
    expect(c, "el quiz con comentario debería parsearse").not.toBeNull();
    expect(c!.correcta).toBe(1);
  });

  it("un // dentro de una cadena NO se toca", () => {
    // Una URL lleva `//`. Borrar hasta el fin de línea se comería el resto.
    const crudo = `{"titular":"Mira https://webmakerlatam.com ahora","pregunta":"¿P?","opciones":["a","b"]}`;
    const c = parseContenidoInteractivo(crudo, encuesta);
    expect(c).not.toBeNull();
    expect(c!.titular).toBe("Mira https://webmakerlatam.com ahora");
  });

  it("la coma colgante que deja el comentario tampoco rompe", () => {
    const crudo = `{"pregunta":"¿P?","opciones":["a","b"],  // sobra\n}`;
    expect(parseContenidoInteractivo(crudo, encuesta)).not.toBeNull();
  });
});

describe("el JSON de ejemplo del prompt es JSON de verdad", () => {
  // El prompt le enseña al modelo "devuelve EXCLUSIVAMENTE este JSON" y le
  // muestra una plantilla. El modelo copia lo que ve. Si la plantilla no es
  // JSON válido, lo que devuelve tampoco lo es: JSON.parse falla, el rescate
  // por regex extrae el MISMO texto roto y falla igual, y la pieza nunca se
  // genera. Le pasó al Quiz con un comentario "//" y nadie lo vio, porque
  // ningún test miraba la plantilla.
  const bloqueJson = (prompt: string): string => {
    const i = prompt.indexOf("{");
    const j = prompt.lastIndexOf("}");
    return i >= 0 && j > i ? prompt.slice(i, j + 1) : "";
  };

  for (const f of FORMATOS_INTERACTIVOS) {
    it(`${f.id}: la plantilla se puede parsear`, () => {
      const crudo = bloqueJson(buildPromptInteractivo(f, "tener página web propia"));
      expect(crudo, `${f.id}: el prompt no contiene ningún bloque JSON`).not.toBe("");
      expect(() => JSON.parse(crudo), `${f.id}: la plantilla NO es JSON válido`).not.toThrow();
    });
  }

  it("ninguna plantilla lleva comentarios", () => {
    const conComentario = FORMATOS_INTERACTIVOS.filter((f) =>
      /\/\/|\/\*/.test(bloqueJson(buildPromptInteractivo(f, "tema"))),
    );
    expect(conComentario.map((f) => f.id)).toEqual([]);
  });

  it("la plantilla pide exactamente los campos del formato", () => {
    // Si el prompt pidiera menos campos de los que el parser exige, el
    // resultado se rechazaría siempre y el formato sería ingenerable.
    for (const f of FORMATOS_INTERACTIVOS) {
      const plantilla = JSON.parse(bloqueJson(buildPromptInteractivo(f, "tema"))) as Record<string, unknown>;
      for (const campo of f.campos) {
        expect(Object.keys(plantilla), `${f.id} no pide "${campo}"`).toContain(campo);
      }
    }
  });
});

describe("titularDe", () => {
  it("usa el titular de la IA cuando existe", () => {
    const c = parseContenidoInteractivo(JSON.stringify({
      titular: "Mi gancho", pregunta: "¿P?", opciones: ["a", "b"],
    }), encuesta)!;
    expect(titularDe(c, encuesta)).toBe("Mi gancho");
  });

  it("cae a lo que tiene sentido en cada formato", () => {
    const sinTitular = parseContenidoInteractivo(JSON.stringify({
      afirmacion: "Con Instagram basta", veredicto: "FALSO", explicacion: "No.",
    }), vf)!;
    expect(titularDe(sinTitular, vf)).toBe("Con Instagram basta");
  });

  // El bloque del veredicto solo dibuja la palabra VERDADERO o FALSO. Si un
  // titular de adorno le ganara a la afirmación, la pieza saldría con un sello
  // y sin nada sellado — se genera igual, se publica igual y no dice nada.
  it("en el veredicto la afirmación le gana al titular de adorno", () => {
    const c = parseContenidoInteractivo(JSON.stringify({
      titular: "¿Verdadero o falso?", afirmacion: "Con Instagram basta",
      veredicto: "FALSO", explicacion: "No.",
    }), vf)!;
    expect(titularDe(c, vf)).toBe("Con Instagram basta");
  });
});
