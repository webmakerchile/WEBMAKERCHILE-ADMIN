// Genera portadas de demostración con el nuevo sistema de direcciones de arte.
// Uso: cd artifacts/api-server && npx tsx scripts/demo-portadas.ts
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { setupFonts } from "../src/lib/fonts";
import { prepararPortada, generateFoxIllustration, composeVerticalCover } from "../src/lib/cover-style";

const DEMOS = [
  {
    archivo: "demo-1.png",
    titulo: "3 errores que matan tus ventas online",
    tema: "errores comunes al vender online que espantan a los clientes",
  },
  {
    archivo: "demo-2.png",
    titulo: "El secreto del marketing que nadie te cuenta",
    tema: "estrategia secreta de marketing digital para pymes",
  },
  {
    archivo: "demo-3.png",
    titulo: "Crea tu página web en 7 días",
    tema: "tutorial paso a paso para crear una página web profesional rápido",
  },
];

async function main() {
  setupFonts();
  const outDir = path.join(process.cwd(), "public", "uploads", "covers");
  await mkdir(outDir, { recursive: true });
  for (const demo of DEMOS) {
    const t0 = Date.now();
    const { direccion, pose, prompt } = prepararPortada(`${demo.titulo}. ${demo.tema}`);
    console.log(`→ ${demo.archivo}: dirección=${direccion.id}, pose=${pose.id}`);
    const ilustracion = await generateFoxIllustration(prompt);
    const final = await composeVerticalCover(ilustracion, demo.titulo, direccion);
    await writeFile(path.join(outDir, demo.archivo), final);
    console.log(`  listo en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
