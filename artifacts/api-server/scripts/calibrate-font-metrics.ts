// Calibra las métricas reales de las fuentes de titulares midiendo el avance
// de cada carácter con el MISMO rasterizador que produce las portadas
// (librsvg vía Sharp). El resultado se escribe en src/lib/font-metrics.generated.ts
// y permite que el layout de titulares ajuste cada línea al ancho exacto de su
// columna (adiós a los anchos estimados "a ojo" por ratio promedio).
//
// Uso: cd artifacts/api-server && npx tsx scripts/calibrate-font-metrics.ts
//
// Técnica: el avance de <c> es el ancho de tinta de "cc" menos el de "c" (los
// bearings del glifo se cancelan y no queda ningún par de letras distintas que
// pueda kernear). El espacio se mide con "X X" vs "XX".
//
// La versión anterior medía "X<c>X" menos "XX", y ESO estaba mal en las
// fuentes con tabla de kerning rica: Montserrat kernea los pares X-c y c-X, así
// que cada avance salía ~8px corto de 200 y el ancho de una línea entera se
// subestimaba un 5-6% — suficiente para que un titular se saliera de su zona.
// Anton y Archivo Black casi no kernean, por eso el error no se veía en ellas.
//
// Al final se valida contra frases reales: si la suma de avances subestima el
// ancho que de verdad se dibuja, el script FALLA en vez de escribir métricas
// mentirosas. Sobreestimar es seguro (el texto sale un pelo más chico);
// subestimar es lo que corta el texto.
import { writeFile } from "fs/promises";
import path from "path";
import { setupFonts } from "../src/lib/fonts";

const FONT_SIZE = 200;
// Colchón sobre cada avance medido. Un par de letras puede kernear en una
// combinación que ninguna sonda cubre (en passion_black, "AV" repetido se
// quedaba 3px corto de 1303), y quedarse corto CORTA TEXTO mientras que
// pasarse solo dibuja la línea un 1.5% más chica, que no se nota.
const MARGEN_SEGURIDAD = 0.015;
// Todo lo que puede acabar en un titular o un sub-copy escrito por el modelo.
// Los caracteres NO calibrados se medían con el promedio de la fuente (~0.6),
// pero una raya larga o unos puntos suspensivos miden ~1.0: el bloque se
// estimaba más angosto de lo que se dibujaba y se salía del lienzo.
const CHARSET =
  `ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖÇ` +
  `abcdefghijklmnopqrstuvwxyzáéíóúüñàèìòùâêîôûäëïöç` +
  `0123456789` +
  `¿?¡!:;,."'()[]{}%$#&@+-*/\\|_=<>~^\`º°ª` +
  `—–…«»“”‘’•·×÷€£¢§¶†‡‰′″≈≠≤≥→←↑↓✓✔★☆`;

interface FuenteACalibrar {
  id: string;
  familia: string;
  peso: number;
}

