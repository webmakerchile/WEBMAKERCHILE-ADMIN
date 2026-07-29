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

/* ==================== Los diez bloques nuevos =========================== */

/** Marco redondeado blanco, la base de casi todas las tarjetas. */
function carta(x: number, y: number, w: number, h: number, relleno = "#FFFFFF", opacidad = 0.96): string {
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${RADIO}" fill="${relleno}" fill-opacity="${opacidad}"/>`;
}

/**
 * Tres huecos numerados para ordenar.
 *
 * Los números van VACÍOS a propósito: si la pieza ya mostrara un orden, no
 * habría nada que ordenar y el formato dejaría de ser interactivo.
 */
function podio(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const n = Math.min(3, c.opciones.length);
  const gap = Math.round(lienzo.width * 0.022);
  const anchoCol = (ancho - gap * (n - 1)) / n;
  const alto = Math.min(zona.alto, Math.round(lienzo.width * 0.42));
  const y0 = zona.y + Math.max(0, (zona.alto - alto) / 2);
  const radio = Math.round(anchoCol * 0.17);

  const piezas: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = margen + i * (anchoCol + gap);
    const cx = x + anchoCol / 2;
    const cyCirculo = y0 + radio + 22;
    const f = fit(c.opciones[i]!, anchoCol - 26, Math.round(anchoCol * 0.15), 16, 3);
    piezas.push(
      carta(x, y0, anchoCol, alto),
      `<circle cx="${cx.toFixed(1)}" cy="${cyCirculo.toFixed(1)}" r="${radio}" fill="none" stroke="${paleta.colorAcento}" stroke-width="5" stroke-dasharray="10 8"/>`,
      lineasCentradas(f, cx, y0 + alto - (alto - radio * 2 - 44) / 2 - 8, "#20242B"),
    );
  }
  return piezas.join("\n    ");
}

/** Dos estados con una flecha en medio: no es un duelo, es una progresión. */
function antesDespues(
  c: ContenidoInteractivo,
  formato: FormatoInteractivo,
  lienzo: Lienzo,
  zona: ZonaBloque,
  paleta: PaletaComposicion,
): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const gap = Math.round(lienzo.width * 0.075);
  const anchoLado = (ancho - gap) / 2;
  const etiquetas = formato.etiquetas ?? (["ANTES", "DESPUÉS"] as const);
  const altoEtiqueta = Math.round(lienzo.width * 0.048);
  const alto = Math.min(zona.alto - altoEtiqueta, Math.round(lienzo.width * 0.32));
  const y0 = zona.y + altoEtiqueta + Math.max(0, (zona.alto - altoEtiqueta - alto) / 2);
  const cy = y0 + alto / 2;

  const lado = (x: number, texto: string, fondo: string, color: string, etiqueta: string) => {
    const f = fit(texto, anchoLado - 36, Math.round(lienzo.width * 0.045), 18, 3);
    const rotulo = fit(etiqueta, anchoLado - 20, Math.round(altoEtiqueta * 0.6), 14, 1);
    return (
      `<text x="${(x + anchoLado / 2).toFixed(1)}" y="${(y0 - altoEtiqueta * 0.34).toFixed(1)}" text-anchor="middle" ` +
      `font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" ` +
      `font-size="${rotulo.fontSize}" letter-spacing="${(rotulo.fontSize * 0.14).toFixed(1)}" ` +
      `fill="${fondo}" filter="url(#textds)">${escapeXml(rotulo.lineas[0] ?? etiqueta)}</text>` +
      carta(x, y0, anchoLado, alto, fondo, 0.97) +
      lineasCentradas(f, x + anchoLado / 2, cy, color)
    );
  };

  // El "antes" va apagado y el "después" con el color de marca: la dirección
  // del cambio se lee sin necesidad de entender los rótulos.
  const puntaX = lienzo.width / 2 + gap * 0.3;
  const baseX = lienzo.width / 2 - gap * 0.3;
  const semiAlto = Math.round(lienzo.width * 0.028);
  return [
    lado(margen, c.izquierda, "#C9CDD4", "#20242B", etiquetas[0]),
    lado(margen + anchoLado + gap, c.derecha, paleta.colorAcento, "#141318", etiquetas[1]),
    `<path d="M${baseX.toFixed(1)} ${(cy - semiAlto).toFixed(1)} L${puntaX.toFixed(1)} ${cy.toFixed(1)} L${baseX.toFixed(1)} ${(cy + semiAlto).toFixed(1)} Z" fill="#FFFFFF"/>`,
  ].join("\n    ");
}

