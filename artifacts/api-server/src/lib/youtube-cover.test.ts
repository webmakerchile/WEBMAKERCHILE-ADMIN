import { describe, it, expect } from "vitest";
import {
  buildYoutubeThumbnailPrompt,
  buildYoutubeTitleOverlaySvg,
  prepararMiniaturaYoutube,
  expresionYoutuber,
  validarFotoPersona,
  PERSON_IMG_MAX_BYTES,
  YT_WIDTH,
  YT_HEIGHT,
} from "./youtube-cover.js";
import { DIRECCIONES_PORTADA } from "./cover-style.js";

const dir = DIRECCIONES_PORTADA[0]!;

describe("buildYoutubeThumbnailPrompt", () => {
  it("siempre exige encuadre horizontal 16:9 y cero texto", () => {
    for (const conPersona of [true, false]) {
      const p = buildYoutubeThumbnailPrompt("tema de prueba", dir, "detalle x", { conPersona });
      expect(p).toContain("HORIZONTAL");
      expect(p).toContain("16:9");
      expect(p).toContain("SIN TEXTO");
      expect(p).toContain("CERO caracteres alfanuméricos");
    }
  });

  it("con persona: exige rostro idéntico y fotorrealismo, sin cartoonizar", () => {
    const p = buildYoutubeThumbnailPrompt("subimos los precios", dir, "detalle", { conPersona: true });
    expect(p).toContain("PERSONA REAL DE LA FOTO ADJUNTA");
    expect(p).toContain("IDÉNTICO");
    expect(p).toContain("FOTORREALISTA");
    expect(p).toContain("PROHIBIDO convertirla en cartoon");
    // El bloque del zorro no debe aparecer.
    expect(p).not.toContain("ZORRO WEBI");
  });

  it("sin persona: protagonista es Webi flat cartoon con pose obligatoria", () => {
    const p = buildYoutubeThumbnailPrompt("tips de diseño", dir, "detalle", {
      conPersona: false,
      pose: { id: "senalando_arriba" as any, descripcion: "señalando hacia arriba con entusiasmo", emocion: null },
    });
    expect(p).toContain("ZORRO WEBI");
    expect(p).toContain("FLAT CARTOON");
    expect(p).toContain("señalando hacia arriba con entusiasmo");
    expect(p).not.toContain("PERSONA REAL DE LA FOTO ADJUNTA");
  });

  it("reserva la franja izquierda despejada para el titular", () => {
    const p = buildYoutubeThumbnailPrompt("tema", dir, "detalle", { conPersona: true });
    expect(p).toContain("FRANJA IZQUIERDA");
    expect(p).toContain("DESPEJADA");
  });

  it("mantiene las reglas anti-sticker y utilería física", () => {
    const p = buildYoutubeThumbnailPrompt("tema", dir, "detalle", { conPersona: false });
    expect(p).toContain("NO STICKERS");
    expect(p).toContain("NUNCA flotando");
    expect(p).toContain("flechas, signos, corazones");
  });

  it("incluye la utilería y el estilo extra pedidos por el usuario", () => {
    const p = buildYoutubeThumbnailPrompt("tema", dir, "detalle", {
      conPersona: true,
      utileria: "un trofeo dorado, una torta con velas",
      extraEstilo: "ambiente festivo",
    });
    expect(p).toContain("un trofeo dorado, una torta con velas");
    expect(p).toContain("UTILERÍA PEDIDA POR EL USUARIO (OBLIGATORIA)");
    expect(p).toContain("ambiente festivo");
  });
});

describe("expresionYoutuber", () => {
  it("mapea emociones del tema a expresiones de youtuber", () => {
    expect(expresionYoutuber("¿Sabías esto de Instagram?")).toContain("duda");
    expect(expresionYoutuber("logramos triplicar las ventas")).toContain("celebración");
    expect(expresionYoutuber("tema neutro cualquiera")).toContain("youtuber");
  });
});

describe("prepararMiniaturaYoutube", () => {
  it("respeta la dirección fijada y no asigna pose cuando hay persona", () => {
    const prep = prepararMiniaturaYoutube("mi tema", null, {
      direccionId: dir.id,
      conPersona: true,
    });
    expect(prep.direccion.id).toBe(dir.id);
    expect(prep.pose).toBeNull();
    expect(prep.prompt).toContain("PERSONA REAL");
  });

  it("asigna pose de Webi cuando no hay persona", () => {
    const prep = prepararMiniaturaYoutube("mi tema", null, { conPersona: false });
    expect(prep.pose).not.toBeNull();
    expect(prep.prompt).toContain("POSE Y EXPRESIÓN OBLIGATORIA");
  });
});

describe("buildYoutubeTitleOverlaySvg", () => {
  it("genera un SVG 1280x720 con scrim lateral y el título en mayúsculas", () => {
    const svg = buildYoutubeTitleOverlaySvg("Cómo duplicar tus ventas", dir).toString();
    expect(svg).toContain(`width="${YT_WIDTH}"`);
    expect(svg).toContain(`height="${YT_HEIGHT}"`);
    expect(svg).toContain("linearGradient");
    // Gradiente horizontal (x2=1), no vertical.
    expect(svg).toContain('x2="1" y2="0"');
    expect(svg).toContain("VENTAS");
    expect(svg).not.toContain("**");
  });

  it("alinea el texto a la izquierda (text-anchor start)", () => {
    const svg = buildYoutubeTitleOverlaySvg("Título de prueba", dir).toString();
    expect(svg).toContain('text-anchor="start"');
    expect(svg).not.toContain('text-anchor="middle"');
  });

  it("funciona con todas las direcciones de arte (chips y limpio)", () => {
    for (const d of DIRECCIONES_PORTADA) {
      const svg = buildYoutubeTitleOverlaySvg("Un título cualquiera de prueba", d).toString();
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    }
  });
});

describe("validarFotoPersona", () => {
  const pngB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");
  const jpgB64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).toString("base64");

  it("acepta PNG y JPEG reales y devuelve su MIME", () => {
    expect(validarFotoPersona(pngB64)).toMatchObject({ ok: true, mime: "image/png" });
    expect(validarFotoPersona(jpgB64)).toMatchObject({ ok: true, mime: "image/jpeg" });
  });

  it("normaliza el prefijo data-URL", () => {
    expect(validarFotoPersona(`data:image/jpeg;base64,${jpgB64}`)).toMatchObject({ ok: true, base64: jpgB64 });
  });

  it("acepta WebP (RIFF....WEBP)", () => {
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]).toString("base64");
    expect(validarFotoPersona(webp)).toMatchObject({ ok: true, mime: "image/webp" });
  });

  it("rechaza base64 corrupto, vacío y formatos no soportados (gif)", () => {
    expect(validarFotoPersona("$$$no-es-base64$$$").ok).toBe(false);
    expect(validarFotoPersona("").ok).toBe(false);
    const gif = Buffer.from("GIF89a-imagen-falsa").toString("base64");
    expect(validarFotoPersona(gif).ok).toBe(false);
  });

  it("rechaza fotos de más de 8 MB con mensaje de peso", () => {
    const grande = Buffer.alloc(PERSON_IMG_MAX_BYTES + 16, 0xff);
    grande[0] = 0xff; grande[1] = 0xd8; grande[2] = 0xff;
    const r = validarFotoPersona(grande.toString("base64"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("8 MB");
  });
});
