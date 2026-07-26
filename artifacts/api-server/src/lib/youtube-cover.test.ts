import { describe, it, expect } from "vitest";
import {
  buildYoutubeThumbnailPrompt,
  buildYoutubeTitleOverlaySvg,
  prepararMiniaturaYoutube,
  expresionYoutuber,
  validarFotoPersona,
  validarFotosPersona,
  PERSON_IMG_MAX_BYTES,
  MAX_FOTOS_PERSONA,
  YT_WIDTH,
  YT_HEIGHT,
} from "./youtube-cover.js";
import { DIRECCIONES_PORTADA } from "./cover-style.js";
import { obtenerEstiloTitular } from "./title-style.js";
import { obtenerPlantilla } from "./thumbnail-templates.js";
import { POSES_PRIMER_PLANO } from "./pose-bank.js";

const dir = DIRECCIONES_PORTADA[0]!;
const plantillaClasica = obtenerPlantilla("yt_lateral_izquierda")!;

describe("buildYoutubeThumbnailPrompt", () => {
  it("siempre exige encuadre horizontal 16:9 y cero texto", () => {
    for (const conPersona of [true, false]) {
      const p = buildYoutubeThumbnailPrompt("tema de prueba", dir, "detalle x", { conPersona, plantilla: plantillaClasica });
      expect(p).toContain("HORIZONTAL");
      expect(p).toContain("16:9");
      expect(p).toContain("SIN TEXTO");
      expect(p).toContain("CERO caracteres alfanuméricos");
    }
  });

  it("con persona: exige rostro idéntico y fotorrealismo, sin cartoonizar", () => {
    const p = buildYoutubeThumbnailPrompt("subimos los precios", dir, "detalle", { conPersona: true, plantilla: plantillaClasica });
    expect(p).toContain("PERSONA REAL DE LA FOTO ADJUNTA");
    expect(p).toContain("IDÉNTICO");
    expect(p).toContain("FOTORREALISTA");
    expect(p).toContain("PROHIBIDO convertirla en cartoon");
    // El bloque del zorro no debe aparecer.
    expect(p).not.toContain("ZORRO WEBI");
  });

  it("con varias fotos: el bloque de identidad exige usar todos los ángulos", () => {
    const p = buildYoutubeThumbnailPrompt("mi tema", dir, "detalle", {
      conPersona: true,
      plantilla: plantillaClasica,
      numFotosPersona: 3,
    });
    expect(p).toContain("LAS FOTOS ADJUNTAS");
    expect(p).toContain("las 3 fotos adjuntas");
    expect(p).toContain("TODOS los ángulos");
    expect(p).toContain("manda la PRIMERA foto");
  });

  it("sin persona: protagonista es Webi flat cartoon con pose obligatoria", () => {
    const p = buildYoutubeThumbnailPrompt("tips de diseño", dir, "detalle", {
      conPersona: false,
      plantilla: plantillaClasica,
      pose: { id: "senalando_arriba" as any, descripcion: "señalando hacia arriba con entusiasmo", emocion: null },
    });
    expect(p).toContain("ZORRO WEBI");
    expect(p).toContain("FLAT CARTOON");
    expect(p).toContain("señalando hacia arriba con entusiasmo");
    expect(p).not.toContain("PERSONA REAL DE LA FOTO ADJUNTA");
  });

  it("la plantilla clásica reserva la franja izquierda despejada", () => {
    const p = buildYoutubeThumbnailPrompt("tema", dir, "detalle", { conPersona: true, plantilla: plantillaClasica });
    expect(p).toContain("FRANJA IZQUIERDA");
    expect(p).toContain("DESPEJADA");
  });

  it("la plantilla espejo reserva la franja derecha", () => {
    const p = buildYoutubeThumbnailPrompt("tema", dir, "detalle", {
      conPersona: true,
      plantilla: obtenerPlantilla("yt_lateral_derecha")!,
    });
    expect(p).toContain("FRANJA DERECHA");
    expect(p).toContain("MITAD IZQUIERDA");
  });

  it("mantiene las reglas anti-sticker y utilería física", () => {
    const p = buildYoutubeThumbnailPrompt("tema", dir, "detalle", { conPersona: false, plantilla: plantillaClasica });
    expect(p).toContain("NO STICKERS");
    expect(p).toContain("NUNCA flotando");
    expect(p).toContain("flechas, signos, corazones");
  });

  it("incluye la utilería y el estilo extra pedidos por el usuario", () => {
    const p = buildYoutubeThumbnailPrompt("tema", dir, "detalle", {
      conPersona: true,
      plantilla: plantillaClasica,
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

  it("respeta plantilla y estilo tipográfico fijados", () => {
    const prep = prepararMiniaturaYoutube("mi tema", null, {
      conPersona: true,
      plantillaId: "yt_cara_gigante",
      estiloTitularId: "neon",
    });
    expect(prep.plantilla.id).toBe("yt_cara_gigante");
    expect(prep.estiloTitular.id).toBe("neon");
    expect(prep.prompt).toContain("CARA GIGANTE");
  });

  it("cara gigante con Webi solo usa poses de cabeza/hombros", () => {
    for (let i = 0; i < 20; i++) {
      const prep = prepararMiniaturaYoutube("celebramos un gran éxito con brazos arriba", null, {
        conPersona: false,
        plantillaId: "yt_cara_gigante",
      });
      expect(prep.pose).not.toBeNull();
      expect(POSES_PRIMER_PLANO).toContain(prep.pose!.id);
    }
  });

  it("una plantillaId vertical cae en rotación de youtube", () => {
    const prep = prepararMiniaturaYoutube("mi tema", null, {
      conPersona: false,
      plantillaId: "v_titular_superior",
    });
    expect(prep.plantilla.formato).toBe("youtube");
  });
});

describe("buildYoutubeTitleOverlaySvg", () => {
  it("genera un SVG 1280x720 con scrim lateral y el título en mayúsculas", () => {
    const svg = buildYoutubeTitleOverlaySvg("Cómo duplicar tus ventas", dir, plantillaClasica, obtenerEstiloTitular("impacto")).toString();
    expect(svg).toContain(`width="${YT_WIDTH}"`);
    expect(svg).toContain(`height="${YT_HEIGHT}"`);
    expect(svg).toContain("linearGradient");
    // Gradiente horizontal (x2=1), no vertical.
    expect(svg).toContain('x2="1" y2="0"');
    expect(svg).toContain("VENTAS");
    expect(svg).not.toContain("**");
  });

  it("plantilla espejo: el scrim nace desde la derecha", () => {
    const svg = buildYoutubeTitleOverlaySvg("Título de prueba", dir, obtenerPlantilla("yt_lateral_derecha")!, obtenerEstiloTitular("impacto")).toString();
    expect(svg).toContain('x1="1" y1="0" x2="0" y2="0"');
  });

  it("plantilla testimonio: dibuja las comillas decorativas", () => {
    const svg = buildYoutubeTitleOverlaySvg("Cliente feliz", dir, obtenerPlantilla("yt_testimonio")!, obtenerEstiloTitular("placas")).toString();
    expect(svg).toContain("&#8220;");
  });

  it("plantilla top número: separa el número inicial y lo dibuja gigante", () => {
    const svg = buildYoutubeTitleOverlaySvg("5 errores que matan tus ventas", dir, obtenerPlantilla("yt_top_numero")!, obtenerEstiloTitular("titan")).toString();
    // El número va en su propio bloque con Alfa Slab One; el resto del título sigue.
    expect(svg).toContain(">5</text>");
    expect(svg).toContain("ERRORES");
    expect(svg).toContain("Alfa Slab One");
  });

  it("funciona con todas las direcciones de arte", () => {
    for (const d of DIRECCIONES_PORTADA) {
      const svg = buildYoutubeTitleOverlaySvg("Un título cualquiera de prueba", d, plantillaClasica, obtenerEstiloTitular("impacto")).toString();
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

describe("validarFotosPersona (multi-foto)", () => {
  const pngB64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");
  const jpgB64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).toString("base64");

  it("acepta hasta el máximo de fotos y conserva el orden", () => {
    const r = validarFotosPersona([pngB64, jpgB64]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fotos).toHaveLength(2);
      expect(r.fotos[0]!.mime).toBe("image/png");
      expect(r.fotos[1]!.mime).toBe("image/jpeg");
    }
  });

  it("rechaza más fotos que el máximo", () => {
    const r = validarFotosPersona(Array.from({ length: MAX_FOTOS_PERSONA + 1 }, () => pngB64));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(`${MAX_FOTOS_PERSONA}`);
  });

  it("propaga el error de la foto inválida indicando cuál es", () => {
    const r = validarFotosPersona([pngB64, "$$$corrupto$$$"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Foto 2");
  });

  it("lista vacía es válida (flujo Webi)", () => {
    const r = validarFotosPersona([]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fotos).toHaveLength(0);
  });
});

describe("energía viral y fidelidad de rostro (v2)", () => {
  it("exige energía de miniatura viral, dirección amplificada y margen de recorte", () => {
    const prep = prepararMiniaturaYoutube("lanzamos algo nuevo", null, { direccionId: "estudio_carmesi", conPersona: false });
    expect(prep.prompt).toContain("GANAS DE HACER CLIC");
    expect(prep.prompt).toContain("SATURADA");
    expect(prep.prompt).toContain("AMPLIFICADA");
    expect(prep.prompt).toContain("MARGEN DE SEGURIDAD");
  });

  it("con persona: exige misma edad, reconocible al instante y solo cambiar expresión/pose", () => {
    const prep = prepararMiniaturaYoutube("lanzamos algo nuevo", null, { direccionId: "estudio_carmesi", conPersona: true });
    expect(prep.prompt).toContain("misma edad");
    expect(prep.prompt).toContain("reconocible AL INSTANTE");
    expect(prep.prompt).toContain("la EXPRESIÓN, la POSE");
    expect(prep.prompt).toContain("PROHIBIDO inventar una cara nueva");
  });
});
