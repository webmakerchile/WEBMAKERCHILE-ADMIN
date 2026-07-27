import { describe, it, expect } from "vitest";
import {
  buildGuionSystemPrompt,
  buildGuionUserPrompt,
  parseGuion,
  revisarGuion,
  limpiarFrasesProhibidas,
  recortarLimpio,
  sanearDato,
  sanearHashtags,
  resolverModoCierre,
  FRASES_PROHIBIDAS,
  MODOS_CIERRE,
  LIMITES_GUION,
} from "./story-script.js";
import { obtenerFormatoHistoria, arcoParaFrames } from "./story-formats.js";

const formato = obtenerFormatoHistoria("caso_real")!;
const arco3 = arcoParaFrames(formato, 3);

const OPTS = {
  tipoHistoria: "tip_tech",
  concepto: "una panadería que perdía pedidos por WhatsApp",
  formato,
  arco: arco3,
  catalogoServicios: "CATÁLOGO DE PRUEBA",
  reglaIdioma: "REGLA DE IDIOMA DE PRUEBA",
};

function guionJson(overrides?: Partial<Record<string, unknown>>[]): string {
  const frames = [0, 1, 2].map((i) => ({
    numero: i + 1,
    copy_principal: `Titular ${i + 1}`,
    sub_copy: `Contexto del frame ${i + 1}`,
    dato: "40",
    dato_label: "pedidos perdidos al mes",
    cta: "Cuéntanos tu caso",
    hashtags: "#WebMakerLatam #PymesLatam",
    prompt_visual: `Webi observando algo en el frame ${i + 1}`,
    ...(overrides?.[i] ?? {}),
  }));
  return JSON.stringify({ hilo: "Ana y sus pedidos perdidos", protagonista: "Ana", frames });
}

describe("prompts del guion", () => {
  it("el system prompt lleva formato, naturalidad y reglas de cierre", () => {
    const p = buildGuionSystemPrompt(OPTS);
    expect(p).toContain(formato.instruccionGuion.slice(0, 40));
    expect(p).toContain("PROHIBIDO pedirle al espectador que siga mirando");
    expect(p).toContain("sigue viendo");
    expect(p).toContain("VETADOS como texto de cierre");
    expect(p).toContain("COHERENCIA DE LA SERIE");
    expect(p).toContain("CATÁLOGO DE PRUEBA");
  });

  it("el user prompt enumera el arco con sus objetivos y el total exacto", () => {
    const p = buildGuionUserPrompt(OPTS);
    expect(p).toContain("ARCO DE 3 FRAMES");
    for (const paso of arco3) {
      expect(p).toContain(paso.paso);
      expect(p).toContain(paso.objetivo.slice(0, 30));
    }
    expect(p).toContain("EXACTAMENTE 3 elementos");
  });

  it("marca qué frames llevan cifra y cuáles no llevan sub-copy", () => {
    const arco5 = arcoParaFrames(formato, 5);
    const p = buildGuionUserPrompt({ ...OPTS, arco: arco5 });
    expect(p).toContain("CIFRA PROTAGONISTA");
    expect(p).toContain("NO lleva sub_copy");
  });

  it("inyecta el ajuste del usuario cuando viene", () => {
    const p = buildGuionUserPrompt({ ...OPTS, ajuste: "hazlo más directo" });
    expect(p).toContain("hazlo más directo");
  });
});

