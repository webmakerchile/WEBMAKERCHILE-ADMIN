// Buscar el navegador con `which chromium` a secas era lo que impedía generar
// contratos: en Nix y en contenedores el binario se llama de otra forma o vive
// fuera del PATH. El orden de preferencia se prueba con una sonda simulada
// porque, si dependiera de lo que haya instalado aquí, el test diría cosas
// distintas en cada máquina — justo el problema que viene a arreglar.

import { describe, it, expect } from "vitest";
import { elegirChromium, CANDIDATOS_CHROMIUM, type SondaChromium } from "./chromium.js";

const sonda = (opts: Partial<SondaChromium> & { rutas?: string[]; path?: Record<string, string> }): SondaChromium => ({
  existe: (r) => (opts.rutas ?? []).includes(r),
  enPath: (n) => (opts.path ?? {})[n] ?? null,
  configurado: opts.configurado,
});

describe("elegir el ejecutable de Chromium", () => {
  it("lo configurado a mano manda, aunque no exista", () => {
    // Si alguien lo definió y está mal, tiene que ver ESE error, no que se lo
    // sustituyamos por otro binario en silencio.
    const r = elegirChromium(sonda({ configurado: "/ruta/inventada", rutas: ["/usr/bin/chromium"] }));
    expect(r).toBe("/ruta/inventada");
  });

  it("una variable vacía o con espacios no cuenta como configurada", () => {
    expect(elegirChromium(sonda({ configurado: "   ", rutas: ["/usr/bin/chromium"] }))).toBe("/usr/bin/chromium");
    expect(elegirChromium(sonda({ configurado: "", rutas: ["/usr/bin/chromium"] }))).toBe("/usr/bin/chromium");
  });

  it("encuentra el binario en cualquiera de las rutas conocidas", () => {
    for (const ruta of CANDIDATOS_CHROMIUM) {
      expect(elegirChromium(sonda({ rutas: [ruta] })), `no encontró ${ruta}`).toBe(ruta);
    }
  });

  it("respeta el orden de preferencia cuando hay varios", () => {
    const r = elegirChromium(sonda({ rutas: ["/usr/bin/google-chrome", "/usr/bin/chromium"] }));
    expect(r).toBe("/usr/bin/chromium");
  });

  // El caso original: no está en ninguna ruta fija, pero sí en el PATH.
  it("cae al PATH cuando no hay ninguna ruta fija", () => {
    expect(elegirChromium(sonda({ path: { "chromium-browser": "/nix/store/xxx/bin/chromium-browser" } })))
      .toBe("/nix/store/xxx/bin/chromium-browser");
  });

  it("prefiere una ruta fija antes que el PATH", () => {
    const r = elegirChromium(sonda({ rutas: ["/usr/bin/chromium"], path: { chromium: "/otro/chromium" } }));
    expect(r).toBe("/usr/bin/chromium");
  });

  // Sin esto el fallo se confundía con "la cotización está mal" y la gente se
  // ponía a corregir un documento que estaba perfecto.
  it("devuelve null cuando no hay ninguno, en vez de una ruta inventada", () => {
    expect(elegirChromium(sonda({}))).toBeNull();
  });
});
