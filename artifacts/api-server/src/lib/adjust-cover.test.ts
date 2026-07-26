import { describe, it, expect } from "vitest";
import {
  buildAdjustPrompt,
  buildImproveAdjustPrompt,
  parseImprovedInstruction,
  prepararLienzoAjuste,
  recortarAjuste,
} from "./adjust-cover.js";

describe("buildAdjustPrompt", () => {
  it("exige mantener todo igual y proteger el titular según el formato", () => {
    const pv = buildAdjustPrompt("cambia la taza por un mate", "vertical");
    expect(pv).toContain("TODO LO DEMÁS QUEDA EXACTAMENTE IGUAL");
    expect(pv).toContain("esté donde esté en la imagen");
    expect(pv).toContain("cambia la taza por un mate");

    const py = buildAdjustPrompt("otro cambio", "youtube");
    expect(py).toContain("esté donde esté en la imagen");
    expect(py).toContain("PROHIBIDO tocarlo");
  });

  it("permite texto pedido dentro de objetos pero prohíbe otros textos nuevos", () => {
    const p = buildAdjustPrompt('la pizarra debe decir "Abogada Mily"', "vertical");
    expect(p).toContain("ortografía EXACTA");
    expect(p).toContain("no agregues ningún texto nuevo");
  });
});

describe("parseImprovedInstruction", () => {
  it("parsea JSON directo y con fences de markdown", () => {
    expect(parseImprovedInstruction('{"instruction":"Cambia la taza por un mate."}')).toBe(
      "Cambia la taza por un mate.",
    );
    expect(parseImprovedInstruction('```json\n{"instruction":"Hazlo."}\n```')).toBe("Hazlo.");
  });

  it("devuelve null ante basura, campos vacíos o campos ausentes", () => {
    expect(parseImprovedInstruction("no es json")).toBeNull();
    expect(parseImprovedInstruction('{"instruction":"   "}')).toBeNull();
    expect(parseImprovedInstruction('{"otra":"cosa"}')).toBeNull();
  });
});

describe("prepararLienzoAjuste + recortarAjuste (letterbox determinista)", () => {
  it("rellena al lienzo exacto del modelo con franjas negras sin deformar", async () => {
    const sharp = (await import("sharp")).default;
    const rojo = await sharp({
      create: { width: 1280, height: 720, channels: 3, background: { r: 200, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const lienzo = await prepararLienzoAjuste(rojo, "youtube");
    const m = await sharp(lienzo).metadata();
    expect([m.width, m.height]).toEqual([1536, 1024]);

    const raw = await sharp(lienzo).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * raw.info.width + x) * raw.info.channels;
      return [raw.data[i], raw.data[i + 1], raw.data[i + 2]];
    };
    expect(px(768, 10)).toEqual([0, 0, 0]); // franja superior negra
    expect(px(768, 512)[0]).toBeGreaterThan(150); // contenido rojo al centro
  });

  it("el viaje completo conserva el encuadre y el tamaño final de cada formato", async () => {
    const sharp = (await import("sharp")).default;
    for (const [formato, w, h] of [["youtube", 1280, 720], ["vertical", 1080, 1920]] as const) {
      const src = await sharp({
        create: { width: w, height: h, channels: 3, background: { r: 10, g: 120, b: 10 } },
      })
        .png()
        .toBuffer();
      const lienzo = await prepararLienzoAjuste(src, formato);
      const final = await recortarAjuste(lienzo, formato);
      const m = await sharp(final).metadata();
      expect([m.width, m.height]).toEqual([w, h]);
      // Sin franjas negras residuales: las esquinas deben seguir siendo contenido (verde).
      const raw = await sharp(final).raw().toBuffer({ resolveWithObject: true });
      expect(raw.data[1]).toBeGreaterThan(80); // canal G del píxel (0,0)
    }
  });
});

describe("buildImproveAdjustPrompt", () => {
  it("incluye la instrucción cruda, el formato, el título y exige JSON", () => {
    const p = buildImproveAdjustPrompt("que la pizarra diga hola", "youtube", "Mi video");
    expect(p).toContain("miniatura de YouTube");
    expect(p).toContain("que la pizarra diga hola");
    expect(p).toContain('"Mi video"');
    expect(p).toContain('{"instruction"');
  });
});
