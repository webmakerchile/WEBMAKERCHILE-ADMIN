// Dibujo de los elementos interactivos sobre la ilustración.
//
// El modelo de imagen NO escribe texto — se le prohíbe expresamente, porque
// cuando lo intenta salen letras deformes. Así que la tarjeta de la encuesta,
// las opciones del quiz, el sello de VERDADERO y la caja de preguntas se
// componen aquí con SVG y las fuentes empaquetadas, igual que los titulares.
//
// Todo se mide con `ajustarTextoMedido` antes de dibujarse: una opción que se
// sale de su píldora es un botón roto, y en una pieza cuya gracia es que se
// pueda responder de un vistazo eso la inutiliza entera.

import {
  ajustarTextoMedido,
  type TextoAjustado,
} from "./title-style.js";
import { escapeXml, FUENTE_SECUNDARIA, type PaletaComposicion } from "./story-render.js";
import type { BloqueInteractivo, ContenidoInteractivo, FormatoInteractivo } from "./formatos-interactivos.js";

/** Lienzo donde se compone el bloque. */
export interface Lienzo {
  width: number;
  height: number;
}

/** Zona vertical reservada para el bloque interactivo. */
export interface ZonaBloque {
  /** Borde superior de la zona. */
  y: number;
  /** Alto disponible. */
  alto: number;
}

const MARGEN_LATERAL = 0.085; // proporción del ancho
const RADIO = 26;

function fit(texto: string, maxWidth: number, maxFontSize: number, minFontSize: number, maxLineas = 2): TextoAjustado {
  return ajustarTextoMedido(texto, {
    maxWidth,
    maxLineas,
    maxFontSize,
    minFontSize,
    fuenteId: "montserrat_bold",
    lineHeight: 1.18,
  });
}

/** Líneas centradas dentro de una caja, devueltas como <text>. */
function lineasCentradas(
  f: TextoAjustado,
  centroX: number,
  centroY: number,
  color: string,
  opts?: { opacidad?: number; sombra?: boolean },
): string {
  if (f.lineas.length === 0) return "";
  const primera = centroY - f.alto / 2 + f.fontSize * 0.82;
  const filtro = opts?.sombra ? ' filter="url(#textds)"' : "";
  const op = opts?.opacidad !== undefined ? ` fill-opacity="${opts.opacidad}"` : "";
  return f.lineas
    .map((l, i) =>
      `<text x="${centroX.toFixed(1)}" y="${(primera + i * f.lineHeight).toFixed(1)}" text-anchor="middle" ` +
      `font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" ` +
      `font-size="${f.fontSize}" fill="${color}"${op}${filtro}>${escapeXml(l)}</text>`)
    .join("\n    ");
}

/** Líneas alineadas a la izquierda desde un x dado. */
function lineasIzquierda(f: TextoAjustado, x: number, centroY: number, color: string): string {
  if (f.lineas.length === 0) return "";
  const primera = centroY - f.alto / 2 + f.fontSize * 0.82;
  return f.lineas
    .map((l, i) =>
      `<text x="${x.toFixed(1)}" y="${(primera + i * f.lineHeight).toFixed(1)}" ` +
      `font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" ` +
      `font-size="${f.fontSize}" fill="${color}">${escapeXml(l)}</text>`)
    .join("\n    ");
}

/* ==================== Los siete bloques ================================= */

/**
 * Tarjeta blanca con opciones apiladas: encuesta y quiz.
 *
 * Es la forma que la gente ya reconoce de Instagram, y por eso funciona sin
 * explicación. En el quiz la correcta va marcada; en la encuesta no hay
 * correcta y ninguna se destaca — destacar una sesgaría la respuesta.
 */
