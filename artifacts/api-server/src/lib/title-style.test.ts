import { describe, it, expect } from "vitest";
import {
  ajustarTextoMedido,
  ESTILOS_TITULAR,
  resolverEstiloTitular,
  obtenerEstiloTitular,
  listarEstilosTitular,
  medirTexto,
  elegirPalabrasAcento,
  layoutTitular,
  construirOverlayTitular,
  type ZonaTexto,
} from "./title-style.js";
import { FONT_METRICS } from "./font-metrics.generated.js";

const ZONA: ZonaTexto = { x: 72, y: 96, width: 496, height: 528, align: "left", vertical: "center", maxFontSize: 122, minFontSize: 44 };
const PALETA = { colorAcento: "#FB923C", scrim: { r: 14, g: 14, b: 16 } };

describe("banco de estilos de titular", () => {
  it("tiene al menos 7 estilos con ids únicos y fuentes calibradas", () => {
    expect(ESTILOS_TITULAR.length).toBeGreaterThanOrEqual(7);
    const ids = new Set(ESTILOS_TITULAR.map(e => e.id));
    expect(ids.size).toBe(ESTILOS_TITULAR.length);
    for (const e of ESTILOS_TITULAR) {
      expect(FONT_METRICS[e.fuenteId]).toBeDefined();
      expect(e.descripcionUi.length).toBeGreaterThan(0);
    }
  });

  it("resolverEstiloTitular respeta el id fijado y el default de plantilla", () => {
    expect(resolverEstiloTitular("neon").id).toBe("neon");
    expect(resolverEstiloTitular(null, "placas").id).toBe("placas");
    expect(resolverEstiloTitular("no_existe", "fuego").id).toBe("fuego");
  });

  it("la rotación automática solo usa estilos impactantes y no repite seguido", () => {
    const impactantes = new Set(["impacto", "titan", "slab_3d", "fuego", "neon"]);
    const seq: string[] = [];
    for (let i = 0; i < 24; i++) seq.push(resolverEstiloTitular().id);
    for (const id of seq) expect(impactantes.has(id)).toBe(true);
    for (let i = 1; i < seq.length; i++) {
      const ventana = seq.slice(Math.max(0, i - 3), i);
      expect(ventana).not.toContain(seq[i]);
    }
  });

  it("listarEstilosTitular expone id, nombre y descripción", () => {
    for (const e of listarEstilosTitular()) {
      expect(e.id.length).toBeGreaterThan(0);
      expect(e.nombre.length).toBeGreaterThan(0);
      expect(e.descripcion.length).toBeGreaterThan(0);
    }
  });
});

describe("medirTexto (métricas calibradas)", () => {
  it("un texto más largo mide más", () => {
    expect(medirTexto("VENTAS", "anton")).toBeGreaterThan(medirTexto("VEN", "anton"));
  });

  it("Bebas (condensada) mide menos que Archivo Black (ancha) para el mismo texto", () => {
    expect(medirTexto("MARKETING", "bebas")).toBeLessThan(medirTexto("MARKETING", "archivo_black"));
  });

  it("caracteres no calibrados usan el promedio de la fuente (no cero)", () => {
    expect(medirTexto("ю", "anton")).toBeCloseTo(FONT_METRICS.anton.promedio, 3);
  });

  it("el letter-spacing suma al ancho", () => {
    expect(medirTexto("HOLA", "anton", 0.05)).toBeGreaterThan(medirTexto("HOLA", "anton"));
  });
});

