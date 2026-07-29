// Las fotos de las ranuras van dentro de la pieza, así que un fallo aquí no
// se ve como un error: se ve como una pieza publicada sin la foto que alguien
// subió. Por eso lo que se comprueba es que la foto llegue de verdad al SVG y
// que las que no se puedan usar se rechacen diciendo cuál.

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  prepararFoto,
  prepararFotos,
  imagenRecortada,
  veloTexto,
  LADO_MAX,
  type RanuraFoto,
} from "./foto-ranura.js";

const RANURAS: RanuraFoto[] = [
  { id: "antes", etiqueta: "Foto del antes", ayuda: "" },
  { id: "despues", etiqueta: "Foto del después", ayuda: "" },
];

/** Una foto real, con la forma que se pida. */
async function fotoBase64(ancho: number, alto: number): Promise<string> {
  const buf = await sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 80, b: 40 } },
  }).jpeg().toBuffer();
  return buf.toString("base64");
}

describe("prepararFoto", () => {
  it("recorta a la proporción del hueco en vez de deformar la foto", async () => {
    // Una foto vertical en un hueco cuadrado: si se encajara entera dejaría
    // franjas a los lados, que se lee como un error de maquetación.
    const p = await prepararFoto(await fotoBase64(600, 1200), 1);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.ancho).toBe(p.alto);
    const meta = await sharp(Buffer.from(p.dataUri.split(",")[1]!, "base64")).metadata();
    expect(meta.width).toBe(p.ancho);
    expect(meta.height).toBe(p.alto);
  });

  it("respeta una proporción apaisada", async () => {
    const p = await prepararFoto(await fotoBase64(400, 400), 2);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.ancho).toBe(LADO_MAX);
    expect(p.alto).toBe(Math.round(LADO_MAX / 2));
  });

  // La foto viaja incrustada en el SVG: su peso es el peso del SVG, y el
  // rasterizador tiene que tragárselo entero antes de dibujar nada.
  it("reduce una foto enorme en vez de incrustarla tal cual", async () => {
    const grande = await fotoBase64(3000, 3000);
    const p = await prepararFoto(grande, 1);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.dataUri.length).toBeLessThan(grande.length);
    expect(p.ancho).toBeLessThanOrEqual(LADO_MAX);
  });

  it("una proporción absurda no revienta el cálculo", async () => {
    for (const ratio of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const p = await prepararFoto(await fotoBase64(200, 200), ratio);
      expect(p.ok, `ratio ${ratio}`).toBe(true);
      if (p.ok) {
        expect(Number.isFinite(p.ancho) && p.ancho > 0).toBe(true);
        expect(Number.isFinite(p.alto) && p.alto > 0).toBe(true);
      }
    }
  });

  it("rechaza lo que no es una imagen", async () => {
    const p = await prepararFoto(Buffer.from("esto no es una foto").toString("base64"), 1);
    expect(p.ok).toBe(false);
  });
});

describe("prepararFotos", () => {
  it("una ranura vacía no es un error: las fotos son opcionales", async () => {
    const r = await prepararFotos({ antes: await fotoBase64(300, 300) }, RANURAS, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fotos.has("antes")).toBe(true);
    expect(r.fotos.has("despues")).toBe(false);
  });

  it("sin fotos devuelve un mapa vacío y no falla", async () => {
    const r = await prepararFotos(undefined, RANURAS, 1);
    expect(r.ok && r.fotos.size === 0).toBe(true);
  });

  it("ignora ranuras que el formato no declara", async () => {
    // Si se colara, la foto se prepararía para nada: ningún bloque la busca.
    const r = await prepararFotos({ inventada: await fotoBase64(300, 300) }, RANURAS, 1);
    expect(r.ok && r.fotos.size === 0).toBe(true);
  });

  // Fallar en silencio aquí publicaría la pieza sin la foto, y quien la subió
  // no tendría forma de saber por qué no salió.
  it("una foto rota dice QUÉ ranura falló", async () => {
    const r = await prepararFotos({ despues: "no-es-base64-valido!!" }, RANURAS, 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Foto del después");
  });
});

describe("incrustado en el SVG", () => {
  it("la imagen recorta con su propia forma y recorta en vez de deformar", () => {
    const svg = imagenRecortada("data:image/jpeg;base64,AAA", "hueco1", 10, 20, 100, 50, 8);
    expect(svg).toContain('id="hueco1"');
    expect(svg).toContain('clip-path="url(#hueco1)"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  // Dos recortes con el mismo id hacen que el segundo use la forma del
  // primero: la foto sale cortada donde no es, y en un duelo son dos huecos.
  it("dos huecos distintos no comparten id", () => {
    const a = imagenRecortada("data:image/jpeg;base64,AAA", "izquierda", 0, 0, 10, 10, 4);
    const b = imagenRecortada("data:image/jpeg;base64,BBB", "derecha", 20, 0, 10, 10, 4);
    expect(a).not.toContain('id="derecha"');
    expect(b).not.toContain('id="izquierda"');
  });

  it("el velo oscurece hacia abajo, que es donde va el texto", () => {
    const svg = veloTexto("velo1", 0, 0, 100, 100, 8);
    const opacidades = [...svg.matchAll(/stop-opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(opacidades.length).toBeGreaterThanOrEqual(2);
    expect(opacidades[opacidades.length - 1]).toBeGreaterThan(opacidades[0]!);
  });
});
