// Test de regresión de la composición de historias.
//
// No comprueba estilo ni gusto: comprueba lo único que el usuario NO puede
// tolerar — que salga texto cortado. Recorre todos los layouts por todos los
// estilos tipográficos con textos deliberadamente hostiles, RASTERIZA de
// verdad con librsvg (el mismo motor que produce las historias en producción)
// y mide la tinta resultante.
import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { setupFonts } from "./fonts.js";
import {
  componerHistoria,
  apilarBloquesInferiores,
  stripEmojis,
} from "./story-render.js";
import { LAYOUTS_HISTORIA, HIST_WIDTH, HIST_HEIGHT } from "./story-formats.js";
import {
  ESTILOS_TITULAR,
  construirOverlayTitular,
  layoutTitular,
  normalizarParaFuente,
  obtenerEstiloTitular,
  type ZonaTexto,
} from "./title-style.js";
import { FONT_METRICS, type MetricasFuente } from "./font-metrics.generated.js";
import type { FrameGuion } from "./story-script.js";

beforeAll(() => {
  setupFonts();
});

/** Margen mínimo contra el borde del lienzo: por debajo de esto el texto se
 *  lee como "cortado" aunque técnicamente entre. */
const MARGEN_MINIMO = 6;

const TEXTOS_HOSTILES = [
  "Nadie contestaba",
  "Ana perdía 40 pedidos al mes por no responder a tiempo",
  "El horno seguía prendido y el teléfono en silencio",
  // Rayas largas, puntos suspensivos y comillas tipográficas: el modelo las
  // escribe todo el rato y antes no estaban calibradas.
  "Cerró la caja —como siempre— y contó lo que faltaba…",
  "«No me alcanza el día», decía Ana cada tarde",
  "Extraordinariamentedesproporcionadísimo",
  "72% de los mensajes quedaban sin respuesta",
  "A",
  "ÁÉÍÓÚÑ ÜÇ àèìòù",
  // Glifos fuera del juego calibrado: si no se descartan, se miden con el
  // promedio de la fuente y librsvg los pinta como cajitas vacías.
  "Ж el símbolo ▲ y el ¤ perdido",
];

function frameDe(texto: string, extra?: Partial<FrameGuion>): FrameGuion {
  return {
    numero: 1,
    paso: "prueba",
    layoutId: "clasico_superior",
    copy_principal: texto,
    sub_copy: "Mismo horno, misma Ana, cero pedidos perdidos por la noche",
    dato: "40",
    dato_label: "pedidos perdidos cada mes",
    cta: "Cuéntanos tu caso",
    hashtags: "#WebMakerLatam #PymesLatam #Chatbot",
    prompt_visual: "Webi mirando el mostrador",
    ...extra,
  };
}

