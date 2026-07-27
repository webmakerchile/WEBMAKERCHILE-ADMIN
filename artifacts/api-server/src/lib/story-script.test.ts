import { describe, it, expect } from "vitest";
import {
  buildGuionSystemPrompt,
  buildGuionUserPrompt,
  parseGuion,
  revisarGuion,
  limpiarFrasesProhibidas,
  FRASES_PROHIBIDAS,
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
    expect(p).toContain("PROHIBIDO repetir siempre WhatsApp");
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
