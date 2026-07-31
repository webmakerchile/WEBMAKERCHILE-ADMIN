// Un fallo aquí no lanza excepción: deja el titular medio fuera del lienzo, o
// el scrim sin encontrar, y la pieza sale publicable a ojos del panel. Por eso
// lo que se comprueba es que NADA se salga y que el 9:16 no cambie ni un píxel.

import { describe, it, expect } from "vitest";
import { escalarLayout, esLienzoHistoria, LIENZO_HISTORIA } from "./escalar-layout";
import { LAYOUTS_HISTORIA, HIST_HEIGHT, HIST_WIDTH } from "./story-formats";

const FEED_4_5 = { width: 1080, height: 1350 };
const CUADRADO = { width: 1080, height: 1080 };

describe("reconocer el lienzo de siempre", () => {
  it("9:16 es el de historia", () => {
    expect(esLienzoHistoria(LIENZO_HISTORIA)).toBe(true);
    expect(esLienzoHistoria({ width: HIST_WIDTH, height: HIST_HEIGHT })).toBe(true);
  });

  it("los del feed no", () => {
    expect(esLienzoHistoria(FEED_4_5)).toBe(false);
    expect(esLienzoHistoria(CUADRADO)).toBe(false);
  });
});

describe("el 9:16 no se toca", () => {
  // Historias funciona hoy. Si escalar cambiara aunque fuera un redondeo, este
  // arreglo rompería lo único que estaba bien.
  it("devuelve el mismo objeto, sin recalcular nada", () => {
    for (const l of LAYOUTS_HISTORIA) {
      expect(escalarLayout(l, LIENZO_HISTORIA), l.id).toBe(l);
    }
  });
});

describe("llevar los layouts al feed", () => {
  for (const lienzo of [FEED_4_5, CUADRADO]) {
    const nombre = `${lienzo.width}x${lienzo.height}`;

    it(`ningún bloque se sale del lienzo en ${nombre}`, () => {
      for (const original of LAYOUTS_HISTORIA) {
        const l = escalarLayout(original, lienzo);
        const zt = l.zonaTitular;
        expect(zt.y, `${original.id} titular arriba`).toBeGreaterThanOrEqual(0);
        expect(zt.y + zt.height, `${original.id} titular abajo`).toBeLessThanOrEqual(lienzo.height);
        expect(zt.x + zt.width, `${original.id} titular a la derecha`).toBeLessThanOrEqual(lienzo.width);

        for (const centro of [l.subCopyCenterY, l.ctaCenterY, l.hashtagsCenterY]) {
          if (centro === null) continue;
          expect(centro, `${original.id} bloque fuera`).toBeGreaterThan(0);
          expect(centro, `${original.id} bloque fuera`).toBeLessThanOrEqual(lienzo.height);
        }

        for (const z of l.zonasDespejadas) {
          expect(z.hasta, `${original.id} zona despejada`).toBeLessThanOrEqual(lienzo.height);
          expect(z.desde).toBeLessThan(z.hasta);
        }
        expect(l.zonaEscena.hasta).toBeLessThanOrEqual(lienzo.height);
      }
    });

    it(`la franja que llegaba al fondo sigue llegando en ${nombre}`, () => {
      // El scrim inferior se busca con `hasta >= alto`. Si el redondeo dejara la
      // franja un píxel corta, no se encontraría y el texto quedaría sobre la
      // ilustración sin oscurecer: legible en la previa, ilegible en el feed.
      for (const original of LAYOUTS_HISTORIA) {
        const teniaFondo = original.zonasDespejadas.some((z) => z.hasta >= HIST_HEIGHT);
        if (!teniaFondo) continue;
        const l = escalarLayout(original, lienzo);
        expect(l.zonasDespejadas.some((z) => z.hasta >= lienzo.height), original.id).toBe(true);
      }
    });
  }

  it("los márgenes laterales se conservan: el ancho no cambia", () => {
    // Todos los lienzos miden 1080 de ancho. Escalar con un solo factor —el del
    // alto— encogería los márgenes y el titular quedaría flotando con aire a
    // los lados.
    const l = escalarLayout(LAYOUTS_HISTORIA[0], FEED_4_5);
    expect(l.zonaTitular.x).toBe(LAYOUTS_HISTORIA[0].zonaTitular.x);
    expect(l.zonaTitular.width).toBe(LAYOUTS_HISTORIA[0].zonaTitular.width);
  });

  it("la tipografía encoge con el alto, que es lo que cambia", () => {
    const original = LAYOUTS_HISTORIA[0];
    const l = escalarLayout(original, FEED_4_5);
    expect(l.zonaTitular.maxFontSize).toBeLessThan(original.zonaTitular.maxFontSize);
  });

  // "Cabe" no es el objetivo: el objetivo es que se lea. Un titular a 20 px
  // cabe perfectamente y en un feed no lo lee nadie.
  it("la fuente mínima no baja del suelo legible", () => {
    for (const original of LAYOUTS_HISTORIA) {
      expect(escalarLayout(original, CUADRADO).zonaTitular.minFontSize).toBeGreaterThanOrEqual(28);
    }
  });

  it("un layout sin sub-copy sigue sin tenerlo", () => {
    const sinSub = LAYOUTS_HISTORIA.find((l) => l.subCopyCenterY === null);
    if (!sinSub) return;
    expect(escalarLayout(sinSub, FEED_4_5).subCopyCenterY).toBeNull();
  });

  it("un layout sin zona de dato no se la inventa", () => {
    const sinDato = LAYOUTS_HISTORIA.find((l) => !l.zonaDato);
    if (!sinDato) return;
    expect(escalarLayout(sinDato, FEED_4_5).zonaDato).toBeUndefined();
  });
});