/** Caja de la tinta de un SVG rasterizado sobre fondo transparente. */
async function cajaDeTinta(svg: Buffer): Promise<{ x0: number; y0: number; x1: number; y1: number } | null> {
  const { data, info } = await sharp(svg)
    .resize(HIST_WIDTH, HIST_HEIGHT, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const canales = info.channels;
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * canales + (canales - 1)]! > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Los scrims son degradados a sangre por diseño: no cuentan como texto. */
function sinScrims(svg: string): string {
  return svg.replace(/<rect[^>]*fill="url\(#(?:top|bot)fade\)"\s*\/>/g, "");
}

// Holgura admitida respecto de la ZONA del layout, no del lienzo: comprobar
// solo contra el borde del lienzo no sirve de nada (las zonas tienen 80px de
// margen lateral, así que un titular puede desbordar su columna e invadir al
// protagonista sin acercarse siquiera al borde).
//
// Horizontal ≈ 0 por diseño: `sangradoEstilo` ya descuenta contorno, sombra y
// placas.
const TOLERANCIA_H = 8;

/**
 * Vertical: no es un número mágico, sale de los tres únicos desbordes que el
 * motor admite a propósito, y se calcula para cada combinación:
 *  · el piso de legibilidad puede pasarse hasta un 8% del alto de la zona,
 *    repartido arriba y abajo por el anclaje centrado → alto · 0.04;
 *  · el bloque se inclina hasta 2 grados, lo que sube una esquina
 *    → (ancho/2) · sin(inclinación);
 *  · el contorno y la sombra dura pintan por debajo de la línea base
 *    → como mucho 0.15 del font-size, que está acotado por maxFontSize.
 */
function toleranciaVertical(zona: {
  ancho: number;
  alto: number;
  maxFontSize: number;
  inclinacion: number;
}): number {
  return (
    zona.alto * 0.04 +
    (zona.ancho / 2) * Math.abs(Math.sin((zona.inclinacion * Math.PI) / 180)) +
    zona.maxFontSize * 0.15
  );
}

describe("titular: la tinta nunca se sale de su zona ni del lienzo", () => {
  for (const layout of LAYOUTS_HISTORIA) {
    for (const estilo of ESTILOS_TITULAR) {
      it(`${layout.id} · ${estilo.id}`, async () => {
        for (const texto of TEXTOS_HOSTILES) {
          const comp = componerHistoria(frameDe(texto), layout, { estiloTitularId: estilo.id });
          expect(comp.overlayTitular, `sin overlay para "${texto}"`).not.toBeNull();
          const caja = await cajaDeTinta(comp.overlayTitular!);
          expect(caja, `titular sin tinta: "${texto}"`).not.toBeNull();
          const z = comp.titular!;
          const ctx = `${layout.id}/${estilo.id} "${texto}"`;

          // Dentro del lienzo.
          expect(caja!.x0, `${ctx}: se sale del lienzo por la izquierda`).toBeGreaterThanOrEqual(MARGEN_MINIMO);
          expect(caja!.y0, `${ctx}: se sale del lienzo por arriba`).toBeGreaterThanOrEqual(MARGEN_MINIMO);
          expect(caja!.x1, `${ctx}: se sale del lienzo por la derecha`).toBeLessThanOrEqual(HIST_WIDTH - 1 - MARGEN_MINIMO);
          expect(caja!.y1, `${ctx}: se sale del lienzo por abajo`).toBeLessThanOrEqual(HIST_HEIGHT - 1 - MARGEN_MINIMO);

          // Y dentro de su zona.
          const tolV = toleranciaVertical({
            ancho: z.derecha - z.izquierda,
            alto: z.bottom - z.top,
            maxFontSize: layout.zonaTitular.maxFontSize,
            inclinacion: estilo.inclinacion,
          });
          expect(z.izquierda - caja!.x0, `${ctx}: desborda la zona por la izquierda`).toBeLessThanOrEqual(TOLERANCIA_H);
          expect(caja!.x1 - z.derecha, `${ctx}: desborda la zona por la derecha`).toBeLessThanOrEqual(TOLERANCIA_H);
          expect(z.top - caja!.y0, `${ctx}: desborda la zona por arriba`).toBeLessThanOrEqual(tolV);
          expect(caja!.y1 - z.bottom, `${ctx}: desborda la zona por abajo`).toBeLessThanOrEqual(tolV);
        }
      }, 60_000);
    }
  }
});

describe("bloques secundarios: nunca se salen ni se pisan", () => {
  const SUBS = [
    "",
    "Una línea corta.",
    "Mismo horno, misma Ana, cero pedidos perdidos desde que el chat contesta solo",
  ];
  const CTAS = ["", "Cuéntanos", "Cuéntanos tu caso y lo vemos juntos"];
  const HASH = ["", "#WebMakerLatam", "#WebMakerLatam #PymesLatam #Chatbot #Ecommerce #Chile"];

  for (const layout of LAYOUTS_HISTORIA) {
    it(`${layout.id} apila sin solapes`, () => {
      for (const sub of SUBS) {
        for (const cta of CTAS) {
          for (const hashtags of HASH) {
            const comp = componerHistoria(
              frameDe("Ana perdía 40 pedidos al mes", { sub_copy: sub, cta, hashtags }),
              layout,
              { estiloTitularId: "impacto" },
            );
            const ctx = `${layout.id} sub=${sub.length} cta=${cta.length} hash=${hashtags.length}`;
            const cajas = comp.bloques
              .map(b => ({ id: b.id, top: b.centroY - b.alto / 2, bottom: b.centroY + b.alto / 2 }))
              .sort((a, b) => a.top - b.top);
            for (const c of cajas) {
              expect(c.top, `${ctx}: ${c.id} se sale por arriba`).toBeGreaterThanOrEqual(0);
              expect(c.bottom, `${ctx}: ${c.id} se sale por abajo`).toBeLessThanOrEqual(HIST_HEIGHT);
            }
            for (let i = 1; i < cajas.length; i++) {
              expect(cajas[i]!.top, `${ctx}: ${cajas[i]!.id} pisa a ${cajas[i - 1]!.id}`)
                .toBeGreaterThanOrEqual(cajas[i - 1]!.bottom);
            }
          }
        }
      }
    });
  }

  it("el frame de cierre entero cabe en el lienzo, rasterizado", async () => {
    const layout = LAYOUTS_HISTORIA.find(l => l.id === "cierre_invitacion")!;
    const comp = componerHistoria(
      frameDe("El horno seguía prendido y el teléfono en silencio", {
        sub_copy: "Mismo horno, misma Ana, cero pedidos perdidos desde que el chat contesta solo",
        cta: "Cuéntanos tu caso y lo vemos",
        hashtags: "#WebMakerLatam #PymesLatam #Chatbot #Ecommerce #Chile",
      }),
      layout,
      { estiloTitularId: "titan" },
    );
    const caja = await cajaDeTinta(Buffer.from(sinScrims(comp.svg)));
    expect(caja).not.toBeNull();
    expect(caja!.y1).toBeLessThanOrEqual(HIST_HEIGHT - 1 - MARGEN_MINIMO);
    expect(caja!.x0).toBeGreaterThanOrEqual(MARGEN_MINIMO);
    expect(caja!.x1).toBeLessThanOrEqual(HIST_WIDTH - 1 - MARGEN_MINIMO);
  }, 30_000);
});

describe("apilarBloquesInferiores", () => {
  it("respeta el centro pedido cuando no hay conflicto", () => {
    const r = apilarBloquesInferiores(
      [
        { id: "subcopy", alto: 100, centroPreferido: 1400 },
        { id: "cta", alto: 90, centroPreferido: 1600 },
        { id: "hashtags", alto: 60, centroPreferido: 1790 },
      ],
      { altoLienzo: 1920, topeSuperior: 900 },
    );
    expect(r.map(b => Math.round(b.centroY))).toEqual([1400, 1600, 1790]);
  });

  it("sube la pila cuando el de abajo no cabe", () => {
    const r = apilarBloquesInferiores(
      [
        { id: "cta", alto: 200, centroPreferido: 1700 },
        { id: "hashtags", alto: 300, centroPreferido: 1850 },
      ],
      { altoLienzo: 1920, topeSuperior: 500 },
    );
    const hash = r.find(b => b.id === "hashtags")!;
    const cta = r.find(b => b.id === "cta")!;
    expect(hash.centroY + hash.alto / 2).toBeLessThanOrEqual(1920);
    expect(cta.centroY + cta.alto / 2).toBeLessThanOrEqual(hash.centroY - hash.alto / 2);
  });

  it("ignora los bloques vacíos", () => {
    const r = apilarBloquesInferiores(
      [
        { id: "subcopy", alto: 0, centroPreferido: 1400 },
        { id: "cta", alto: 90, centroPreferido: 1600 },
      ],
      { altoLienzo: 1920, topeSuperior: 500 },
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("cta");
  });
});

describe("redes de seguridad del motor de titulares", () => {
  // Zona deliberadamente imposible: muy baja para su piso de fuente. Antes el
  // piso de legibilidad se aplicaba DESPUÉS del ajuste de altura y sin volver
  // a comprobarlo, así que el bloque crecía sin techo y se salía de la zona.
  const zonaImposible = (y: number): ZonaTexto => ({
    x: 80, y, width: 920, height: 120,
    align: "center", vertical: "center", maxFontSize: 110, minFontSize: 64,
  });
  const textoLargo = "La digitalización de los procesos internos transformó el negocio familiar";

  it("el piso de legibilidad no puede pasarse más de un 8% del alto de la zona", () => {
    for (const estilo of ESTILOS_TITULAR) {
      const zona = zonaImposible(400);
      const lay = layoutTitular(textoLargo, zona, estilo);
      const gap = estilo.efecto.tipo === "chips" ? 8 : 0;
      const alto = lay.altoTotal + gap * Math.max(0, lay.lineas.length - 1);
      expect(alto / zona.height, `${estilo.id} desbordó el techo de altura`).toBeLessThanOrEqual(1.081);
    }
  });

  it("ninguna línea supera el ancho de la zona", () => {
    for (const estilo of ESTILOS_TITULAR) {
      const zona = zonaImposible(400);
      for (const texto of [...TEXTOS_HOSTILES, textoLargo]) {
        for (const linea of layoutTitular(texto, zona, estilo).lineas) {
          expect(linea.ancho, `${estilo.id} "${texto}"`).toBeLessThanOrEqual(zona.width);
        }
      }
    }
  });

  it("un bloque anclado fuera del lienzo se vuelve a meter dentro", async () => {
    // Zona colocada a propósito casi en el borde inferior: sin el clamp final
    // el bloque se dibujaría medio fuera, que es texto literalmente cortado.
    const zona = zonaImposible(HIST_HEIGHT - 60);
    const overlay = construirOverlayTitular({
      canvas: { width: HIST_WIDTH, height: HIST_HEIGHT },
      zona,
      scrim: "ninguno",
      titulo: textoLargo,
      estilo: obtenerEstiloTitular("impacto")!,
      paleta: { colorAcento: "#FB923C", scrim: { r: 15, g: 23, b: 42 } },
    });
    const caja = await cajaDeTinta(overlay);
    expect(caja).not.toBeNull();
    // Si el bloque se dibujara medio fuera, el rasterizado lo recortaría y
    // quedaría tinta pegada a la última fila del lienzo: eso es el corte.
    expect(caja!.y1).toBeLessThanOrEqual(HIST_HEIGHT - 1 - MARGEN_MINIMO);
    expect(caja!.y0).toBeGreaterThanOrEqual(MARGEN_MINIMO);
  }, 30_000);
});

describe("normalizarParaFuente", () => {
  it("descarta lo que no se puede medir y deja intacto lo que sí", () => {
    expect(normalizarParaFuente("ANA PERDÍA 40 PEDIDOS", "anton")).toBe("ANA PERDÍA 40 PEDIDOS");
    expect(normalizarParaFuente("Ж▲¤", "anton")).toBe("");
    expect(normalizarParaFuente("Cerró —así— y contó…", "montserrat_bold")).toBe("Cerró —así— y contó…");
  });

  it("todo lo que sobrevive tiene métrica: medir y dibujar coinciden", () => {
    for (const estilo of ESTILOS_TITULAR) {
      const metricas: MetricasFuente = FONT_METRICS[estilo.fuenteId];
      const salida = normalizarParaFuente("Ж▲¤ Ana —40— pedidos… «hoy»", estilo.fuenteId);
      for (const ch of salida) {
        if (ch === " ") continue;
        expect(
          metricas.avances[ch],
          `${estilo.fuenteId} dejó pasar "${ch}" sin métrica`,
        ).toBeDefined();
      }
    }
  });
});

describe("stripEmojis", () => {
  it("quita emojis y caracteres de control que romperían el SVG", () => {
    expect(stripEmojis("Ana 🚀 perdía pedidos")).toBe("Ana perdía pedidos");
    expect(stripEmojis("  doble   espacio  ")).toBe("doble espacio");
  });
});
