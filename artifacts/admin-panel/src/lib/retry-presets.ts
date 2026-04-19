// Preajustes de reintento: botones con prompt interno detallado
// Cada preset traduce un click del usuario a una instrucción precisa para el modelo.

export type RetryPreset = {
  id: string;
  label: string;
  emoji: string;
  prompt: string;
};

export const RETRY_PRESETS: RetryPreset[] = [
  {
    id: "no-es-zorro-webmaker",
    label: "No es el zorro de WebMaker",
    emoji: "🦊",
    prompt:
      "El zorro de la imagen NO es Webi (la mascota oficial de WebMakerLatam). Reemplázalo por el zorro CANON exacto: " +
      "cara alargada (NO redonda chibi), hocico crema/blanco que sobresale, ojos pequeños como puntos negros sólidos (NO ojos grandes Disney/Pixar con brillos ni iris), " +
      "nariz negra triangular pequeña (NO rosada), orejas grandes triangulares con interior blanco/crema, " +
      "lentes RECTANGULARES de marco NEGRO grueso (NO redondos, NO marrones, NO naranjas), " +
      "polera VERDE OSCURO PLANA color #4A5D3A sin sombras ni gradientes, " +
      "pelaje naranja PLANO color #E86A30 sin sombras ni textura, " +
      "panza/pecho color crema #F4DEB5, " +
      "cola larga y peluda con punta blanca, " +
      "líneas negras GRUESAS uniformes (estilo flat cartoon 2D vector, NO 3D, NO anime, NO realista), " +
      "postura bípeda como una persona. Replícalo idéntico a la imagen master oficial y a las referencias canon adjuntas.",
  },
  {
    id: "zorro-muy-grande",
    label: "Zorro muy grande",
    emoji: "🔍",
    prompt:
      "El zorro Webi está demasiado grande y come la composición. Redúcelo de modo que ocupe aproximadamente el 50-55% del alto de la imagen, " +
      "centrado horizontalmente y dejando aire respirable arriba (para el título) y abajo (para el subtítulo). " +
      "Mantén proporciones correctas: cabeza ~25% del cuerpo, cuerpo bípedo. NO recortes la cola ni los pies.",
  },
  {
    id: "zorro-muy-pequeno",
    label: "Zorro muy pequeño",
    emoji: "🔎",
    prompt:
      "El zorro Webi se ve demasiado pequeño y pierde protagonismo. Aumenta su escala para que ocupe ~55-60% del alto de la imagen, " +
      "manteniéndolo siempre completo (cabeza, cuerpo, cola y pies dentro del frame), centrado y como protagonista visual.",
  },
  {
    id: "fondo-equivocado",
    label: "Fondo equivocado",
    emoji: "🎨",
    prompt:
      "Reemplaza el fondo por la paleta canónica de WebMakerLatam: fondo principal AZUL OSCURO PROFUNDO color #0F1B2D plano, " +
      "con un GRADIENTE RADIAL NARANJA cálido (color #E86A30 al ~35% de opacidad) detrás del zorro como halo de luz, " +
      "y una grilla geométrica sutil en líneas finas blancas/grises a ~8% de opacidad sobre todo el fondo. " +
      "Algunas chispas/puntos de luz blancos suaves dispersos para dar profundidad. NADA de degradados arcoíris, NADA de fondos blancos o claros.",
  },
  {
    id: "props-realistas",
    label: "Props muy realistas",
    emoji: "📐",
    prompt:
      "Los objetos y dispositivos (laptops, celulares, iconos, etc.) están demasiado realistas o fotográficos. " +
      "Rediséñalos como ILUSTRACIONES VECTORIALES PLANAS estilo flat cartoon 2D, con líneas negras gruesas uniformes, " +
      "colores planos (sin gradientes ni sombras complejas), iconos simples y limpios. " +
      "Coherente con el estilo del zorro: NADA de 3D, NADA de fotorealismo, NADA de renders.",
  },
  {
    id: "pose-poco-expresiva",
    label: "Pose poco expresiva",
    emoji: "💪",
    prompt:
      "La pose del zorro es plana o estática. Hazla más dinámica y expresiva, alineada al mensaje del slide: " +
      "gestos claros con las manos (señalando, sosteniendo el prop, pulgar arriba, manos en alto, etc.), " +
      "expresión facial coherente con el tono (preocupado para problema, alegre para solución/cta, sorprendido para hook). " +
      "Lenguaje corporal vivo pero manteniendo el estilo flat cartoon 2D.",
  },
  {
    id: "demasiado-cerca",
    label: "Cara muy cerca (close-up)",
    emoji: "↔️",
    prompt:
      "El plano está demasiado cerrado: se ve solo la cara del zorro. Aleja la cámara y muestra al zorro de CUERPO COMPLETO " +
      "(cabeza + torso + piernas + cola + pies) como personaje protagonista. Plano americano o entero, NO close-up.",
  },
  {
    id: "texto-en-imagen-no",
    label: "Quitar texto de la imagen",
    emoji: "🚫",
    prompt:
      "La imagen contiene texto, letras, números o palabras dentro del arte (en el laptop, en pancartas, en el celular, etc.) y NO debería tener NINGUNO. " +
      "Regenera la imagen completamente limpia: cero letras, cero números, cero palabras en cualquier idioma, en cualquier parte. " +
      "Los rectángulos/zonas donde habría texto deben quedar como bloques de color planos o líneas decorativas abstractas.",
  },
  {
    id: "expresion-rara",
    label: "Expresión facial rara",
    emoji: "🎭",
    prompt:
      "La expresión facial del zorro es exagerada o no encaja con el mensaje. " +
      "Hazla SUTIL y natural: ojos pequeños como puntos negros sólidos (NUNCA grandes ni con brillos Disney), " +
      "boca pequeña sin lengua ni dientes visibles, sin cejas tipo anime. " +
      "La emoción debe ser legible pero contenida, coherente con el tono del slide.",
  },
  {
    id: "composicion-saturada",
    label: "Composición saturada",
    emoji: "📐",
    prompt:
      "La escena está abarrotada de elementos rodeando al zorro por todos lados. Simplifica: " +
      "MÁXIMO 3 objetos de apoyo en TOTAL, AGRUPADOS A UN SOLO LADO del zorro (izquierda O derecha), " +
      "dejando el lado opuesto con fondo limpio. PROHIBIDO el collage de iconos o rodear al zorro. " +
      "El zorro debe ser visualmente el protagonista claro, no uno más entre objetos.",
  },
  {
    id: "objetos-cortados",
    label: "Objetos cortados por bordes",
    emoji: "✂️",
    prompt:
      "Hay objetos (laptop, celular, props) cortados por los bordes de la imagen o mal posicionados. " +
      "Reposiciónalos para que estén COMPLETOS dentro del frame con un margen mínimo de 60px desde cualquier borde. " +
      "Si no caben enteros, redúcelos de tamaño. Nada debe verse partido por los bordes.",
  },
];
