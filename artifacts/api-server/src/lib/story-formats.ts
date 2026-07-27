// Sistema de FORMATOS NARRATIVOS y LAYOUTS para historias 9:16.
//
// Equivalente de las plantillas de portadas, pero en dos ejes:
//
//  · FORMATO NARRATIVO: qué historia se cuenta y cómo progresa entre frames
//    (arcos por cantidad de frames + instrucciones de guion para el LLM).
//    Antes cada frame se escribía por separado con roles genéricos
//    (hook/desarrollo/cta) y la serie no tenía hilo real.
//
//  · LAYOUT: cómo se compone el texto sobre el lienzo 1080x1920 y qué zonas
//    debe dejar despejadas la ilustración. Antes había UN layout fijo que
//    siempre pintaba título + sub-copy + botón naranja + hashtags, en TODOS
//    los frames — de ahí la sensación de plantilla.
//
// El CTA y los hashtags dejan de ser obligatorios por frame: solo aparecen
// donde el formato lo pide (normalmente el cierre).

import type { ZonaTexto } from "./title-style.js";

export const HIST_WIDTH = 1080;
export const HIST_HEIGHT = 1920;

/* ========================= Layouts visuales ============================== */

/** Bloques que un layout puede dibujar sobre la historia. */
export type BloqueHistoria =
  | "titular"
  | "subcopy"
  | "cta"
  | "hashtags"
  | "dato_gigante"
  | "comillas"
  | "contador";

export interface LayoutHistoria {
  id: string;
  nombre: string;
  descripcionUi: string;
  /** Zona del titular (la usa el motor de tipografía de impacto). */
  zonaTitular: ZonaTexto;
  /** Centro vertical del sub-copy (px). null = este layout no lleva sub-copy. */
  subCopyCenterY: number | null;
  /** Centro vertical del botón CTA (px). Solo se dibuja si el frame trae CTA. */
  ctaCenterY: number;
  /** Centro vertical de los hashtags (px). Solo si el frame trae hashtags. */
  hashtagsCenterY: number;
  /** Zona del dato gigante, para layouts que lo llevan. */
  zonaDato?: { y: number; alto: number };
  bloques: BloqueHistoria[];
  /** Franjas que la ILUSTRACIÓN debe dejar limpias, en píxeles. */
  zonasDespejadas: Array<{ desde: number; hasta: number }>;
  /** Rango vertical donde vive Webi (se inyecta al prompt de imagen). */
  zonaEscena: { desde: number; hasta: number };
  /** Scrim: dónde oscurecer para legibilidad. */
  scrim: "superior" | "inferior" | "ambos";
}

const zona = (
  y: number,
  height: number,
  maxFontSize: number,
  minFontSize = 46,
  align: "left" | "center" = "center",
): ZonaTexto => ({
  x: 80,
  y,
  width: HIST_WIDTH - 160,
  height,
  align,
  vertical: "center",
  maxFontSize,
  minFontSize,
});

