import { describe, it, expect } from "vitest";
import {
  FORMATOS_HISTORIA,
  LAYOUTS_HISTORIA,
  HIST_WIDTH,
  HIST_HEIGHT,
  resolverFormatoHistoria,
  obtenerFormatoHistoria,
  obtenerLayoutHistoria,
  layoutHistoriaPorDefecto,
  arcoParaFrames,
  listarFormatosHistoria,
} from "./story-formats.js";

describe("banco de layouts de historia", () => {
  it("todas las zonas caben en el lienzo 1080x1920", () => {
    for (const l of LAYOUTS_HISTORIA) {
      expect(l.zonaTitular.x).toBeGreaterThanOrEqual(0);
      expect(l.zonaTitular.x + l.zonaTitular.width).toBeLessThanOrEqual(HIST_WIDTH);
      expect(l.zonaTitular.y).toBeGreaterThanOrEqual(0);
      expect(l.zonaTitular.y + l.zonaTitular.height).toBeLessThanOrEqual(HIST_HEIGHT);
      expect(l.zonaTitular.maxFontSize).toBeGreaterThan(l.zonaTitular.minFontSize);
      if (l.subCopyCenterY !== null) {
        expect(l.subCopyCenterY).toBeGreaterThan(0);
        expect(l.subCopyCenterY).toBeLessThan(HIST_HEIGHT);
      }
      expect(l.zonaEscena.hasta).toBeGreaterThan(l.zonaEscena.desde);
    }
  });

  it("el titular nunca cae dentro de la zona de la escena", () => {
    for (const l of LAYOUTS_HISTORIA) {
      const tituloFin = l.zonaTitular.y + l.zonaTitular.height;
      const solapa = tituloFin > l.zonaEscena.desde && l.zonaTitular.y < l.zonaEscena.hasta;
      expect(solapa, `layout ${l.id}: el titular invade la escena`).toBe(false);
    }
  });

  it("la escena vive fuera de las franjas despejadas", () => {
    for (const l of LAYOUTS_HISTORIA) {
      for (const z of l.zonasDespejadas) {
        const solapa = z.hasta > l.zonaEscena.desde && z.desde < l.zonaEscena.hasta;
        expect(solapa, `layout ${l.id}: zona despejada ${z.desde}-${z.hasta} pisa la escena`).toBe(false);
      }
    }
  });

  it("los bloques de texto opcionales caen en zonas despejadas", () => {
    for (const l of LAYOUTS_HISTORIA) {
      const enDespejada = (y: number) =>
        l.zonasDespejadas.some(z => y >= z.desde && y <= z.hasta);
      if (l.subCopyCenterY !== null && l.bloques.includes("subcopy")) {
        expect(enDespejada(l.subCopyCenterY), `layout ${l.id}: sub-copy fuera de zona despejada`).toBe(true);
      }
      if (l.bloques.includes("cta")) {
        expect(enDespejada(l.ctaCenterY), `layout ${l.id}: CTA fuera de zona despejada`).toBe(true);
      }
      if (l.bloques.includes("hashtags")) {
        expect(enDespejada(l.hashtagsCenterY), `layout ${l.id}: hashtags fuera de zona despejada`).toBe(true);
      }
    }
  });

  it("los layouts con dato gigante declaran su zona", () => {
    for (const l of LAYOUTS_HISTORIA.filter(l => l.bloques.includes("dato_gigante"))) {
      expect(l.zonaDato).toBeDefined();
      expect(l.zonaDato!.alto).toBeGreaterThan(100);
    }
  });

  it("obtenerLayoutHistoria es un lookup puro y hay default", () => {
    expect(obtenerLayoutHistoria("clasico_superior")?.nombre).toBe("Clásico superior");
    expect(obtenerLayoutHistoria("no_existe")).toBeUndefined();
    expect(layoutHistoriaPorDefecto().id).toBe("clasico_superior");
  });
});

