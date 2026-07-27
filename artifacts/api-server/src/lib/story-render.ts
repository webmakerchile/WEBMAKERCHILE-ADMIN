// Composición del texto sobre una historia 9:16 (1080x1920).
//
// Vive fuera de las rutas a propósito: así se puede renderizar en un test sin
// levantar Express, base de datos ni llamar a la IA — que es la única forma
// honesta de garantizar que NUNCA sale un texto cortado.
//
// Reglas que este módulo hace cumplir, todas verificadas por story-render.test:
//  · Ningún bloque se sale del lienzo ni queda pegado al borde.
//  · Los bloques inferiores (sub-copy, invitación, hashtags) se apilan de abajo
//    hacia arriba con sus alturas MEDIDAS, así que nunca se pisan entre sí.
//  · Todo el texto se mide con la fuente que realmente se dibuja.

import sharp from "sharp";
import {
  ajustarTextoMedido,
  construirOverlayTitular,
  medirTexto,
  normalizarParaFuente,
  obtenerEstiloTitular,
  type TextoAjustado,
  type ZonaTexto,
} from "./title-style.js";
import { FONT_METRICS } from "./font-metrics.generated.js";
import { HIST_HEIGHT, HIST_WIDTH, type LayoutHistoria } from "./story-formats.js";
import type { FrameGuion } from "./story-script.js";

export const PALETA_COMMUNITY = { colorAcento: "#FB923C", scrim: { r: 15, g: 23, b: 42 } };

/** Fuente empaquetada del texto secundario. "Inter" NO está instalada en el
 *  servidor (cae en DejaVu Sans, más ancha) — medir como Inter y dibujar como
 *  DejaVu es lo que sacaba el sub-copy fuera del lienzo. */
export const FUENTE_SECUNDARIA = FONT_METRICS.montserrat_bold;

/** Aire mínimo entre bloques y contra el borde inferior del lienzo. */
const GAP_BLOQUES = 26;
const MARGEN_LIENZO = 48;

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/** Quita emojis, pictogramas y caracteres de control: librsvg no los dibuja y
 *  los de control además rompen el XML del overlay. */
export function stripEmojis(s: string): string {
  return s
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[\u200D\uFE0F\u20E3]/g, "")
    // Los caracteres de control rompen el XML del overlay (librsvg falla y el
    // frame sale sin texto): fuera antes de llegar al SVG.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Defs SVG: gradientes de las zonas reservadas + sombra suave de texto.
export const SVG_DEFS = `
  <defs>
    <linearGradient id="topfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F172A" stop-opacity="0.92"/>
      <stop offset="60%" stop-color="#0F172A" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="botfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F172A" stop-opacity="0"/>
      <stop offset="20%" stop-color="#0F172A" stop-opacity="0.85"/>
      <stop offset="40%" stop-color="#0F172A" stop-opacity="0.97"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="1"/>
    </linearGradient>
    <filter id="textds" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
      <feOffset dx="0" dy="2" result="off"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
`;

/** Bloque de texto secundario centrado, medido con métricas reales. */
export function bloqueSecundarioSvg(
  fit: TextoAjustado,
  opts: { canvasWidth: number; centerY: number; color: string; opacidad?: number; conSombra?: boolean },
): string {
  if (fit.lineas.length === 0) return "";
  const primeraBase = opts.centerY - fit.alto / 2 + fit.fontSize * 0.82;
  const filtro = opts.conSombra === false ? "" : ' filter="url(#textds)"';
  const op = opts.opacidad !== undefined ? ` fill-opacity="${opts.opacidad}"` : "";
  return fit.lineas
    .map(
      (linea, i) =>
        `<text x="${opts.canvasWidth / 2}" y="${(primeraBase + i * fit.lineHeight).toFixed(1)}" text-anchor="middle" font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}" font-size="${fit.fontSize}" fill="${opts.color}"${op}${filtro}>${escapeXml(linea)}</text>`,
    )
    .join("\n    ");
}

/* ==================== Apilado de los bloques inferiores =================== */

interface BloqueApilable {
  id: "subcopy" | "cta" | "hashtags";
  /** Alto TOTAL que ocupa (incluye el relleno del botón en el caso del CTA). */
  alto: number;
  /** Centro que pide el layout; solo se respeta si no genera solapes. */
  centroPreferido: number;
}

export interface PosicionBloque {
  id: BloqueApilable["id"];
  centroY: number;
  alto: number;
}

/**
 * Coloca los bloques inferiores de abajo hacia arriba respetando sus alturas
 * reales. Antes cada uno usaba el centro fijo del layout mientras su alto
 * variaba con el texto, así que un sub-copy de tres líneas terminaba pegado al
 * botón y un botón alto empujaba los hashtags fuera del lienzo.
 *
 * Nunca baja un bloque: solo lo sube lo justo para que quepa y no se pise con
 * el de abajo. Con `topeSuperior` se evita además que invada el titular.
 */
