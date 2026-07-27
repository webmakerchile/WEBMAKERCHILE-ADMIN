import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  prepararImagenInstagram,
  destinoPorRatio,
  motivoNoPublicable,
  esMimeImagen,
  esMimeVideo,
  pareceImagenPorNombre,
  RATIO_FEED_MIN,
  RATIO_FEED_MAX,
} from "./instagram-media.js";

/** PNG sólido del tamaño pedido: el renderizador de la app produce PNG. */
function pngDe(ancho: number, alto: number): Promise<Buffer> {
  return sharp({
    create: { width: ancho, height: alto, channels: 3, background: { r: 20, g: 30, b: 45 } },
  })
    .png()
    .toBuffer();
}

describe("destinoPorRatio", () => {
  it("manda al feed lo que el feed acepta", () => {
    expect(destinoPorRatio(1)).toBe("feed"); // 1:1
    expect(destinoPorRatio(0.8)).toBe("feed"); // 4:5, el vertical máximo
    expect(destinoPorRatio(1.91)).toBe("feed");
  });

  it("manda a historias lo más vertical que 4:5", () => {
    // 1080x1920 = 0.5625: la API RECHAZA esto en el feed, no es una preferencia.
    expect(destinoPorRatio(1080 / 1920)).toBe("story");
    expect(destinoPorRatio(0.79)).toBe("story");
  });
});

describe("prepararImagenInstagram", () => {
  it("convierte el PNG a JPEG, que es lo único que acepta la API", async () => {
    const r = await prepararImagenInstagram(await pngDe(1080, 1080));
    expect(r.mimeType).toBe("image/jpeg");
    expect(r.extension).toBe("jpg");
    const meta = await sharp(r.buffer).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("una historia 9:16 se publica como STORIES, no como post de feed", async () => {
    const r = await prepararImagenInstagram(await pngDe(1080, 1920));
    expect(r.tipo).toBe("STORIES");
  });

  it("un carrusel 4:5 y un post 1:1 van al feed", async () => {
    expect((await prepararImagenInstagram(await pngDe(1080, 1350))).tipo).toBe("IMAGE");
    expect((await prepararImagenInstagram(await pngDe(1080, 1080))).tipo).toBe("IMAGE");
  });

  it("rellena la imagen demasiado apaisada en vez de recortarla", async () => {
    // Recortar se comería el titular: el motor compone el texto pegado a los
    // bordes de su zona.
    const r = await prepararImagenInstagram(await pngDe(2400, 800)); // 3:1
    const meta = await sharp(r.buffer).metadata();
    const ratio = meta.width! / meta.height!;
    expect(meta.width).toBe(2400);
    expect(ratio).toBeLessThanOrEqual(RATIO_FEED_MAX + 0.01);
    expect(ratio).toBeGreaterThanOrEqual(RATIO_FEED_MIN);
    expect(r.nota).toContain("rellenada");
  });

  it("respeta el destino explícito por encima del automático", async () => {
    const r = await prepararImagenInstagram(await pngDe(1080, 1080), "story");
    expect(r.tipo).toBe("STORIES");
  });

  it("falla claro si la imagen no se puede leer", async () => {
    await expect(prepararImagenInstagram(Buffer.from("no soy una imagen"))).rejects.toThrow();
  });
});

describe("detección de tipo de archivo", () => {
  it("distingue imagen de video por MIME", () => {
    expect(esMimeImagen("image/png")).toBe(true);
    expect(esMimeImagen("video/mp4")).toBe(false);
    expect(esMimeVideo("video/quicktime")).toBe(true);
    expect(esMimeVideo(null)).toBe(false);
  });

  it("cae al nombre cuando Drive no informa MIME", () => {
    expect(pareceImagenPorNombre("portada.png")).toBe(true);
    expect(pareceImagenPorNombre("historia_1.JPEG")).toBe(true);
    expect(pareceImagenPorNombre("clip.mp4")).toBe(false);
    expect(pareceImagenPorNombre(null)).toBe(false);
  });
});

describe("motivoNoPublicable", () => {
  it("deja pasar imagen y video", () => {
    expect(motivoNoPublicable("image/png", "a.png")).toBeNull();
    expect(motivoNoPublicable("video/mp4", "a.mp4")).toBeNull();
    expect(motivoNoPublicable(null, "portada.jpg")).toBeNull();
  });

  it("explica por qué no se puede publicar otra cosa", () => {
    const m = motivoNoPublicable("application/pdf", "informe.pdf");
    expect(m).toContain("Instagram");
    expect(m).toContain("application/pdf");
  });

  it("con MIME desconocido lo intenta, no lo rechaza", () => {
    // Drive no siempre informa el MIME. Rechazar por no saber rompería
    // publicaciones de video que hasta ahora funcionaban.
    expect(motivoNoPublicable(null, null)).toBeNull();
    expect(motivoNoPublicable(undefined, "archivo-sin-extension")).toBeNull();
  });
});
