// Plantillas de composición para portadas y miniaturas ("formatos
// predeterminados"): cada plantilla define DÓNDE vive el protagonista en la
// escena (bloque de composición que se inyecta al prompt de la ilustración),
// DÓNDE va el titular (zona de texto + lado del scrim) y qué extras
// decorativos lleva (comillas de testimonio, número gigante).
//
// La variedad de diseño viene de intercalar plantillas entre generaciones
// (rotación FIFO anti-repetición, igual que las direcciones de arte), o de
// fijar una a mano desde la UI.

import type { ZonaTexto, ScrimLado, ExtraOverlay } from "./title-style.js";

export type FormatoPlantilla = "youtube" | "vertical";

export interface PlantillaPortada {
  id: string;
  formato: FormatoPlantilla;
  nombre: string;
  /** Descripción corta para la UI de selección. */
  descripcionUi: string;
  /** Zona del lienzo FINAL donde se compone el titular. */
  zona: ZonaTexto;
  scrim: ScrimLado;
  /** Estilo de titular por defecto (null = rotación automática de estilos). */
  estiloTitularDefault: string | null;
  /** "primer_plano" restringe las poses de Webi a gestos de cabeza/hombros. */
  encuadre?: "cuerpo" | "primer_plano";
  /** Solo formato vertical: dónde vive el personaje según esta composición
   *  (reemplaza la línea fija "40% del área visual inferior" del prompt). */
  personajeVertical?: string;
  extras?: ExtraOverlay[];
  /** Bloque de COMPOSICIÓN para el prompt de la ilustración (protagonista,
   *  utilería y zona que debe quedar despejada para el titular). */
  bloqueComposicion(conPersona: boolean): string;
}

/* ==================== Plantillas YouTube (1280x720) ====================== */

const protagonista = (conPersona: boolean) => (conPersona ? "el protagonista (la persona real)" : "el zorro Webi");

