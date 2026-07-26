import { describe, expect, it } from "vitest";
import {
  DIRECCIONES_PORTADA,
  seleccionarDireccion,
  prepararPortada,
  listarOpcionesPortada,
  elegirDetalle,
  elegirPalabrasAcento,
  esErrorRateLimit,
  buildCoverIllustrationPrompt,
  buildTitleOverlaySvg,
  splitTextIntoLines,
} from "./cover-style";
import { seleccionarPosePortada } from "./pose-bank";
import { obtenerEstiloTitular } from "./title-style";
import { obtenerPlantilla } from "./thumbnail-templates";

describe("banco de direcciones de arte", () => {
  it("tiene 8 direcciones con ids únicos y campos completos", () => {
    expect(DIRECCIONES_PORTADA).toHaveLength(8);
    const ids = new Set(DIRECCIONES_PORTADA.map(d => d.id));
    expect(ids.size).toBe(8);
    for (const d of DIRECCIONES_PORTADA) {
      expect(d.fondo.length).toBeGreaterThan(100);
      expect(d.detalles.length).toBeGreaterThanOrEqual(3);
      expect(d.titular.colorAcento).toMatch(/^#/);
      if (d.titular.modo === "chips") expect(d.titular.chipFondo).toBeTruthy();
    }
  });

  it("la selección FIFO nunca repite dentro de la ventana de memoria", () => {
    const seq: string[] = [];
    for (let i = 0; i < 30; i++) seq.push(seleccionarDireccion().id);
    for (let i = 1; i < seq.length; i++) {
      const ventana = seq.slice(Math.max(0, i - 5), i);
      expect(ventana).not.toContain(seq[i]);
    }
  });
});

describe("elegirPalabrasAcento", () => {
  it("prioriza números y palabras gatillo, máximo 2", () => {
    const acentos = elegirPalabrasAcento(["3 ERRORES QUE", "MATAN TUS VENTAS"]);
    expect(acentos.size).toBeLessThanOrEqual(2);
    expect(acentos.has("3")).toBe(true);
    expect(acentos.has("ERRORES")).toBe(true);
  });

  it("sin números ni gatillo destaca la palabra más larga", () => {
    const acentos = elegirPalabrasAcento(["APRENDE", "DE OTRA FORMA"]);
    expect(acentos.has("APRENDE")).toBe(true);
  });

  it("acentúa palabras con tilde vía normalización", () => {
    const acentos = elegirPalabrasAcento(["EL ÉXITO REAL"]);
    expect(acentos.has("ÉXITO")).toBe(true);
  });
});

describe("buildCoverIllustrationPrompt", () => {
  it("incluye zorro master, dirección, detalle, pose y regla sin texto", () => {
    const dir = DIRECCIONES_PORTADA[0]!;
    const detalle = elegirDetalle(dir);
    const pose = seleccionarPosePortada("cómo vender más");
    const prompt = buildCoverIllustrationPrompt("cómo vender más", dir, detalle, pose);
    expect(prompt).toContain("CERO caracteres alfanuméricos");
    expect(prompt).toContain("Zorro naranja antropomórfico");
    expect(prompt).toContain(dir.nombre);
    expect(prompt).toContain(dir.fondo.slice(0, 60));
    expect(prompt).toContain(detalle);
    expect(prompt).toContain(pose.descripcion);
    expect(prompt).toContain("cómo vender más");
  });

  it("incluye el estilo extra del usuario cuando viene", () => {
    const dir = DIRECCIONES_PORTADA[1]!;
    const prompt = buildCoverIllustrationPrompt(
      "tema", dir, dir.detalles[0]!, seleccionarPosePortada("tema"), "más minimalista",
    );
    expect(prompt).toContain("más minimalista");
  });
});

describe("buildTitleOverlaySvg (motor title-style)", () => {
  const dir = DIRECCIONES_PORTADA[0]!;
  const plantillaSup = obtenerPlantilla("v_titular_superior")!;
  const plantillaInf = obtenerPlantilla("v_titular_inferior")!;

  it("siempre usa scrim degradado, nunca franja sólida", () => {
    for (const d of DIRECCIONES_PORTADA) {
      const svg = buildTitleOverlaySvg("5 SECRETOS DEL MARKETING DIGITAL", d, plantillaSup, obtenerEstiloTitular("impacto")).toString();
      expect(svg).toContain("linearGradient");
      expect(svg).toContain('stop-opacity="0"');
    }
  });

  it("con plantilla inferior el scrim nace desde abajo", () => {
    const svg = buildTitleOverlaySvg("TITULAR DE PRUEBA", dir, plantillaInf, obtenerEstiloTitular("impacto")).toString();
    expect(svg).toContain('x1="0" y1="1" x2="0" y2="0"');
  });

  it("estilo impacto: contorno grueso + sombra dura (capas apiladas)", () => {
    const svg = buildTitleOverlaySvg("3 TRUCOS DE VENTAS", dir, plantillaSup, obtenerEstiloTitular("impacto")).toString();
    expect(svg).toContain('stroke="#000000"');
    expect(svg).toContain("rgba(0,0,0,0.55)");
    expect(svg).toContain("Archivo Black");
  });

  it("estilo fuego: relleno degradado con gradiente definido", () => {
    const svg = buildTitleOverlaySvg("EL SECRETO DE LAS VENTAS", dir, plantillaSup, obtenerEstiloTitular("fuego")).toString();
    expect(svg).toContain('id="gradTitular"');
    expect(svg).toContain('fill="url(#gradTitular)"');
    expect(svg).toContain("Anton");
  });

  it("estilo slab_3d: extrusión con varias capas desplazadas", () => {
    const svg = buildTitleOverlaySvg("GRAN CAMBIO", dir, plantillaSup, obtenerEstiloTitular("slab_3d")).toString();
    expect(svg).toContain("Alfa Slab One");
    expect((svg.match(/<text/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it("estilo neon: halo con capas de contorno translúcidas", () => {
    const svg = buildTitleOverlaySvg("NOCHE DE VENTAS", dir, plantillaSup, obtenerEstiloTitular("neon")).toString();
    expect(svg).toContain("Bebas Neue");
    expect(svg).toContain('opacity="0.16"');
    expect(svg).toContain(`stroke="${dir.titular.colorAcento}"`);
  });

  it("estilo titan: palabra de acento sobre placa de color", () => {
    const svg = buildTitleOverlaySvg("3 ERRORES GRAVES", dir, plantillaSup, obtenerEstiloTitular("titan")).toString();
    expect(svg).toContain(`fill="${dir.titular.colorAcento}"`);
    expect(svg).toContain("rx=");
  });

  it("destaca palabras de acento con el color de la dirección", () => {
    const svg = buildTitleOverlaySvg("3 TRUCOS DE VENTAS", dir, plantillaSup, obtenerEstiloTitular("impacto")).toString();
    expect(svg).toContain(`fill="${dir.titular.colorAcento}"`);
  });

  it("aplica la inclinación del estilo elegido", () => {
    const svg = buildTitleOverlaySvg("TITULAR DE PRUEBA", dir, plantillaSup, obtenerEstiloTitular("impacto")).toString();
    expect(svg).toContain("rotate(-2,");
  });

  it("escapa caracteres XML del título", () => {
    const svg = buildTitleOverlaySvg("MÁS <VENTAS> & ÉXITO", dir, plantillaSup, obtenerEstiloTitular("clasico")).toString();
    expect(svg).toContain("&lt;VENTAS&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).not.toMatch(/<VENTAS>/);
  });

  it("sin plantilla ni estilo explícitos igual produce un SVG válido (rotación)", () => {
    const svg = buildTitleOverlaySvg("UN TITULAR CUALQUIERA", dir).toString();
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
});

describe("esErrorRateLimit", () => {
  it("reconoce el code etiquetado, el mensaje legado y los patrones del proveedor", () => {
    expect(esErrorRateLimit(Object.assign(new Error("saturado"), { code: "RATE_LIMIT" }))).toBe(true);
    expect(esErrorRateLimit(new Error("RATE_LIMIT"))).toBe(true);
    expect(esErrorRateLimit(new Error("429 Too Many Requests"))).toBe(true);
    expect(esErrorRateLimit(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
    expect(esErrorRateLimit(new Error("otra cosa"))).toBe(false);
    expect(esErrorRateLimit(null)).toBe(false);
  });
});

describe("splitTextIntoLines", () => {
  it("respeta el máximo de caracteres por línea", () => {
    const lines = splitTextIntoLines("UNO DOS TRES CUATRO CINCO SEIS", 10);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(10);
    expect(lines.join(" ")).toBe("UNO DOS TRES CUATRO CINCO SEIS");
  });
});

describe("personalización de portadas (opciones)", () => {
  it("respeta la dirección fijada por id", () => {
    const r = prepararPortada("Tema de prueba", null, { direccionId: "estudio_carmesi" });
    expect(r.direccion.id).toBe("estudio_carmesi");
  });

  it("cae en rotación automática si la direccionId no existe", () => {
    const r = prepararPortada("Tema de prueba", null, { direccionId: "no_existe" });
    expect(DIRECCIONES_PORTADA.some((d) => d.id === r.direccion.id)).toBe(true);
  });

  it("respeta la pose fijada por id y la incluye en el prompt", () => {
    const r = prepararPortada("Tema de prueba", null, { poseId: "superhero_stance" });
    expect(r.pose.id).toBe("superhero_stance");
    expect(r.prompt).toContain("superhéroe");
  });

  it("inyecta la utilería pedida como bloque obligatorio del prompt", () => {
    const r = prepararPortada("Tema", null, { utileria: "una taza de café humeante" });
    expect(r.prompt).toContain("UTILERÍA PEDIDA POR EL USUARIO (OBLIGATORIA): una taza de café humeante");
  });

  it("sin utilería pedida no aparece el bloque obligatorio", () => {
    const r = prepararPortada("Tema", null);
    expect(r.prompt).not.toContain("UTILERÍA PEDIDA POR EL USUARIO");
  });

  it("ignora utilería y estilo extra de solo espacios", () => {
    const r = prepararPortada("Tema", "   ", { utileria: "   " });
    expect(r.prompt).not.toContain("UTILERÍA PEDIDA POR EL USUARIO");
    expect(r.prompt).not.toContain("ESTILO ADICIONAL PEDIDO POR EL USUARIO");
  });

  it("respeta la plantilla y el estilo tipográfico fijados", () => {
    const r = prepararPortada("Tema de prueba", null, {
      plantillaId: "v_titular_inferior",
      estiloTitularId: "fuego",
    });
    expect(r.plantilla.id).toBe("v_titular_inferior");
    expect(r.estiloTitular.id).toBe("fuego");
    expect(r.prompt).toContain("ZONA INFERIOR VACÍA");
  });

  it("v_titular_inferior reubica al personaje y remapea la franja superior", () => {
    const r = prepararPortada("Tema de prueba", null, { plantillaId: "v_titular_inferior" });
    expect(r.prompt).not.toContain("40% del área visual inferior");
    expect(r.prompt).toContain("MITAD SUPERIOR-CENTRAL");
    expect(r.prompt).toContain('toda mención a "franja superior"');
  });

  it("v_titular_superior conserva al zorro abajo", () => {
    const r = prepararPortada("Tema de prueba", null, { plantillaId: "v_titular_superior" });
    expect(r.prompt).toContain("40% del área visual inferior");
  });

  it("una plantillaId de otro formato cae en rotación vertical", () => {
    const r = prepararPortada("Tema de prueba", null, { plantillaId: "yt_cara_gigante" });
    expect(r.plantilla.formato).toBe("vertical");
  });

  it("listarOpcionesPortada expone direcciones, poses, plantillas y estilos", () => {
    const cat = listarOpcionesPortada();
    expect(cat.direcciones).toHaveLength(8);
    for (const d of cat.direcciones) {
      expect(d.colorAcento).toMatch(/^#/);
      expect(d.descripcion.length).toBeGreaterThan(0);
    }
    expect(cat.poses).toHaveLength(14);
    for (const p of cat.poses) expect(p.etiqueta.length).toBeGreaterThan(0);
    expect(cat.plantillas.some((p) => p.formato === "youtube")).toBe(true);
    expect(cat.plantillas.some((p) => p.formato === "vertical")).toBe(true);
    expect(cat.estilosTitular.length).toBeGreaterThanOrEqual(7);
    for (const e of cat.estilosTitular) expect(e.descripcion.length).toBeGreaterThan(0);
  });
});
