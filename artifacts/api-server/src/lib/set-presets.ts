// Opciones del set que se eligen con un clic, sin escribir nada.
//
// La personalización tenía tres campos de texto libre —pose en un desplegable,
// utilería y estilo en blanco— y eso deja todo el trabajo creativo del lado de
// quien crea: hay que inventar qué objeto pedir, con qué palabras, y acertar
// con un vocabulario que el modelo entienda. La mayoría de las veces se dejaba
// vacío, no porque no hiciera falta, sino porque pensarlo cuesta más que el
// resultado que da.
//
// Aquí están las opciones ya redactadas, en el lenguaje que el prompt necesita.
// Se eligen tocando. Los campos de texto siguen existiendo para lo que no esté
// en la lista, pero ya no son el único camino.

import { POSES_PRIMER_PLANO, type PoseId } from "./pose-bank.js";

export interface PresetSet {
  id: string;
  /** Lo que se lee en el botón. */
  etiqueta: string;
  /** Lo que se le dice al modelo. */
  texto: string;
}

/* ==================== Gesto y expresión ================================= */

/**
 * La cara, por encima de la pose.
 *
 * La pose dice qué hace el cuerpo; el gesto dice con qué cara lo hace. Son
 * cosas distintas —se puede señalar con entusiasmo o señalar con hartazgo— y
 * antes no había forma de pedir la segunda sin escribirla a mano.
 */
export const GESTOS_WEBI: PresetSet[] = [
  { id: "sonrisa_amplia", etiqueta: "Sonrisa amplia", texto: "sonrisa amplia y sincera, ojos entrecerrados de alegría" },
  { id: "ceja_levantada", etiqueta: "Ceja levantada", texto: "una ceja levantada y media sonrisa escéptica, como dudando de lo que oye" },
  { id: "guino", etiqueta: "Guiño cómplice", texto: "guiñando un ojo con sonrisa cómplice, gesto de complicidad con el espectador" },
  { id: "boca_abierta", etiqueta: "Boca abierta", texto: "boca abierta de asombro y ojos muy abiertos, expresión de no poder creerlo" },
  { id: "serio", etiqueta: "Serio y directo", texto: "expresión seria y directa, sin sonrisa, mirada firme al espectador" },
  { id: "risa", etiqueta: "Riendo", texto: "riendo con ganas, cabeza ligeramente hacia atrás y ojos cerrados de risa" },
  { id: "cansado", etiqueta: "Agotado", texto: "párpados caídos y expresión de agotamiento, media sonrisa resignada" },
  { id: "orgulloso", etiqueta: "Orgulloso", texto: "mentón levantado y pecho hacia afuera, sonrisa satisfecha de logro" },
  { id: "ceno_fruncido", etiqueta: "Ceño fruncido", texto: "ceño fruncido con las cejas juntas, expresión de preocupación o desacuerdo" },
  { id: "picaro", etiqueta: "Pícaro", texto: "sonrisa ladeada y mirada pícara de reojo, como quien sabe algo que no ha contado" },
];

/* ==================== Encuadre de cámara ================================ */

export interface PresetEncuadre extends PresetSet {
  /**
   * Si el encuadre solo deja ver cabeza y hombros, las poses que necesitan el
   * torso entero dejan de ser posibles: pedir "brazos cruzados" en primer
   * plano da una imagen que contradice lo que se eligió.
   */
  soloPrimerPlano: boolean;
}

export const ENCUADRES: PresetEncuadre[] = [
  { id: "plano_medio", etiqueta: "Plano medio", texto: "plano medio: el zorro de la cintura hacia arriba, ocupando el centro del encuadre", soloPrimerPlano: false },
  { id: "primer_plano", etiqueta: "Primer plano", texto: "primer plano: la cabeza y los hombros del zorro llenan el encuadre, expresión bien legible", soloPrimerPlano: true },
  { id: "cuerpo_entero", etiqueta: "Cuerpo entero", texto: "cuerpo entero del zorro visible dentro del set, con espacio alrededor", soloPrimerPlano: false },
  { id: "contrapicado", etiqueta: "Desde abajo", texto: "cámara baja mirando hacia arriba, el zorro se ve imponente y protagonista", soloPrimerPlano: false },
  { id: "picado", etiqueta: "Desde arriba", texto: "cámara ligeramente elevada mirando hacia abajo, el zorro se ve pequeño frente a la escena", soloPrimerPlano: false },
];

/** Poses que caben en un encuadre cerrado, para que la UI apague el resto. */
export function posesCompatibles(encuadreId?: string | null): readonly PoseId[] | null {
  const encuadre = ENCUADRES.find((e) => e.id === encuadreId);
  return encuadre?.soloPrimerPlano ? POSES_PRIMER_PLANO : null;
}

/* ==================== Utilería del set ================================== */

export interface GrupoPresets {
  titulo: string;
  opciones: PresetSet[];
}

/**
 * Objetos del set, agrupados por la situación que ilustran.
 *
 * Están escritos como objetos físicos concretos porque así es como el prompt
 * los pide: "un notebook abierto" se dibuja, "productividad" no.
 */
