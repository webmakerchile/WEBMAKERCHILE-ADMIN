// Banco de poses rotativas para el zorro Webi en portadas e historias.
// Incluye: detección emocional desde el tema + selección anti-repetición
// con memoria FIFO de las últimas N poses usadas.

export type PoseId =
  | "pointing_right"
  | "pointing_left"
  | "shocked_front"
  | "thinking_hand_chin"
  | "arms_crossed_confident"
  | "shrug_confused"
  | "triumphant_arms_up"
  | "worried_head_hold"
  | "presenting_with_hand"
  | "whispering_secret"
  | "reading_document"
  | "thumbs_up_confident"
  | "superhero_stance"
  | "head_tilt_curious";

export interface PoseEntry {
  id: PoseId;
  /** Etiqueta corta en español para selects de UI. */
  etiqueta: string;
  descripcion: string;
}

export const PORTADA_POSES: PoseEntry[] = [
  { id: "pointing_right", etiqueta: "Señalando a la derecha", descripcion: "cuerpo girado 3/4 a la derecha, brazo derecho extendido señalando un elemento de la escena a la derecha, sonrisa segura, cejas levantadas" },
  { id: "pointing_left", etiqueta: "Señalando a la izquierda", descripcion: "cuerpo girado 3/4 a la izquierda, brazo izquierdo extendido señalando un elemento de la escena a la izquierda, expresión curiosa, cabeza ligeramente inclinada" },
  { id: "shocked_front", etiqueta: "Sorprendido (shock)", descripcion: "cuerpo de frente al espectador, ambas patas levantadas cerca de la cara en señal de sorpresa, ojos muy abiertos, boca abierta, expresión de shock total" },
  { id: "thinking_hand_chin", etiqueta: "Pensativo", descripcion: "cuerpo de 3/4, pata derecha apoyada en el mentón en pose pensativa, mirando hacia arriba como si estuviera reflexionando, expresión seria y contemplativa" },
  { id: "arms_crossed_confident", etiqueta: "Brazos cruzados (seguro)", descripcion: "cuerpo de frente, brazos cruzados firmemente sobre el pecho, sonrisa de lado segura, cabeza ligeramente inclinada, postura relajada y dominante" },
  { id: "shrug_confused", etiqueta: "Confundido (¿qué pasó?)", descripcion: "cuerpo de frente, ambas patas levantadas en gesto de 'no sé' (palmas hacia arriba), expresión confundida o de pregunta, hombros encogidos" },
  { id: "triumphant_arms_up", etiqueta: "Celebrando (brazos arriba)", descripcion: "cuerpo de frente, ambos brazos levantados al cielo en pose de triunfo y celebración, sonrisa enorme, ojos cerrados de alegría" },
  { id: "worried_head_hold", etiqueta: "Preocupado", descripcion: "cuerpo de 3/4, una pata sosteniéndose la cabeza en gesto de preocupación o frustración, expresión de inquietud, boca ligeramente abierta" },
  { id: "presenting_with_hand", etiqueta: "Presentando con la mano", descripcion: "cuerpo de 3/4, brazo derecho extendido con la palma hacia arriba como presentando algo, sonrisa cálida y acogedora, gesto invitante" },
  { id: "whispering_secret", etiqueta: "Contando un secreto", descripcion: "cuerpo de 3/4 inclinado hacia adelante hacia el espectador, una pata cerca de la boca como contando un secreto, expresión pícara, cejas levantadas" },
  { id: "reading_document", etiqueta: "Leyendo un documento", descripcion: "cuerpo de 3/4, ambas patas sosteniendo un documento o tablet frente al pecho, mirando hacia abajo con expresión concentrada y enfocada" },
  { id: "thumbs_up_confident", etiqueta: "Pulgar arriba", descripcion: "cuerpo de frente, pata derecha con pulgar arriba, sonrisa amplia y confiada, contacto visual directo con el espectador" },
  { id: "superhero_stance", etiqueta: "Pose de superhéroe", descripcion: "cuerpo de frente, manos en las caderas, pecho hacia adelante, mirada heroica al horizonte, postura de superhéroe" },
  { id: "head_tilt_curious", etiqueta: "Curioso (cabeza inclinada)", descripcion: "cuerpo de 3/4, cabeza inclinada hacia un lado con expresión curiosa, una oreja más alta que la otra, mirada juguetona" },
];

export type Emocion =
  | "pregunta"
  | "problema"
  | "revelacion"
  | "confianza"
  | "celebracion"
  | "educativo"
  | "alerta";