/** Rejilla 2x2 de perfiles: la gente se etiqueta sola. */
function galeriaTipos(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const gap = Math.round(lienzo.width * 0.022);
  const anchoCelda = (ancho - gap) / 2;
  const filas = Math.ceil(Math.min(4, c.opciones.length) / 2);
  const altoCelda = Math.min((zona.alto - gap * (filas - 1)) / filas, Math.round(lienzo.width * 0.2));
  const altoTotal = filas * altoCelda + gap * (filas - 1);
  const y0 = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);

  const piezas: string[] = [];
  for (let i = 0; i < Math.min(4, c.opciones.length); i++) {
    const x = margen + (i % 2) * (anchoCelda + gap);
    const y = y0 + Math.floor(i / 2) * (altoCelda + gap);
    const f = fit(c.opciones[i]!, anchoCelda - 70, Math.round(anchoCelda * 0.11), 16, 2);
    const r = Math.round(altoCelda * 0.15);
    piezas.push(
      carta(x, y, anchoCelda, altoCelda),
      `<circle cx="${(x + 26 + r).toFixed(1)}" cy="${(y + altoCelda / 2).toFixed(1)}" r="${r}" fill="${paleta.colorAcento}"/>`,
      `<text x="${(x + 26 + r).toFixed(1)}" y="${(y + altoCelda / 2 + r * 0.36).toFixed(1)}" text-anchor="middle" ` +
        `font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" ` +
        `font-size="${Math.round(r * 1.05)}" fill="#141318">${i + 1}</text>`,
      lineasIzquierda(f, x + 26 + r * 2 + 18, y + altoCelda / 2, "#20242B"),
    );
  }
  return piezas.join("\n    ");
}

/** Cinco caras del 1 al 5, con los dos extremos rotulados. */
function escalaCaras(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const radio = Math.round(ancho / 5 / 2.55);
  const altoRotulo = Math.round(lienzo.width * 0.042);
  const altoTotal = radio * 2 + altoRotulo + 40;
  const y0 = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);
  const cy = y0 + radio + 12;
  const paso = ancho / 5;

  const piezas: string[] = [];
  for (let i = 0; i < 5; i++) {
    const cx = margen + paso * i + paso / 2;
    // La boca va de arco hacia abajo a arco hacia arriba: la escala se lee
    // sin números y sin saber el idioma.
    const curva = (i - 2) * radio * 0.26;
    const anchoBoca = radio * 0.52;
    piezas.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radio}" fill="#FFFFFF" fill-opacity="0.96"/>`,
      `<circle cx="${(cx - radio * 0.32).toFixed(1)}" cy="${(cy - radio * 0.22).toFixed(1)}" r="${(radio * 0.11).toFixed(1)}" fill="#20242B"/>`,
      `<circle cx="${(cx + radio * 0.32).toFixed(1)}" cy="${(cy - radio * 0.22).toFixed(1)}" r="${(radio * 0.11).toFixed(1)}" fill="#20242B"/>`,
      `<path d="M${(cx - anchoBoca).toFixed(1)} ${(cy + radio * 0.28 - curva * 0.5).toFixed(1)} Q${cx.toFixed(1)} ${(cy + radio * 0.28 + curva).toFixed(1)} ${(cx + anchoBoca).toFixed(1)} ${(cy + radio * 0.28 - curva * 0.5).toFixed(1)}" ` +
        `fill="none" stroke="#20242B" stroke-width="${(radio * 0.12).toFixed(1)}" stroke-linecap="round"/>`,
    );
  }

  const rotulo = (texto: string, cx: number, anclaje: string) => {
    const f = fit(texto, paso * 1.9, Math.round(altoRotulo * 0.66), 14, 1);
    return `<text x="${cx.toFixed(1)}" y="${(cy + radio + altoRotulo).toFixed(1)}" text-anchor="${anclaje}" ` +
      `font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" ` +
      `font-size="${f.fontSize}" fill="${paleta.colorAcento}" filter="url(#textds)">${escapeXml(f.lineas[0] ?? texto)}</text>`;
  };
  if (c.izquierda) piezas.push(rotulo(c.izquierda, margen + paso / 2, "middle"));
  if (c.derecha) piezas.push(rotulo(c.derecha, margen + ancho - paso / 2, "middle"));
  return piezas.join("\n    ");
}

