// Calibra las métricas reales de las fuentes de titulares midiendo el avance
// de cada carácter con el MISMO rasterizador que produce las portadas
// (librsvg vía Sharp). El resultado se escribe en src/lib/font-metrics.generated.ts
// y permite que el layout de titulares ajuste cada línea al ancho exacto de su
// columna (adiós a los anchos estimados "a ojo" por ratio promedio).
//
// Uso: cd artifacts/api-server && npx tsx scripts/calibrate-font-metrics.ts
//
// Técnica: el ancho de tinta de "X<c>X" menos el de "XX" es el avance de <c>
// (los bearings de las X de los bordes se cancelan; el kerning entre mayúsculas
// de fuentes display es ~0). El espacio se mide con "X X" vs "XX".
import { writeFile } from "fs/promises";
import path from "path";
import { setupFonts } from "../src/lib/fonts";

const FONT_SIZE = 200;
const CHARSET = `ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÜÑabcdefghijklmnopqrstuvwxyzáéíóúüñ0123456789¿?¡!:;,."'()%$#&@+-*/º°`;

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

  async function inkBox(familia: string, peso: number, texto: string): Promise<{ w: number; h: number }> {
    const svg = `<svg width="2400" height="900" xmlns="http://www.w3.org/2000/svg">
  <text x="400" y="600" font-family="'${familia}'" font-weight="${peso}" font-size="${FONT_SIZE}" fill="#fff">${escapeXml(texto)}</text>
</svg>`;
    const { info } = await sharp(Buffer.from(svg))
      .trim({ threshold: 8 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { w: info.width, h: info.height };
  }

  const bloques: string[] = [];
  for (const f of FUENTES) {
    const base = (await inkBox(f.familia, f.peso, "XX")).w;
    // Sanidad: si la fuente no está instalada, librsvg cae a DejaVu y las
    // métricas mienten. "XX" en DejaVu Bold ≈ 0.70/char; ninguna de nuestras
    // display baja de eso salvo condensadas — comparamos contra la caja de "H".
    const capH = (await inkBox(f.familia, f.peso, "H")).h;
    const chars: Record<string, number> = {};
    for (const c of CHARSET) {
      const w = (await inkBox(f.familia, f.peso, `X${c}X`)).w;
      chars[c] = Math.max(0, Number(((w - base) / FONT_SIZE).toFixed(4)));
    }
    const space = Number((((await inkBox(f.familia, f.peso, "X X")).w - base) / FONT_SIZE).toFixed(4));
    const valores = Object.values(chars).filter(v => v > 0);
    const promedio = Number((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(4));
    console.log(`${f.id}: cap=${(capH / FONT_SIZE).toFixed(3)} espacio=${space} promedio=${promedio}`);
    bloques.push(`  ${f.id}: {
    familia: ${JSON.stringify(f.familia)},
    peso: ${f.peso},
    cap: ${(capH / FONT_SIZE).toFixed(4)},
    espacio: ${space},
    promedio: ${promedio},
    avances: ${JSON.stringify(chars)},
  }`);
  }

  const contenido = `// GENERADO por scripts/calibrate-font-metrics.ts — NO editar a mano.
// Avance horizontal real de cada carácter (fracción del font-size), medido
// rasterizando con librsvg/fontconfig — el mismo motor que compone las
// portadas. \`cap\` es la altura de la H mayúscula; \`espacio\` el avance del
// espacio; \`promedio\` el fallback para caracteres no calibrados.

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