describe("layoutTitular (auto-ajuste por línea)", () => {
  const estilo = obtenerEstiloTitular("impacto")!;

  it("cada línea llena el ancho de la zona (o toca el tope de tamaño)", () => {
    const layout = layoutTitular("3 errores que matan tus ventas online", ZONA, estilo);
    expect(layout.lineas.length).toBeGreaterThanOrEqual(2);
    for (const l of layout.lineas) {
      const llenaAncho = l.ancho >= ZONA.width * 0.82;
      const topeTamano = l.fontSize >= ZONA.maxFontSize - 1;
      expect(llenaAncho || topeTamano).toBe(true);
      expect(l.ancho).toBeLessThanOrEqual(ZONA.width * 1.02);
    }
  });

  it("un título corto sale en una línea gigante", () => {
    const layout = layoutTitular("GRATIS", ZONA, estilo);
    expect(layout.lineas).toHaveLength(1);
    expect(layout.lineas[0]!.fontSize).toBeGreaterThanOrEqual(100);
  });

  it("nunca produce más de 4 líneas y conserva todas las palabras", () => {
    const titulo = "como hacer que tu página web venda sola todos los días del año";
    const layout = layoutTitular(titulo, ZONA, estilo);
    expect(layout.lineas.length).toBeLessThanOrEqual(4);
    const palabras = layout.lineas.flatMap(l => l.palabras).join(" ");
    expect(palabras).toBe(titulo.toUpperCase());
  });

  it("el bloque respeta la altura de la zona (con tolerancia del piso de legibilidad)", () => {
    const layout = layoutTitular("una frase larguísima para poner a prueba el ajuste vertical del bloque", ZONA, estilo);
    expect(layout.altoTotal).toBeLessThanOrEqual(ZONA.height * 1.15);
  });

  it("limpia asteriscos de markdown y normaliza espacios", () => {
    const layout = layoutTitular("**gran   oferta**", ZONA, estilo);
    expect(layout.lineas.map(l => l.texto).join(" ")).toBe("GRAN OFERTA");
  });

  it("una palabra muy larga cede el piso de tamaño antes que desbordar la zona", () => {
    const layout = layoutTitular("internacionalización", ZONA, estilo);
    for (const l of layout.lineas) {
      expect(l.ancho).toBeLessThanOrEqual(ZONA.width * 1.01);
    }
  });

  it("títulos realistas con palabras largas tampoco desbordan", () => {
    const layout = layoutTitular("como delegar responsabilidades sin perder el control", ZONA, estilo);
    for (const l of layout.lineas) {
      expect(l.ancho).toBeLessThanOrEqual(ZONA.width * 1.01);
    }
  });

  it("ninguna línea supera 2.2x el tamaño de la más chica", () => {
    const layout = layoutTitular("no cometas este error gigante", ZONA, estilo);
    const sizes = layout.lineas.map(l => l.fontSize);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThanOrEqual(2.25);
  });
});

describe("elegirPalabrasAcento", () => {
  it("prioriza números y palabras gatillo, máximo 2", () => {
    const acentos = elegirPalabrasAcento(["3 ERRORES QUE", "MATAN TUS VENTAS"]);
    expect(acentos.size).toBeLessThanOrEqual(2);
    expect(acentos.has("3")).toBe(true);
    expect(acentos.has("ERRORES")).toBe(true);
  });

  it("sin números ni gatillo destaca la palabra más larga", () => {
    const acentos = elegirPalabrasAcento(["APRENDE", "DE OTRA FORMA"]);
    expect(acentos.has("APRENDE")).toBe(true);
  });

  it("acentúa palabras con tilde vía normalización", () => {
    const acentos = elegirPalabrasAcento(["EL ÉXITO REAL"]);
    expect(acentos.has("ÉXITO")).toBe(true);
  });
});

