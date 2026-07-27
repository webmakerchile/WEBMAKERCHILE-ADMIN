// Motor de tipografía de titulares para portadas y miniaturas.
//
// Reemplaza el render "básico" anterior (fill plano + sombra) por un sistema
// de ESTILOS DE TITULAR estilo youtuber famoso: contorno grueso, sombra dura,
// extrusión 3D, halo neón, relleno degradado y placas — todo compuesto como
// capas de <text> apiladas (librsvg-safe: sin filtros ni paint-order).
//
// La otra mitad del motor es el LAYOUT CON MÉTRICAS REALES: cada carácter
// tiene su avance medido (font-metrics.generated.ts, calibrado rasterizando
// con librsvg), así que cada línea se parte balanceada y escala su font-size
// para llenar el ancho exacto de su columna — el bloque de texto queda macizo
// como en las miniaturas de los canales grandes, sin "letras que no encajan".
//
// Sin dependencias de cover-style/youtube-cover: este módulo es la base y
// aquellos lo consumen.

import { FONT_METRICS, type FuenteTitularId, type MetricasFuente } from "./font-metrics.generated.js";

/* ========================= Tipos públicos ================================ */

export interface ZonaTexto {
  x: number;
  y: number;
  width: number;
  height: number;
  align: "left" | "center";
  /** Anclaje vertical del bloque dentro de la zona. */
  vertical: "top" | "center" | "bottom";
  /** Tope de font-size para esta zona (px del lienzo final). */
  maxFontSize: number;
  /** Piso de font-size: por debajo, el layout prefiere partir en más líneas. */
  minFontSize: number;
}

export type ScrimLado = "izquierda" | "derecha" | "superior" | "inferior" | "ninguno";

interface SombraDura {
  /** Desplazamiento como fracción del font-size. */
  dx: number;
  dy: number;
  color: string;
}

export type EfectoTitular =
  | { tipo: "relleno"; sombra?: SombraDura }
  | { tipo: "contorno"; grosor: number; colorContorno: string; sombra?: SombraDura }
  | {
      tipo: "extrusion";
      /** Cantidad de capas de profundidad. */
      profundidad: number;
      /** Desplazamiento por capa como fracción del font-size. */
      paso: number;
      colorExtrusion: string;
      grosor: number;
      colorContorno: string;
    }
  | { tipo: "neon"; capas: Array<{ grosor: number; opacidad: number }>; colorGlow: "auto" | string }
  | { tipo: "gradiente"; stops: [string, string]; grosor: number; colorContorno: string; sombra?: SombraDura }
  | { tipo: "chips"; chipFondo: string; sombra?: SombraDura };

export interface EstiloTitular {
  id: string;
  nombre: string;
  /** Descripción corta para la UI de selección. */
  descripcionUi: string;
  fuenteId: FuenteTitularId;
  lineHeight: number;
  /** Espaciado extra entre caracteres como fracción del font-size. */
  letterSpacing: number;
  colorTexto: string;
  /** "color": la palabra clave cambia de color · "caja": va sobre una placa. */
  acento: { modo: "color" | "caja"; color: "auto" | string };
  efecto: EfectoTitular;
  /** Inclinación del bloque completo en grados. */
  inclinacion: number;
}

/** Lo mínimo que el motor necesita saber de la dirección de arte. */
export interface PaletaTitular {
  colorAcento: string;
  scrim: { r: number; g: number; b: number };
}

/* ==================== Banco de estilos de titular ======================== */

