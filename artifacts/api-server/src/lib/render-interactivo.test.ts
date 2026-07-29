// Test de regresión de los bloques interactivos.
//
// Rasteriza de verdad con librsvg — el mismo motor que produce las piezas en
// producción — y mide la tinta. Lo que comprueba no es estética: es que el
// texto quepa. Una opción que se sale de su píldora es un botón roto, y en una
// pieza cuya única gracia es poder responderla de un vistazo, eso la inutiliza.

import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import { setupFonts } from "./fonts.js";
import { bloqueInteractivoSvg, type Lienzo, type ZonaBloque } from "./render-interactivo.js";
import { svgDefs, PALETA_COMMUNITY } from "./story-render.js";
import {
  FORMATOS_INTERACTIVOS,
  obtenerFormatoInteractivo,
  parseContenidoInteractivo,
  type ContenidoInteractivo,
  type FormatoInteractivo,
} from "./formatos-interactivos.js";

beforeAll(() => { setupFonts(); });

const LIENZO: Lienzo = { width: 1080, height: 1920 };
const ZONA: ZonaBloque = { y: 1180, alto: 560 };

/** Textos deliberadamente hostiles: largos, con tildes y sin espacios. */
const HOSTILES = [
  "Sí",
  "No, todavía no",
  "Extraordinariamentedesproporcionadísimo",
  "¿Tu negocio ya tiene página web propia y funcionando hoy?",
  "Respondes mensajes de clientes después de las diez de la noche casi todos los días",
  "ÁÉÍÓÚÑ ÜÇ àèìòù",
];

/** Contenido de prueba para un formato, con el texto hostil en todos sus campos. */
function contenidoDe(f: FormatoInteractivo, texto: string): ContenidoInteractivo {
  const n = f.opciones ?? 3;
  const crudo = {
    titular: texto,
    pregunta: texto,
    opciones: Array.from({ length: n }, (_, i) => (i === 0 ? texto : `Opción ${i + 1}`)),
    correcta: 0,
    afirmacion: texto,
    veredicto: "FALSO",
    explicacion: texto,
    items: Array.from({ length: n }, (_, i) => (i === 0 ? texto : `Señal ${i + 1}`)),
    izquierda: texto,
    derecha: "La otra opción",
    invitacion: texto,
    dato: "73%",
    frase: `${texto} ___`,
    cta: "Responde",
  };
  const c = parseContenidoInteractivo(JSON.stringify(crudo), f);
  if (!c) throw new Error(`el contenido de prueba de "${f.id}" no pasó la validación`);
  return c;
}

/**
 * Lienzo de prueba MÁS GRANDE que el real, con el contenido desplazado.
 *
 * Rasterizar al tamaño exacto no sirve para detectar desbordes: el
 * rasterizador RECORTA lo que se sale, así que la caja de tinta siempre cae
 * dentro y el test pasa aunque el texto se salga. Con un margen alrededor, lo
 * que se desborda se dibuja y se puede medir.
 */
const MARGEN_TEST = 400;

function svgCompleto(cuerpo: string): Buffer {
  return Buffer.from(
    `<svg width="${LIENZO.width + MARGEN_TEST * 2}" height="${LIENZO.height + MARGEN_TEST * 2}" xmlns="http://www.w3.org/2000/svg">` +
      `${svgDefs(PALETA_COMMUNITY.scrim)}` +
      `<g transform="translate(${MARGEN_TEST} ${MARGEN_TEST})">${cuerpo}</g></svg>`,
  );
}

/** Caja de la tinta de un SVG rasterizado sobre fondo transparente. */
async function cajaDeTinta(svg: Buffer) {
  const { data, info } = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * ch + (ch - 1)]! > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

// Holgura: el sello de veredicto va rotado -4° a propósito, y un borde de 6px
// se pinta hacia fuera del rectángulo. Nada de eso es texto desbordado.
const TOLERANCIA = 26;

describe("los bloques interactivos caben en su zona", () => {
  for (const formato of FORMATOS_INTERACTIVOS) {
    it(`${formato.id} (${formato.bloque})`, async () => {
      for (const texto of HOSTILES) {
        const c = contenidoDe(formato, texto);
        const cuerpo = bloqueInteractivoSvg(formato.bloque, c, formato, LIENZO, ZONA, PALETA_COMMUNITY);
        expect(cuerpo, `${formato.id} no dibujó nada con "${texto.slice(0, 24)}"`).not.toBe("");

        const caja = await cajaDeTinta(svgCompleto(cuerpo));
        expect(caja, `${formato.id} salió vacío`).not.toBeNull();
        const ctx = `${formato.id} · "${texto.slice(0, 30)}"`;

        // Coordenadas del diseño: se descuenta el margen del lienzo de prueba.
        const x0 = caja!.x0 - MARGEN_TEST;
        const x1 = caja!.x1 - MARGEN_TEST;
        const y0 = caja!.y0 - MARGEN_TEST;
        const y1 = caja!.y1 - MARGEN_TEST;

        // Dentro del ancho del lienzo real.
        expect(x0, `${ctx}: se sale por la izquierda`).toBeGreaterThanOrEqual(-TOLERANCIA);
        expect(x1, `${ctx}: se sale por la derecha`).toBeLessThanOrEqual(LIENZO.width + TOLERANCIA);

        // Y dentro de su zona vertical: invadir hacia arriba se come al zorro.
        expect(ZONA.y - y0, `${ctx}: desborda la zona por arriba`).toBeLessThanOrEqual(TOLERANCIA);
        expect(y1 - (ZONA.y + ZONA.alto), `${ctx}: desborda la zona por abajo`).toBeLessThanOrEqual(TOLERANCIA);
      }
    }, 60_000);
  }
});