function tarjetaOpciones(
  c: ContenidoInteractivo,
  formato: FormatoInteractivo,
  lienzo: Lienzo,
  zona: ZonaBloque,
  paleta: PaletaComposicion,
): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const n = Math.max(1, c.opciones.length);

  const preguntaFit = fit(c.pregunta, ancho - 60, Math.round(lienzo.width * 0.045), 22, 3);
  const altoPregunta = preguntaFit.alto + 34;

  // La altura de cada píldora sale del espacio real, no de un número fijo:
  // con tres opciones y poca zona, fijarla las sacaría de la tarjeta.
  const disponible = zona.alto - altoPregunta - 40;
  const gap = Math.round(lienzo.width * 0.018);
  const altoPildora = Math.max(56, Math.min(Math.round(lienzo.width * 0.085), (disponible - gap * (n - 1)) / n));

  const altoTarjeta = altoPregunta + n * altoPildora + gap * (n - 1) + 34;
  const y0 = zona.y + Math.max(0, (zona.alto - altoTarjeta) / 2);

  const piezas: string[] = [
    `<rect x="${margen}" y="${y0}" width="${ancho}" height="${altoTarjeta}" rx="${RADIO}" fill="#FFFFFF" fill-opacity="0.97"/>`,
    lineasCentradas(preguntaFit, lienzo.width / 2, y0 + 24 + preguntaFit.alto / 2, "#141318"),
  ];

  const xPildora = margen + 22;
  const anchoPildora = ancho - 44;
  let y = y0 + altoPregunta + 12;

  for (let i = 0; i < c.opciones.length; i++) {
    const esCorrecta = formato.campos.includes("correcta") && i === c.correcta;
    const fondo = esCorrecta ? paleta.colorAcento : "#EFF1F4";
    const texto = esCorrecta ? "#141318" : "#2B2F36";
    const f = fit(c.opciones[i]!, anchoPildora - 56, Math.round(altoPildora * 0.42), 18, 1);
    piezas.push(
      `<rect x="${xPildora}" y="${y.toFixed(1)}" width="${anchoPildora}" height="${altoPildora.toFixed(1)}" rx="${(altoPildora / 2).toFixed(1)}" fill="${fondo}"/>`,
      lineasIzquierda(f, xPildora + 28, y + altoPildora / 2, texto),
    );
    y += altoPildora + gap;
  }

  return piezas.join("\n    ");
}

/**
 * Dos mitades enfrentadas con un "VS" al medio.
 *
 * Si el formato trae rótulos fijos (MITO / REALIDAD) van encima de cada lado:
 * sin ellos se ven dos frases enfrentadas y no hay forma de saber cuál es la
 * que hay que creer, que es justo lo que la pieza tenía que dejar claro.
 */
function duelo(
  c: ContenidoInteractivo,
  formato: FormatoInteractivo,
  lienzo: Lienzo,
  zona: ZonaBloque,
  paleta: PaletaComposicion,
): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const gap = Math.round(lienzo.width * 0.035);
  const anchoLado = (ancho - gap) / 2;
  const etiquetas = formato.etiquetas ?? null;
  const altoEtiqueta = etiquetas ? Math.round(lienzo.width * 0.048) : 0;
  const alto = Math.min(zona.alto - altoEtiqueta, Math.round(lienzo.width * 0.34));
  const y0 = zona.y + altoEtiqueta + Math.max(0, (zona.alto - altoEtiqueta - alto) / 2);

  const lado = (x: number, texto: string, fondo: string, color: string, etiqueta: string | null) => {
    const f = fit(texto, anchoLado - 36, Math.round(lienzo.width * 0.05), 20, 3);
    const caja =
      `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${anchoLado.toFixed(1)}" height="${alto}" rx="${RADIO}" fill="${fondo}"/>` +
      lineasCentradas(f, x + anchoLado / 2, y0 + alto / 2, color);
    if (!etiqueta) return caja;

    const tamano = Math.round(altoEtiqueta * 0.62);
    const rotulo = fit(etiqueta, anchoLado - 24, tamano, 14, 1);
    return (
      `<text x="${(x + anchoLado / 2).toFixed(1)}" y="${(y0 - altoEtiqueta * 0.34).toFixed(1)}" text-anchor="middle" ` +
      `font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" ` +
      `font-size="${rotulo.fontSize}" letter-spacing="${(rotulo.fontSize * 0.14).toFixed(1)}" ` +
      `fill="${fondo}" filter="url(#textds)">${escapeXml(rotulo.lineas[0] ?? etiqueta)}</text>` +
      caja
    );
  };

  const radioVs = Math.round(lienzo.width * 0.055);
  const cx = lienzo.width / 2;
  const cy = y0 + alto / 2;

  return [
    lado(margen, c.izquierda, "#FFFFFF", "#141318", etiquetas?.[0] ?? null),
    lado(margen + anchoLado + gap, c.derecha, paleta.colorAcento, "#141318", etiquetas?.[1] ?? null),
    `<circle cx="${cx}" cy="${cy.toFixed(1)}" r="${radioVs}" fill="#141318"/>`,
    `<text x="${cx}" y="${(cy + radioVs * 0.34).toFixed(1)}" text-anchor="middle" font-family="'${FUENTE_SECUNDARIA.familia}'" ` +
      `font-weight="${FUENTE_SECUNDARIA.peso}" font-size="${Math.round(radioVs * 0.9)}" fill="#FFFFFF">VS</text>`,
  ].join("\n    ");
}