export const LAYOUTS_HISTORIA: LayoutHistoria[] = [
  {
    id: "clasico_superior",
    nombre: "Clásico superior",
    descripcionUi: "Titular arriba, escena al centro y remate abajo.",
    zonaTitular: zona(150, 300, 112),
    subCopyCenterY: 1450,
    ctaCenterY: 1620,
    hashtagsCenterY: 1780,
    bloques: ["titular", "subcopy", "cta", "hashtags", "contador"],
    zonasDespejadas: [
      { desde: 0, hasta: 560 },
      { desde: 1300, hasta: HIST_HEIGHT },
    ],
    zonaEscena: { desde: 560, hasta: 1300 },
    scrim: "ambos",
  },
  {
    id: "editorial_inferior",
    nombre: "Editorial inferior",
    descripcionUi: "La escena respira arriba y el titular remata abajo, estilo revista.",
    zonaTitular: zona(1240, 330, 112, 46, "left"),
    subCopyCenterY: 1680,
    ctaCenterY: 1700,
    hashtagsCenterY: 1830,
    bloques: ["titular", "subcopy", "contador"],
    zonasDespejadas: [
      { desde: 0, hasta: 200 },
      { desde: 1180, hasta: HIST_HEIGHT },
    ],
    zonaEscena: { desde: 200, hasta: 1180 },
    scrim: "inferior",
  },
  {
    id: "dato_gigante",
    nombre: "Dato gigante",
    descripcionUi: "Una cifra enorme manda y el titular la explica. Para números que impactan.",
    zonaTitular: zona(700, 220, 84),
    zonaDato: { y: 170, alto: 400 },
    subCopyCenterY: 1640,
    ctaCenterY: 1700,
    hashtagsCenterY: 1830,
    bloques: ["dato_gigante", "titular", "subcopy", "contador"],
    zonasDespejadas: [
      { desde: 0, hasta: 960 },
      { desde: 1520, hasta: HIST_HEIGHT },
    ],
    zonaEscena: { desde: 960, hasta: 1520 },
    scrim: "ambos",
  },
  {
    id: "cita_testimonio",
    nombre: "Cita",
    descripcionUi: "Comillas grandes y frase en primera persona. Para testimonios y confesiones.",
    zonaTitular: zona(300, 420, 92, 44, "left"),
    subCopyCenterY: 1620,
    ctaCenterY: 1700,
    hashtagsCenterY: 1830,
    bloques: ["comillas", "titular", "subcopy", "contador"],
    zonasDespejadas: [
      { desde: 0, hasta: 880 },
      { desde: 1500, hasta: HIST_HEIGHT },
    ],
    zonaEscena: { desde: 880, hasta: 1500 },
    scrim: "ambos",
  },
  {
    id: "respiro",
    nombre: "Respiro",
    descripcionUi: "Solo el titular y la escena. Silencio visual para los momentos de tensión.",
    zonaTitular: zona(190, 380, 124),
    subCopyCenterY: null,
    ctaCenterY: 1700,
    hashtagsCenterY: 1830,
    bloques: ["titular", "contador"],
    zonasDespejadas: [
      { desde: 0, hasta: 640 },
      { desde: 1520, hasta: HIST_HEIGHT },
    ],
    zonaEscena: { desde: 640, hasta: 1520 },
    scrim: "superior",
  },
  {
    id: "cierre_invitacion",
    nombre: "Cierre",
    descripcionUi: "Layout de remate: titular, una línea de contexto y la invitación.",
    zonaTitular: zona(180, 300, 106),
    subCopyCenterY: 1420,
    ctaCenterY: 1610,
    hashtagsCenterY: 1790,
    bloques: ["titular", "subcopy", "cta", "hashtags"],
    zonasDespejadas: [
      { desde: 0, hasta: 560 },
      { desde: 1290, hasta: HIST_HEIGHT },
    ],
    zonaEscena: { desde: 560, hasta: 1290 },
    scrim: "ambos",
  },
];

const LAYOUTS_POR_ID = new Map(LAYOUTS_HISTORIA.map(l => [l.id, l]));

export function obtenerLayoutHistoria(id: string): LayoutHistoria | undefined {
  return LAYOUTS_POR_ID.get(id);
}

/** Layout por defecto cuando un id no existe (compatibilidad hacia atrás). */
export function layoutHistoriaPorDefecto(): LayoutHistoria {
  return LAYOUTS_POR_ID.get("clasico_superior")!;
}

/* ==================== Formatos narrativos ================================ */

/** Un paso del arco: qué cuenta ese frame y con qué layout se compone. */
export interface PasoNarrativo {
  /** Etiqueta del rol narrativo (va al prompt del guion). */
  paso: string;
  /** Qué debe lograr este frame, en instrucción directa para el guionista. */
  objetivo: string;
  layoutId: string;
}

export interface FormatoHistoria {
  id: string;
  nombre: string;
  descripcionUi: string;
  /** Mecanismo de retención: por qué el espectador no se salta la serie. */
  porQueRetiene: string;
  /** Bloque de prompt con la voz y las reglas de guion de este formato. */
  instruccionGuion: string;
  /** Arcos por cantidad de frames (2..5). */
  arcos: Record<number, PasoNarrativo[]>;
  /** Tipos de historia donde este formato encaja bien. */
  tiposAfines: Array<"tip_tech" | "motivacional" | "comunidad">;
}

