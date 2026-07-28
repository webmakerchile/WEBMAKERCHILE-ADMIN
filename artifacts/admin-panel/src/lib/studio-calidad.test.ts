import { describe, it, expect } from "vitest";
import {
  PERFILES_CALIDAD,
  perfilPorId,
  perfilInferior,
  restriccionesVideo,
  bitratePara,
  BITRATE_MAX,
  BITRATE_MIN,
  etiquetaResolucion,
  etiquetaBitrate,
  diagnosticarCaptura,
  debeBajarPerfil,
} from "./studio-calidad";

describe("restriccionesVideo", () => {
  // El bug original: `max: 1920 / 2560` hacía imposible capturar 4K (2160x3840).
  // Ninguna restricción puede volver a poner un techo.
  it("no pone ningún techo duro", () => {
    for (const perfil of PERFILES_CALIDAD) {
      const c = restriccionesVideo(perfil, "user") as Record<string, any>;
      expect(c.width.max, `${perfil.id} volvió a poner un techo de ancho`).toBeUndefined();
      expect(c.height.max, `${perfil.id} volvió a poner un techo de alto`).toBeUndefined();
      expect(c.frameRate.max, `${perfil.id} volvió a poner un techo de fps`).toBeUndefined();
    }
  });

  it("el perfil máximo pide 4K vertical", () => {
    const c = restriccionesVideo(perfilPorId("maxima"), "user") as Record<string, any>;
    expect(c.height.ideal).toBe(3840);
    expect(c.width.ideal).toBe(2160);
  });

  it("pide vertical 9:16 y respeta la cámara elegida", () => {
    const c = restriccionesVideo(perfilPorId("alta"), "environment") as Record<string, any>;
    expect(c.facingMode).toBe("environment");
    expect(c.aspectRatio.ideal).toBeCloseTo(9 / 16);
    expect(c.width.ideal / c.height.ideal).toBeCloseTo(9 / 16, 2);
  });
});

describe("bitratePara", () => {
  // El bug: 8 Mbps fijos. Correcto a 1080p, cinco veces corto a 4K.
  it("escala con los píxeles en vez de ser una cifra fija", () => {
    const full = bitratePara(1080, 1920, 30);
    const cuatroK = bitratePara(2160, 3840, 30);
    expect(cuatroK).toBeGreaterThan(full * 3);
  });

  it("deja 1080p30 en un rango sano para redes", () => {
    const b = bitratePara(1080, 1920, 30);
    expect(b).toBeGreaterThan(5_000_000);
    expect(b).toBeLessThan(9_000_000);
  });

  it("deja 4K30 muy por encima de los 8 Mbps que se usaban antes", () => {
    expect(bitratePara(2160, 3840, 30)).toBeGreaterThan(20_000_000);
  });

  it("sube con los fotogramas por segundo", () => {
    expect(bitratePara(1080, 1920, 60)).toBeGreaterThan(bitratePara(1080, 1920, 30));
  });

  // El techo no es estética: por encima de ~45 Mbps ningún codificador por
  // hardware de móvil mantiene el ritmo, y perder el ritmo ES el lag.
  it("respeta el techo y el suelo", () => {
    expect(bitratePara(4320, 7680, 60)).toBe(BITRATE_MAX);
    expect(bitratePara(64, 64, 30)).toBe(BITRATE_MIN);
  });

  it("sobrevive a valores basura sin devolver NaN", () => {
    for (const b of [bitratePara(0, 0, 0), bitratePara(-10, -10, -5), bitratePara(NaN as any, 100, 30)]) {
      expect(Number.isFinite(b)).toBe(true);
      expect(b).toBeGreaterThanOrEqual(BITRATE_MIN);
    }
  });
});

describe("etiquetaResolucion", () => {
  // Se mira el lado LARGO: en vertical un 4K es 2160 de ancho, y mirar el
  // ancho lo etiquetaría como "2K".
  it("nombra por el lado largo, que es lo correcto en vertical", () => {
    expect(etiquetaResolucion(2160, 3840)).toBe("4K");
    expect(etiquetaResolucion(3840, 2160)).toBe("4K");
    expect(etiquetaResolucion(1080, 1920)).toBe("1080p");
    expect(etiquetaResolucion(720, 1280)).toBe("720p");
  });

  it("cae a las dimensiones crudas cuando no hay nombre", () => {
    expect(etiquetaResolucion(640, 480)).toBe("640×480");
    expect(etiquetaResolucion(0, 0)).toBe("—");
  });
});

describe("etiquetaBitrate", () => {
  it("redondea sin decimales de más", () => {
    expect(etiquetaBitrate(25_000_000)).toBe("25 Mbps");
    expect(etiquetaBitrate(6_200_000)).toBe("6.2 Mbps");
  });
});

describe("diagnosticarCaptura", () => {
  it("lee lo que la cámara entregó de verdad", () => {
    const d = diagnosticarCaptura({ width: 2160, height: 3840, frameRate: 30 } as MediaTrackSettings);
    expect(d.etiqueta).toBe("4K");
    expect(d.bitrate).toBeGreaterThan(20_000_000);
  });

  it("no revienta cuando el navegador no informa nada", () => {
    const d = diagnosticarCaptura({} as MediaTrackSettings);
    expect(d.etiqueta).toBe("—");
    expect(Number.isFinite(d.bitrate)).toBe(true);
  });
});

describe("debeBajarPerfil", () => {
  it("no decide nada con menos de dos segundos de muestra", () => {
    expect(debeBajarPerfil(30, 30)).toBe(false);
  });

  it("baja solo cuando se pierden fotogramas de verdad", () => {
    expect(debeBajarPerfil(600, 12)).toBe(false); // 2%: normal
    expect(debeBajarPerfil(600, 90)).toBe(true); // 15%: se ve a tirones
  });
});

describe("perfilInferior", () => {
  it("recorre la escalera hacia abajo y se detiene en el último", () => {
    expect(perfilInferior("maxima")?.id).toBe("alta");
    expect(perfilInferior("alta")?.id).toBe("datos");
    expect(perfilInferior("datos")).toBeNull();
  });
});
