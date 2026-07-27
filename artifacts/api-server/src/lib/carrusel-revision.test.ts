import { describe, it, expect } from "vitest";
import { revisarCarrusel, similitud, type SlideRevisable } from "./carrusel-revision.js";

const slide = (n: number, rol: string, titulo: string, subtitulo = "", visual = "Webi mirando"): SlideRevisable =>
  ({ numero: n, rol, titulo, subtitulo, prompt_visual: visual });

const buenCarrusel: SlideRevisable[] = [
  slide(1, "portada", "Tu web tarda ocho segundos en abrir", "La mitad se va antes de verla"),
  slide(2, "desarrollo", "Las fotos pesan más que la página", "Cada imagen sin comprimir suma dos segundos"),
  slide(3, "cta", "Lo revisamos contigo", "Te decimos qué la frena"),
];

describe("revisarCarrusel", () => {
  it("un carrusel bien hecho no tiene observaciones", () => {
    expect(revisarCarrusel(buenCarrusel, true)).toEqual([]);
  });

  it("detecta slides sin título o sin dirección visual", () => {
    const r = revisarCarrusel([slide(1, "portada", ""), slide(2, "cta", "Hablemos", "", "")], true);
    expect(r.some(i => i.includes("sin título"))).toBe(true);
    expect(r.some(i => i.includes("prompt_visual"))).toBe(true);
  });

  it("detecta aperturas de manual", () => {
    const r = revisarCarrusel([slide(1, "portada", "¿Sabías que pierdes clientes?"), slide(2, "cta", "Hablemos")], true);
    expect(r.some(i => i.includes("fórmula de manual"))).toBe(true);
  });

  it("detecta muletillas de plataforma", () => {
    const r = revisarCarrusel([slide(1, "portada", "Mira esto", "Desliza para ver"), slide(2, "cta", "Hablemos")], true);
    expect(r.some(i => i.includes("desliza"))).toBe(true);
  });

  it("detecta el subtítulo que repite el título", () => {
    // Es la firma número uno del texto de máquina.
    const r = revisarCarrusel([
      slide(1, "portada", "Tu web tarda mucho en cargar", "Tu web carga demasiado lento y tarda"),
      slide(2, "cta", "Hablemos"),
    ], true);
    expect(r.some(i => i.includes("repite el título"))).toBe(true);
  });

  it("detecta slides que dicen lo mismo: el carrusel no avanza", () => {
    const r = revisarCarrusel([
      slide(1, "portada", "Pierdes clientes por la velocidad"),
      slide(2, "desarrollo", "Por la velocidad pierdes clientes"),
      slide(3, "cta", "Hablemos"),
    ], true);
    expect(r.some(i => i.includes("dicen lo mismo"))).toBe(true);
  });

  it("exige portada al inicio y cierre al final solo en carruseles", () => {
    const mal = [slide(1, "desarrollo", "A"), slide(2, "desarrollo", "B")];
    expect(revisarCarrusel(mal, true).some(i => i.includes("portada"))).toBe(true);
    // Una publicación única no tiene arco que respetar.
    expect(revisarCarrusel([slide(1, "unica", "A")], false)).toEqual([]);
  });

  it("no repite el mismo aviso", () => {
    const r = revisarCarrusel([slide(1, "portada", "", "", ""), slide(2, "cta", "", "", "")], true);
    expect(new Set(r).size).toBe(r.length);
  });

  it("avisa si no se generó nada", () => {
    expect(revisarCarrusel([], true)).toHaveLength(1);
  });
});

describe("similitud", () => {
  it("mide parecido real, ignorando palabras vacías", () => {
    expect(similitud("Tu web carga lento", "Tu web carga lento")).toBe(1);
    expect(similitud("Tu web carga lento", "Las fotos pesan mucho")).toBeLessThan(0.2);
    expect(similitud("", "algo")).toBe(0);
  });
});
