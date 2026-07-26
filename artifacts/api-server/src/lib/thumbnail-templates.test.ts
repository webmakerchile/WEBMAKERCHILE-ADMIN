import { describe, it, expect } from "vitest";
import {
  PLANTILLAS_PORTADA,
  resolverPlantilla,
  obtenerPlantilla,
  listarPlantillas,
} from "./thumbnail-templates.js";

describe("banco de plantillas", () => {
  it("tiene plantillas de ambos formatos con ids únicos y zonas dentro del lienzo", () => {
    const ids = new Set(PLANTILLAS_PORTADA.map(p => p.id));
    expect(ids.size).toBe(PLANTILLAS_PORTADA.length);
    expect(PLANTILLAS_PORTADA.filter(p => p.formato === "youtube").length).toBeGreaterThanOrEqual(5);
    expect(PLANTILLAS_PORTADA.filter(p => p.formato === "vertical").length).toBeGreaterThanOrEqual(2);
    for (const p of PLANTILLAS_PORTADA) {
      const lienzo = p.formato === "youtube" ? { w: 1280, h: 720 } : { w: 1080, h: 1920 };
      expect(p.zona.x).toBeGreaterThanOrEqual(0);
      expect(p.zona.y).toBeGreaterThanOrEqual(0);
      expect(p.zona.x + p.zona.width).toBeLessThanOrEqual(lienzo.w);
      expect(p.zona.y + p.zona.height).toBeLessThanOrEqual(lienzo.h);
      expect(p.zona.maxFontSize).toBeGreaterThan(p.zona.minFontSize);
      expect(p.bloqueComposicion(true).length).toBeGreaterThan(80);
      expect(p.bloqueComposicion(false).length).toBeGreaterThan(80);
    }
  });

  it("cada bloque de composición exige una zona despejada para el titular", () => {
    for (const p of PLANTILLAS_PORTADA) {
      expect(p.bloqueComposicion(false).toUpperCase()).toMatch(/DESPEJAD/);
    }
  });

  it("los bloques con persona nombran al protagonista real y sin persona a Webi", () => {
    for (const p of PLANTILLAS_PORTADA.filter(p => p.formato === "youtube")) {
      expect(p.bloqueComposicion(true).toLowerCase()).toContain("persona real");
      expect(p.bloqueComposicion(false).toLowerCase()).toContain("webi");
    }
  });
});

describe("resolverPlantilla", () => {
  it("respeta la plantilla fijada del formato correcto", () => {
    expect(resolverPlantilla("yt_testimonio", "youtube").id).toBe("yt_testimonio");
    expect(resolverPlantilla("v_titular_inferior", "vertical").id).toBe("v_titular_inferior");
  });

  it("una plantilla de otro formato cae en rotación del formato pedido", () => {
    const p = resolverPlantilla("v_titular_superior", "youtube");
    expect(p.formato).toBe("youtube");
  });

  it("la rotación youtube intercala sin repetir dentro de la ventana", () => {
    const seq: string[] = [];
    for (let i = 0; i < 30; i++) seq.push(resolverPlantilla(null, "youtube").id);
    for (let i = 1; i < seq.length; i++) {
      const ventana = seq.slice(Math.max(0, i - 3), i);
      expect(ventana).not.toContain(seq[i]);
    }
    // Testimonio nunca entra a la rotación automática.
    expect(seq).not.toContain("yt_testimonio");
  });

  it("la rotación vertical alterna (memoria menor que el pool)", () => {
    const seq: string[] = [];
    for (let i = 0; i < 12; i++) seq.push(resolverPlantilla(null, "vertical").id);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });

  it("miles con espacio no activan 'top número' en la rotación", () => {
    for (let i = 0; i < 40; i++) {
      const p = resolverPlantilla(null, "youtube", { titulo: "10 000 seguidores en un mes" });
      expect(p.id).not.toBe("yt_top_numero");
    }
  });

  it("'top número' solo entra al pool cuando el título empieza con número", () => {
    for (let i = 0; i < 40; i++) {
      const sin = resolverPlantilla(null, "youtube", { titulo: "los errores de siempre" });
      expect(sin.id).not.toBe("yt_top_numero");
    }
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) ids.add(resolverPlantilla(null, "youtube", { titulo: "5 errores fatales" }).id);
    expect(ids.has("yt_top_numero")).toBe(true);
  });

  it("obtenerPlantilla es un lookup puro", () => {
    expect(obtenerPlantilla("yt_cara_gigante")?.nombre).toBe("Cara gigante");
    expect(obtenerPlantilla("no_existe")).toBeUndefined();
  });

  it("listarPlantillas expone id, formato, nombre y descripción", () => {
    for (const p of listarPlantillas()) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(["youtube", "vertical"]).toContain(p.formato);
      expect(p.nombre.length).toBeGreaterThan(0);
      expect(p.descripcion.length).toBeGreaterThan(0);
    }
  });
});