export function apilarBloquesInferiores(
  bloques: BloqueApilable[],
  opts: { altoLienzo: number; topeSuperior: number },
): PosicionBloque[] {
  const orden: BloqueApilable["id"][] = ["subcopy", "cta", "hashtags"];
  const presentes = bloques
    .filter(b => b.alto > 0)
    .sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));

  const posiciones = new Map<BloqueApilable["id"], PosicionBloque>();
  let limiteInferior = opts.altoLienzo - MARGEN_LIENZO;

  // De abajo hacia arriba: cada bloque no puede pasar del límite que dejó el
  // anterior, y el límite del siguiente es su borde superior menos el aire.
  for (const b of [...presentes].reverse()) {
    const bottom = Math.min(b.centroPreferido + b.alto / 2, limiteInferior);
    const top = bottom - b.alto;
    posiciones.set(b.id, { id: b.id, centroY: top + b.alto / 2, alto: b.alto });
    limiteInferior = top - GAP_BLOQUES;
  }

  // Si la pila subió tanto que se mete en el titular, se baja en bloque lo
  // justo para despejarlo (sigue sin solaparse: se mueve todo junto).
  const masAlto = Math.min(...presentes.map(b => posiciones.get(b.id)!.centroY - b.alto / 2));
  if (presentes.length > 0 && masAlto < opts.topeSuperior) {
    const empuje = opts.topeSuperior - masAlto;
    for (const p of posiciones.values()) p.centroY += empuje;
  }
  return presentes.map(b => posiciones.get(b.id)!);
}

/* ==================== Render de un frame ================================= */

export interface OpcionesRenderHistoria {
  frameInfo?: { numero: number; total: number };
  estiloTitularId?: string;
}

/** Geometría resuelta de un frame: lo que el test verifica sin rasterizar. */
export interface ComposicionHistoria {
  svg: string;
  overlayTitular: Buffer | null;
  /** Caja del bloque de titular, ya resuelta. */
  titular: { top: number; bottom: number; izquierda: number; derecha: number } | null;
  bloques: PosicionBloque[];
}

/**
 * Resuelve la composición completa (SVG + overlay del titular) sin tocar la
 * imagen de fondo. Separado del render para poder auditar la geometría.
 */
