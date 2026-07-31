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
  svgDefs,
  PALETA_COMMUNITY,
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

/**
 * Margen alrededor del lienzo al rasterizar en los tests.
 *
 * Sin él, el rasterizador recorta lo que se sale y la caja de tinta cae siempre
 * dentro: el test pasaría con el titular medio fuera. Con margen, el desborde
 * se dibuja y se puede medir.
 */
const MARGEN_TEST = 400;

/** Mete la composición en un lienzo con margen, desplazada al centro. */
function conMargen(svg: string, lienzo: { width: number; height: number }): string {
  const interior = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const w = lienzo.width + MARGEN_TEST * 2;
  const h = lienzo.height + MARGEN_TEST * 2;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<g transform="translate(${MARGEN_TEST},${MARGEN_TEST})">${interior}</g></svg>`;
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

  /* ---------------- Lienzos de feed ----------------

     El fallo que esto cubre: los formatos interactivos del feed se componían
     enteros a 9:16 y DESPUÉS se recortaban al aspecto real, así que el recorte
     se llevaba el 30 % del alto en 4:5 y el 44 % en 1:1 — con el titular ya
     dibujado dentro. Los tests solo rasterizaban 1080x1920, que es justo el
     único caso donde no pasaba, y por eso "en Historias funciona y en el feed
     no" nunca lo detectó nada. */

  for (const [nombre, lienzo] of [
    ["4:5", { width: 1080, height: 1350 }],
    ["1:1", { width: 1080, height: 1080 }],
  ] as const) {
    it(`el titular cabe también en ${nombre}, rasterizado`, async () => {
      for (const layout of LAYOUTS_HISTORIA) {
        const comp = componerHistoria(
          frameDe("El horno seguía prendido y el teléfono en silencio"),
          layout,
          { estiloTitularId: "titan", lienzo },
        );
        // Se rasteriza sobre un lienzo MÁS GRANDE, con la composición desplazada
        // al centro. Rasterizar al tamaño exacto no sirve para esto: lo que se
        // salga queda recortado por el propio rasterizador y la caja de tinta
        // siempre sale dentro — el test pasaría aunque el titular se fuera medio
        // metro fuera. Con margen, lo que desborda se ve y se mide.
        const png = await sharp(Buffer.from(conMargen(sinScrims(comp.svg), lienzo)))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const { data, info } = png;
        const canales = info.channels;
        let y0 = info.height, y1 = -1, x0 = info.width, x1 = -1;
        for (let y = 0; y < info.height; y++) {
          for (let x = 0; x < info.width; x++) {
            if (data[(y * info.width + x) * canales + (canales - 1)]! > 12) {
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
            }
          }
        }
        if (y1 < 0) continue; // layout sin tinta visible: nada que comprobar
        // Se mide en coordenadas del diseño, descontando el margen del test.
        const top = y0 - MARGEN_TEST, bottom = y1 - MARGEN_TEST;
        const left = x0 - MARGEN_TEST, right = x1 - MARGEN_TEST;
        expect(top, `${layout.id} en ${nombre}: se sale por arriba`).toBeGreaterThanOrEqual(0);
        expect(bottom, `${layout.id} en ${nombre}: se sale por abajo`).toBeLessThanOrEqual(lienzo.height - 1);
        expect(left, `${layout.id} en ${nombre}: se sale por la izquierda`).toBeGreaterThanOrEqual(0);
        expect(right, `${layout.id} en ${nombre}: se sale por la derecha`).toBeLessThanOrEqual(lienzo.width - 1);
      }
    }, 60_000);
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
      paleta: PALETA_COMMUNITY,
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

describe("scrim de las zonas reservadas", () => {
  // El scrim se pintaba SIEMPRE con #0F172A (azul marino), el fondo de la
  // generación anterior. Como la ilustración ya viene con el set iluminado
  // nuevo, la pieza salía con el centro ámbar y las franjas de arriba y abajo
  // azules: dos estilos pegados en la misma imagen.
  const AZUL_VIEJO = "#0f172a";

  it("usa el color que se le pasa, no uno fijo", () => {
    const ambar = svgDefs({ r: 14, g: 14, b: 16 });
    const esmeralda = svgDefs({ r: 5, g: 18, b: 13 });
    expect(ambar).toContain("#0e0e10");
    expect(esmeralda).toContain("#05120d");
    expect(ambar).not.toBe(esmeralda);
  });

  it("no reintroduce el azul de la generación anterior", () => {
    // Los scrims reales de las 8 direcciones del estudio (cover-style). No se
    // importa el módulo porque arrastra el cliente de IA, que exige API key.
    const SCRIMS_DIRECCIONES = [
      { r: 14, g: 14, b: 16 }, { r: 10, g: 15, b: 30 }, { r: 5, g: 18, b: 13 },
      { r: 16, g: 10, b: 28 }, { r: 14, g: 9, b: 10 }, { r: 18, g: 14, b: 8 },
      { r: 16, g: 11, b: 7 }, { r: 12, g: 12, b: 16 },
    ];
    for (const scrim of [...SCRIMS_DIRECCIONES, PALETA_COMMUNITY.scrim]) {
      expect(svgDefs(scrim).toLowerCase()).not.toContain(AZUL_VIEJO);
    }
  });

  // Con opacidad 1 el degradado inferior tapaba el set por completo y se leía
  // como una franja de otro color pegada abajo, que es justo lo que rompe la
  // ilusión de una sola foto.
  it("el degradado inferior nunca tapa del todo el set", () => {
    const stops = [...svgDefs(PALETA_COMMUNITY.scrim).matchAll(/stop-opacity="([\d.]+)"/g)]
      .map((m) => Number(m[1]));
    expect(stops.length).toBeGreaterThan(0);
    expect(Math.max(...stops)).toBeLessThan(1);
  });

  // La comprobación que de verdad importa: rasterizar el scrim encima de un
  // set cálido y mirar los píxeles. Con el azul viejo la franja inferior salía
  // fría (azul dominante) sobre una ilustración ámbar — el "está combinando
  // dos estilos" que se ve a simple vista.
  it("rasterizado sobre un set cálido, la franja inferior no se enfría", async () => {
    const w = 300, h = 400;
    const fondo = await sharp({
      create: { width: w, height: h, channels: 3, background: { r: 120, g: 74, b: 32 } },
    }).png().toBuffer();
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${svgDefs(PALETA_COMMUNITY.scrim)}` +
        `<rect x="0" y="${h - 100}" width="${w}" height="100" fill="url(#botfade)"/></svg>`,
    );
    const { data, info } = await sharp(fondo)
      .composite([{ input: svg, top: 0, left: 0 }])
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Píxel del centro de la última fila: lo más tapado por el degradado.
    const i = ((h - 1) * info.width + Math.floor(w / 2)) * info.channels;
    const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
    expect(r, `la franja quedó fría (r=${r} b=${b}): volvió el azul`).toBeGreaterThanOrEqual(b);
  }, 20_000);

  it("la composición de un frame hereda la paleta que se le pasa", () => {
    const comp = componerHistoria(frameDe("Ana perdía 40 pedidos"), LAYOUTS_HISTORIA[0]!, {
      paleta: { colorAcento: "#34D399", scrim: { r: 5, g: 18, b: 13 } },
    });
    expect(comp.svg).toContain("#05120d");
    expect(comp.svg.toLowerCase()).not.toContain(AZUL_VIEJO);
  });
});