describe("limpiarFrasesProhibidas", () => {
  it("elimina las muletillas de retención", () => {
    expect(limpiarFrasesProhibidas("Perdía clientes. Sigue viendo").toLowerCase()).not.toContain("sigue viendo");
    expect(limpiarFrasesProhibidas("Toca para seguir y mira esto").toLowerCase()).not.toContain("toca para seguir");
    expect(limpiarFrasesProhibidas("No te pierdas el final").toLowerCase()).not.toContain("no te pierdas");
  });

  it("no destruye el texto útil", () => {
    expect(limpiarFrasesProhibidas("Ana perdía 40 pedidos al mes")).toBe("Ana perdía 40 pedidos al mes");
  });

  it("cubre toda la lista negra sin dejar rastro", () => {
    for (const frase of FRASES_PROHIBIDAS) {
      const limpio = limpiarFrasesProhibidas(`Texto base ${frase} final`).toLowerCase();
      expect(limpio, `quedó "${frase}"`).not.toContain(frase.toLowerCase());
    }
  });
});

describe("recortarLimpio", () => {
  it("nunca corta una palabra por la mitad", () => {
    const largo = "El horno seguía prendido y el teléfono en silencio toda la tarde";
    for (let limite = 10; limite <= 70; limite++) {
      const r = recortarLimpio(largo, limite);
      expect(r.length, `límite ${limite}`).toBeLessThanOrEqual(limite);
      // Todo lo que sobrevive tiene que ser una palabra completa del original.
      for (const palabra of r.split(" ")) {
        expect(largo.split(" "), `"${palabra}" no es una palabra entera (límite ${limite})`).toContain(palabra);
      }
    }
  });

  it("deja el texto intacto si ya cabe", () => {
    expect(recortarLimpio("Nadie contestaba", 44)).toBe("Nadie contestaba");
  });

  it("no deja la frase colgando de una preposición o conjunción", () => {
    expect(recortarLimpio("El horno prendido y el teléfono", 22)).toBe("El horno prendido");
    expect(recortarLimpio("Cerró la caja de noche", 15)).toBe("Cerró la caja");
  });

  it("devuelve entera una palabra única más larga que el límite", () => {
    // Media palabra nunca es mejor que una palabra chica: la achica el motor.
    expect(recortarLimpio("Extraordinariamentedesproporcionado", 44)).toBe("Extraordinariamentedesproporcionado");
  });

  it("sí corta un token absurdo, que ya no es una palabra", () => {
    expect(recortarLimpio("x".repeat(300), 44)).toHaveLength(44);
  });

  it("no deja puntuación suelta al principio ni al final", () => {
    expect(recortarLimpio(": Ana perdía pedidos —", 60)).toBe("Ana perdía pedidos");
  });
});

describe("sanearDato", () => {
  it("acepta cifras dibujables", () => {
    expect(sanearDato("40")).toBe("40");
    expect(sanearDato("72%")).toBe("72%");
    expect(sanearDato("1.250")).toBe("1.250");
    expect(sanearDato("3 h")).toBe("3 h");
  });

  it("rechaza lo que no es una cifra en vez de recortarlo", () => {
    // "cuarenta".slice(0,7) daba "cuarent": una palabra cortada gigante.
    expect(sanearDato("cuarenta")).toBe("");
    expect(sanearDato("muchos pedidos")).toBe("");
    expect(sanearDato("")).toBe("");
    expect(sanearDato("40 pedidos perdidos al mes")).toBe("");
  });
});

describe("sanearHashtags", () => {
  it("normaliza, deduplica y acota a 5", () => {
    expect(sanearHashtags("WebMakerLatam #pymes")).toBe("#WebMakerLatam #pymes");
    expect(sanearHashtags("#a #WebMakerLatam #webmakerlatam")).toBe("#WebMakerLatam");
    expect(sanearHashtags("#a1 #b2 #c3 #d4 #e5 #f6 #g7").split(" ")).toHaveLength(5);
  });

  it("aguanta basura sin romper", () => {
    expect(sanearHashtags("")).toBe("");
    expect(sanearHashtags("### , ,, #")).toBe("");
  });
});