describe("degradación honesta", () => {
  const encuesta = obtenerFormatoInteractivo("encuesta")!;

  // Media tarjeta pintada es peor que ninguna: la ilustración con su titular
  // sigue siendo una pieza publicable, una tarjeta rota no.
  it("no dibuja nada si falta el contenido esencial", () => {
    const vacio = { ...contenidoDe(encuesta, "Sí"), opciones: [] };
    expect(bloqueInteractivoSvg("tarjeta_opciones", vacio, encuesta, LIENZO, ZONA, PALETA_COMMUNITY)).toBe("");
  });

  it("no dibuja nada si la zona es demasiado baja", () => {
    const c = contenidoDe(encuesta, "Sí");
    const apretada: ZonaBloque = { y: 1800, alto: 40 };
    expect(bloqueInteractivoSvg("tarjeta_opciones", c, encuesta, LIENZO, apretada, PALETA_COMMUNITY)).toBe("");
  });

  it("un tipo de bloque desconocido no rompe la generación", () => {
    const c = contenidoDe(encuesta, "Sí");
    expect(bloqueInteractivoSvg("inventado" as never, c, encuesta, LIENZO, ZONA, PALETA_COMMUNITY)).toBe("");
  });
});

describe("cada formato se dibuja distinto de todos los demás", () => {
  // La queja de origen: elegir un tipo de contenido u otro daba lo mismo.
  // Aquí se le da a los diez formatos EXACTAMENTE el mismo contenido —mismo
  // texto, mismo número de opciones y de ítems— para que cualquier diferencia
  // que aparezca venga del formato y no de lo que escribió la IA. Si dos
  // formatos producen el mismo dibujo, elegir entre ellos vuelve a dar igual.
  const comun = {
    titular: "Titular de prueba",
    pregunta: "¿Tu negocio ya tiene página web propia?",
    opciones: ["Sí, hace tiempo", "Todavía no", "Está en camino", "No lo sé"],
    correcta: 1,
    afirmacion: "Con Instagram me basta",
    veredicto: "FALSO",
    explicacion: "Explicación de prueba para el formato.",
    items: ["Señal uno", "Señal dos", "Señal tres", "Señal cuatro"],
    izquierda: "Página propia",
    derecha: "Solo Instagram",
    invitacion: "Pregúntame lo que quieras de webs",
    dato: "73%",
    frase: "Lo que más me cuesta de mi negocio es ___",
    cta: "Responde",
  };

  it("no hay dos formatos con el mismo dibujo", () => {
    const porSvg = new Map<string, string[]>();
    for (const f of FORMATOS_INTERACTIVOS) {
      const c = parseContenidoInteractivo(JSON.stringify(comun), f);
      expect(c, `${f.id} no aceptó el contenido común`).not.toBeNull();
      const svg = bloqueInteractivoSvg(f.bloque, c!, f, LIENZO, ZONA, PALETA_COMMUNITY);
      expect(svg, `${f.id} no dibujó nada`).not.toBe("");
      porSvg.set(svg, [...(porSvg.get(svg) ?? []), f.id]);
    }
    const repetidos = [...porSvg.values()].filter((ids) => ids.length > 1);
    expect(
      repetidos,
      `estos formatos producen la misma pieza, así que elegir entre ellos da igual: ` +
        repetidos.map((ids) => ids.join(" = ")).join(" · "),
    ).toEqual([]);
  });
});

describe("el quiz marca la respuesta correcta y la encuesta no", () => {
  it("solo el quiz destaca una opción", () => {
    const quiz = obtenerFormatoInteractivo("quiz")!;
    const encuesta = obtenerFormatoInteractivo("encuesta")!;
    const acento = PALETA_COMMUNITY.colorAcento;

    const svgQuiz = bloqueInteractivoSvg("tarjeta_opciones", contenidoDe(quiz, "Sí"), quiz, LIENZO, ZONA, PALETA_COMMUNITY);
    const svgEnc = bloqueInteractivoSvg("tarjeta_opciones", contenidoDe(encuesta, "Sí"), encuesta, LIENZO, ZONA, PALETA_COMMUNITY);

    expect(svgQuiz).toContain(acento);
    // Destacar una opción en una encuesta sesgaría la respuesta.
    expect(svgEnc).not.toContain(acento);
  });
});