export const ESTILOS_TITULAR: EstiloTitular[] = [
  {
    id: "impacto",
    nombre: "Impacto total",
    descripcionUi: "Letras enormes con contorno negro y sombra dura — el look MrBeast.",
    fuenteId: "archivo_black",
    lineHeight: 1.08,
    letterSpacing: 0,
    colorTexto: "#FFFFFF",
    acento: { modo: "color", color: "auto" },
    efecto: {
      tipo: "contorno",
      grosor: 0.09,
      colorContorno: "#000000",
      sombra: { dx: 0.05, dy: 0.055, color: "rgba(0,0,0,0.55)" },
    },
    inclinacion: -2,
  },
  {
    id: "titan",
    nombre: "Titán condensada",
    descripcionUi: "Condensada altísima con la palabra clave sobre una placa de color.",
    fuenteId: "anton",
    lineHeight: 1.08,
    letterSpacing: 0.005,
    colorTexto: "#FFFFFF",
    acento: { modo: "caja", color: "auto" },
    efecto: {
      tipo: "contorno",
      grosor: 0.06,
      colorContorno: "#000000",
      sombra: { dx: 0.038, dy: 0.045, color: "rgba(0,0,0,0.5)" },
    },
    inclinacion: 0,
  },
  {
    id: "slab_3d",
    nombre: "3D cartel",
    descripcionUi: "Serifa gruesa con extrusión 3D, estilo cartel de feria retro.",
    fuenteId: "alfa_slab",
    lineHeight: 1.16,
    letterSpacing: 0,
    colorTexto: "#FFF6E3",
    acento: { modo: "color", color: "auto" },
    efecto: {
      tipo: "extrusion",
      profundidad: 6,
      paso: 0.015,
      colorExtrusion: "#17110A",
      grosor: 0.028,
      colorContorno: "#000000",
    },
    inclinacion: -1.5,
  },
  {
    id: "neon",
    nombre: "Neón eléctrico",
    descripcionUi: "Condensada con halo de neón del color de la luz del estudio.",
    fuenteId: "bebas",
    lineHeight: 1.04,
    letterSpacing: 0.012,
    colorTexto: "#FFFFFF",
    acento: { modo: "color", color: "auto" },
    efecto: {
      tipo: "neon",
      capas: [
        { grosor: 0.17, opacidad: 0.16 },
        { grosor: 0.1, opacidad: 0.3 },
        { grosor: 0.05, opacidad: 0.6 },
      ],
      colorGlow: "auto",
    },
    inclinacion: 0,
  },
  {
    id: "fuego",
    nombre: "Degradado dorado",
    descripcionUi: "Relleno degradado amarillo→naranja con contorno oscuro, viral clásico.",
    fuenteId: "anton",
    lineHeight: 1.08,
    letterSpacing: 0.005,
    colorTexto: "#FFE45C",
    acento: { modo: "color", color: "#FFFFFF" },
    efecto: {
      tipo: "gradiente",
      stops: ["#FFE45C", "#FF8A00"],
      grosor: 0.07,
      colorContorno: "#211200",
      sombra: { dx: 0.04, dy: 0.05, color: "rgba(0,0,0,0.55)" },
    },
    inclinacion: -2,
  },
  {
    id: "placas",
    nombre: "Placas premium",
    descripcionUi: "Cada línea sobre una placa oscura con la palabra clave en color.",
    fuenteId: "montserrat_black",
    lineHeight: 1.3,
    letterSpacing: 0.01,
    colorTexto: "#FFFFFF",
    acento: { modo: "color", color: "auto" },
    efecto: { tipo: "chips", chipFondo: "rgba(8,8,10,0.78)" },
    inclinacion: -1.5,
  },
  {
    id: "clasico",
    nombre: "Clásico limpio",
    descripcionUi: "Texto directo con sombra suave, sobrio y elegante.",
    fuenteId: "montserrat_black",
    lineHeight: 1.14,
    letterSpacing: 0.01,
    colorTexto: "#FFFFFF",
    acento: { modo: "color", color: "auto" },
    efecto: { tipo: "relleno", sombra: { dx: 0.03, dy: 0.035, color: "rgba(0,0,0,0.5)" } },
    inclinacion: 0,
  },
];

const ESTILOS_POR_ID = new Map(ESTILOS_TITULAR.map(e => [e.id, e]));

/** Estilos con energía de miniatura viral: la rotación automática solo usa estos. */
const ROTACION_ESTILOS = ["impacto", "titan", "slab_3d", "fuego", "neon"] as const;
const MEMORIA_ESTILOS = 3;
const ultimosEstilos: string[] = [];

/**
 * Resuelve el estilo del titular: fijado por el usuario → default de la
 * plantilla → rotación automática (anti-repetición) entre los impactantes.
 */
export function resolverEstiloTitular(
  estiloId?: string | null,
  plantillaDefault?: string | null,
): EstiloTitular {
  const fijado = estiloId ? ESTILOS_POR_ID.get(estiloId) : undefined;
  if (fijado) {
    registrarEstilo(fijado.id);
    return fijado;
  }
  const porPlantilla = plantillaDefault ? ESTILOS_POR_ID.get(plantillaDefault) : undefined;
  if (porPlantilla) {
    registrarEstilo(porPlantilla.id);
    return porPlantilla;
  }
  const disponibles = ROTACION_ESTILOS.filter(id => !ultimosEstilos.includes(id));
  const candidatos = disponibles.length > 0 ? disponibles : [...ROTACION_ESTILOS];
  const elegido = candidatos[Math.floor(Math.random() * candidatos.length)]!;
  registrarEstilo(elegido);
  return ESTILOS_POR_ID.get(elegido)!;
}

function registrarEstilo(id: string): void {
  ultimosEstilos.push(id);
  if (ultimosEstilos.length > MEMORIA_ESTILOS) ultimosEstilos.shift();
}

/** Lookup puro por id (no toca la memoria de rotación). */
export function obtenerEstiloTitular(id: string): EstiloTitular | undefined {
  return ESTILOS_POR_ID.get(id);
}

export function listarEstilosTitular() {
  return ESTILOS_TITULAR.map(e => ({ id: e.id, nombre: e.nombre, descripcion: e.descripcionUi }));
}

/* ==================== Medición con métricas reales ======================= */