describe("banco de formatos narrativos", () => {
  it("todos tienen ids únicos, arcos 2-5 e instrucción de guion", () => {
    const ids = new Set(FORMATOS_HISTORIA.map(f => f.id));
    expect(ids.size).toBe(FORMATOS_HISTORIA.length);
    expect(FORMATOS_HISTORIA.length).toBeGreaterThanOrEqual(5);
    for (const f of FORMATOS_HISTORIA) {
      expect(f.instruccionGuion.length).toBeGreaterThan(150);
      expect(f.porQueRetiene.length).toBeGreaterThan(20);
      expect(f.tiposAfines.length).toBeGreaterThan(0);
      for (const n of [2, 3, 4, 5]) {
        const arco = f.arcos[n];
        expect(arco, `${f.id} no tiene arco de ${n}`).toBeDefined();
        expect(arco!.length).toBe(n);
      }
    }
  });

  it("cada paso apunta a un layout existente y no repite paso dentro del arco", () => {
    for (const f of FORMATOS_HISTORIA) {
      for (const [n, arco] of Object.entries(f.arcos)) {
        const pasos = new Set<string>();
        for (const paso of arco) {
          expect(obtenerLayoutHistoria(paso.layoutId), `${f.id}/${n}: layout ${paso.layoutId} no existe`).toBeDefined();
          expect(paso.objetivo.length).toBeGreaterThan(20);
          expect(pasos.has(paso.paso), `${f.id}/${n}: paso "${paso.paso}" repetido`).toBe(false);
          pasos.add(paso.paso);
        }
      }
    }
  });

  it("todo arco termina en un layout con CTA (el cierre invita)", () => {
    for (const f of FORMATOS_HISTORIA) {
      for (const [n, arco] of Object.entries(f.arcos)) {
        const ultimo = arco[arco.length - 1]!;
        const layout = obtenerLayoutHistoria(ultimo.layoutId)!;
        expect(layout.bloques.includes("cta"), `${f.id}/${n}: el cierre no puede mostrar CTA`).toBe(true);
      }
    }
  });

  it("los tres tipos de historia tienen formatos afines", () => {
    for (const tipo of ["tip_tech", "motivacional", "comunidad"] as const) {
      const afines = FORMATOS_HISTORIA.filter(f => f.tiposAfines.includes(tipo));
      expect(afines.length, `${tipo} se quedó sin formatos`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("resolverFormatoHistoria", () => {
  it("respeta el formato fijado", () => {
    expect(resolverFormatoHistoria("mito_verdad", "tip_tech").id).toBe("mito_verdad");
  });

  it("un id inválido cae en rotación afín al tipo", () => {
    const f = resolverFormatoHistoria("no_existe", "comunidad");
    expect(f.tiposAfines).toContain("comunidad");
  });

  it("la rotación no repite dentro de la ventana de memoria", () => {
    const seq: string[] = [];
    for (let i = 0; i < 24; i++) seq.push(resolverFormatoHistoria(null, "tip_tech").id);
    for (let i = 1; i < seq.length; i++) {
      const ventana = seq.slice(Math.max(0, i - 3), i);
      expect(ventana).not.toContain(seq[i]);
    }
  });

  it("obtenerFormatoHistoria es un lookup puro", () => {
    expect(obtenerFormatoHistoria("caso_real")?.nombre).toBe("Caso real");
    expect(obtenerFormatoHistoria("nope")).toBeUndefined();
  });

  it("listarFormatosHistoria expone lo que necesita la UI", () => {
    for (const f of listarFormatosHistoria()) {
      expect(f.id.length).toBeGreaterThan(0);
      expect(f.nombre.length).toBeGreaterThan(0);
      expect(f.descripcion.length).toBeGreaterThan(0);
      expect(f.porQueRetiene.length).toBeGreaterThan(0);
    }
  });
});

describe("arcoParaFrames", () => {
  const formato = obtenerFormatoHistoria("caso_real")!;

  it("devuelve exactamente N pasos para 2..5", () => {
    for (const n of [2, 3, 4, 5]) {
      expect(arcoParaFrames(formato, n)).toHaveLength(n);
    }
  });

  it("una historia única devuelve un solo paso que cierra", () => {
    const arco = arcoParaFrames(formato, 1);
    expect(arco).toHaveLength(1);
    expect(obtenerLayoutHistoria(arco[0]!.layoutId)!.bloques).toContain("cta");
  });

  it("acota valores fuera de rango sin romperse", () => {
    expect(arcoParaFrames(formato, 0)).toHaveLength(1);
    expect(arcoParaFrames(formato, 99)).toHaveLength(5);
  });

  it("todos los formatos responden a todas las cantidades", () => {
    for (const f of FORMATOS_HISTORIA) {
      for (const n of [1, 2, 3, 4, 5]) {
        expect(arcoParaFrames(f, n)).toHaveLength(n);
      }
    }
  });
});