/** Cuadrícula 3x3 para marcar. */
function bingo(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const gap = Math.round(lienzo.width * 0.014);
  const lado = (ancho - gap * 2) / 3;
  const filas = Math.ceil(Math.min(9, c.items.length) / 3);
  const altoCelda = Math.min(lado, (zona.alto - gap * (filas - 1)) / filas);
  const altoTotal = filas * altoCelda + gap * (filas - 1);
  const y0 = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);

  const piezas: string[] = [];
  for (let i = 0; i < Math.min(9, c.items.length); i++) {
    const x = margen + (i % 3) * (lado + gap);
    const y = y0 + Math.floor(i / 3) * (altoCelda + gap);
    const f = fit(c.items[i]!, lado - 20, Math.round(altoCelda * 0.17), 13, 3);
    piezas.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${lado.toFixed(1)}" height="${altoCelda.toFixed(1)}" rx="14" fill="#FFFFFF" fill-opacity="0.95" stroke="${paleta.colorAcento}" stroke-width="3"/>`,
      lineasCentradas(f, x + lado / 2, y + altoCelda / 2, "#20242B"),
    );
  }
  return piezas.join("\n    ");
}

/** Tres niveles con su color: rojo, ámbar, verde. */
function semaforo(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque): string {
  const COLORES = ["#EF4444", "#F59E0B", "#22C55E"];
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const n = Math.min(3, c.opciones.length);
  const gap = Math.round(lienzo.width * 0.018);
  const altoFila = Math.min(Math.round(lienzo.width * 0.11), (zona.alto - gap * (n - 1)) / n);
  const altoTotal = n * altoFila + gap * (n - 1);
  let y = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);

  const radio = Math.round(altoFila * 0.3);
  const piezas: string[] = [];
  for (let i = 0; i < n; i++) {
    const f = fit(c.opciones[i]!, ancho - radio * 2 - 90, Math.round(altoFila * 0.3), 16, 2);
    piezas.push(
      carta(margen, y, ancho, altoFila),
      `<circle cx="${(margen + 28 + radio).toFixed(1)}" cy="${(y + altoFila / 2).toFixed(1)}" r="${radio}" fill="${COLORES[i]}"/>`,
      lineasIzquierda(f, margen + 28 + radio * 2 + 24, y + altoFila / 2, "#20242B"),
    );
    y += altoFila + gap;
  }
  return piezas.join("\n    ");
}

/**
 * Tres afirmaciones y una es mentira.
 *
 * NINGUNA va marcada: señalar la mentira en la propia pieza sería contar el
 * final. La respuesta va en la explicación, que se publica después.
 */
function tresCartas(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const n = Math.min(3, c.opciones.length);
  const gap = Math.round(lienzo.width * 0.018);
  const altoFila = Math.min(Math.round(lienzo.width * 0.135), (zona.alto - gap * (n - 1)) / n);
  const altoTotal = n * altoFila + gap * (n - 1);
  let y = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);

  const radio = Math.round(altoFila * 0.24);
  const piezas: string[] = [];
  for (let i = 0; i < n; i++) {
    const f = fit(c.opciones[i]!, ancho - radio * 2 - 110, Math.round(altoFila * 0.24), 15, 3);
    const cxInterrogante = margen + ancho - 30 - radio;
    piezas.push(
      carta(margen, y, ancho, altoFila),
      lineasIzquierda(f, margen + 30, y + altoFila / 2, "#20242B"),
      `<circle cx="${cxInterrogante.toFixed(1)}" cy="${(y + altoFila / 2).toFixed(1)}" r="${radio}" fill="none" stroke="${paleta.colorAcento}" stroke-width="4"/>`,
      `<text x="${cxInterrogante.toFixed(1)}" y="${(y + altoFila / 2 + radio * 0.4).toFixed(1)}" text-anchor="middle" ` +
        `font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" ` +
        `font-size="${Math.round(radio * 1.15)}" fill="${paleta.colorAcento}">?</text>`,
    );
    y += altoFila + gap;
  }
  return piezas.join("\n    ");
}

/** Una palabra grande para que la definan. */
function tarjetaDefinicion(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const fTermino = fit(c.termino, ancho - 80, Math.round(lienzo.width * 0.15), 32, 2);
  const altoRotulo = Math.round(lienzo.width * 0.05);
  const altoTotal = fTermino.alto + altoRotulo + 90;
  const y0 = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);
  const cx = lienzo.width / 2;
  const anchoLinea = ancho * 0.55;

  const fRotulo = fit("¿SABES QUÉ ES?", ancho - 120, Math.round(altoRotulo * 0.62), 14, 1);
  return [
    carta(margen, y0, ancho, altoTotal),
    `<text x="${cx}" y="${(y0 + altoRotulo).toFixed(1)}" text-anchor="middle" ` +
      `font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" ` +
      `font-size="${fRotulo.fontSize}" letter-spacing="${(fRotulo.fontSize * 0.16).toFixed(1)}" fill="#8A9099">${escapeXml(fRotulo.lineas[0] ?? "")}</text>`,
    lineasCentradas(fTermino, cx, y0 + altoRotulo + 24 + fTermino.alto / 2, paleta.colorAcento),
    `<rect x="${((lienzo.width - anchoLinea) / 2).toFixed(1)}" y="${(y0 + altoTotal - 36).toFixed(1)}" width="${anchoLinea.toFixed(1)}" height="6" rx="3" fill="#D6DAE0"/>`,
  ].join("\n    ");
}