/** Afirmación + sello VERDADERO/FALSO inclinado, como un timbre. */
function veredicto(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const esVerdadero = c.veredicto === "VERDADERO";
  const color = esVerdadero ? "#22C55E" : "#EF4444";

  // El sello es el remate de la pieza, no una nota al pie: con el tamaño de
  // antes quedaba perdido en su zona y la afirmación de arriba se lo comía.
  const f = fit(c.veredicto, ancho * 0.86, Math.round(lienzo.width * 0.14), 30, 1);
  const altoSello = f.alto + 52;
  const anchoSello = Math.min(ancho, f.ancho + 96);
  const x0 = (lienzo.width - anchoSello) / 2;
  const y0 = zona.y + Math.max(0, (zona.alto - altoSello) / 2);
  const cx = lienzo.width / 2;
  const cy = y0 + altoSello / 2;

  return [
    `<g transform="rotate(-4 ${cx.toFixed(1)} ${cy.toFixed(1)})">`,
    `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${anchoSello.toFixed(1)}" height="${altoSello.toFixed(1)}" rx="14" fill="none" stroke="${color}" stroke-width="6"/>`,
    `<rect x="${(x0 + 8).toFixed(1)}" y="${(y0 + 8).toFixed(1)}" width="${(anchoSello - 16).toFixed(1)}" height="${(altoSello - 16).toFixed(1)}" rx="8" fill="${color}" fill-opacity="0.16"/>`,
    lineasCentradas(f, cx, cy, color),
    `</g>`,
  ].join("\n    ");
}

/**
 * Lista de filas: test rápido y reto.
 *
 * El test rápido lleva casillas —se marcan en cualquier orden—; el reto lleva
 * los pasos numerados, porque se hacen en secuencia y una casilla suelta no
 * dice por dónde se empieza.
 */
function checklist(
  c: ContenidoInteractivo,
  formato: FormatoInteractivo,
  lienzo: Lienzo,
  zona: ZonaBloque,
  paleta: PaletaComposicion,
): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const n = Math.max(1, c.items.length);
  const gap = Math.round(lienzo.width * 0.014);
  const altoFila = Math.max(52, Math.min(Math.round(lienzo.width * 0.075), (zona.alto - gap * (n - 1)) / n));
  const altoTotal = n * altoFila + gap * (n - 1);
  let y = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);

  const lado = Math.round(altoFila * 0.44);
  const numerado = formato.ordenado === true;
  const piezas: string[] = [];

  for (let i = 0; i < c.items.length; i++) {
    const f = fit(c.items[i]!, ancho - lado - 62, Math.round(altoFila * 0.34), 16, 2);
    const cyMarca = y + altoFila / 2;
    const marca = numerado
      ? `<circle cx="${(margen + 20 + lado / 2).toFixed(1)}" cy="${cyMarca.toFixed(1)}" r="${(lado / 2).toFixed(1)}" fill="${paleta.colorAcento}"/>` +
        `<text x="${(margen + 20 + lado / 2).toFixed(1)}" y="${(cyMarca + lado * 0.19).toFixed(1)}" text-anchor="middle" ` +
        `font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" ` +
        `font-size="${Math.round(lado * 0.62)}" fill="#141318">${i + 1}</text>`
      : `<rect x="${(margen + 20).toFixed(1)}" y="${(y + (altoFila - lado) / 2).toFixed(1)}" width="${lado}" height="${lado}" rx="7" fill="none" stroke="${paleta.colorAcento}" stroke-width="4"/>`;

    piezas.push(
      `<rect x="${margen}" y="${y.toFixed(1)}" width="${ancho}" height="${altoFila.toFixed(1)}" rx="16" fill="#FFFFFF" fill-opacity="0.95"/>`,
      marca,
      lineasIzquierda(f, margen + 20 + lado + 20, y + altoFila / 2, "#20242B"),
    );
    y += altoFila + gap;
  }
  return piezas.join("\n    ");
}

/** Caja de preguntas: la forma del sticker de Instagram. */
function cajaPregunta(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const fInv = fit(c.invitacion, ancho - 56, Math.round(lienzo.width * 0.045), 20, 3);
  const altoCampo = Math.round(lienzo.width * 0.09);
  const altoCaja = fInv.alto + altoCampo + 66;
  const y0 = zona.y + Math.max(0, (zona.alto - altoCaja) / 2);
  const yCampo = y0 + fInv.alto + 44;

  const fCta = fit("Escribe aquí…", ancho - 120, Math.round(altoCampo * 0.36), 16, 1);

  return [
    `<rect x="${margen}" y="${y0.toFixed(1)}" width="${ancho}" height="${altoCaja.toFixed(1)}" rx="${RADIO}" fill="#FFFFFF" fill-opacity="0.97"/>`,
    lineasCentradas(fInv, lienzo.width / 2, y0 + 24 + fInv.alto / 2, "#141318"),
    `<rect x="${(margen + 22).toFixed(1)}" y="${yCampo.toFixed(1)}" width="${(ancho - 44).toFixed(1)}" height="${altoCampo}" rx="${Math.round(altoCampo / 2)}" fill="none" stroke="${paleta.colorAcento}" stroke-width="4" stroke-dasharray="14 10"/>`,
    lineasCentradas(fCta, lienzo.width / 2, yCampo + altoCampo / 2, "#9AA1AC"),
  ].join("\n    ");
}