const FUENTES: FuenteACalibrar[] = [
  { id: "anton", familia: "Anton", peso: 400 },
  { id: "archivo_black", familia: "Archivo Black", peso: 400 },
  { id: "bebas", familia: "Bebas Neue", peso: 400 },
  { id: "alfa_slab", familia: "Alfa Slab One", peso: 400 },
  { id: "passion_black", familia: "Passion One", peso: 900 },
  { id: "oswald_bold", familia: "Oswald", peso: 700 },
  { id: "montserrat_black", familia: "Montserrat", peso: 900 },
  // Texto secundario de historias/carruseles (sub-copy, CTA, hashtags):
  // antes se pedía "Inter", que NO está empaquetada y caía en DejaVu Sans —
  // mucho más ancha que la estimación, así que el texto se salía del lienzo.
  { id: "montserrat_bold", familia: "Montserrat", peso: 700 },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function main() {
  setupFonts();
  const sharp = (await import("sharp")).default;

  async function inkBox(
    familia: string,
    peso: number,
    texto: string,
    ancho = 1200,
  ): Promise<{ w: number; h: number }> {
    // Lienzo ajustado al texto: la mayoría de las sondas son de 1-3 glifos y
    // rasterizar 2400x900 para cada una multiplicaba por cuatro el tiempo de
    // calibración sin aportar nada.
    const svg = `<svg width="${ancho}" height="600" xmlns="http://www.w3.org/2000/svg">
  <text x="200" y="420" font-family="'${familia}'" font-weight="${peso}" font-size="${FONT_SIZE}" fill="#fff">${escapeXml(texto)}</text>
</svg>`;
    const { info } = await sharp(Buffer.from(svg))
      .trim({ threshold: 8 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { w: info.width, h: info.height };
  }

  // Frases de control: mezcla de mayúsculas, minúsculas, acentos, cifras y
  // signos, más los casos extremos de kerning ("AV") y de bearings ("II").
  const FRASES_CONTROL = [
    "EXTRAORDINARIAMENTEDESPROPORCIONADO",
    "ANA PERDIA 40 PEDIDOS AL MES",
    "El horno seguia prendido y el telefono en silencio",
    "AVAVAVAVAV",
    "IIIIIIIIII",
    "72% de los mensajes, sin respuesta...",
    "AÑO TRAS AÑO: ¿QUE CAMBIO?",
  ];

  const bloques: string[] = [];
  const fallos: string[] = [];
  for (const f of FUENTES) {
    const base = (await inkBox(f.familia, f.peso, "XX")).w;
    // Sanidad: si la fuente no está instalada, librsvg cae a DejaVu y las
    // métricas mienten. "XX" en DejaVu Bold ≈ 0.70/char; ninguna de nuestras
    // display baja de eso salvo condensadas — comparamos contra la caja de "H".
    const capH = (await inkBox(f.familia, f.peso, "H")).h;
    const chars: Record<string, number> = {};
    for (const c of CHARSET) {
      // ink("cc") - ink("c") = avance de c, sin pares heterogéneos que kerneen.
      const doble = (await inkBox(f.familia, f.peso, `${c}${c}`)).w;
      const simple = (await inkBox(f.familia, f.peso, c)).w;
      const porRepeticion = doble - simple;
      // Red de seguridad para los glifos que kernean consigo mismos: se toma
      // el mayor de los dos estimadores, porque pasarse es seguro y quedarse
      // corto es lo que corta el texto.
      const porVecinos = (await inkBox(f.familia, f.peso, `X${c}X`)).w - base;
      const w = Math.max(porRepeticion, porVecinos) * (1 + MARGEN_SEGURIDAD);
      chars[c] = Math.max(0, Number((w / FONT_SIZE).toFixed(4)));
    }
    const space = Number(
      ((((await inkBox(f.familia, f.peso, "X X")).w - base) * (1 + MARGEN_SEGURIDAD)) / FONT_SIZE).toFixed(4),
    );
    const valores = Object.values(chars).filter(v => v > 0);
    const promedio = Number((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(4));

    // Validación: la suma de avances tiene que cubrir el ancho realmente
    // dibujado de cada frase de control.
    let peor = Infinity;
    for (const frase of FRASES_CONTROL) {
      const est = [...frase].reduce((a, c) => a + (c === " " ? space : chars[c] ?? promedio), 0) * FONT_SIZE;
      const real = (await inkBox(f.familia, f.peso, frase, 8000)).w;
      const holgura = (est - real) / real;
      if (holgura < peor) peor = holgura;
      if (est < real) fallos.push(`${f.id}: "${frase}" estimado ${est.toFixed(0)} < real ${real} px`);
    }
    console.log(
      `${f.id}: cap=${(capH / FONT_SIZE).toFixed(3)} espacio=${space} promedio=${promedio} holgura mínima=${(peor * 100).toFixed(1)}%`,
    );
    bloques.push(`  ${f.id}: {
    familia: ${JSON.stringify(f.familia)},
    peso: ${f.peso},
    cap: ${(capH / FONT_SIZE).toFixed(4)},
    espacio: ${space},
    promedio: ${promedio},
    avances: ${JSON.stringify(chars)},
  }`);
  }

  if (fallos.length > 0) {
    console.error("\nMÉTRICAS RECHAZADAS — subestiman el ancho real:");
    for (const f of fallos) console.error(`  · ${f}`);
    throw new Error("La calibración subestima el ancho: escribirla cortaría texto.");
  }

  const contenido = `// GENERADO por scripts/calibrate-font-metrics.ts — NO editar a mano.
// Avance horizontal real de cada carácter (fracción del font-size), medido
// rasterizando con librsvg/fontconfig — el mismo motor que compone las
// portadas. \`cap\` es la altura de la H mayúscula; \`espacio\` el avance del
// espacio; \`promedio\` el fallback para caracteres no calibrados.
//
// Verificado contra frases de control: la suma de avances SIEMPRE cubre el
// ancho que librsvg dibuja de verdad (ver la validación del script).

export interface MetricasFuente {
  familia: string;
  peso: number;
  cap: number;
  espacio: number;
  promedio: number;
  avances: Record<string, number>;
}

export const FONT_METRICS = {
${bloques.join(",\n")},
} as const satisfies Record<string, MetricasFuente>;

export type FuenteTitularId = keyof typeof FONT_METRICS;
`;
  const destino = path.join(process.cwd(), "src", "lib", "font-metrics.generated.ts");
  await writeFile(destino, contenido);
  console.log(`\nMétricas escritas en ${destino}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
