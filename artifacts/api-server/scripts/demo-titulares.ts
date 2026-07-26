// Renderiza titulares de demostración con el motor de tipografía de impacto
// SIN llamadas de IA: compone el overlay de cada plantilla/estilo sobre un
// fondo sintético de estudio, para revisar visualmente tipografías, efectos,
// ajuste por línea, placas, número gigante y comillas.
//
// Uso: cd artifacts/api-server && npx tsx scripts/demo-titulares.ts [dirSalida]
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { setupFonts } from "../src/lib/fonts";
import { DIRECCIONES_PORTADA } from "../src/lib/cover-style";
import { construirOverlayTitular, obtenerEstiloTitular } from "../src/lib/title-style";
import { obtenerPlantilla } from "../src/lib/thumbnail-templates";

/** Fondo sintético tipo "estudio en penumbra" (gradiente + viñeta). */
function fondoEstudio(w: number, h: number, colorLuz: string): Buffer {
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="foco" cx="0.62" cy="0.45" r="0.75">
      <stop offset="0" stop-color="${colorLuz}" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="${colorLuz}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#0B0B0E" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#101012"/>
      <stop offset="1" stop-color="#26262B"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#base)"/>
  <rect width="${w}" height="${h}" fill="url(#foco)"/>
</svg>`);
}

const DEMOS: Array<{
  archivo: string;
  formato: "youtube" | "vertical";
  plantillaId: string;
  estiloId: string;
  titulo: string;
}> = [
  { archivo: "yt-impacto-lateral.png", formato: "youtube", plantillaId: "yt_lateral_izquierda", estiloId: "impacto", titulo: "3 errores que matan tus ventas" },
  { archivo: "yt-fuego-espejo.png", formato: "youtube", plantillaId: "yt_lateral_derecha", estiloId: "fuego", titulo: "Testimonio de su nueva página web a Emily" },
  { archivo: "yt-impacto-cara.png", formato: "youtube", plantillaId: "yt_cara_gigante", estiloId: "impacto", titulo: "No lo puedo creer" },
  { archivo: "yt-fuego-inferior.png", formato: "youtube", plantillaId: "yt_impacto_inferior", estiloId: "fuego", titulo: "La verdad del marketing digital" },
  { archivo: "yt-placas-testimonio.png", formato: "youtube", plantillaId: "yt_testimonio", estiloId: "placas", titulo: "Testimonio abogada Mily" },
  { archivo: "yt-titan-numero.png", formato: "youtube", plantillaId: "yt_top_numero", estiloId: "titan", titulo: "5 errores que matan tus ventas" },
  { archivo: "yt-neon-lateral.png", formato: "youtube", plantillaId: "yt_lateral_izquierda", estiloId: "neon", titulo: "Cómo vender más rápido" },
  { archivo: "yt-slab3d-lateral.png", formato: "youtube", plantillaId: "yt_lateral_izquierda", estiloId: "slab_3d", titulo: "El secreto del éxito" },
  { archivo: "v-impacto-superior.png", formato: "vertical", plantillaId: "v_titular_superior", estiloId: "impacto", titulo: "3 errores que matan tus ventas" },
  { archivo: "v-fuego-inferior.png", formato: "vertical", plantillaId: "v_titular_inferior", estiloId: "fuego", titulo: "Crea tu página web en 7 días" },
];

async function main() {
  setupFonts();
  const sharp = (await import("sharp")).default;
  const outDir = process.argv[2] ?? path.join(process.cwd(), "public", "uploads", "covers", "titulares");
  await mkdir(outDir, { recursive: true });

  for (const demo of DEMOS) {
    const canvas = demo.formato === "youtube" ? { width: 1280, height: 720 } : { width: 1080, height: 1920 };
    const plantilla = obtenerPlantilla(demo.plantillaId)!;
    const estilo = obtenerEstiloTitular(demo.estiloId)!;
    const dir = DIRECCIONES_PORTADA[0]!;
    const overlay = construirOverlayTitular({
      canvas,
      zona: plantilla.zona,
      scrim: plantilla.scrim,
      titulo: demo.titulo,
      estilo,
      paleta: { colorAcento: dir.titular.colorAcento, scrim: dir.titular.scrim },
      extras: plantilla.extras,
    });
    const png = await sharp(fondoEstudio(canvas.width, canvas.height, "#B45309"))
      .composite([{ input: overlay, top: 0, left: 0 }])
      .png()
      .toBuffer();
    await writeFile(path.join(outDir, demo.archivo), png);
    console.log(`→ ${demo.archivo} (${plantilla.id} + ${estilo.id})`);
  }
  console.log(`\nRenders en ${outDir}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