/** Ancho de un texto en unidades de font-size (multiplicar por el fs en px). */
export function medirTexto(texto: string, fuenteId: FuenteTitularId, letterSpacing = 0): number {
  const m: MetricasFuente = FONT_METRICS[fuenteId];
  let w = 0;
  for (const ch of texto) {
    if (ch === " ") w += m.espacio;
    else w += m.avances[ch] ?? m.promedio;
  }
  // librsvg aplica letter-spacing después de CADA glifo (incluido el último):
  // sobreestimar apenas es seguro para el ajuste al ancho.
  return w + letterSpacing * texto.length;
}

/* ==================== Texto secundario medido ============================ */

export interface TextoAjustado {
  lineas: string[];
  fontSize: number;
  lineHeight: number;
  /** Ancho de la línea más ancha, en px. Nunca supera `maxWidth`. */
  ancho: number;
  alto: number;
}

export interface OpcionesAjusteTexto {
  maxWidth: number;
  /** Alto disponible; si se excede, igual se respeta el ancho. */
  maxHeight?: number;
  maxLineas?: number;
  maxFontSize: number;
  minFontSize: number;
  fuenteId: FuenteTitularId;
  lineHeight?: number;
  letterSpacing?: number;
}

/** Parte el texto en líneas que caben en `maxWidth` a un font-size dado,
 *  cortando incluso dentro de una palabra si esa palabra sola no cabe. */
function partirPorAncho(
  palabras: string[],
  fuenteId: FuenteTitularId,
  letterSpacing: number,
  fontSize: number,
  maxWidth: number,
): string[] {
  const m: MetricasFuente = FONT_METRICS[fuenteId];
  const anchoDe = (t: string) => medirTexto(t, fuenteId, letterSpacing) * fontSize;
  const anchoEspacio = (m.espacio + letterSpacing) * fontSize;

  const lineas: string[] = [];
  let actual = "";
  let anchoActual = 0;

  const empujar = () => {
    if (actual) lineas.push(actual);
    actual = "";
    anchoActual = 0;
  };

  for (const palabra of palabras) {
    let w = anchoDe(palabra);
    // Palabra más ancha que la columna: se parte por caracteres.
    if (w > maxWidth) {
      empujar();
      let resto = palabra;
      while (resto && anchoDe(resto) > maxWidth) {
        let corte = resto.length - 1;
        while (corte > 1 && anchoDe(resto.slice(0, corte)) > maxWidth) corte--;
        lineas.push(resto.slice(0, corte));
        resto = resto.slice(corte);
      }
      actual = resto;
      anchoActual = anchoDe(resto);
      continue;
    }
    const anchoConEspacio = actual ? anchoActual + anchoEspacio + w : w;
    if (anchoConEspacio > maxWidth) {
      empujar();
      actual = palabra;
      anchoActual = w;
    } else {
      actual = actual ? `${actual} ${palabra}` : palabra;
      anchoActual = anchoConEspacio;
    }
  }
  empujar();
  return lineas;
}

/**
 * Ajusta un bloque de texto secundario (sub-copy, CTA, hashtags) midiendo con
 * las métricas REALES de una fuente empaquetada, no con un ratio estimado.
 *
 * Garantía: la línea más ancha del resultado NUNCA supera `maxWidth`. Antes
 * este texto se medía suponiendo "Inter" —que no está empaquetada y caía en
 * DejaVu Sans, bastante más ancha—, así que se salía del lienzo.
 */
export function ajustarTextoMedido(texto: string, opts: OpcionesAjusteTexto): TextoAjustado {
  const lh = opts.lineHeight ?? 1.22;
  const ls = opts.letterSpacing ?? 0;
  const limpio = texto.replace(/\s+/g, " ").trim();
  const palabras = limpio.split(" ").filter(Boolean);
  if (palabras.length === 0) {
    return { lineas: [], fontSize: opts.minFontSize, lineHeight: opts.minFontSize * lh, ancho: 0, alto: 0 };
  }

  const maxLineas = opts.maxLineas ?? 4;
  const armar = (fontSize: number): TextoAjustado => {
    const lineas = partirPorAncho(palabras, opts.fuenteId, ls, fontSize, opts.maxWidth);
    const ancho = lineas.reduce(
      (max, l) => Math.max(max, medirTexto(l, opts.fuenteId, ls) * fontSize),
      0,
    );
    const lineHeight = fontSize * lh;
    return { lineas, fontSize, lineHeight, ancho, alto: lineas.length * lineHeight };
  };

  for (let fs = Math.round(opts.maxFontSize); fs >= opts.minFontSize; fs -= 2) {
    const r = armar(fs);
    if (r.lineas.length > maxLineas) continue;
    if (opts.maxHeight !== undefined && r.alto > opts.maxHeight) continue;
    return r;
  }
  // Piso: el ancho SIEMPRE se respeta (partirPorAncho corta lo que haga falta);
  // solo puede excederse el alto, que es preferible a perder texto.
  return armar(opts.minFontSize);
}

/* ==================== Palabras de acento ================================= */