describe("parseGuion", () => {
  it("alinea el guion con el arco y respeta los layouts", () => {
    const g = parseGuion(guionJson(), arco3, formato.id)!;
    expect(g).not.toBeNull();
    expect(g.frames).toHaveLength(3);
    expect(g.protagonista).toBe("Ana");
    expect(g.formatoId).toBe(formato.id);
    g.frames.forEach((f, i) => {
      expect(f.numero).toBe(i + 1);
      expect(f.paso).toBe(arco3[i]!.paso);
      expect(f.layoutId).toBe(arco3[i]!.layoutId);
    });
  });

  it("CTA y hashtags SOLO en el frame de cierre", () => {
    const g = parseGuion(guionJson(), arco3, formato.id)!;
    expect(g.frames[0]!.cta).toBe("");
    expect(g.frames[0]!.hashtags).toBe("");
    expect(g.frames[1]!.cta).toBe("");
    expect(g.frames[2]!.cta).toBe("Cuéntanos tu caso");
    expect(g.frames[2]!.hashtags).toContain("#WebMakerLatam");
  });

  it("el dato solo sobrevive en los frames cuyo layout lo dibuja", () => {
    const g = parseGuion(guionJson(), arco3, formato.id)!;
    const conDato = g.frames.filter(f => f.dato !== "");
    expect(conDato.length).toBeGreaterThanOrEqual(1);
    for (const f of g.frames) {
      const llevaDato = arco3.find(p => p.paso === f.paso)!.layoutId === "dato_gigante";
      if (!llevaDato) expect(f.dato).toBe("");
    }
  });

  it("limpia frases prohibidas que el modelo haya colado", () => {
    const g = parseGuion(
      guionJson([{ copy_principal: "Ana perdía pedidos. Sigue viendo" }]),
      arco3,
      formato.id,
    )!;
    expect(g.frames[0]!.copy_principal.toLowerCase()).not.toContain("sigue viendo");
    expect(g.frames[0]!.copy_principal).toContain("Ana");
  });

  it("recorta a los límites de longitud", () => {
    const largo = "x".repeat(300);
    const g = parseGuion(
      guionJson([{ copy_principal: largo, sub_copy: largo }]),
      arco3,
      formato.id,
    )!;
    expect(g.frames[0]!.copy_principal.length).toBeLessThanOrEqual(LIMITES_GUION.titularLargo);
    expect(g.frames[0]!.sub_copy.length).toBeLessThanOrEqual(LIMITES_GUION.subCopy);
  });

  it("recorta el copy largo por palabra, no a media letra", () => {
    const frase = "El horno seguía prendido y el teléfono en silencio toda la tarde entera";
    const g = parseGuion(
      guionJson([{ copy_principal: frase, sub_copy: frase }]),
      arco3,
      formato.id,
    )!;
    const palabras = frase.split(" ");
    for (const campo of [g.frames[0]!.copy_principal, g.frames[0]!.sub_copy]) {
      expect(campo.length).toBeGreaterThan(10);
      for (const p of campo.split(" ")) expect(palabras, `"${p}" quedó partida`).toContain(p);
    }
  });

  it("acepta JSON envuelto en markdown", () => {
    const g = parseGuion("```json\n" + guionJson() + "\n```", arco3, formato.id);
    expect(g).not.toBeNull();
    expect(g!.frames).toHaveLength(3);
  });

  it("rellena si el modelo devuelve menos frames de los pedidos", () => {
    const corto = JSON.stringify({
      hilo: "h",
      protagonista: "",
      frames: [{ copy_principal: "Uno", sub_copy: "s", prompt_visual: "v" }],
    });
    const g = parseGuion(corto, arco3, formato.id)!;
    expect(g.frames).toHaveLength(3);
  });

  it("devuelve null con basura o sin titulares", () => {
    expect(parseGuion("no soy json", arco3, formato.id)).toBeNull();
    expect(parseGuion(JSON.stringify({ frames: [] }), arco3, formato.id)).toBeNull();
    const sinTitulares = JSON.stringify({ frames: [{ copy_principal: "" }, { copy_principal: "" }, { copy_principal: "" }] });
    expect(parseGuion(sinTitulares, arco3, formato.id)).toBeNull();
  });
});