const YT: PlantillaPortada[] = [
  {
    id: "yt_lateral_izquierda",
    formato: "youtube",
    nombre: "Clásica lateral",
    descripcionUi: "Titular a la izquierda, protagonista grande a la derecha.",
    zona: { x: 72, y: 96, width: 496, height: 528, align: "left", vertical: "center", maxFontSize: 122, minFontSize: 44 },
    scrim: "izquierda",
    estiloTitularDefault: null,
    bloqueComposicion: (conPersona) => `COMPOSICIÓN HORIZONTAL DE MINIATURA (CRÍTICO - NO NEGOCIABLE):
- MITAD DERECHA del encuadre: ${protagonista(conPersona)}, anclado al piso del estudio con su sombra coherente, encuadrado del pecho hacia arriba, MUY GRANDE y con presencia dominante, cuerpo ligeramente inclinado hacia la cámara
- CENTRO (entre el protagonista y la franja izquierda): 2 a 3 piezas de UTILERÍA física del tema, apoyadas en el piso del set o sobre una mesa baja, a escala real
- PROFUNDIDAD DE CÁMARA REAL: una pieza de utilería asoma GRANDE en primer plano parcial (por la derecha o el centro-bajo, JAMÁS en la franja izquierda), ligeramente desenfocada; el protagonista queda perfectamente nítido y el fondo con desenfoque suave de lente
- FRANJA IZQUIERDA (el 46% izquierdo del encuadre): SOLO el fondo de la dirección de arte en su versión más plana y OSCURA, totalmente DESPEJADA — ahí se montará el titular después. NADA puede existir en esa franja: ni objetos, ni brazos, ni haces protagonistas, ni sombras marcadas.`,
  },
  {
    id: "yt_lateral_derecha",
    formato: "youtube",
    nombre: "Lateral espejo",
    descripcionUi: "Protagonista a la izquierda, titular a la derecha (espejo).",
    zona: { x: 712, y: 96, width: 496, height: 528, align: "left", vertical: "center", maxFontSize: 122, minFontSize: 44 },
    scrim: "derecha",
    estiloTitularDefault: null,
    bloqueComposicion: (conPersona) => `COMPOSICIÓN HORIZONTAL DE MINIATURA — VERSIÓN ESPEJO (CRÍTICO - NO NEGOCIABLE):
- MITAD IZQUIERDA del encuadre: ${protagonista(conPersona)}, anclado al piso del estudio con su sombra coherente, encuadrado del pecho hacia arriba, MUY GRANDE y con presencia dominante, cuerpo ligeramente inclinado hacia la cámara
- CENTRO (entre el protagonista y la franja derecha): 2 a 3 piezas de UTILERÍA física del tema, apoyadas en el piso del set o sobre una mesa baja, a escala real
- PROFUNDIDAD DE CÁMARA REAL: una pieza de utilería asoma GRANDE en primer plano parcial (por la izquierda o el centro-bajo, JAMÁS en la franja derecha), ligeramente desenfocada; el protagonista queda perfectamente nítido y el fondo con desenfoque suave de lente
- FRANJA DERECHA (el 46% derecho del encuadre): SOLO el fondo de la dirección de arte en su versión más plana y OSCURA, totalmente DESPEJADA — ahí se montará el titular después. NADA puede existir en esa franja: ni objetos, ni brazos, ni haces protagonistas, ni sombras marcadas.`,
  },
  {
    id: "yt_cara_gigante",
    formato: "youtube",
    nombre: "Cara gigante",
    descripcionUi: "Primer plano enorme de la reacción; titular corto arriba a la izquierda.",
    zona: { x: 64, y: 60, width: 540, height: 300, align: "left", vertical: "top", maxFontSize: 150, minFontSize: 48 },
    scrim: "izquierda",
    estiloTitularDefault: "impacto",
    encuadre: "primer_plano",
    bloqueComposicion: (conPersona) => `COMPOSICIÓN "CARA GIGANTE" (CRÍTICO - NO NEGOCIABLE):
- ${protagonista(conPersona).toUpperCase()} EN PRIMER PLANO EXTREMO en la mitad derecha: encuadre de cabeza y hombros, la cara ocupa MÁS DEL 60% de la altura del lienzo — la expresión es la protagonista absoluta de la miniatura
- La expresión llevada al MÁXIMO (sin deformar los rasgos): es lo primero que se ve incluso en tamaño miniatura de celular
- UNA sola pieza de utilería del tema asomando en primer plano por la esquina inferior (centro o derecha), ligeramente desenfocada, JAMÁS tapando la cara
- CUADRANTE SUPERIOR IZQUIERDO (40% izquierdo, 55% superior): SOLO fondo de la dirección de arte en su versión más plana y OSCURA, totalmente DESPEJADO para el titular — ni objetos, ni hombros, ni haces protagonistas
- El borde inferior izquierdo puede tener utilería tenue en penumbra, nunca brillante`,
  },
  {
    id: "yt_impacto_inferior",
    formato: "youtube",
    nombre: "Impacto inferior",
    descripcionUi: "Protagonista centrado y titular gigante a lo ancho, abajo.",
    zona: { x: 84, y: 468, width: 1112, height: 200, align: "center", vertical: "center", maxFontSize: 132, minFontSize: 46 },
    scrim: "inferior",
    estiloTitularDefault: "fuego",
    bloqueComposicion: (conPersona) => `COMPOSICIÓN "IMPACTO INFERIOR" (CRÍTICO - NO NEGOCIABLE):
- ${protagonista(conPersona).toUpperCase()} CENTRADO en el encuadre, del pecho hacia arriba, grande, con la cabeza en el tercio superior-central SIN tocar el borde superior
- A cada costado del protagonista: 1 pieza de UTILERÍA física del tema por lado, apoyada en el piso del set, a escala real, parcialmente en penumbra
- FRANJA INFERIOR (el 38% inferior del encuadre): SOLO el piso del estudio fundiéndose a penumbra OSCURA y plana, totalmente DESPEJADA — ahí se montará el titular después. Nada puede invadirla: ni manos, ni utilería, ni el círculo de luz protagonista
- El punto más iluminado de la escena es la cara del protagonista; la luz cae hacia la franja inferior hasta apagarse`,
  },
  {
    id: "yt_testimonio",
    formato: "youtube",
    nombre: "Testimonio",
    descripcionUi: "Para casos de clientes: comillas gigantes y look editorial elegante.",
    zona: { x: 100, y: 130, width: 470, height: 470, align: "left", vertical: "center", maxFontSize: 110, minFontSize: 42 },
    scrim: "izquierda",
    estiloTitularDefault: "placas",
    extras: [{ tipo: "comillas" }],
    bloqueComposicion: (conPersona) => `COMPOSICIÓN "TESTIMONIO" (CRÍTICO - NO NEGOCIABLE):
- MITAD DERECHA del encuadre: ${protagonista(conPersona)} en retrato EDITORIAL premium — del pecho hacia arriba, grande, expresión de satisfacción genuina y orgullo (sonrisa real, postura segura), como la foto de un caso de éxito
- CENTRO: 1 a 2 piezas de utilería física que cuenten SU historia (su producto, su notebook con su sitio en pantalla apagada de formas abstractas, su herramienta de trabajo), apoyadas a escala real
- FRANJA IZQUIERDA (el 46% izquierdo): SOLO fondo de la dirección de arte plano y OSCURO, totalmente DESPEJADO para la cita del testimonio — nada puede existir ahí
- Tono general: elegante y creíble, energía cálida de historia real bien contada (menos estridente que una miniatura de reto viral)`,
  },
  {
    id: "yt_top_numero",
    formato: "youtube",
    nombre: "Top con número",
    descripcionUi: "El número del título se dibuja GIGANTE (ideal para '5 errores…').",
    zona: { x: 72, y: 76, width: 496, height: 568, align: "left", vertical: "top", maxFontSize: 116, minFontSize: 44 },
    scrim: "izquierda",
    estiloTitularDefault: "titan",
    extras: [{ tipo: "numero_gigante" }],
    bloqueComposicion: (conPersona) => `COMPOSICIÓN "TOP NUMERADO" (CRÍTICO - NO NEGOCIABLE):
- MITAD DERECHA del encuadre: ${protagonista(conPersona)}, anclado al piso con su sombra, del pecho hacia arriba, MUY GRANDE, gesto de estar enumerando o advirtiendo (una mano visible con gesto expresivo)
- CENTRO: 2 a 3 piezas de UTILERÍA física del tema apoyadas en el set a escala real, una de ellas asomando en primer plano parcial desenfocada (nunca por la izquierda)
- FRANJA IZQUIERDA (el 46% izquierdo): SOLO fondo de la dirección de arte plano y OSCURO, totalmente DESPEJADO — ahí irán el número gigante y el titular. Nada puede invadirla.`,
  },
];