const PALABRAS_CLAVE = new Set([
  "error", "errores", "secreto", "secretos", "gratis", "nunca", "siempre",
  "clave", "claves", "truco", "trucos", "ia", "web", "ventas", "venta",
  "exito", "éxito", "facil", "fácil", "rapido", "rápido", "peligro",
  "millon", "millón", "millones", "dinero", "plata", "cliente", "clientes",
  "hoy", "ya", "ahora", "prohibido", "urgente", "verdad", "mentira",
  "mentiras", "gigante", "mejor", "peor", "todo", "nada", "nadie",
  "testimonio", "real", "nuevo", "nueva", "imposible", "increible", "increíble",
]);

function normalizar(w: string): string {
  return w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Elige hasta 2 palabras del título para destacar en acento.
 * Prioridad: números > palabras "gatillo" > la palabra más larga (≥5).
 */
export function elegirPalabrasAcento(lines: string[]): Set<string> {
  type Cand = { word: string; score: number };
  const cands: Cand[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (const raw of line.split(/\s+/)) {
      const word = raw.trim();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      const limpio = normalizar(word.replace(/[^\p{L}\p{N}]/gu, ""));
      if (!limpio) continue;
      if (/\d/.test(word)) cands.push({ word, score: 3 });
      else if (PALABRAS_CLAVE.has(limpio) || PALABRAS_CLAVE.has(normalizar(word))) cands.push({ word, score: 2 });
      else if (limpio.length >= 5) cands.push({ word, score: 1 + limpio.length / 100 });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return new Set(cands.slice(0, 2).map(c => c.word));
}

/* ==================== Partición balanceada de líneas ===================== */

/**
 * Partición lineal clásica: divide las palabras en `n` grupos contiguos
 * minimizando el ancho del grupo más ancho (los bloques quedan parejos).
 */
function particionBalanceada(anchos: number[], espacios: number[], n: number): number[][] {
  const k = anchos.length;
  if (n >= k) return anchos.map((_, i) => [i]);

  // anchoGrupo(i, j) = suma de anchos i..j + espacios intermedios.
  const prefijoAncho: number[] = [0];
  for (let i = 0; i < k; i++) prefijoAncho.push(prefijoAncho[i]! + anchos[i]!);
  const anchoGrupo = (i: number, j: number): number => {
    let w = prefijoAncho[j + 1]! - prefijoAncho[i]!;
    for (let t = i; t < j; t++) w += espacios[t]!;
    return w;
  };

  // dp[j][g] = mínimo "ancho máximo" partiendo las primeras j palabras en g grupos.
  const dp: number[][] = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
  const corte: number[][] = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(0));
  dp[0]![0] = 0;
  for (let j = 1; j <= k; j++) {
    for (let g = 1; g <= Math.min(j, n); g++) {
      for (let i = g - 1; i < j; i++) {
        const costo = Math.max(dp[i]![g - 1]!, anchoGrupo(i, j - 1));
        if (costo < dp[j]![g]!) {
          dp[j]![g] = costo;
          corte[j]![g] = i;
        }
      }
    }
  }

  const grupos: number[][] = [];
  let j = k;
  for (let g = n; g >= 1; g--) {
    const i = corte[j]![g]!;
    grupos.unshift(Array.from({ length: j - i }, (_, t) => i + t));
    j = i;
  }
  return grupos;
}

export interface LineaLayout {
  texto: string;
  palabras: string[];
  fontSize: number;
  /** Ancho total de la línea en px al fontSize elegido. */
  ancho: number;
}

export interface TitularLayout {
  lineas: LineaLayout[];
  /** Altura total del bloque en px. */
  altoTotal: number;
}

/**
 * Layout del titular: limpia el texto, parte las palabras en líneas
 * balanceadas y ajusta el font-size DE CADA LÍNEA para llenar el ancho de la
 * zona (con topes de la zona y un límite de contraste entre líneas para que
 * ninguna quede ridículamente más grande que las demás).
 */
export function layoutTitular(titulo: string, zona: ZonaTexto, estilo: EstiloTitular): TitularLayout {
  const limpio = titulo.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const palabras = limpio.split(" ").filter(Boolean);
  if (palabras.length === 0) return { lineas: [], altoTotal: 0 };

  const m = FONT_METRICS[estilo.fuenteId];
  const anchos = palabras.map(p => medirTexto(p, estilo.fuenteId, estilo.letterSpacing));
  const espacios = palabras.slice(0, -1).map(() => m.espacio + estilo.letterSpacing);

  // Probar particiones de 1 a 4 líneas y quedarse con la que maximiza el
  // tamaño de la línea MÁS CHICA (bloque macizo estilo youtuber).
  const maxLineas = Math.min(4, palabras.length);
  let mejor: { grupos: number[][]; puntaje: number } | null = null;
  for (let n = 1; n <= maxLineas; n++) {
    const grupos = particionBalanceada(anchos, espacios, n);
    const fsLineas = grupos.map(g => {
      const ancho = anchoDeGrupo(g, anchos, espacios);
      return Math.min(zona.maxFontSize, zona.width / ancho);
    });
    // Altura disponible limita el tamaño global.
    const altura = fsLineas.reduce((acc, fs) => acc + fs * estilo.lineHeight, 0);
    const factorAltura = altura > zona.height ? zona.height / altura : 1;
    const puntaje = Math.min(...fsLineas) * factorAltura;
    if (!mejor || puntaje > mejor.puntaje + 0.5) mejor = { grupos, puntaje };
  }

  const grupos = mejor!.grupos;
  let fsLineas = grupos.map(g => {
    const ancho = anchoDeGrupo(g, anchos, espacios);
    return Math.min(zona.maxFontSize, zona.width / ancho);
  });

  // Límite de contraste: ninguna línea más de 2.2x la más chica.
  const fsMin = Math.min(...fsLineas);
  fsLineas = fsLineas.map(fs => Math.min(fs, fsMin * 2.2));

  // Encajar en la altura de la zona (escala proporcional), contando el aire
  // entre placas cuando el estilo es de chips.
  const gapLinea = estilo.efecto.tipo === "chips" ? 8 : 0;
  const altura =
    fsLineas.reduce((acc, fs) => acc + fs * estilo.lineHeight, 0) + gapLinea * (fsLineas.length - 1);
  if (altura > zona.height) {
    const factor = (zona.height - gapLinea * (fsLineas.length - 1)) / (altura - gapLinea * (fsLineas.length - 1));
    fsLineas = fsLineas.map(fs => fs * factor);
  }
  // Piso de legibilidad (mejor pasarse un pelo del alto que un titular
  // ilegible)… pero el ancho de la zona SIEMPRE manda: una línea con una
  // palabra muy larga jamás debe desbordar la franja despejada e invadir al
  // protagonista — ahí el piso cede y la línea se achica lo necesario.
  fsLineas = fsLineas.map((fs, i) => {
    const conPiso = Math.max(fs, zona.minFontSize);
    const anchoLinea = anchoDeGrupo(grupos[i]!, anchos, espacios);
    return Math.min(conPiso, zona.width / anchoLinea);
  });

  const lineas: LineaLayout[] = grupos.map((g, i) => {
    const texto = g.map(idx => palabras[idx]!).join(" ");
    const fs = Math.round(fsLineas[i]!);
    return {
      texto,
      palabras: g.map(idx => palabras[idx]!),
      fontSize: fs,
      ancho: anchoDeGrupo(g, anchos, espacios) * fs,
    };
  });
  const altoTotal = lineas.reduce((acc, l) => acc + l.fontSize * estilo.lineHeight, 0);
  return { lineas, altoTotal };
}

function anchoDeGrupo(indices: number[], anchos: number[], espacios: number[]): number {
  let w = 0;
  indices.forEach((idx, t) => {
    w += anchos[idx]!;
    if (t < indices.length - 1) w += espacios[idx]!;
  });
  return w;
}

/* ==================== Render SVG (capas librsvg-safe) ==================== */

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface PalabraPos {
  texto: string;
  x: number;
  ancho: number;
  esAcento: boolean;
}

/** Posición x de cada palabra de la línea (para capas, placas y acentos). */
function posicionarPalabras(
  linea: LineaLayout,
  estilo: EstiloTitular,
  acentos: Set<string>,
  xInicio: number,
): PalabraPos[] {
  const m = FONT_METRICS[estilo.fuenteId];
  const fs = linea.fontSize;
  let x = xInicio;
  return linea.palabras.map(p => {
    const ancho = medirTexto(p, estilo.fuenteId, estilo.letterSpacing) * fs;
    const pos: PalabraPos = { texto: p, x, ancho, esAcento: acentos.has(p) };
    x += ancho + (m.espacio + estilo.letterSpacing) * fs;
    return pos;
  });
}

function atributosFuente(estilo: EstiloTitular, fontSize: number): string {
  const m = FONT_METRICS[estilo.fuenteId];
  const ls = estilo.letterSpacing > 0 ? ` letter-spacing="${(estilo.letterSpacing * fontSize).toFixed(1)}"` : "";
  return `font-family="'${m.familia}'" font-weight="${m.peso}" font-size="${fontSize}"${ls}`;
}

/** Una capa de texto de la línea completa: cada palabra como <text> propio
 *  con x medido (así no dependemos de espacios entre tspans — librsvg los
 *  recorta — y podemos pintar acentos y placas por palabra). */
function capaTexto(
  palabras: PalabraPos[],
  baseline: number,
  estilo: EstiloTitular,
  fontSize: number,
  attrs: { dx?: number; dy?: number; fill: string | ((p: PalabraPos) => string); stroke?: { color: string; width: number }; opacidad?: number; soloContorno?: boolean },
): string {
  const dx = attrs.dx ?? 0;
  const dy = attrs.dy ?? 0;
  const piezas = palabras.map(p => {
    const fill = attrs.soloContorno ? "none" : typeof attrs.fill === "function" ? attrs.fill(p) : attrs.fill;
    const stroke = attrs.stroke
      ? ` stroke="${attrs.stroke.color}" stroke-width="${attrs.stroke.width.toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"`
      : "";
    const op = attrs.opacidad !== undefined ? ` opacity="${attrs.opacidad}"` : "";
    return `<text x="${(p.x + dx).toFixed(1)}" y="${(baseline + dy).toFixed(1)}" ${atributosFuente(estilo, fontSize)} fill="${fill}"${stroke}${op}>${escapeXml(p.texto)}</text>`;
  });
  return piezas.join("");
}

export interface ExtraOverlay {
  tipo: "comillas" | "numero_gigante";
  /** Solo para numero_gigante: el número ya separado del título. */
  valor?: string;
}

export interface OpcionesOverlayTitular {
  canvas: { width: number; height: number };
  zona: ZonaTexto;
  scrim: ScrimLado;
  titulo: string;
  estilo: EstiloTitular;
  paleta: PaletaTitular;
  extras?: ExtraOverlay[];
}

/**
 * Construye el overlay SVG completo del titular: scrim degradado del lado que
 * pida la plantilla + bloque de texto con el estilo elegido + extras
 * decorativos (comillas de testimonio, número gigante).
 */
export function construirOverlayTitular(opts: OpcionesOverlayTitular): Buffer {
  const { canvas, zona, estilo, paleta } = opts;
  const colorAcento = estilo.acento.color === "auto" ? paleta.colorAcento : estilo.acento.color;

  // Número gigante: se separa del título ANTES del layout (p. ej. "5 ERRORES…").
  let titulo = opts.titulo;
  let numeroGigante: string | null = null;
  if (opts.extras?.some(e => e.tipo === "numero_gigante")) {
    // El lookahead (?!\d) evita partir miles escritos con espacio:
    // "10 000 tips" NO debe volverse número gigante "10" + titular "000 TIPS".
    const m = titulo.trim().match(/^(\d{1,2})\s+(?!\d)(.+)$/);
    if (m) {
      numeroGigante = m[1]!;
      titulo = m[2]!;
    }
  }

  // Si hay número gigante, el texto cede espacio vertical (el número vive arriba).
  const altoNumero = numeroGigante ? Math.min(zona.height * 0.42, zona.maxFontSize * 2.1) : 0;
  const zonaTexto: ZonaTexto = numeroGigante
    ? { ...zona, y: zona.y + altoNumero, height: zona.height - altoNumero }
    : zona;

  const layout = layoutTitular(titulo, zonaTexto, estilo);
  const acentos = elegirPalabrasAcento(layout.lineas.map(l => l.texto));

  const gapChips = estilo.efecto.tipo === "chips" ? 8 : 0;
  const altoBloque = layout.altoTotal + gapChips * Math.max(0, layout.lineas.length - 1);
  const blockTop =
    zonaTexto.vertical === "top"
      ? zonaTexto.y
      : zonaTexto.vertical === "bottom"
        ? zonaTexto.y + zonaTexto.height - altoBloque
        : zonaTexto.y + Math.max(0, (zonaTexto.height - altoBloque) / 2);
  const blockCenterY = blockTop + altoBloque / 2;
  const blockCenterX = zona.x + zona.width / 2;

  const defs: string[] = [];
  const piezas: string[] = [];

  // Gradiente de relleno (una sola definición para todas las líneas).
  if (estilo.efecto.tipo === "gradiente") {
    const [c1, c2] = estilo.efecto.stops;
    defs.push(
      `<linearGradient id="gradTitular" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`,
    );
  }

  // Número gigante (siempre con extrusión, protagonista absoluto).
  if (numeroGigante) {
    const fsNum = Math.round(altoNumero / 1.02);
    const anchoNum = medirTexto(numeroGigante, "alfa_slab", 0) * fsNum;
    const xNum = zona.align === "center" ? blockCenterX - anchoNum / 2 : zona.x;
    const baseNum = zona.y + altoNumero * 0.86;
    const capMetrics = FONT_METRICS.alfa_slab;
    const attrs = `font-family="'${capMetrics.familia}'" font-weight="${capMetrics.peso}" font-size="${fsNum}"`;
    for (let i = 7; i >= 1; i--) {
      const off = fsNum * 0.014 * i;
      piezas.push(`<text x="${(xNum + off).toFixed(1)}" y="${(baseNum + off).toFixed(1)}" ${attrs} fill="#17110A">${escapeXml(numeroGigante)}</text>`);
    }
    piezas.push(
      `<text x="${xNum.toFixed(1)}" y="${baseNum.toFixed(1)}" ${attrs} fill="${colorAcento}" stroke="#000000" stroke-width="${(fsNum * 0.025).toFixed(1)}" stroke-linejoin="round">${escapeXml(numeroGigante)}</text>`,
    );
  }

  // Comillas decorativas de testimonio (arriba-izquierda de la zona de texto).
  if (opts.extras?.some(e => e.tipo === "comillas")) {
    const fsQ = Math.round(zona.width * 0.34);
    const qm = FONT_METRICS.alfa_slab;
    piezas.push(
      `<text x="${(zona.x - fsQ * 0.06).toFixed(1)}" y="${(blockTop + fsQ * 0.18).toFixed(1)}" font-family="'${qm.familia}'" font-weight="${qm.peso}" font-size="${fsQ}" fill="${colorAcento}" opacity="0.35">&#8220;</text>`,
    );
  }

  // Líneas del titular.
  let cursorY = blockTop;
  for (const linea of layout.lineas) {
    const fs = linea.fontSize;
    const altoLinea = fs * estilo.lineHeight;
    const baseline = cursorY + altoLinea / 2 + fs * 0.36;
    const xInicio = zona.align === "center" ? blockCenterX - linea.ancho / 2 : zona.x;
    const palabras = posicionarPalabras(linea, estilo, acentos, xInicio);
    piezas.push(renderLinea(palabras, baseline, estilo, fs, colorAcento, altoLinea, cursorY));
    cursorY += altoLinea + gapChips;
  }

  // Scrim: garantiza legibilidad sin tapar la escena.
  const scrimSvg = renderScrim(opts.scrim, canvas, paleta.scrim, blockTop, altoBloque);

  const svg = `<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs.join("")}</defs>
  ${scrimSvg}
  <g transform="rotate(${estilo.inclinacion}, ${blockCenterX.toFixed(1)}, ${blockCenterY.toFixed(1)})">
    ${piezas.join("\n    ")}
  </g>
</svg>`;
  return Buffer.from(svg);
}

/** Todas las capas de UNA línea según el efecto del estilo. */
function renderLinea(
  palabras: PalabraPos[],
  baseline: number,
  estilo: EstiloTitular,
  fs: number,
  colorAcento: string,
  altoLinea: number,
  lineTop: number,
): string {
  const capas: string[] = [];
  const ef = estilo.efecto;
  const acentoEnCaja = estilo.acento.modo === "caja";
  // Las palabras sobre placa NO reciben contorno/sombra/extrusión: se dibujan
  // limpias sobre su placa (si pasaran por las capas de efecto quedarían como
  // un bloque oscuro ilegible encima del color de acento).
  const palabrasEfecto = acentoEnCaja ? palabras.filter(p => !p.esAcento) : palabras;
  const palabrasCaja = acentoEnCaja ? palabras.filter(p => p.esAcento) : [];
  const fillPalabra = (p: PalabraPos): string => {
    if (!p.esAcento) return ef.tipo === "gradiente" ? "url(#gradTitular)" : estilo.colorTexto;
    return colorAcento;
  };

  // Placas de acento + su palabra limpia (alineadas a la altura de mayúsculas).
  if (palabrasCaja.length > 0) {
    const cap = FONT_METRICS[estilo.fuenteId].cap;
    for (const p of palabrasCaja) {
      const padX = fs * 0.14;
      const padY = fs * 0.11;
      const y = baseline - fs * cap - padY;
      const h = fs * (cap + 0.04) + padY * 2;
      capas.push(
        `<g transform="rotate(-2, ${(p.x + p.ancho / 2).toFixed(1)}, ${(y + h / 2).toFixed(1)})"><rect x="${(p.x - padX).toFixed(1)}" y="${y.toFixed(1)}" width="${(p.ancho + padX * 2).toFixed(1)}" height="${h.toFixed(1)}" rx="${(fs * 0.08).toFixed(1)}" fill="${colorAcento}"/></g>`,
      );
      capas.push(capaTexto([p], baseline, estilo, fs, { fill: "#111111" }));
    }
  }

  // Placa de línea completa (estilo chips).
  if (ef.tipo === "chips" && palabras.length > 0) {
    const primero = palabras[0]!;
    const ultimo = palabras[palabras.length - 1]!;
    const padX = fs * 0.28;
    const x = primero.x - padX;
    const w = ultimo.x + ultimo.ancho + padX - x;
    const y = lineTop + altoLinea * 0.02;
    capas.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(altoLinea * 0.96).toFixed(1)}" rx="${(fs * 0.18).toFixed(1)}" fill="${ef.chipFondo}"/>`,
    );
  }

  switch (ef.tipo) {
    case "relleno": {
      if (ef.sombra) {
        capas.push(capaTexto(palabrasEfecto, baseline, estilo, fs, { dx: ef.sombra.dx * fs, dy: ef.sombra.dy * fs, fill: ef.sombra.color }));
      }
      capas.push(capaTexto(palabrasEfecto, baseline, estilo, fs, { fill: fillPalabra }));
      break;
    }
    case "chips": {
      capas.push(capaTexto(palabrasEfecto, baseline, estilo, fs, { fill: fillPalabra }));
      break;
    }
    case "contorno": {
      const grosor = ef.grosor * fs;
      if (ef.sombra) {
        capas.push(
          capaTexto(palabrasEfecto, baseline, estilo, fs, {
            dx: ef.sombra.dx * fs,
            dy: ef.sombra.dy * fs,
            fill: ef.sombra.color,
            stroke: { color: ef.sombra.color, width: grosor },
          }),
        );
      }
      capas.push(capaTexto(palabrasEfecto, baseline, estilo, fs, { fill: ef.colorContorno, stroke: { color: ef.colorContorno, width: grosor } }));
      capas.push(capaTexto(palabrasEfecto, baseline, estilo, fs, { fill: fillPalabra }));
      break;
    }
    case "extrusion": {
      const grosor = ef.grosor * fs;
      for (let i = ef.profundidad; i >= 1; i--) {
        const off = ef.paso * fs * i;
        capas.push(
          capaTexto(palabrasEfecto, baseline, estilo, fs, {
            dx: off,
            dy: off,
            fill: ef.colorExtrusion,
            stroke: { color: ef.colorExtrusion, width: grosor },
          }),
        );
      }
      capas.push(capaTexto(palabrasEfecto, baseline, estilo, fs, { fill: ef.colorContorno, stroke: { color: ef.colorContorno, width: grosor * 1.6 } }));
      capas.push(capaTexto(palabrasEfecto, baseline, estilo, fs, { fill: fillPalabra }));
      break;
    }
    case "neon": {
      const glow = ef.colorGlow === "auto" ? colorAcento : ef.colorGlow;
      for (const capa of ef.capas) {
        capas.push(
          capaTexto(palabrasEfecto, baseline, estilo, fs, {
            fill: "none",
            soloContorno: true,
            stroke: { color: glow, width: capa.grosor * fs },
            opacidad: capa.opacidad,
          }),
        );
      }
      capas.push(capaTexto(palabrasEfecto, baseline, estilo, fs, { fill: fillPalabra }));
      break;
    }
    case "gradiente": {
      const grosor = ef.grosor * fs;
      if (ef.sombra) {
        capas.push(
          capaTexto(palabrasEfecto, baseline, estilo, fs, {
            dx: ef.sombra.dx * fs,
            dy: ef.sombra.dy * fs,
            fill: ef.sombra.color,
            stroke: { color: ef.sombra.color, width: grosor },
          }),
        );
      }
      capas.push(capaTexto(palabrasEfecto, baseline, estilo, fs, { fill: ef.colorContorno, stroke: { color: ef.colorContorno, width: grosor } }));
      capas.push(capaTexto(palabrasEfecto, baseline, estilo, fs, { fill: fillPalabra }));
      break;
    }
  }

  return capas.join("\n    ");
}