export const FORMATOS_HISTORIA: FormatoHistoria[] = [
  {
    id: "caso_real",
    nombre: "Caso real",
    descripcionUi: "Un negocio concreto, su problema y cómo lo resolvió. Con cifras.",
    porQueRetiene:
      "El espectador se reconoce en el protagonista y quiere saber cómo terminó su historia.",
    instruccionGuion: `FORMATO: CASO REAL (mini-documental de negocio).
- Inventa UN protagonista concreto y verosímil y MANTENLO en todos los frames: nombre de pila, tipo de negocio y ciudad LATAM (ej: "Ana, panadería en Ñuñoa"). Nunca lo cambies a mitad de la serie.
- Cuenta en PASADO lo que le ocurrió, como quien relata algo que vio de cerca. Nada de hablarle al espectador con imperativos hasta el cierre.
- Usa cifras concretas y creíbles (pedidos perdidos, horas, clientes, porcentajes) y REPÍTELAS de forma consistente: si en el frame 2 dijiste "40 pedidos", en el frame 4 sigue siendo 40.
- El servicio de WebMakerLatam aparece como lo que resolvió el problema, no como un anuncio.`,
    arcos: {
      2: [
        { paso: "el_problema", objetivo: "Presenta al protagonista y el problema que lo tenía atascado, con una cifra concreta.", layoutId: "clasico_superior" },
        { paso: "el_resultado", objetivo: "Cómo terminó y qué lo cambió. Cierra invitando a quien se sienta identificado.", layoutId: "cierre_invitacion" },
      ],
      3: [
        { paso: "presentacion", objetivo: "Presenta al protagonista y el síntoma que notó primero. Deja la causa sin explicar.", layoutId: "clasico_superior" },
        { paso: "el_diagnostico", objetivo: "Revela la causa real del problema, con la cifra que la hizo evidente.", layoutId: "dato_gigante" },
        { paso: "el_resultado", objetivo: "Qué cambió tras resolverlo y cómo está hoy. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      4: [
        { paso: "presentacion", objetivo: "Presenta al protagonista y su día a día antes del problema.", layoutId: "clasico_superior" },
        { paso: "el_sintoma", objetivo: "El momento en que notó que algo iba mal. Concreto y cotidiano.", layoutId: "respiro" },
        { paso: "el_diagnostico", objetivo: "La causa real, con la cifra que la hizo evidente.", layoutId: "dato_gigante" },
        { paso: "el_resultado", objetivo: "Cómo está hoy y qué lo cambió. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      5: [
        { paso: "presentacion", objetivo: "Presenta al protagonista, su negocio y su ciudad.", layoutId: "clasico_superior" },
        { paso: "el_sintoma", objetivo: "El momento exacto en que notó que algo iba mal.", layoutId: "respiro" },
        { paso: "el_diagnostico", objetivo: "La causa real detrás del síntoma, con la cifra que la hizo evidente.", layoutId: "dato_gigante" },
        { paso: "el_cambio", objetivo: "Qué hizo distinto y cómo se sintió el primer resultado.", layoutId: "editorial_inferior" },
        { paso: "el_resultado", objetivo: "Dónde está hoy. Cierra invitando a quien se sienta identificado.", layoutId: "cierre_invitacion" },
      ],
    },
    tiposAfines: ["tip_tech", "comunidad"],
  },
  {
    id: "antes_despues",
    nombre: "Antes y después",
    descripcionUi: "La transformación de un negocio, lado a lado. Muy visual.",
    porQueRetiene: "El contraste promete un salto concreto y el espectador quiere ver el después.",
    instruccionGuion: `FORMATO: ANTES Y DESPUÉS (transformación).
- Elige UNA situación de negocio y muéstrala en dos estados: cómo era antes y cómo es ahora. Mantén el MISMO negocio y el mismo indicador en toda la serie.
- Los frames de "antes" son concretos y algo incómodos (sin dramatizar de más); los de "después" son sobrios, sin euforia publicitaria.
- El cambio debe ser MEDIBLE: mismo indicador antes y después (tiempo de respuesta, pedidos, horas al día, clientes al mes).
- No expliques la solución técnica: muestra la diferencia en la vida del dueño.`,
    arcos: {
      2: [
        { paso: "antes", objetivo: "Cómo era antes, con el indicador concreto en su peor estado.", layoutId: "clasico_superior" },
        { paso: "despues", objetivo: "Cómo es ahora con el mismo indicador. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      3: [
        { paso: "antes", objetivo: "El antes, con el indicador en su peor estado.", layoutId: "clasico_superior" },
        { paso: "el_giro", objetivo: "Qué cambió exactamente. Una sola decisión, contada simple.", layoutId: "respiro" },
        { paso: "despues", objetivo: "El después con el mismo indicador. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      4: [
        { paso: "antes", objetivo: "El antes, con el indicador en su peor estado.", layoutId: "clasico_superior" },
        { paso: "el_costo", objetivo: "Cuánto costaba ese antes, en dinero, tiempo o clientes. Cifra concreta.", layoutId: "dato_gigante" },
        { paso: "el_giro", objetivo: "Qué cambió exactamente. Una sola decisión.", layoutId: "respiro" },
        { paso: "despues", objetivo: "El después con el mismo indicador. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      5: [
        { paso: "antes", objetivo: "El antes, con el indicador en su peor estado.", layoutId: "clasico_superior" },
        { paso: "el_costo", objetivo: "Cuánto costaba ese antes. Cifra concreta.", layoutId: "dato_gigante" },
        { paso: "el_giro", objetivo: "Qué cambió exactamente. Una sola decisión.", layoutId: "respiro" },
        { paso: "primeros_dias", objetivo: "Qué se notó en los primeros días del cambio.", layoutId: "editorial_inferior" },
        { paso: "despues", objetivo: "El después con el mismo indicador. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
    },
    tiposAfines: ["tip_tech", "comunidad"],
  },
  {
    id: "mito_verdad",
    nombre: "Mito y verdad",
    descripcionUi: "Derriba una creencia instalada del rubro con argumentos.",
    porQueRetiene: "Contradecir algo que el espectador cree obliga a quedarse a ver la explicación.",
    instruccionGuion: `FORMATO: MITO Y VERDAD.
- Empieza por una creencia MUY extendida entre dueños de negocio, dicha tal cual la dirían ellos ("con Instagram me basta", "una web es para empresas grandes").
- No descalifiques a quien lo cree: explica de dónde viene esa idea y por qué hoy ya no se sostiene.
- Sostén el argumento con UN dato o consecuencia concreta, no con opiniones.
- Cierra con lo que sí conviene hacer, en una frase clara.`,
    arcos: {
      2: [
        { paso: "el_mito", objetivo: "Enuncia la creencia tal como la diría un dueño de negocio.", layoutId: "cita_testimonio" },
        { paso: "la_verdad", objetivo: "Por qué ya no se sostiene y qué conviene hacer. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      3: [
        { paso: "el_mito", objetivo: "Enuncia la creencia tal como la diría un dueño de negocio.", layoutId: "cita_testimonio" },
        { paso: "por_que_falla", objetivo: "La consecuencia concreta de creer eso, con un dato.", layoutId: "dato_gigante" },
        { paso: "la_verdad", objetivo: "Qué conviene hacer en su lugar. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      4: [
        { paso: "el_mito", objetivo: "La creencia, en las palabras del dueño de negocio.", layoutId: "cita_testimonio" },
        { paso: "de_donde_viene", objetivo: "Por qué esa idea tenía sentido antes. Sin condescendencia.", layoutId: "clasico_superior" },
        { paso: "por_que_falla", objetivo: "Qué cambió y cuánto cuesta hoy seguir creyéndolo. Dato concreto.", layoutId: "dato_gigante" },
        { paso: "la_verdad", objetivo: "Qué conviene hacer hoy. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      5: [
        { paso: "el_mito", objetivo: "La creencia, en las palabras del dueño de negocio.", layoutId: "cita_testimonio" },
        { paso: "de_donde_viene", objetivo: "Por qué esa idea tenía sentido antes.", layoutId: "clasico_superior" },
        { paso: "que_cambio", objetivo: "Qué cambió en el mercado o en los clientes.", layoutId: "respiro" },
        { paso: "por_que_falla", objetivo: "Cuánto cuesta hoy seguir creyéndolo. Dato concreto.", layoutId: "dato_gigante" },
        { paso: "la_verdad", objetivo: "Qué conviene hacer hoy. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
    },
    tiposAfines: ["tip_tech", "motivacional"],
  },
  {
    id: "diagnostico",
    nombre: "Autodiagnóstico",
    descripcionUi: "Señales para que el espectador se evalúe a sí mismo, una por frame.",
    porQueRetiene: "Cada señal es una pregunta directa: el espectador se queda a ver si le toca.",
    instruccionGuion: `FORMATO: AUTODIAGNÓSTICO.
- Cada frame intermedio es UNA señal concreta y observable, formulada para que el espectador la reconozca en su propio negocio HOY. Nada de señales abstractas.
- Las señales van de la más común a la más grave, y NUNCA se repiten entre sí.
- Habla en segunda persona ("te pasa", "lo viste"), pero sin acusar ni asustar de más.
- El cierre resume qué significa reconocerse en varias señales y qué hacer al respecto.`,
    arcos: {
      2: [
        { paso: "la_pregunta", objetivo: "Plantea qué se va a diagnosticar y por qué importa.", layoutId: "clasico_superior" },
        { paso: "el_veredicto", objetivo: "Las señales resumidas y qué hacer. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      3: [
        { paso: "la_pregunta", objetivo: "Plantea qué se va a diagnosticar.", layoutId: "respiro" },
        { paso: "senal_1", objetivo: "La señal más común y reconocible.", layoutId: "clasico_superior" },
        { paso: "el_veredicto", objetivo: "Qué significa y qué hacer. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      4: [
        { paso: "la_pregunta", objetivo: "Plantea qué se va a diagnosticar.", layoutId: "respiro" },
        { paso: "senal_1", objetivo: "La señal más común y fácil de reconocer en el día a día.", layoutId: "clasico_superior" },
        { paso: "senal_2", objetivo: "Una señal más grave, distinta de la anterior.", layoutId: "editorial_inferior" },
        { paso: "el_veredicto", objetivo: "Qué significa y qué hacer. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      5: [
        { paso: "la_pregunta", objetivo: "Plantea qué se va a diagnosticar.", layoutId: "respiro" },
        { paso: "senal_1", objetivo: "La señal más común y fácil de reconocer en el día a día.", layoutId: "clasico_superior" },
        { paso: "senal_2", objetivo: "Una señal intermedia, distinta.", layoutId: "editorial_inferior" },
        { paso: "senal_3", objetivo: "La señal más grave, la que duele reconocer.", layoutId: "dato_gigante" },
        { paso: "el_veredicto", objetivo: "Qué significa reconocerse en varias y qué hacer. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
    },
    tiposAfines: ["tip_tech"],
  },
  {
    id: "detras_camaras",
    nombre: "Detrás de cámaras",
    descripcionUi: "Cómo trabaja la agencia por dentro, en primera persona.",
    porQueRetiene: "Mostrar el proceso real genera cercanía y el espectador quiere ver cómo termina.",
    instruccionGuion: `FORMATO: DETRÁS DE CÁMARAS.
- Escribe en PRIMERA PERSONA DEL PLURAL, como equipo de WebMakerLatam ("nos pasó", "aprendimos", "esta semana").
- Cuenta algo específico y honesto del trabajo real: una decisión, un error que costó caro, un detalle que nadie ve.
- Está permitido (y es deseable) admitir algo que salió mal: eso es lo que hace creíble el resto.
- Cierra abriendo la puerta, sin vender: quien quiera algo así hecho con este cuidado, que escriba.`,
    arcos: {
      2: [
        { paso: "el_momento", objetivo: "Qué pasó esta semana en el equipo. Concreto.", layoutId: "cita_testimonio" },
        { paso: "lo_que_queda", objetivo: "Qué aprendimos y cómo se aplica al cliente. Cierra abriendo la puerta.", layoutId: "cierre_invitacion" },
      ],
      3: [
        { paso: "el_momento", objetivo: "Qué pasó. Concreto y honesto.", layoutId: "cita_testimonio" },
        { paso: "el_detalle", objetivo: "El detalle invisible que marcó la diferencia.", layoutId: "respiro" },
        { paso: "lo_que_queda", objetivo: "Qué aprendimos. Cierra abriendo la puerta.", layoutId: "cierre_invitacion" },
      ],
      4: [
        { paso: "el_momento", objetivo: "Qué pasó. Concreto y honesto.", layoutId: "cita_testimonio" },
        { paso: "lo_que_costo", objetivo: "Qué costó (tiempo, trabajo rehecho). Cifra concreta.", layoutId: "dato_gigante" },
        { paso: "el_detalle", objetivo: "El detalle invisible que marcó la diferencia.", layoutId: "respiro" },
        { paso: "lo_que_queda", objetivo: "Qué aprendimos. Cierra abriendo la puerta.", layoutId: "cierre_invitacion" },
      ],
      5: [
        { paso: "el_momento", objetivo: "Qué pasó. Concreto y honesto.", layoutId: "cita_testimonio" },
        { paso: "el_contexto", objetivo: "Qué había en juego para el cliente.", layoutId: "clasico_superior" },
        { paso: "lo_que_costo", objetivo: "Qué costó. Cifra concreta.", layoutId: "dato_gigante" },
        { paso: "el_detalle", objetivo: "El detalle invisible que marcó la diferencia.", layoutId: "respiro" },
        { paso: "lo_que_queda", objetivo: "Qué aprendimos. Cierra abriendo la puerta.", layoutId: "cierre_invitacion" },
      ],
    },
    tiposAfines: ["comunidad", "motivacional"],
  },
  {
    id: "momento_quiebre",
    nombre: "Momento de quiebre",
    descripcionUi: "Un instante concreto que lo cambió todo. Tensión narrativa pura.",
    porQueRetiene: "Empieza en el punto de máxima tensión y solo el último frame explica cómo se resolvió.",
    instruccionGuion: `FORMATO: MOMENTO DE QUIEBRE.
- Abre EN MEDIO de la escena, en el instante de máxima tensión, como una película que empieza por el clímax: hora, lugar, qué estaba pasando.
- No expliques nada en el primer frame. La pregunta "¿y entonces qué pasó?" debe quedar flotando sola, sin pedirle al espectador que siga.
- Cada frame avanza el reloj de la escena; nunca retrocede ni repite lo ya contado.
- El cierre resuelve la tensión y recién ahí aparece el aprendizaje. Sin moraleja de manual.`,
    arcos: {
      2: [
        { paso: "el_instante", objetivo: "El momento de máxima tensión, sin explicar nada.", layoutId: "respiro" },
        { paso: "la_salida", objetivo: "Cómo se resolvió y qué dejó. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      3: [
        { paso: "el_instante", objetivo: "El momento de máxima tensión, sin explicar.", layoutId: "respiro" },
        { paso: "como_llegamos", objetivo: "Qué venía pasando para llegar ahí.", layoutId: "clasico_superior" },
        { paso: "la_salida", objetivo: "Cómo se resolvió y qué dejó. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      4: [
        { paso: "el_instante", objetivo: "El momento de máxima tensión, sin explicar.", layoutId: "respiro" },
        { paso: "como_llegamos", objetivo: "Qué venía pasando para llegar ahí.", layoutId: "clasico_superior" },
        { paso: "lo_que_estaba_en_juego", objetivo: "Qué se podía perder. Cifra concreta.", layoutId: "dato_gigante" },
        { paso: "la_salida", objetivo: "Cómo se resolvió y qué dejó. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
      5: [
        { paso: "el_instante", objetivo: "El momento de máxima tensión, sin explicar.", layoutId: "respiro" },
        { paso: "como_llegamos", objetivo: "Qué venía pasando para llegar ahí.", layoutId: "clasico_superior" },
        { paso: "lo_que_estaba_en_juego", objetivo: "Qué se podía perder. Cifra concreta.", layoutId: "dato_gigante" },
        { paso: "la_decision", objetivo: "La decisión que se tomó en ese momento.", layoutId: "editorial_inferior" },
        { paso: "la_salida", objetivo: "Cómo terminó y qué dejó. Cierra invitando.", layoutId: "cierre_invitacion" },
      ],
    },
    tiposAfines: ["motivacional", "comunidad", "tip_tech"],
  },
];

const FORMATOS_POR_ID = new Map(FORMATOS_HISTORIA.map(f => [f.id, f]));

export function obtenerFormatoHistoria(id: string): FormatoHistoria | undefined {
  return FORMATOS_POR_ID.get(id);
}

/* ==================== Selección con memoria FIFO ========================= */

// Memoria menor que el pool, si no el filtro anti-repetición queda vacío.
const MEMORIA_FORMATOS = 3;
const ultimosFormatos: string[] = [];

function registrarFormato(id: string): void {
  ultimosFormatos.push(id);
  if (ultimosFormatos.length > MEMORIA_FORMATOS) ultimosFormatos.shift();
}

/**
 * Resuelve el formato narrativo: fijado por el usuario, o rotación automática
 * anti-repetición entre los formatos afines al tipo de historia.
 */
export function resolverFormatoHistoria(
  formatoId: string | null | undefined,
  tipoHistoria: string,
): FormatoHistoria {
  const fijado = formatoId ? FORMATOS_POR_ID.get(formatoId) : undefined;
  if (fijado) {
    registrarFormato(fijado.id);
    return fijado;
  }
  const tipo = tipoHistoria as "tip_tech" | "motivacional" | "comunidad";
  const afines = FORMATOS_HISTORIA.filter(f => f.tiposAfines.includes(tipo));
  const pool = afines.length > 0 ? afines : FORMATOS_HISTORIA;
  const disponibles = pool.filter(f => !ultimosFormatos.includes(f.id));
  const candidatos = disponibles.length > 0 ? disponibles : pool;
  const elegido = candidatos[Math.floor(Math.random() * candidatos.length)]!;
  registrarFormato(elegido.id);
  return elegido;
}

/** Arco del formato para N frames, con recorte/relleno defensivo. */
export function arcoParaFrames(formato: FormatoHistoria, nFrames: number): PasoNarrativo[] {
  const n = Math.max(1, Math.min(5, nFrames));
  if (n === 1) {
    // Historia única: un solo frame que abre y cierra.
    return [{
      paso: "unica",
      objetivo: "Cuenta la idea completa en un solo frame: gancho, sustancia y cierre.",
      layoutId: "cierre_invitacion",
    }];
  }
  const arco = formato.arcos[n];
  if (arco && arco.length === n) return arco;
  // Fallback: estirar/recortar el arco más cercano disponible.
  const disponibles = Object.keys(formato.arcos).map(Number).sort((a, b) => Math.abs(a - n) - Math.abs(b - n));
  const base = formato.arcos[disponibles[0] ?? 3] ?? [];
  if (base.length >= n) return [...base.slice(0, n - 1), base[base.length - 1]!];
  const relleno = base[Math.max(0, base.length - 2)] ?? base[0]!;
  const estirado = [...base];
  while (estirado.length < n) estirado.splice(estirado.length - 1, 0, relleno);
  return estirado.slice(0, n);
}

export function listarFormatosHistoria() {
  return FORMATOS_HISTORIA.map(f => ({
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcionUi,
    porQueRetiene: f.porQueRetiene,
  }));
}