/* ==================== Plantillas verticales (1080x1920) ================== */

const VERTICAL: PlantillaPortada[] = [
  {
    id: "v_titular_superior",
    formato: "vertical",
    nombre: "Titular superior",
    descripcionUi: "La clásica: titular arriba, escena del estudio abajo.",
    zona: { x: 60, y: 150, width: 960, height: 380, align: "center", vertical: "center", maxFontSize: 168, minFontSize: 58 },
    scrim: "superior",
    estiloTitularDefault: null,
    personajeVertical: "SIEMPRE de cuerpo completo visible (cabeza, torso, brazos, piernas, cola). NUNCA cortado ni parcialmente visible\n- El zorro debe ocupar al menos 40% del área visual inferior. Es el PROTAGONISTA, no un elemento secundario",
    bloqueComposicion: () => `ZONA SUPERIOR VACÍA (CRÍTICO - NO NEGOCIABLE):
- El 35% SUPERIOR de la imagen (de 0px a 670px desde arriba) debe ser ÚNICAMENTE el fondo de la dirección de arte en su versión más plana y oscura, totalmente DESPEJADO y SIN elementos — ahí se montará el titular después
- NADA puede existir en esa zona: ni el zorro, ni objetos, ni sombras, ni líneas, ni bordes
- Toda la acción visual comienza DEBAJO del píxel 670`,
  },
  {
    id: "v_titular_inferior",
    formato: "vertical",
    nombre: "Titular inferior",
    descripcionUi: "La escena arriba y el titular gigante abajo (estilo póster).",
    zona: { x: 60, y: 1420, width: 960, height: 360, align: "center", vertical: "center", maxFontSize: 168, minFontSize: 58 },
    scrim: "inferior",
    estiloTitularDefault: null,
    personajeVertical: "SIEMPRE de cuerpo completo visible (cabeza, torso, brazos, piernas, cola). NUNCA cortado ni parcialmente visible\n- El zorro vive en la MITAD SUPERIOR-CENTRAL del encuadre, parado sobre el piso del estudio a media altura, ocupando al menos 40% de esa mitad. Es el PROTAGONISTA, no un elemento secundario",
    bloqueComposicion: () => `ZONA INFERIOR VACÍA (CRÍTICO - NO NEGOCIABLE):
- La acción (personaje y utilería) vive en la MITAD SUPERIOR-CENTRAL del encuadre: el personaje parado sobre el piso del estudio a media altura, con el 12% superior como aire limpio del fondo
- El 28% INFERIOR de la imagen es ÚNICAMENTE el piso del estudio extendiéndose hacia la cámara y fundiéndose a penumbra OSCURA y plana, SIN objetos, SIN sombras marcadas, SIN el círculo de luz
- Esa zona inferior queda totalmente DESPEJADA — NADA puede existir en ella: ahí se montará el titular después`,
  },
];

