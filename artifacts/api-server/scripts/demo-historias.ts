// Renderiza una SERIE de historias de demostración SIN llamar a la IA de
// imágenes: usa un fondo sintético con el look de marca y compone el texto
// con los layouts reales de story-formats. Sirve para revisar de un vistazo
// la variedad de composición y que nada se pise entre zonas.
//
// Uso: cd artifacts/api-server && npx tsx scripts/demo-historias.ts [dirSalida]
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { setupFonts } from "../src/lib/fonts";
import {
  construirOverlayTitular,
  obtenerEstiloTitular,
  medirTexto,
} from "../src/lib/title-style";
import { FONT_METRICS } from "../src/lib/font-metrics.generated";
import {
  HIST_WIDTH,
  HIST_HEIGHT,
  obtenerFormatoHistoria,
  obtenerLayoutHistoria,
  arcoParaFrames,
  type LayoutHistoria,
} from "../src/lib/story-formats";
import type { FrameGuion } from "../src/lib/story-script";

const PALETA = { colorAcento: "#FB923C", scrim: { r: 15, g: 23, b: 42 } };

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

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/** Versión reducida del compositor real, suficiente para revisar layouts. */
function overlayTexto(frame: FrameGuion, layout: LayoutHistoria, numero: number, total: number): Buffer {
  const w = HIST_WIDTH, h = HIST_HEIGHT;
  const piezas: string[] = [];

  const sup = layout.zonasDespejadas.find(z => z.desde === 0);
  const inf = layout.zonasDespejadas.find(z => z.hasta >= h);
  if ((layout.scrim === "superior" || layout.scrim === "ambos") && sup) {
    piezas.push(`<rect x="0" y="0" width="${w}" height="${sup.hasta + 60}" fill="url(#topfade)"/>`);
  }
  if ((layout.scrim === "inferior" || layout.scrim === "ambos") && inf) {
    piezas.push(`<rect x="0" y="${inf.desde - 100}" width="${w}" height="${h - inf.desde + 100}" fill="url(#botfade)"/>`);
  }

  if (layout.bloques.includes("comillas")) {
    const q = FONT_METRICS.alfa_slab;
    const fsQ = Math.round(w * 0.26);
    piezas.push(`<text x="${layout.zonaTitular.x - fsQ * 0.05}" y="${layout.zonaTitular.y + fsQ * 0.2}" font-family="'${q.familia}'" font-weight="${q.peso}" font-size="${fsQ}" fill="${PALETA.colorAcento}" fill-opacity="0.32">&#8220;</text>`);
  }

  if (layout.bloques.includes("dato_gigante") && frame.dato && layout.zonaDato) {
    const m = FONT_METRICS.anton;
    const alto = layout.zonaDato.alto;
    const fsNum = Math.min(alto * 0.78, (w * 0.8) / Math.max(0.4, medirTexto(frame.dato, "anton")));
    const anchoNum = medirTexto(frame.dato, "anton") * fsNum;
    const baseNum = layout.zonaDato.y + alto * 0.72;
    const xNum = (w - anchoNum) / 2;
    piezas.push(`<text x="${xNum.toFixed(1)}" y="${baseNum.toFixed(1)}" font-family="'${m.familia}'" font-weight="${m.peso}" font-size="${fsNum.toFixed(0)}" fill="${PALETA.colorAcento}">${escapeXml(frame.dato)}</text>`);
    if (frame.dato_label) {
      piezas.push(`<text x="${w / 2}" y="${layout.zonaDato.y + alto + 14 + 40 * 0.8}" text-anchor="middle" font-family="Inter,sans-serif" font-weight="600" font-size="40" fill="#f1f5f9">${escapeXml(frame.dato_label)}</text>`);
    }
  }

  if (frame.sub_copy && layout.subCopyCenterY !== null && layout.bloques.includes("subcopy")) {
    piezas.push(`<text x="${w / 2}" y="${layout.subCopyCenterY}" text-anchor="middle" font-family="Inter,sans-serif" font-weight="600" font-size="44" fill="#f1f5f9">${escapeXml(frame.sub_copy.slice(0, 46))}</text>`);
  }

  if (frame.cta && layout.bloques.includes("cta")) {
    const bw = 620, bh = 96;
    piezas.push(`<rect x="${(w - bw) / 2}" y="${layout.ctaCenterY - bh / 2}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="#E86A30"/>`);
    piezas.push(`<text x="${w / 2}" y="${layout.ctaCenterY + 15}" text-anchor="middle" font-family="Inter,sans-serif" font-weight="700" font-size="42" fill="#fff">${escapeXml(frame.cta)}</text>`);
  }

  if (frame.hashtags && layout.bloques.includes("hashtags")) {
    piezas.push(`<text x="${w / 2}" y="${layout.hashtagsCenterY}" text-anchor="middle" font-family="Inter,sans-serif" font-weight="500" font-size="30" fill="#fb923c">${escapeXml(frame.hashtags)}</text>`);
  }

  if (layout.bloques.includes("contador") && total > 1) {
    piezas.push(`<rect x="${w - 160}" y="40" width="120" height="56" rx="28" fill="#0F172A" fill-opacity="0.55"/>`);
    piezas.push(`<text x="${w - 100}" y="78" text-anchor="middle" font-family="Inter,sans-serif" font-weight="700" font-size="30" fill="#fff" fill-opacity="0.85">${numero}/${total}</text>`);
  }

  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="topfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F172A" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="botfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F172A" stop-opacity="0"/>
      <stop offset="40%" stop-color="#0F172A" stop-opacity="0.97"/>
      <stop offset="100%" stop-color="#0F172A" stop-opacity="1"/>
    </linearGradient>
  </defs>
  ${piezas.join("\n  ")}
</svg>`);
}

// Guion de ejemplo: una serie de 5 frames del formato "caso real".
const GUION_DEMO: Array<Omit<FrameGuion, "layoutId" | "paso">> = [
  { numero: 1, copy_principal: "Ana horneaba a las 5 de la mañana", sub_copy: "Su panadería en Ñuñoa llevaba seis años abierta.", dato: "", dato_label: "", cta: "", hashtags: "", prompt_visual: "" },
  { numero: 2, copy_principal: "Los pedidos llegaban de noche", sub_copy: "", dato: "", dato_label: "", cta: "", hashtags: "", prompt_visual: "" },
  { numero: 3, copy_principal: "pedidos sin responder cada mes", sub_copy: "Nadie contestaba después de las nueve.", dato: "40", dato_label: "pedidos perdidos al mes", cta: "", hashtags: "", prompt_visual: "" },
  { numero: 4, copy_principal: "Puso a responder un bot mientras dormía", sub_copy: "Configurarlo tomó una tarde.", dato: "", dato_label: "", cta: "", hashtags: "", prompt_visual: "" },
  { numero: 5, copy_principal: "Hoy despierta con la agenda llena", sub_copy: "Mismo horno, misma Ana, cero pedidos perdidos.", dato: "", dato_label: "", cta: "Cuéntanos tu caso", hashtags: "#WebMakerLatam #PymesLatam #Chatbot", prompt_visual: "" },
];

async function main() {
  setupFonts();
  const sharp = (await import("sharp")).default;
  const outDir = process.argv[2] ?? path.join(process.cwd(), "public", "uploads", "historias-demo");
  await mkdir(outDir, { recursive: true });

  const formato = obtenerFormatoHistoria("caso_real")!;
  const arco = arcoParaFrames(formato, 5);
  const estilo = obtenerEstiloTitular("impacto")!;

  for (const [i, paso] of arco.entries()) {
    const layout = obtenerLayoutHistoria(paso.layoutId)!;
    const base = GUION_DEMO[i]!;
    const frame: FrameGuion = { ...base, paso: paso.paso, layoutId: layout.id };

    const png = await sharp(fondoHistoria(layout.zonaEscena))
      .composite([
        { input: overlayTexto(frame, layout, i + 1, arco.length), top: 0, left: 0 },
        {
          input: construirOverlayTitular({
            canvas: { width: HIST_WIDTH, height: HIST_HEIGHT },
            zona: layout.zonaTitular,
            scrim: "ninguno",
            titulo: frame.copy_principal,
            estilo,
            paleta: PALETA,
          }),
          top: 0, left: 0,
        },
      ])
      .png()
      .toBuffer();

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