/** Scrim degradado del lado indicado (nunca franja sólida). */
function renderScrim(
  lado: ScrimLado,
  canvas: { width: number; height: number },
  color: { r: number; g: number; b: number },
  blockTop: number,
  altoBloque: number,
): string {
  if (lado === "ninguno") return "";
  const { r, g, b } = color;
  const stops = (o1: number, o2: number, o3: number) =>
    `<stop offset="0" stop-color="rgb(${r},${g},${b})" stop-opacity="${o1}"/><stop offset="0.55" stop-color="rgb(${r},${g},${b})" stop-opacity="${o2}"/><stop offset="1" stop-color="rgb(${r},${g},${b})" stop-opacity="${o3}"/>`;

  switch (lado) {
    case "izquierda": {
      const w = Math.round(canvas.width * 0.58);
      return `<defs><linearGradient id="scrimTit" x1="0" y1="0" x2="1" y2="0">${stops(0.95, 0.78, 0)}</linearGradient></defs><rect x="0" y="0" width="${w}" height="${canvas.height}" fill="url(#scrimTit)"/>`;
    }
    case "derecha": {
      const w = Math.round(canvas.width * 0.58);
      return `<defs><linearGradient id="scrimTit" x1="1" y1="0" x2="0" y2="0">${stops(0.95, 0.78, 0)}</linearGradient></defs><rect x="${canvas.width - w}" y="0" width="${w}" height="${canvas.height}" fill="url(#scrimTit)"/>`;
    }
    case "superior": {
      const h = Math.max(Math.round(canvas.height * 0.33), Math.round(blockTop + altoBloque + 120));
      return `<defs><linearGradient id="scrimTit" x1="0" y1="0" x2="0" y2="1">${stops(0.94, 0.82, 0)}</linearGradient></defs><rect x="0" y="0" width="${canvas.width}" height="${h}" fill="url(#scrimTit)"/>`;
    }
    case "inferior": {
      const alto = Math.max(Math.round(canvas.height * 0.42), Math.round(canvas.height - blockTop + 90));
      return `<defs><linearGradient id="scrimTit" x1="0" y1="1" x2="0" y2="0">${stops(0.95, 0.8, 0)}</linearGradient></defs><rect x="0" y="${canvas.height - alto}" width="${canvas.width}" height="${alto}" fill="url(#scrimTit)"/>`;
    }
  }
}