/** Un marco por rellenar, con las esquinas marcadas. */
function marcoVacio(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const fInv = fit(c.invitacion, ancho - 56, Math.round(lienzo.width * 0.042), 18, 3);
  const altoMarco = Math.round(lienzo.width * 0.22);
  const altoTotal = fInv.alto + altoMarco + 46;
  const y0 = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);
  const yMarco = y0 + fInv.alto + 34;
  const brazo = Math.round(altoMarco * 0.24);

  // Las esquinas en L y el interior vacío dicen "esto lo escribes tú" sin
  // necesidad de una instrucción escrita.
  const esquina = (x: number, y: number, dx: number, dy: number) =>
    `<path d="M${(x + dx * brazo).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + dy * brazo).toFixed(1)}" ` +
    `fill="none" stroke="${paleta.colorAcento}" stroke-width="7" stroke-linecap="round"/>`;

  const x1 = margen + 10, x2 = margen + ancho - 10;
  const y1 = yMarco, y2 = yMarco + altoMarco;
  return [
    lineasCentradas(fInv, lienzo.width / 2, y0 + fInv.alto / 2, "#FFFFFF", { sombra: true }),
    `<rect x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${(x2 - x1).toFixed(1)}" height="${altoMarco}" rx="18" fill="#FFFFFF" fill-opacity="0.13"/>`,
    esquina(x1, y1, 1, 1), esquina(x2, y1, -1, 1),
    esquina(x1, y2, 1, -1), esquina(x2, y2, -1, -1),
  ].join("\n    ");
}

/** Una frase entrecomillada para tomar partido. */
function cita(c: ContenidoInteractivo, lienzo: Lienzo, zona: ZonaBloque, paleta: PaletaComposicion): string {
  const margen = lienzo.width * MARGEN_LATERAL;
  const ancho = lienzo.width - margen * 2;
  const comillas = Math.round(lienzo.width * 0.13);
  const f = fit(c.frase, ancho - 120, Math.round(lienzo.width * 0.052), 20, 4);
  const altoTotal = f.alto + comillas * 0.7 + 76;
  const y0 = zona.y + Math.max(0, (zona.alto - altoTotal) / 2);
  const cx = lienzo.width / 2;

  return [
    carta(margen, y0, ancho, altoTotal),
    `<text x="${(margen + 34).toFixed(1)}" y="${(y0 + comillas * 0.78).toFixed(1)}" ` +
      `font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" ` +
      `font-size="${comillas}" fill="${paleta.colorAcento}" fill-opacity="0.5">&#8220;</text>`,
    lineasCentradas(f, cx, y0 + comillas * 0.55 + f.alto / 2 + 10, "#141318"),
    `<rect x="${(cx - ancho * 0.16).toFixed(1)}" y="${(y0 + altoTotal - 34).toFixed(1)}" width="${(ancho * 0.32).toFixed(1)}" height="6" rx="3" fill="${paleta.colorAcento}"/>`,
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
      case "podio": return c.opciones.length >= 3 ? podio(c, lienzo, zona, paleta) : "";
      case "antes_despues": return c.izquierda && c.derecha ? antesDespues(c, formato, lienzo, zona, paleta) : "";
      case "galeria_tipos": return c.opciones.length >= 4 ? galeriaTipos(c, lienzo, zona, paleta) : "";
      case "escala_caras": return c.izquierda && c.derecha ? escalaCaras(c, lienzo, zona, paleta) : "";
      case "bingo": return c.items.length >= 9 ? bingo(c, lienzo, zona, paleta) : "";
      case "semaforo": return c.opciones.length >= 3 ? semaforo(c, lienzo, zona) : "";
      case "tres_cartas": return c.opciones.length >= 3 ? tresCartas(c, lienzo, zona, paleta) : "";
      case "tarjeta_definicion": return c.termino ? tarjetaDefinicion(c, lienzo, zona, paleta) : "";
      case "marco_vacio": return c.invitacion ? marcoVacio(c, lienzo, zona, paleta) : "";
      case "cita": return c.frase ? cita(c, lienzo, zona, paleta) : "";
      default: return "";
    }
  } catch (e) {
    console.warn(`[interactivo] no se pudo dibujar "${tipo}": ${(e as Error).message}`);
    return "";
  }
}
