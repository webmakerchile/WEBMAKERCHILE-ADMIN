import { describe, expect, it } from "vitest";
import {
  DIRECCIONES_PORTADA,
  seleccionarDireccion,
  elegirDetalle,
  elegirPalabrasAcento,
  esErrorRateLimit,
  buildCoverIllustrationPrompt,
  buildTitleOverlaySvg,
  splitTextIntoLines,
} from "./cover-style";
import { seleccionarPosePortada } from "./pose-bank";

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

describe("buildTitleOverlaySvg", () => {
  const dirChips = DIRECCIONES_PORTADA.find(d => d.titular.modo === "chips")!;
  const dirLimpio = DIRECCIONES_PORTADA.find(d => d.titular.modo === "limpio")!;

  it("siempre usa scrim degradado, nunca franja sólida amarilla", () => {
    for (const dir of DIRECCIONES_PORTADA) {
      const svg = buildTitleOverlaySvg("5 SECRETOS DEL MARKETING DIGITAL", dir).toString();
      expect(svg).toContain("linearGradient");
      expect(svg).toContain('stop-opacity="0"');
      expect(svg.toUpperCase()).not.toContain("#FFB800");
    }
  });

  it("modo chips dibuja placas con el color de la dirección", () => {
    const svg = buildTitleOverlaySvg("EL SECRETO DE LAS VENTAS", dirChips).toString();
    expect(svg).toContain(`fill="${dirChips.titular.chipFondo}"`);
    expect(svg).toContain("rx=");
  });

  it("modo limpio no dibuja placas pero sí sombra", () => {
    const svg = buildTitleOverlaySvg("EL SECRETO DE LAS VENTAS", dirLimpio).toString();
    expect(svg).not.toContain(`rx=`);
    expect(svg).toContain("rgba(0,0,0,0.5)");
  });

  it("destaca palabras de acento con el color de la dirección", () => {
    const svg = buildTitleOverlaySvg("3 TRUCOS DE VENTAS", dirChips).toString();
    expect(svg).toContain(`fill="${dirChips.titular.colorAcento}"`);
  });

  it("aplica la inclinación configurada", () => {
    const svg = buildTitleOverlaySvg("TITULAR DE PRUEBA", dirChips).toString();
    expect(svg).toContain(`rotate(${dirChips.titular.inclinacion},`);
  });

  it("escapa caracteres XML del título", () => {
    const svg = buildTitleOverlaySvg("MÁS <VENTAS> & ÉXITO", dirLimpio).toString();
    expect(svg).toContain("&lt;VENTAS&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).not.toMatch(/<VENTAS>/);
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
