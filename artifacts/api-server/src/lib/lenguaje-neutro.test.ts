import { describe, it, expect } from "vitest";
import {
  REGLA_ESPANOL_NEUTRO,
  neutralizarEspanolismos,
  detectarEspanolismos,
} from "./lenguaje-neutro.js";

describe("neutralizarEspanolismos", () => {
  it("corrige el que se coló en producción", () => {
    expect(neutralizarEspanolismos("Dos historias empalmadas")).toBe("Dos historias enlazadas");
    expect(neutralizarEspanolismos("empalmar los pedidos")).toBe("enlazar los pedidos");
  });

  it("conserva la capitalización", () => {
    expect(neutralizarEspanolismos("Empalmadas y listo")).toBe("Enlazadas y listo");
    expect(neutralizarEspanolismos("EMPALMADAS")).toBe("ENLAZADAS");
  });

  it("cambia el vocabulario de España por el latinoamericano", () => {
    expect(neutralizarEspanolismos("Abre el ordenador")).toBe("Abre el computador");
    expect(neutralizarEspanolismos("desde el móvil")).toBe("desde el celular");
    expect(neutralizarEspanolismos("Es una web guay")).toBe("Es una web genial");
    expect(neutralizarEspanolismos("hay que currar")).toBe("hay que trabajar");
    expect(neutralizarEspanolismos("va a por todas")).toBe("va por todas");
  });

  it("elimina la segunda persona del plural", () => {
    expect(neutralizarEspanolismos("vosotros sabéis")).toContain("ustedes");
    expect(neutralizarEspanolismos("vuestro negocio")).toBe("su negocio");
    expect(neutralizarEspanolismos("vuestras cuentas")).toBe("sus cuentas");
  });

  it("NO toca 'móvil' cuando es adjetivo", () => {
    // "diseño móvil" es correcto en toda la región: corregirlo sería peor.
    expect(neutralizarEspanolismos("diseño móvil adaptable")).toBe("diseño móvil adaptable");
    expect(neutralizarEspanolismos("versión móvil")).toBe("versión móvil");
  });

  it("no destruye el texto neutro", () => {
    const t = "Ana perdía 40 pedidos al mes y nadie contestaba después de las nueve.";
    expect(neutralizarEspanolismos(t)).toBe(t);
  });

  it("nunca rompe la concordancia de género del artículo", () => {
    // Un reemplazo que deje "el computadora" es peor que el españolismo:
    // todos los equivalentes conservan el género del término original.
    expect(neutralizarEspanolismos("el ordenador nuevo")).toBe("el computador nuevo");
    expect(neutralizarEspanolismos("los ordenadores")).toBe("los computadores");
    expect(neutralizarEspanolismos("un coche")).toBe("un auto");
    expect(neutralizarEspanolismos("una web cutre")).toBe("una web de mala calidad");
  });

  it("no toca palabras que solo CONTIENEN un españolismo", () => {
    expect(neutralizarEspanolismos("molarizado")).toBe("molarizado");
    expect(neutralizarEspanolismos("recoger")).toBe("recoger");
  });
});

describe("detectarEspanolismos", () => {
  it("marca los ambiguos para que el modelo reescriba", () => {
    expect(detectarEspanolismos("Vale, lo vemos mañana")).toContain("vale");
    expect(detectarEspanolismos("hay que coger el pedido")).toContain("coger");
  });

  it("no marca texto neutro", () => {
    expect(detectarEspanolismos("Ana cerró la caja a las once")).toEqual([]);
  });

  it("respeta límites de palabra con acentos alrededor", () => {
    expect(detectarEspanolismos("recoger la información")).toEqual([]);
  });
});

describe("REGLA_ESPANOL_NEUTRO", () => {
  it("prohíbe España explícitamente y permite lo coloquial universal", () => {
    expect(REGLA_ESPANOL_NEUTRO).toContain("PROHIBIDO EL ESPAÑOL DE ESPAÑA");
    expect(REGLA_ESPANOL_NEUTRO).toContain("empalmar");
    expect(REGLA_ESPANOL_NEUTRO).toContain("vosotros");
    expect(REGLA_ESPANOL_NEUTRO).toContain("SÍ puedes ser coloquial");
  });

  it("sigue prohibiendo el modismo de un solo país, incluido Chile", () => {
    expect(REGLA_ESPANOL_NEUTRO).toContain("cachái");
    expect(REGLA_ESPANOL_NEUTRO).toContain("chamba");
    expect(REGLA_ESPANOL_NEUTRO).toContain("voseo");
  });
});