const POSES_POR_EMOCION: Record<Emocion, PoseId[]> = {
  pregunta:    ["thinking_hand_chin", "shrug_confused", "whispering_secret", "head_tilt_curious"],
  problema:    ["worried_head_hold", "shocked_front", "shrug_confused"],
  revelacion:  ["shocked_front", "pointing_right", "pointing_left", "whispering_secret"],
  confianza:   ["arms_crossed_confident", "thumbs_up_confident", "presenting_with_hand", "superhero_stance"],
  celebracion: ["triumphant_arms_up", "thumbs_up_confident", "superhero_stance"],
  educativo:   ["presenting_with_hand", "reading_document", "pointing_right", "head_tilt_curious"],
  alerta:      ["shocked_front", "worried_head_hold", "pointing_left"],
};

export function detectarEmocion(tema: string): Emocion | null {
  const t = tema.toLowerCase();
  if (/\?|por qu[eé]|c[oó]mo|qu[eé]\s|cu[aá]ndo|sab[ií]as/.test(t)) return "pregunta";
  if (/error|problem|falla|pierd|riesg|peligr|mal\s|malo|aleja/.test(t)) return "problema";
  if (/secreto|revel|descubr|verdad|nadie|truco oculto/.test(t)) return "revelacion";
  if (/conf[ií]a|garant[ií]a|experto|profesional|pro\s|seguro/.test(t)) return "confianza";
  if (/[eé]xito|logr|triplic|duplic|aument|crec|result|consegu|gan[oóeé]/.test(t)) return "celebracion";
  if (/aprend|gu[ií]a|paso|tutorial|raz[oó]n|tip|hábito|clave/.test(t)) return "educativo";
  if (/urgente|cuidad|importante|atenci[oó]n|alert|peligro/.test(t)) return "alerta";
  return null;
}

// Memoria FIFO en proceso (se reinicia con cada restart del server, suficiente
// para evitar repetición dentro de una sesión normal de creación de contenido).
const MEMORIA_MAX = 8;
const ultimasPosesPortada: PoseId[] = [];

export interface PoseSeleccionada {
  id: PoseId;
  descripcion: string;
  emocion: Emocion | null;
}

export function seleccionarPosePortada(tema: string): PoseSeleccionada {
  const emocion = detectarEmocion(tema);
  const idsCompatibles = emocion
    ? POSES_POR_EMOCION[emocion]
    : PORTADA_POSES.map(p => p.id);

  // Excluir las usadas recientemente. Si todas están en memoria, igual elige.
  const disponibles = idsCompatibles.filter(id => !ultimasPosesPortada.includes(id));
  const candidatos = disponibles.length > 0 ? disponibles : idsCompatibles;
  const elegidaId = candidatos[Math.floor(Math.random() * candidatos.length)]!;

  // Actualizar memoria FIFO.
  ultimasPosesPortada.push(elegidaId);
  if (ultimasPosesPortada.length > MEMORIA_MAX) ultimasPosesPortada.shift();

  const entry = PORTADA_POSES.find(p => p.id === elegidaId)!;
  return { id: entry.id, descripcion: entry.descripcion, emocion };
}

// Bloque de instrucciones que se inyecta al final del prompt de Gemini para
// FORZAR la pose seleccionada y bloquear la pose por defecto "señalando 3/4 derecha".
export function bloquePoseRequerida(pose: PoseSeleccionada): string {
  return `
POSE OBLIGATORIA DEL ZORRO EN ESTA PORTADA (NO NEGOCIABLE):
${pose.descripcion}

REGLAS DE POSE (CRÍTICAS):
- El zorro DEBE adoptar EXACTAMENTE la pose descrita arriba.
- PROHIBIDAS las poses por defecto a menos que estén explícitamente pedidas:
  · Cuerpo 3/4 a la derecha con brazo extendido señalando (overuso histórico)
  · Cuerpo 3/4 mirando una laptop o pantalla (overuso histórico)
  · Postura genérica de "presentador" frontal estática
- Si la pose dice "brazos cruzados", los brazos DEBEN estar cruzados, no señalando.
- Si la pose dice "shocked", ambas patas DEBEN estar cerca de la cara, no apuntando.
- Si la pose dice "pulgar arriba", la pata DEBE mostrar el pulgar levantado.
- Antes de finalizar la imagen, verifica mentalmente que la pose coincide.
`;
}
