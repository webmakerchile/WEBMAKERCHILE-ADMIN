// Llevar un layout de historia a un lienzo de feed.
//
// El problema que arregla: los formatos interactivos del FEED se componían
// enteros a 9:16 y luego se recortaban. La cadena era
//
//   el modelo genera 1024x1536  →  se recorta a 1080x1920  →  se dibuja el
//   titular encima  →  se recorta OTRA VEZ a 1080x1350 (o 1080x1080)
//
// o sea que el segundo recorte se comía el 30 % del alto en 4:5 y el 44 % en
// 1:1, con el titular ya dibujado dentro. No es que "se perdiera parte de la
// ilustración": se cortaba el texto. Por eso en Historias se veía bien y en el
// feed no, que es exactamente como se reportó.
//
// Las coordenadas de los layouts son píxeles absolutos de 1080x1920
// (`story-formats.ts`), así que para componer directamente sobre el lienzo del
// feed hay que llevarlas ahí. Esto lo hace, y es puro para poder comprobar que
// nada se sale: un error aquí no da excepción, deja el titular medio fuera.

import { HIST_HEIGHT, HIST_WIDTH, type LayoutHistoria } from "./story-formats.js";

export interface Lienzo {
  width: number;
  height: number;
}

export const LIENZO_HISTORIA: Lienzo = { width: HIST_WIDTH, height: HIST_HEIGHT };

/** ¿Es el lienzo de historia de siempre? Entonces no hay nada que escalar. */
export function esLienzoHistoria(lienzo: Lienzo): boolean {
  return lienzo.width === HIST_WIDTH && lienzo.height === HIST_HEIGHT;
}

/**
 * Escala un layout al lienzo dado.
 *
 * Se escala por SEPARADO en cada eje: el ancho de todos los lienzos es 1080, y
 * usar un solo factor (el del alto) encogería los márgenes laterales y el
 * titular quedaría flotando en medio con aire a los lados.
 *
 * Los tamaños de fuente van con el factor vertical, que es el que de verdad
 * cambia: en 4:5 hay un 70 % del alto, así que un titular pensado para 1920
 * ocuparía proporcionalmente mucho más y empujaría al resto fuera.
 */
export function escalarLayout(layout: LayoutHistoria, lienzo: Lienzo): LayoutHistoria {
  if (esLienzoHistoria(lienzo)) return layout;

  const fx = lienzo.width / HIST_WIDTH;
  const fy = lienzo.height / HIST_HEIGHT;
  const x = (v: number) => Math.round(v * fx);
  const y = (v: number) => Math.round(v * fy);

  return {
    ...layout,
    zonaTitular: {
      ...layout.zonaTitular,
      x: x(layout.zonaTitular.x),
      y: y(layout.zonaTitular.y),
      width: x(layout.zonaTitular.width),
      height: y(layout.zonaTitular.height),
      maxFontSize: Math.round(layout.zonaTitular.maxFontSize * fy),
      // El mínimo NO baja del suelo legible aunque el lienzo encoja: un titular
      // a 20 px cabe, pero en un feed no lo lee nadie, y "cabe" no es el
      // objetivo — el objetivo es que se lea.
      minFontSize: Math.max(28, Math.round(layout.zonaTitular.minFontSize * fy)),
    },
    subCopyCenterY: layout.subCopyCenterY === null ? null : y(layout.subCopyCenterY),
    ctaCenterY: y(layout.ctaCenterY),
    hashtagsCenterY: y(layout.hashtagsCenterY),
    zonaDato: layout.zonaDato
      ? { y: y(layout.zonaDato.y), alto: y(layout.zonaDato.alto) }
      : undefined,
    zonasDespejadas: layout.zonasDespejadas.map((z) => ({
      desde: y(z.desde),
      // La franja que llegaba al fondo tiene que seguir llegando al fondo: si
      // el redondeo la dejara un píxel corta, el scrim inferior —que se busca
      // con `hasta >= alto`— dejaría de encontrarse y el texto quedaría sobre
      // la ilustración sin oscurecer.
      hasta: z.hasta >= HIST_HEIGHT ? lienzo.height : y(z.hasta),
    })),
    zonaEscena: { desde: y(layout.zonaEscena.desde), hasta: y(layout.zonaEscena.hasta) },
  };
}