describe("revisarGuion", () => {
  it("un guion completo no tiene observaciones", () => {
    const g = parseGuion(guionJson(), arco3, formato.id)!;
    expect(revisarGuion(g, arco3)).toHaveLength(0);
  });

  it("detecta titulares repetidos", () => {
    const g = parseGuion(
      guionJson([{ copy_principal: "Mismo" }, { copy_principal: "Mismo" }]),
      arco3,
      formato.id,
    )!;
    expect(revisarGuion(g, arco3).some(i => i.includes("repite"))).toBe(true);
  });

  it("detecta cifra faltante en el frame que la necesita", () => {
    const g = parseGuion(guionJson([{}, { dato: "" }]), arco3, formato.id)!;
    const issues = revisarGuion(g, arco3);
    expect(issues.some(i => i.includes("cifra"))).toBe(true);
  });

  it("detecta cierre sin invitación", () => {
    const g = parseGuion(guionJson([{}, {}, { cta: "" }]), arco3, formato.id)!;
    expect(revisarGuion(g, arco3).some(i => i.includes("cierre"))).toBe(true);
  });
});

describe("reglas de naturalidad y honestidad en el prompt", () => {
  it("prohíbe el folleto de agencia y las aperturas de manual", () => {
    const p = buildGuionSystemPrompt(OPTS);
    expect(p).toContain("lleva tu negocio al siguiente nivel");
    expect(p).toContain("¿Sabías que...?");
    expect(p).toContain("vender con miedo");
  });

  it("incluye la regla de honestidad: nada de falsos testimonios", () => {
    const p = buildGuionSystemPrompt(OPTS);
    expect(p).toContain("ESCENARIO ILUSTRATIVO");
    expect(p).toContain("caso de éxito");
    expect(p).toContain("PROHIBIDO nombrar negocios, marcas o personas reales");
  });

  it("veta WhatsApp como cierre por defecto", () => {
    const p = buildGuionSystemPrompt(OPTS);
    expect(p).toContain("VETADOS como texto de cierre");
    expect(p).toContain("Hablemos por WhatsApp");
  });

  it("cierra con la prueba final de coherencia", () => {
    const p = buildGuionSystemPrompt(OPTS);
    expect(p).toContain("PRUEBA FINAL");
    expect(p).toContain("intercambiar dos frames");
  });

  it("inyecta el modo de cierre elegido", () => {
    const modo = MODOS_CIERRE.find(m => m.id === "auto_revision")!;
    const p = buildGuionSystemPrompt({ ...OPTS, modoCierre: modo });
    expect(p).toContain("auto revisión");
  });
});

describe("resolverModoCierre", () => {
  it("todos los modos tienen peso positivo e instrucción", () => {
    for (const m of MODOS_CIERRE) {
      expect(m.peso).toBeGreaterThan(0);
      expect(m.instruccion.length).toBeGreaterThan(40);
    }
  });

  it("rota sin repetir dentro de la ventana de memoria", () => {
    const seq: string[] = [];
    for (let i = 0; i < 20; i++) seq.push(resolverModoCierre("tip_tech").id);
    for (let i = 1; i < seq.length; i++) {
      const ventana = seq.slice(Math.max(0, i - 3), i);
      expect(ventana).not.toContain(seq[i]);
    }
  });

  it("existe el modo sin invitación (la cuota de silencio)", () => {
    expect(MODOS_CIERRE.some(m => m.id === "sin_invitacion")).toBe(true);
  });

  it("motivacional y comunidad rematan sin pedir nada con frecuencia", () => {
    let silencios = 0;
    for (let i = 0; i < 40; i++) {
      if (resolverModoCierre("motivacional").id === "sin_invitacion") silencios++;
    }
    expect(silencios).toBeGreaterThan(5);
  });
});