export const UTILERIA_PRESETS: GrupoPresets[] = [
  {
    titulo: "Escritorio",
    opciones: [
      { id: "notebook", etiqueta: "Notebook abierto", texto: "un notebook abierto sobre la mesa" },
      { id: "cafe", etiqueta: "Taza de café", texto: "una taza de café humeante" },
      { id: "libreta", etiqueta: "Libreta y lápiz", texto: "una libreta abierta con un lápiz encima" },
      { id: "audifonos", etiqueta: "Audífonos", texto: "unos audífonos apoyados en la mesa" },
      { id: "post_its", etiqueta: "Post-its", texto: "varios post-it pegados en la pared del set" },
    ],
  },
  {
    titulo: "Negocio",
    opciones: [
      { id: "cajas", etiqueta: "Cajas de envío", texto: "cajas de cartón apiladas listas para enviar" },
      { id: "carrito", etiqueta: "Carrito de compras", texto: "un carrito de compras pequeño" },
      { id: "posnet", etiqueta: "Máquina de tarjetas", texto: "una máquina de tarjetas de crédito" },
      { id: "letrero", etiqueta: "Letrero de abierto", texto: "un letrero colgante de 'abierto'" },
      { id: "vitrina", etiqueta: "Vitrina de productos", texto: "una vitrina pequeña con productos ordenados" },
    ],
  },
  {
    titulo: "Web y pantallas",
    opciones: [
      { id: "celular", etiqueta: "Celular", texto: "un celular mostrando una pantalla encendida" },
      { id: "monitor", etiqueta: "Monitor grande", texto: "un monitor grande encendido detrás" },
      { id: "carrito_web", etiqueta: "Carrito de compra flotante", texto: "un ícono tridimensional de carrito de compra flotando como objeto físico" },
      { id: "candado", etiqueta: "Candado de seguridad", texto: "un candado cerrado como objeto físico sobre el set" },
      { id: "router", etiqueta: "Router con luces", texto: "un router con lucecitas encendidas" },
    ],
  },
  {
    titulo: "Datos y tiempo",
    opciones: [
      { id: "grafico", etiqueta: "Gráfico subiendo", texto: "un gráfico de barras físico con la tendencia subiendo" },
      { id: "grafico_baja", etiqueta: "Gráfico cayendo", texto: "un gráfico de barras físico con la tendencia cayendo" },
      { id: "reloj", etiqueta: "Reloj de pared", texto: "un reloj de pared grande" },
      { id: "calendario", etiqueta: "Calendario marcado", texto: "un calendario de pared con un día marcado en rojo" },
      { id: "calculadora", etiqueta: "Calculadora", texto: "una calculadora sobre la mesa" },
    ],
  },
  {
    titulo: "Celebración",
    opciones: [
      { id: "globos", etiqueta: "Globos", texto: "globos flotando en el set" },
      { id: "confeti", etiqueta: "Confeti", texto: "confeti cayendo por el aire" },
      { id: "medalla", etiqueta: "Medalla", texto: "una medalla colgando del cuello del zorro" },
      { id: "trofeo", etiqueta: "Trofeo", texto: "un trofeo dorado apoyado en el set" },
    ],
  },
];

/* ==================== Toque de estilo =================================== */

export const ESTILO_PRESETS: PresetSet[] = [
  { id: "dramatico", etiqueta: "Más dramático", texto: "tono más dramático, sombras marcadas y contraste alto" },
  { id: "festivo", etiqueta: "Festivo", texto: "ambiente festivo y cálido, con más color y energía" },
  { id: "minimalista", etiqueta: "Minimalista", texto: "más limpio y minimalista, con menos elementos en el set" },
  { id: "nocturno", etiqueta: "Nocturno", texto: "aire nocturno con luces de neón suaves de fondo" },
  { id: "urgencia", etiqueta: "Urgencia", texto: "sensación de urgencia, luz más dura y encuadre apretado" },
  { id: "amanecer", etiqueta: "Amanecer", texto: "brillo suave de amanecer entrando por un lado del set" },
  { id: "retro", etiqueta: "Retro", texto: "look retro de los noventa, con grano y colores algo lavados" },
  { id: "acogedor", etiqueta: "Acogedor", texto: "ambiente acogedor y cercano, luz cálida y envolvente" },
];

/* ==================== Resolución para el prompt ========================= */

const buscar = (lista: PresetSet[], id?: string | null): PresetSet | null =>
  id ? lista.find((p) => p.id === id) ?? null : null;

export const textoGesto = (id?: string | null): string | null => buscar(GESTOS_WEBI, id)?.texto ?? null;
export const textoEncuadre = (id?: string | null): string | null => buscar(ENCUADRES, id)?.texto ?? null;

/** Catálogo completo para la UI. */
export function listarPresetsSet() {
  return {
    gestos: GESTOS_WEBI.map(({ id, etiqueta }) => ({ id, etiqueta })),
    encuadres: ENCUADRES.map(({ id, etiqueta, soloPrimerPlano }) => ({ id, etiqueta, soloPrimerPlano })),
    utileria: UTILERIA_PRESETS.map((g) => ({
      titulo: g.titulo,
      opciones: g.opciones.map(({ id, etiqueta, texto }) => ({ id, etiqueta, texto })),
    })),
    estilos: ESTILO_PRESETS.map(({ id, etiqueta, texto }) => ({ id, etiqueta, texto })),
    posesPrimerPlano: [...POSES_PRIMER_PLANO],
  };
}