export function componerHistoria(
  frame: FrameGuion,
  layout: LayoutHistoria,
  opts?: OpcionesRenderHistoria,
): ComposicionHistoria {
  const w = HIST_WIDTH;
  const h = HIST_HEIGHT;
  const sidePadding = 80;
  const innerWidth = w - sidePadding * 2;

  const titular = stripEmojis(frame.copy_principal);
  const sub =
    layout.bloques.includes("subcopy") && layout.subCopyCenterY !== null
      ? stripEmojis(frame.sub_copy)
      : "";
  const cta = layout.bloques.includes("cta") ? stripEmojis(frame.cta) : "";
  const hashtags = layout.bloques.includes("hashtags") ? stripEmojis(frame.hashtags) : "";
  const dato = layout.bloques.includes("dato_gigante") ? stripEmojis(frame.dato) : "";
  const datoLabel = dato ? stripEmojis(frame.dato_label) : "";

  const estilo =
    (opts?.estiloTitularId ? obtenerEstiloTitular(opts.estiloTitularId) : undefined) ??
    obtenerEstiloTitular("impacto")!;
  const acento = PALETA_COMMUNITY.colorAcento;

  // Si el layout esperaba una cifra y el guion no trajo una válida, el titular
  // se queda con todo el espacio en vez de dejar un hueco enorme arriba.
  const zonaTitular: ZonaTexto =
    layout.zonaDato && !dato
      ? {
          ...layout.zonaTitular,
          y: layout.zonaDato.y,
          height: layout.zonaTitular.y + layout.zonaTitular.height - layout.zonaDato.y,
        }
      : layout.zonaTitular;

  // Todo el texto secundario se mide con las métricas reales de Montserrat.
  const subFit = sub
    ? ajustarTextoMedido(sub, {
        maxWidth: w - 200,
        maxHeight: 190,
        maxLineas: 3,
        maxFontSize: 52,
        minFontSize: 30,
        fuenteId: "montserrat_bold",
        lineHeight: 1.2,
      })
    : null;

  const ctaFit = cta
    ? ajustarTextoMedido(cta, {
        maxWidth: innerWidth - 160,
        maxHeight: 120,
        maxLineas: 2,
        maxFontSize: 44,
        minFontSize: 28,
        fuenteId: "montserrat_bold",
        lineHeight: 1.18,
      })
    : null;

  const hashSidePadding = 140;
  const hashFit = hashtags
    ? ajustarTextoMedido(hashtags, {
        maxWidth: w - hashSidePadding * 2,
        maxHeight: 130,
        maxLineas: 3,
        maxFontSize: 32,
        minFontSize: 20,
        fuenteId: "montserrat_bold",
        lineHeight: 1.22,
      })
    : null;

  const padX = 64;
  const padY = 26;
  const btnHeight = ctaFit ? Math.max(88, ctaFit.alto + padY * 2) : 0;

  const posiciones = apilarBloquesInferiores(
    [
      { id: "subcopy", alto: subFit?.alto ?? 0, centroPreferido: layout.subCopyCenterY ?? 0 },
      { id: "cta", alto: btnHeight, centroPreferido: layout.ctaCenterY },
      { id: "hashtags", alto: hashFit?.alto ?? 0, centroPreferido: layout.hashtagsCenterY },
    ],
    { altoLienzo: h, topeSuperior: zonaTitular.y + zonaTitular.height + GAP_BLOQUES },
  );
  const centroDe = (id: PosicionBloque["id"]) => posiciones.find(p => p.id === id)?.centroY ?? null;

  // Botón de invitación: solo existe si el frame trae CTA (o sea, el cierre).
  const centroCta = centroDe("cta");
  const ctaSvg =
    ctaFit && centroCta !== null
      ? (() => {
          // El botón se dimensiona con el ancho MEDIDO y nunca excede el lienzo.
          const btnWidth = Math.min(innerWidth, ctaFit.ancho + padX * 2);
          const btnX = (w - btnWidth) / 2;
          const btnY = centroCta - btnHeight / 2;
          return `
      <rect x="${btnX.toFixed(1)}" y="${(btnY + 8).toFixed(1)}" width="${btnWidth.toFixed(1)}" height="${btnHeight.toFixed(1)}"
        rx="${btnHeight / 2}" fill="#E86A30" fill-opacity="0.30" filter="url(#ctashadow)"/>
      <rect x="${btnX.toFixed(1)}" y="${btnY.toFixed(1)}" width="${btnWidth.toFixed(1)}" height="${btnHeight.toFixed(1)}"
        rx="${btnHeight / 2}" fill="#E86A30"/>
      ${bloqueSecundarioSvg(ctaFit, { canvasWidth: w, centerY: centroCta, color: "#ffffff", conSombra: false })}
    `;
        })()
      : "";

  // Cifra protagonista: se dibuja con la display del titular, centrada por
  // métricas reales (mismo motor que las portadas) y con su etiqueta debajo.
  const datoSvg =
    dato && layout.zonaDato
      ? (() => {
          const m = FONT_METRICS.anton;
          const texto = normalizarParaFuente(dato, "anton");
          const avance = Math.max(0.4, medirTexto(texto, "anton"));
          const alto = layout.zonaDato.alto;
          const fsNum = Math.floor(Math.min(alto * 0.78, (innerWidth * 0.9) / avance));
          const anchoNum = avance * fsNum;
          const baseNum = layout.zonaDato.y + alto * 0.72;
          const xNum = (w - anchoNum) / 2;
          const attrs = `font-family="'${m.familia}'" font-weight="${m.peso}" font-size="${fsNum}"`;
          const sombra = fsNum * 0.03;
          const etiqueta = datoLabel
            ? (() => {
                const fit = ajustarTextoMedido(datoLabel, {
                  maxWidth: innerWidth - 60,
                  maxHeight: 110,
                  maxLineas: 2,
                  maxFontSize: 44,
                  minFontSize: 26,
                  fuenteId: "montserrat_bold",
                  lineHeight: 1.2,
                });
                return bloqueSecundarioSvg(fit, {
                  canvasWidth: w,
                  centerY: layout.zonaDato!.y + alto + 14 + fit.alto / 2,
                  color: "#f1f5f9",
                  opacidad: 0.92,
                });
              })()
            : "";
          return `
      <text x="${(xNum + sombra).toFixed(1)}" y="${(baseNum + sombra).toFixed(1)}" ${attrs} fill="#0B1120" fill-opacity="0.8">${escapeXml(texto)}</text>
      <text x="${xNum.toFixed(1)}" y="${baseNum.toFixed(1)}" ${attrs} fill="${acento}">${escapeXml(texto)}</text>
      ${etiqueta}
    `;
        })()
      : "";

  // Comillas decorativas para los layouts de cita.
  const comillasSvg = layout.bloques.includes("comillas")
    ? (() => {
        const q = FONT_METRICS.alfa_slab;
        const fsQ = Math.round(w * 0.26);
        return `<text x="${(zonaTitular.x - fsQ * 0.05).toFixed(1)}" y="${(zonaTitular.y + fsQ * 0.2).toFixed(1)}"
      font-family="'${q.familia}'" font-weight="${q.peso}" font-size="${fsQ}" fill="${acento}" fill-opacity="0.32">&#8220;</text>`;
      })()
    : "";

  // Contador discreto de la serie (arriba a la derecha).
  const info = opts?.frameInfo;
  const contadorSvg =
    layout.bloques.includes("contador") && info && info.total > 1
      ? `
    <rect x="${(w - 160).toFixed(1)}" y="40" width="120" height="56" rx="28" fill="#0F172A" fill-opacity="0.55"/>
    <text x="${(w - 100).toFixed(1)}" y="78" text-anchor="middle"
      font-family="'${FUENTE_SECUNDARIA.familia}'" font-weight="${FUENTE_SECUNDARIA.peso}"
      font-size="30" fill="#ffffff" fill-opacity="0.85">${info.numero}/${info.total}</text>
  `
      : "";

  // Scrims: solo donde el layout pone texto, para no ensuciar la ilustración.
  const despejadaSuperior = layout.zonasDespejadas.find(z => z.desde === 0);
  const despejadaInferior = layout.zonasDespejadas.find(z => z.hasta >= HIST_HEIGHT);
  const scrimTop =
    (layout.scrim === "superior" || layout.scrim === "ambos") && despejadaSuperior
      ? `<rect x="0" y="0" width="${w}" height="${Math.round(despejadaSuperior.hasta + 60)}" fill="url(#topfade)"/>`
      : "";
  // El scrim inferior arranca donde arranque el bloque más alto de la pila:
  // si la pila subió, el degradado sube con ella y el texto no queda a media
  // luz sobre la ilustración.
  const topePila = posiciones.length > 0 ? Math.min(...posiciones.map(p => p.centroY - p.alto / 2)) : h;
  const inicioScrim = Math.min(despejadaInferior?.desde ?? h, topePila - 60);
  const scrimBottom =
    (layout.scrim === "inferior" || layout.scrim === "ambos") && despejadaInferior
      ? `<rect x="0" y="${Math.round(inicioScrim - 100)}" width="${w}" height="${Math.round(h - inicioScrim + 100)}" fill="url(#botfade)"/>`
      : "";

  const centroSub = centroDe("subcopy");
  const centroHash = centroDe("hashtags");
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    ${SVG_DEFS}
    <filter id="ctashadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="14"/>
    </filter>
    ${scrimTop}
    ${scrimBottom}
    ${comillasSvg}
    ${datoSvg}
    ${subFit && centroSub !== null ? bloqueSecundarioSvg(subFit, { canvasWidth: w, centerY: centroSub, color: "#f1f5f9" }) : ""}
    ${ctaSvg}
    ${hashFit && centroHash !== null ? bloqueSecundarioSvg(hashFit, { canvasWidth: w, centerY: centroHash, color: "#fb923c" }) : ""}
    ${contadorSvg}
  </svg>`;

  const overlayTitular = titular
    ? construirOverlayTitular({
        canvas: { width: w, height: h },
        zona: zonaTitular,
        scrim: "ninguno", // los gradientes de arriba ya hacen de scrim
        titulo: titular,
        estilo,
        paleta: PALETA_COMMUNITY,
      })
    : null;

  return {
    svg,
    overlayTitular,
    titular: titular
      ? {
          top: zonaTitular.y,
          bottom: zonaTitular.y + zonaTitular.height,
          izquierda: zonaTitular.x,
          derecha: zonaTitular.x + zonaTitular.width,
        }
      : null,
    bloques: posiciones,
  };
}

/**
 * Compone el texto del frame sobre la ilustración y devuelve el PNG en base64.
 *
 * El layout (story-formats) define qué bloques se dibujan y dónde: hay frames
 * que solo llevan titular, otros que llevan una cifra gigante y solo el frame
 * de cierre lleva botón de invitación y hashtags.
 */
export async function renderTextoEnHistoria(
  imagenBase64: string,
  frame: FrameGuion,
  layout: LayoutHistoria,
  opts?: OpcionesRenderHistoria,
): Promise<string> {
  // Forzar 9:16 (1080x1920): el modelo suele devolver tamaños menores y las
  // zonas del layout están en píxeles absolutos de ese lienzo.
  const imgBuffer = await sharp(Buffer.from(imagenBase64, "base64"))
    .resize(HIST_WIDTH, HIST_HEIGHT, { fit: "cover", position: "center" })
    .png()
    .toBuffer();

  const comp = componerHistoria(frame, layout, opts);
  const capas: sharp.OverlayOptions[] = [{ input: Buffer.from(comp.svg), top: 0, left: 0 }];
  if (comp.overlayTitular) capas.push({ input: comp.overlayTitular, top: 0, left: 0 });

  const composed = await sharp(imgBuffer).composite(capas).png().toBuffer();
  return composed.toString("base64");
}