/** Frase con un hueco subrayado para completar. */
function hueco(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  // El "___" que escribe la IA se dibuja como una línea de verdad: en texto
  // se ve como un error de tipeo.
  const frase = c.frase.replace(/_{2,}/g, "").replace(/\s+/g, " ").trim();
  const f = fit(frase, ancho - 56, Math.round(lienzo.width * 0.055), 22, 3);
  const anchoLinea = ancho * 0.6;
  const altoTotal = f.alto + 74;
  const y0 = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);

  return [
    `<rect x="${margen}" y="${y0.toFixed(1)}" width="${ancho}" height="${altoTotal.toFixed(1)}" rx="${RADIO}" fill="#FFFFFF" fill-opacity="0.96"/>`,
    lineasCentradas(f, lienzo.width / 2, y0 + 22 + f.alto / 2, "#141318"),
    `<rect x="${((lienzo.width - anchoLinea) / 2).toFixed(1)}" y="${(y0 + altoTotal - 32).toFixed(1)}" width="${anchoLinea.toFixed(1)}" height="6" rx="3" fill="${paleta.colorAcento}"/>`,
  ].join("\n    ");
}

/** Barra con el dato al centro: adivina la cifra. */
function escala(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const fDato = fit(c.dato, ancho * 0.7, Math.round(lienzo.width * 0.16), 40, 1);
  const altoBarra = Math.round(lienzo.width * 0.028);
  const altoTotal = fDato.alto + altoBarra + 76;
  const y0 = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);
  const yBarra = y0 + fDato.alto + 44;

  return [
    `<rect x="${margen}" y="${y0.toFixed(1)}" width="${ancho}" height="${altoTotal.toFixed(1)}" rx="${RADIO}" fill="#FFFFFF" fill-opacity="0.96"/>`,
    lineasCentradas(fDato, lienzo.width / 2, y0 + 22 + fDato.alto / 2, paleta.colorAcento),
    `<rect x="${(margen + 30).toFixed(1)}" y="${yBarra.toFixed(1)}" width="${(ancho - 60).toFixed(1)}" height="${altoBarra}" rx="${altoBarra / 2}" fill="#E6E9ED"/>`,
    `<rect x="${(margen + 30).toFixed(1)}" y="${yBarra.toFixed(1)}" width="${((ancho - 60) * 0.68).toFixed(1)}" height="${altoBarra}" rx="${altoBarra / 2}" fill="${paleta.colorAcento}"/>`,
    `<circle cx="${(margen + 30 + (ancho - 60) * 0.68).toFixed(1)}" cy="${(yBarra + altoBarra / 2).toFixed(1)}" r="${(altoBarra * 1.35).toFixed(1)}" fill="#FFFFFF" stroke="${paleta.colorAcento}" stroke-width="5"/>`,
  ].join("\n    ");
}

/**
 * Dibuja el bloque que le corresponde al formato.
 *
 * Devuelve "" si el contenido no da: mejor la ilustración con su titular que
 * una tarjeta a medio pintar.
 */
export function bloqueInteractivoSvg(
  tipo: BloqueInteractivo,
  c: ContenidoInteractivo,
  formato: FormatoInteractivo,
  lienzo: Lienzo,
  zona: ZonaBloque,
  paleta: PaletaComposicion,
): string {
  if (zona.alto < 90) return "";
  try {
    switch (tipo) {
      case "tarjeta_opciones": return c.opciones.length >= 2 ? tarjetaOpciones(c, formato, lienzo, zona, paleta) : "";
      case "duelo": return c.izquierda && c.derecha ? duelo(c, formato, lienzo, zona, paleta) : "";
      case "veredicto": return c.veredicto ? veredicto(c, lienzo, zona) : "";
      case "checklist": return c.items.length >= 2 ? checklist(c, formato, lienzo, zona, paleta) : "";
      case "caja_pregunta": return c.invitacion ? cajaPregunta(c, lienzo, zona, paleta) : "";
      case "hueco": return c.frase ? hueco(c, lienzo, zona, paleta) : "";
      case "escala": return c.dato ? escala(c, lienzo, zona, paleta) : "";
      default: return "";
    }
  } catch (e) {
    console.warn(`[interactivo] no se pudo dibujar "${tipo}": ${(e as Error).message}`);
    return "";
  }
}
