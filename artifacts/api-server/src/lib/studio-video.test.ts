import { describe, it, expect } from "vitest";
import {
  planNormalizacion,
  recorteVertical,
  etiquetaResolucion,
  ALTO_MAXIMO,
  ANCHO_MAXIMO,
} from "./studio-video";

describe("recorteVertical", () => {
  it("recorta el ancho cuando la fuente es más apaisada que 9:16", () => {
    // 4:3 vertical (1440x1920) → sobra ancho.
    expect(recorteVertical(1440, 1920)).toEqual({ ancho: 1080, alto: 1920 });
  });

  it("recorta el alto cuando la fuente es más estrecha que 9:16", () => {
    // 1:2 (1000x2000) → sobra alto.
    expect(recorteVertical(1000, 2000)).toEqual({ ancho: 1000, alto: 1778 });
  });

  it("deja intacto lo que ya es 9:16", () => {
    expect(recorteVertical(2160, 3840)).toEqual({ ancho: 2160, alto: 3840 });
    expect(recorteVertical(1080, 1920)).toEqual({ ancho: 1080, alto: 1920 });
  });

  // libx264 con yuv420p exige dimensiones pares o falla el encode entero.
  it("siempre devuelve dimensiones pares", () => {
    for (const [w, h] of [[1439, 1921], [999, 1777], [2161, 3841], [721, 1281]]) {
      const r = recorteVertical(w!, h!);
      expect(r.ancho % 2, `ancho impar para ${w}x${h}`).toBe(0);
      expect(r.alto % 2, `alto impar para ${w}x${h}`).toBe(0);
    }
  });

  it("nunca amplía: estirar 720p a 4K solo añade peso", () => {
    const r = recorteVertical(720, 1280);
    expect(r.ancho).toBeLessThanOrEqual(720);
    expect(r.alto).toBeLessThanOrEqual(1280);
  });
});

describe("planNormalizacion", () => {
  // EL bug. El filtro era scale=1080:1920 fijo: todo acababa en Full HD,
  // grabaras lo que grabaras.
  it("conserva el 4K en vez de tirarlo a 1080p", () => {
    const plan = planNormalizacion({ width: 2160, height: 3840, rotation: 0 }, 60);
    expect(plan.alto).toBe(3840);
    expect(plan.ancho).toBe(2160);
    expect(plan.reducido).toBe(false);
    expect(plan.vf).not.toContain("1080:1920");
  });

  it("conserva 2K y 1440p igual que el 4K", () => {
    expect(planNormalizacion({ width: 1440, height: 2560, rotation: 0 }).alto).toBe(2560);
    expect(planNormalizacion({ width: 1620, height: 2880, rotation: 0 }).alto).toBe(2880);
  });

  it("no amplía una fuente pequeña", () => {
    const plan = planNormalizacion({ width: 720, height: 1280, rotation: 0 });
    expect(plan.alto).toBe(1280);
    expect(plan.vf).not.toContain("scale=");
  });

  it("recupera el 4K de una fuente apaisada girándola", () => {
    const plan = planNormalizacion({ width: 3840, height: 2160, rotation: 0 });
    expect(plan.vf).toContain("transpose=1");
    expect(plan.alto).toBe(3840);
    expect(plan.ancho).toBe(2160);
  });

  // Si ffmpeg ya aplica la rotación de los metadatos, girar otra vez la deja
  // al revés: el vídeo saldría cabeza abajo.
  it("no gira dos veces cuando la rotación ya está en los metadatos", () => {
    const plan = planNormalizacion({ width: 3840, height: 2160, rotation: 90 });
    expect(plan.vf).not.toContain("transpose");
  });

  it("reduce solo lo que supera el techo de 4K", () => {
    const plan = planNormalizacion({ width: 4320, height: 7680, rotation: 0 });
    expect(plan.reducido).toBe(true);
    expect(plan.alto).toBeLessThanOrEqual(ALTO_MAXIMO);
    expect(plan.ancho).toBeLessThanOrEqual(ANCHO_MAXIMO);
    expect(plan.vf).toContain("scale=");
    // Y recorta ANTES de escalar: al revés se tira detalle y luego se recorta.
    expect(plan.vf.indexOf("crop=")).toBeLessThan(plan.vf.indexOf("scale="));
  });

  it("siempre entrega dimensiones pares", () => {
    for (const [w, h] of [[2161, 3841], [1439, 1921], [4321, 7681], [999, 1777]]) {
      const plan = planNormalizacion({ width: w!, height: h!, rotation: 0 });
      expect(plan.ancho % 2, `ancho impar para ${w}x${h}`).toBe(0);
      expect(plan.alto % 2, `alto impar para ${w}x${h}`).toBe(0);
    }
  });

  it("conserva los fotogramas del origen con un tope sano", () => {
    expect(planNormalizacion({ width: 1080, height: 1920, rotation: 0, fps: 60 }).fps).toBe(60);
    expect(planNormalizacion({ width: 1080, height: 1920, rotation: 0, fps: 240 }).fps).toBe(60);
    expect(planNormalizacion({ width: 1080, height: 1920, rotation: 0 }).fps).toBe(30);
  });

  // El timeout fijo de 180 s hacía fallar cualquier 4K largo, y el fallo caía
  // en silencio al vídeo crudo de tasa variable.
  it("da más margen a lo que de verdad tarda más", () => {
    const full = planNormalizacion({ width: 1080, height: 1920, rotation: 0 }, 60);
    const cuatroK = planNormalizacion({ width: 2160, height: 3840, rotation: 0 }, 180);
    expect(cuatroK.timeoutMs).toBeGreaterThan(full.timeoutMs);
    expect(full.timeoutMs).toBeGreaterThanOrEqual(240_000);
    expect(cuatroK.timeoutMs).toBeLessThanOrEqual(1_200_000);
  });

  it("afloja el preset solo cuando hay muchos píxeles", () => {
    expect(planNormalizacion({ width: 1080, height: 1920, rotation: 0 }).preset).toBe("fast");
    expect(planNormalizacion({ width: 2160, height: 3840, rotation: 0 }).preset).toBe("veryfast");
  });

  it("sin dimensiones legibles cae al formato prometido en vez de inventar", () => {
    const plan = planNormalizacion({ width: 0, height: 0, rotation: 0 });
    expect(plan.ancho).toBe(1080);
    expect(plan.alto).toBe(1920);
    expect(plan.resumen).toContain("sin dimensiones legibles");
  });

  it("el resumen deja por escrito qué pasó con la resolución", () => {
    expect(planNormalizacion({ width: 2160, height: 3840, rotation: 0 }).resumen).toContain("conservada");
    expect(planNormalizacion({ width: 4320, height: 7680, rotation: 0 }).resumen).toContain("reducida");
    expect(planNormalizacion({ width: 3840, height: 2160, rotation: 0 }).resumen).toContain("girada");
  });
});

describe("etiquetaResolucion", () => {
  it("nombra por el lado largo, que es lo correcto en vertical", () => {
    expect(etiquetaResolucion(2160, 3840)).toBe("4K");
    expect(etiquetaResolucion(1080, 1920)).toBe("1080p");
    expect(etiquetaResolucion(0, 0)).toBe("desconocida");
  });
});