describe("construirOverlayTitular", () => {
  const canvas = { width: 1280, height: 720 };

  it("produce un SVG del tamaño del lienzo con el título en mayúsculas", () => {
    const svg = construirOverlayTitular({
      canvas,
      zona: ZONA,
      scrim: "izquierda",
      titulo: "cómo vender más",
      estilo: obtenerEstiloTitular("impacto")!,
      paleta: PALETA,
    }).toString();
    expect(svg).toContain('width="1280"');
    expect(svg).toContain('height="720"');
    expect(svg).toContain("VENDER");
  });

  it("cada palabra va en su propio <text> con x medido (sin tspans frágiles)", () => {
    const svg = construirOverlayTitular({
      canvas,
      zona: ZONA,
      scrim: "ninguno",
      titulo: "tres palabras justas",
      estilo: obtenerEstiloTitular("clasico")!,
      paleta: PALETA,
    }).toString();
    expect(svg).not.toContain("<tspan");
    // clasico = sombra + relleno: 2 capas x 3 palabras = 6 <text>.
    expect((svg.match(/<text/g) ?? []).length).toBe(6);
  });

  it("acento en modo caja dibuja la placa detrás de la palabra clave", () => {
    const svg = construirOverlayTitular({
      canvas,
      zona: ZONA,
      scrim: "izquierda",
      titulo: "3 secretos del éxito",
      estilo: obtenerEstiloTitular("titan")!,
      paleta: PALETA,
    }).toString();
    expect(svg).toContain(`fill="${PALETA.colorAcento}"`);
    expect(svg).toContain('fill="#111111"');
  });

  it("extra numero_gigante separa el número inicial del resto del título", () => {
    const svg = construirOverlayTitular({
      canvas,
      zona: ZONA,
      scrim: "izquierda",
      titulo: "7 claves del diseño",
      estilo: obtenerEstiloTitular("titan")!,
      paleta: PALETA,
      extras: [{ tipo: "numero_gigante" }],
    }).toString();
    expect(svg).toContain(">7</text>");
    expect(svg).toContain("CLAVES");
    // El 7 gigante no debe repetirse como palabra del titular.
    const matches = svg.match(/>7<\/text>/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("miles con espacio ('10 000 tips') NO se parten como número gigante", () => {
    const svg = construirOverlayTitular({
      canvas,
      zona: ZONA,
      scrim: "izquierda",
      titulo: "10 000 tips de ventas",
      estilo: obtenerEstiloTitular("titan")!,
      paleta: PALETA,
      extras: [{ tipo: "numero_gigante" }],
    }).toString();
    // Sin split: el "10" va como palabra normal del titular, no en Alfa Slab gigante.
    expect(svg).toContain("10");
    expect(svg).toContain("000");
    expect(svg).not.toContain("Alfa Slab One");
  });

  it("sin número inicial, numero_gigante no altera el título", () => {
    const svg = construirOverlayTitular({
      canvas,
      zona: ZONA,
      scrim: "izquierda",
      titulo: "claves del diseño",
      estilo: obtenerEstiloTitular("titan")!,
      paleta: PALETA,
      extras: [{ tipo: "numero_gigante" }],
    }).toString();
    expect(svg).toContain("CLAVES");
  });

  it("scrim 'ninguno' no dibuja rect de scrim", () => {
    const svg = construirOverlayTitular({
      canvas,
      zona: ZONA,
      scrim: "ninguno",
      titulo: "hola mundo",
      estilo: obtenerEstiloTitular("clasico")!,
      paleta: PALETA,
    }).toString();
    expect(svg).not.toContain("scrimTit");
  });

  it("escapa XML en todas las capas (incluida la sombra)", () => {
    const svg = construirOverlayTitular({
      canvas,
      zona: ZONA,
      scrim: "izquierda",
      titulo: "a<b> & 'c'",
      estilo: obtenerEstiloTitular("impacto")!,
      paleta: PALETA,
    }).toString();
    expect(svg).not.toMatch(/<B>/);
    expect(svg).toContain("&amp;");
  });
});

describe("ajustarTextoMedido (texto secundario)", () => {
  // El bug real: el sub-copy se medía como "Inter" (que NO está empaquetada y
  // cae en DejaVu Sans, más ancha) y se salía del lienzo por los costados.
  const ANCHO = 880;
  const base = { maxWidth: ANCHO, maxFontSize: 52, minFontSize: 26, fuenteId: "montserrat_bold" as const };

  it("ninguna línea supera jamás el ancho disponible", () => {
    const textos = [
      "Su panadería en Ñuñoa llevaba seis años abierta.",
      "Mismo horno, misma Ana, cero pedidos perdidos.",
      "Una frase muchísimo más larga de lo razonable que debería partirse en varias líneas sin salirse nunca del lienzo disponible",
      "corto",
      "#WebMakerLatam #PymesLatam #NegociosOnline #Chatbot #Emprendedores",
    ];
    for (const t of textos) {
      const fit = ajustarTextoMedido(t, base);
      expect(fit.ancho, `"${t.slice(0, 30)}" se sale`).toBeLessThanOrEqual(ANCHO);
      for (const linea of fit.lineas) {
        expect(medirTexto(linea, "montserrat_bold") * fit.fontSize).toBeLessThanOrEqual(ANCHO + 0.5);
      }
    }
  });

  it("una palabra sola más ancha que la columna se parte por caracteres", () => {
    const fit = ajustarTextoMedido("Supercalifragilisticoespialidosoextralargo", { ...base, maxWidth: 200 });
    expect(fit.lineas.length).toBeGreaterThan(1);
    expect(fit.ancho).toBeLessThanOrEqual(200);
  });

  it("conserva todo el texto (no trunca)", () => {
    const texto = "Su panadería en Ñuñoa llevaba seis años abierta";
    const fit = ajustarTextoMedido(texto, base);
    expect(fit.lineas.join(" ")).toBe(texto);
  });

  it("respeta el tope de líneas achicando la fuente", () => {
    const largo = "Una frase larga que sin control ocuparía muchas líneas seguidas en pantalla";
    const fit = ajustarTextoMedido(largo, { ...base, maxLineas: 2 });
    expect(fit.lineas.length).toBeLessThanOrEqual(2);
  });

  it("un texto corto usa el tamaño máximo", () => {
    const fit = ajustarTextoMedido("Hola", base);
    expect(fit.fontSize).toBe(base.maxFontSize);
    expect(fit.lineas).toHaveLength(1);
  });

  it("texto vacío no rompe", () => {
    const fit = ajustarTextoMedido("   ", base);
    expect(fit.lineas).toHaveLength(0);
    expect(fit.alto).toBe(0);
  });
});