/* ==================== Catálogo, rotación y resolución ==================== */

export const PLANTILLAS_PORTADA: PlantillaPortada[] = [...YT, ...VERTICAL];

const PLANTILLAS_POR_ID = new Map(PLANTILLAS_PORTADA.map(p => [p.id, p]));

/** Plantillas que entran a la rotación automática por formato. Testimonio se
 *  usa solo a pedido; "top número" entra solo si el título trae número inicial. */
const ROTACION_BASE: Record<FormatoPlantilla, string[]> = {
  youtube: ["yt_lateral_izquierda", "yt_lateral_derecha", "yt_cara_gigante", "yt_impacto_inferior"],
  vertical: ["v_titular_superior", "v_titular_inferior"],
};

// La memoria debe ser MENOR que el pool del formato o el filtro anti-repetición
// queda vacío siempre y la rotación vuelve a ser azar puro.
const MEMORIA_PLANTILLAS: Record<FormatoPlantilla, number> = { youtube: 3, vertical: 1 };
const ultimasPlantillas: Record<FormatoPlantilla, string[]> = { youtube: [], vertical: [] };

function registrarPlantilla(formato: FormatoPlantilla, id: string): void {
  const mem = ultimasPlantillas[formato];
  mem.push(id);
  if (mem.length > MEMORIA_PLANTILLAS[formato]) mem.shift();
}

/**
 * Resuelve la plantilla: fijada por id, o rotación automática anti-repetición
 * del formato (sumando "top número" al pool cuando el título empieza con número).
 */
export function resolverPlantilla(
  plantillaId: string | null | undefined,
  formato: FormatoPlantilla,
  opts?: { titulo?: string | null },
): PlantillaPortada {
  const fijada = plantillaId ? PLANTILLAS_POR_ID.get(plantillaId) : undefined;
  if (fijada && fijada.formato === formato) {
    registrarPlantilla(formato, fijada.id);
    return fijada;
  }

  const pool = [...ROTACION_BASE[formato]];
  if (formato === "youtube" && /^\d{1,2}\s+(?!\d)\S/.test((opts?.titulo ?? "").trim())) {
    pool.push("yt_top_numero");
  }
  const mem = ultimasPlantillas[formato];
  const disponibles = pool.filter(id => !mem.includes(id));
  const candidatas = disponibles.length > 0 ? disponibles : pool;
  const elegidaId = candidatas[Math.floor(Math.random() * candidatas.length)]!;
  registrarPlantilla(formato, elegidaId);
  return PLANTILLAS_POR_ID.get(elegidaId)!;
}

/** Lookup puro por id (no toca la memoria de rotación). */
export function obtenerPlantilla(id: string): PlantillaPortada | undefined {
  return PLANTILLAS_POR_ID.get(id);
}

export function listarPlantillas() {
  return PLANTILLAS_PORTADA.map(p => ({
    id: p.id,
    formato: p.formato,
    nombre: p.nombre,
    descripcion: p.descripcionUi,
  }));
}
