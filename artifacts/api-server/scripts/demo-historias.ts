// Renderiza una SERIE de historias de demostración SIN llamar a la IA de
// imágenes: usa un fondo sintético con el look de marca y compone el texto con
// EL MISMO compositor que producción (lib/story-render). Sirve para revisar de
// un vistazo la variedad de composición y que nada se pise entre zonas.
//
// Importante: aquí ya NO hay una copia del compositor. Antes sí la había, y una
// copia que se desincroniza es peor que no tener demo: enseña un render que no
// es el que la app genera.
//
// Uso: cd artifacts/api-server && npx tsx scripts/demo-historias.ts [dirSalida]
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { setupFonts } from "../src/lib/fonts";
import { componerHistoria } from "../src/lib/story-render";
import {
  HIST_WIDTH,
  HIST_HEIGHT,
  obtenerFormatoHistoria,
  obtenerLayoutHistoria,
  arcoParaFrames,
} from "../src/lib/story-formats";
import type { FrameGuion } from "../src/lib/story-script";

/** Fondo sintético con el look de las historias (slate + halo naranja). */
function fondoHistoria(escena: { desde: number; hasta: number }): Buffer {
  const cy = (escena.desde + escena.hasta) / 2;
  return Buffer.from(`<svg width="${HIST_WIDTH}" height="${HIST_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0" stop-color="#1E293B"/><stop offset="1" stop-color="#0F172A"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#E86A30" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#E86A30" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${HIST_WIDTH}" height="${HIST_HEIGHT}" fill="url(#bg)"/>
  <circle cx="${HIST_WIDTH / 2}" cy="${cy}" r="${Math.min(420, (escena.hasta - escena.desde) / 2)}" fill="url(#halo)"/>
  <rect x="${HIST_WIDTH / 2 - 150}" y="${cy - 190}" width="300" height="380" rx="40" fill="#E86A30" fill-opacity="0.55"/>
  <text x="${HIST_WIDTH / 2}" y="${cy + 20}" text-anchor="middle" font-family="sans-serif" font-size="44" fill="#0F172A" fill-opacity="0.6">WEBI</text>
</svg>`);
}

// Guion de ejemplo con la forma que devuelve el modelo, incluidos los casos que
// antes reventaban el ajuste: raya larga, puntos suspensivos y comillas
// tipográficas (no estaban calibrados y se medían más angostos de lo que son).
const GUION_DEMO: Array<Partial<FrameGuion>> = [
  {
    copy_principal: "Ana horneaba a las cinco de la mañana",
    sub_copy: "Su panadería en Ñuñoa llevaba seis años abierta.",
  },
  { copy_principal: "Los pedidos llegaban de noche" },
  {
    copy_principal: "Pedidos sin responder cada mes",
    sub_copy: "Nadie contestaba después de las nueve.",
    dato: "40",
    dato_label: "pedidos perdidos al mes",
  },
  {
    copy_principal: "Puso el chat a responder —también de noche—",
    sub_copy: "La libreta de la caja dejó de llenarse de nombres sueltos…",
  },
  {
    copy_principal: "Hoy despierta con la agenda llena",
    sub_copy: "Mismo horno, misma Ana, cero pedidos perdidos.",
    cta: "Cuéntanos tu caso",
    hashtags: "#WebMakerLatam #PymesLatam #Chatbot",
  },
];

async function main() {
  setupFonts();
  const outDir = process.argv[2] ?? path.join(process.cwd(), "public", "uploads", "historias-demo");
  await mkdir(outDir, { recursive: true });

  const formato = obtenerFormatoHistoria("caso_real")!;
  const arco = arcoParaFrames(formato, 5);

  for (const [i, paso] of arco.entries()) {
    const layout = obtenerLayoutHistoria(paso.layoutId)!;
    const frame: FrameGuion = {
      numero: i + 1,
      paso: paso.paso,
      layoutId: layout.id,
      copy_principal: "",
      sub_copy: "",
      dato: "",
      dato_label: "",
      cta: "",
      hashtags: "",
      prompt_visual: "",
      ...GUION_DEMO[i],
    };

    const comp = componerHistoria(frame, layout, {
      frameInfo: { numero: i + 1, total: arco.length },
      estiloTitularId: "impacto",
    });
    const capas: sharp.OverlayOptions[] = [{ input: Buffer.from(comp.svg), top: 0, left: 0 }];
    if (comp.overlayTitular) capas.push({ input: comp.overlayTitular, top: 0, left: 0 });

    const png = await sharp(fondoHistoria(layout.zonaEscena)).composite(capas).png().toBuffer();
    const archivo = `historia-${i + 1}-${paso.paso}-${layout.id}.png`;
    await writeFile(path.join(outDir, archivo), png);
    console.log(`→ ${archivo}`);
  }
  console.log(`\nRenders en ${outDir}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
