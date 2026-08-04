// Recordatorios de trabajo estancado.
//
// Lo único que avisa hoy es la fecha de vencimiento de una TAREA, y solo el día
// antes y el día de (`checkHubTaskDueReminders`). En cuanto la fecha pasa, el
// marcador `<dueDate>:today` deja de coincidir con nada y la tarea **no vuelve a
// avisar nunca**: el sistema se calla justo cuando el atraso empieza a importar.
//
// Falta además todo lo que el equipo pidió: cuánto lleva un proyecto en el
// panel, cuánto lleva una tarea sin moverse y la prioridad. Esas señales ya
// existen —la de "sin moverse +72 h" está pintada en /mis-tareas— pero se ven
// solo si alguien entra a mirar, que es justo lo que no pasa con lo estancado.
//
// La decisión de qué avisar vive aquí, en funciones puras, porque el error caro
// no es que falle: es que avise de más. Un panel que manda cinco correos al día
// se silencia en una semana y entonces ya no avisa de nada.

/* ==================== Vocabulario real del tablero ====================== */

// Estos valores NO son inventados: salen de `VALID_PRIORITIES` y `VALID_STAGES`
// en `lib/db/src/schema/hub-tasks.ts`. La prioridad más alta lleva tilde
// ("crítica"), así que compararla contra "critica" la degradaría a "media" en
// silencio y el filtro de prioridad se comería justo las urgentes.
export type Prioridad = "baja" | "media" | "alta" | "crítica";

const ORDEN: Record<Prioridad, number> = { baja: 0, media: 1, alta: 2, "crítica": 3 };

/** Quita tildes y espacios para que "critica", "CRÍTICA" y "Crítica" sean la misma. */
function claveDePrioridad(v: unknown): Prioridad | null {
  const s = String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (s === "critica") return "crítica";
  return s === "baja" || s === "media" || s === "alta" ? s : null;
}

/** Etapa donde la tarea ya no está en marcha. */
const ETAPA_TERMINADA = "done";

/**
 * `backlog` es una cola, no trabajo parado.
 *
 * /mis-tareas ya la excluye del aviso de "estancada" (`mis-tareas.tsx`), y con
 * razón: casi toda tarea recién creada lleva días en backlog, así que el umbral
 * corto la haría sonar para todo el tablero el día después de crearlo. Sigue
 * teniendo aviso propio, pero con un plazo mucho más largo.
 */
const ETAPA_EN_COLA = "backlog";

const normalizarEtapa = (v: unknown) => String(v ?? "").trim().toLowerCase();

/* ==================== Reglas configurables ============================== */

export interface ReglasRecordatorio {
  /** Días sin cambiar de etapa para considerar estancada una tarea de prioridad media. */
  diasTareaEstancada: number;
  /** Igual, para prioridad crítica: por defecto avisa mucho antes que las demás. */
  diasTareaEstancadaCritica: number;
  /** Igual, para prioridad alta. */
  diasTareaEstancadaAlta: number;
  /** Igual, para prioridad baja: por defecto tolera más tiempo sin moverse. */
  diasTareaEstancadaBaja: number;
  /** Días en backlog antes de preguntar si sigue teniendo sentido. */
  diasEnCola: number;
  /** Días de atraso sobre la fecha de vencimiento de la tarea. */
  diasVencida: number;
  /** Días de un proyecto abierto sin ningún cambio en el panel. */
  diasProyectoParado: number;
  /** Solo avisa de tareas con esta prioridad o superior. */
  prioridadMinima: Prioridad;
}

export const REGLAS_POR_DEFECTO: ReglasRecordatorio = {
  diasTareaEstancada: 3,
  diasTareaEstancadaCritica: 1,
  diasTareaEstancadaAlta: 2,
  diasTareaEstancadaBaja: 5,
  diasEnCola: 30,
  diasVencida: 1,
  diasProyectoParado: 14,
  prioridadMinima: "media",
};

/** Normaliza lo que venga de la configuración, con topes sanos. */
export function normalizarReglas(
  crudas: Partial<ReglasRecordatorio> | null | undefined,
): ReglasRecordatorio {
  const dia = (v: unknown, porDefecto: number) => {
    const n = Number(v);
    // Cero o negativo avisaría de TODO, cada vez que corre el job.
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 365) : porDefecto;
  };
  return {
    diasTareaEstancada: dia(crudas?.diasTareaEstancada, REGLAS_POR_DEFECTO.diasTareaEstancada),
    diasTareaEstancadaCritica: dia(crudas?.diasTareaEstancadaCritica, REGLAS_POR_DEFECTO.diasTareaEstancadaCritica),
    diasTareaEstancadaAlta: dia(crudas?.diasTareaEstancadaAlta, REGLAS_POR_DEFECTO.diasTareaEstancadaAlta),
    diasTareaEstancadaBaja: dia(crudas?.diasTareaEstancadaBaja, REGLAS_POR_DEFECTO.diasTareaEstancadaBaja),
    diasEnCola: dia(crudas?.diasEnCola, REGLAS_POR_DEFECTO.diasEnCola),
    diasVencida: dia(crudas?.diasVencida, REGLAS_POR_DEFECTO.diasVencida),
    diasProyectoParado: dia(crudas?.diasProyectoParado, REGLAS_POR_DEFECTO.diasProyectoParado),
    prioridadMinima: claveDePrioridad(crudas?.prioridadMinima) ?? REGLAS_POR_DEFECTO.prioridadMinima,
  };
}

/**
 * Umbral de "estancada" según la prioridad de la tarea.
 *
 * Antes había un solo plazo para el tablero entero. Con esto una crítica
 * puede sonar al día, mientras una baja tolera casi una semana sin moverse.
 */
export function umbralEstancadaPorPrioridad(reglas: ReglasRecordatorio, prioridad: Prioridad): number {
  if (prioridad === "crítica") return reglas.diasTareaEstancadaCritica;
  if (prioridad === "alta") return reglas.diasTareaEstancadaAlta;
  if (prioridad === "baja") return reglas.diasTareaEstancadaBaja;
  return reglas.diasTareaEstancada;
}

/* ==================== Cada cuánto se repite un aviso ===================== */

/**
 * Escalones de insistencia.
 *
 * Lo importante de todo este archivo. Si el aviso se repitiera cada vez que el
 * contador de días sube, una tarea parada un mes mandaría treinta
 * notificaciones y quien las recibe silenciaría el canal entero — con lo que el
 * sistema pasaría a no avisar de nada. Con escalones, un mes parado son cuatro
 * avisos: al llegar al umbral, y luego a los 7, 14 y 30 días.
 */
const ESCALONES = [3, 7, 14, 30, 60, 90, 180, 365] as const;

/** Puntos en los que se avisa: el umbral configurado y los escalones mayores. */
export function puntosDeAviso(umbral: number): number[] {
  return [umbral, ...ESCALONES.filter((e) => e > umbral)];
}

/**
 * En qué escalón cae algo que lleva `dias` parado, o null si aún no toca.
 *
 * El número que devuelve es el que va en la referencia del aviso: mientras no
 * cambie de escalón, el aviso se considera ya mandado.
 */
export function escalonDe(dias: number, umbral: number): number | null {
  if (!Number.isFinite(dias) || dias < umbral) return null;
  let mejor: number | null = null;
  for (const p of puntosDeAviso(umbral)) if (p <= dias) mejor = p;
  return mejor;
}

/* ==================== Qué merece un aviso =============================== */

export type TipoAviso = "estancada" | "en_cola" | "vencida" | "proyecto_parado";

export interface Aviso {
  tipo: TipoAviso;
  /** Identifica lo avisado, para no repetirlo hasta el siguiente escalón. */
  ref: string;
  titulo: string;
  cuerpo: string;
  enlace: string;
  userId: number;
  /** Días reales parado. Ordena los avisos cuando hay que recortar. */
  dias: number;
}

export interface TareaVigilada {
  id: number;
  title: string;
  stage: string;
  priority?: string | null;
  /** Cuándo entró en su etapa actual. */
  stageSince?: Date | string | number | null;
  assigneeId?: number | null;
  /** Fecha local (YYYY-MM-DD), como la guarda el Hub. */
  dueDate?: string | null;
}

/** Días completos transcurridos, o null si la fecha no es utilizable. */
function diasDesde(desde: Date | string | number | null | undefined, ahora: Date): number | null {
  if (desde === null || desde === undefined || desde === "") return null;
  const t = desde instanceof Date ? desde.getTime() : new Date(desde).getTime();
  // `t <= 0` es la época Unix, y eso NO es una fecha: es el 0 que deja un
  // proyecto del tablero al que nunca se le escribió `updatedAt`. Leerlo como
  // fecha da "lleva 20.000 días parado" y manda el aviso más alarmante posible
  // por el motivo más tonto posible.
  if (!Number.isFinite(t) || t <= 0) return null;
  return Math.floor((ahora.getTime() - t) / 86_400_000);
}

/**
 * Días de atraso de un `dueDate` del Hub.
 *
 * Los dueDate son fechas locales sin hora ("2026-07-31"). `new Date()` sobre esa
 * cadena la interpreta como medianoche **UTC**, que en Santiago es la tarde del
 * día anterior: comparar con la hora actual daría un día de atraso de más justo
 * el día del vencimiento. Por eso se comparan como fechas, no como instantes.
 */
export function diasDeAtraso(dueDate: string | null | undefined, hoy: string): number | null {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.exec(String(dueDate ?? "").trim())?.[0];
  const hoyOk = /^\d{4}-\d{2}-\d{2}$/.exec(String(hoy ?? "").trim())?.[0];
  if (!fecha || !hoyOk) return null;
  const ms = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((ms(hoyOk) - ms(fecha)) / 86_400_000);
}

function alcanzaPrioridad(p: unknown, minima: Prioridad): boolean {
  // Sin prioridad legible se asume "media", que es el default de la columna.
  return ORDEN[claveDePrioridad(p) ?? "media"] >= ORDEN[minima];
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Avisos de tareas: sin moverse, aparcadas en backlog y atrasadas.
 *
 * Sin asignado no se avisa: no habría a quién, y mandárselo a dirección
 * convierte el aviso en ruido para quien no puede hacer nada con él.
 *
 * @param direccionIds  A quién copiar (CEO/superadmin) además del responsable.
 *   Si dirección es también la responsable, no se duplica.
 * @param nombrePorId  Para que la copia de dirección diga de quién es la tarea.
 */
export function avisosDeTareas(
  tareas: readonly TareaVigilada[],
  reglas: ReglasRecordatorio,
  ahora: Date = new Date(),
  hoy?: string,
  direccionIds: readonly number[] = [],
  nombrePorId: ReadonlyMap<number, string> = new Map(),
): Aviso[] {
  const fechaHoy = hoy ?? ahora.toISOString().slice(0, 10);
  const salida: Aviso[] = [];

  for (const t of tareas) {
    if (!t.assigneeId) continue;
    const etapa = normalizarEtapa(t.stage);
    if (etapa === ETAPA_TERMINADA) continue;
    if (!alcanzaPrioridad(t.priority, reglas.prioridadMinima)) continue;

    const prioridad = claveDePrioridad(t.priority) ?? "media";
    const enCola = etapa === ETAPA_EN_COLA;
    const quieta = diasDesde(t.stageSince, ahora);
    const umbral = enCola ? reglas.diasEnCola : umbralEstancadaPorPrioridad(reglas, prioridad);
    const escalon = quieta === null ? null : escalonDe(quieta, umbral);

    const propios: Aviso[] = [];
    if (escalon !== null && quieta !== null) {
      propios.push({
        tipo: enCola ? "en_cola" : "estancada",
        ref: `tarea:${t.id}:${enCola ? "en_cola" : "estancada"}:${escalon}`,
        titulo: enCola ? "Tarea aparcada" : "Tarea sin avanzar",
        cuerpo: enCola
          ? `"${t.title}" lleva ${plural(quieta, "día", "días")} en backlog. ¿Sigue en pie?`
          : `"${t.title}" lleva ${plural(quieta, "día", "días")} en la misma etapa.`,
        enlace: "/mis-tareas",
        userId: t.assigneeId,
        dias: quieta,
      });
    }

    // Atraso: independiente de la etapa. Una tarea puede moverse todos los días
    // y aun así llevar dos semanas pasada de fecha.
    const atraso = diasDeAtraso(t.dueDate, fechaHoy);
    const escalonAtraso = atraso === null ? null : escalonDe(atraso, reglas.diasVencida);
    if (escalonAtraso !== null && atraso !== null) {
      propios.push({
        tipo: "vencida",
        ref: `tarea:${t.id}:vencida:${t.dueDate}:${escalonAtraso}`,
        titulo: "Tarea atrasada",
        cuerpo: `"${t.title}" venció hace ${plural(atraso, "día", "días")}.`,
        enlace: "/mi-dia",
        userId: t.assigneeId,
        dias: atraso,
      });
    }

    salida.push(...propios);

    // Copia a dirección de cada aviso propio, salvo que dirección sea la
    // misma persona responsable (ya lo recibió arriba).
    if (propios.length > 0 && direccionIds.length > 0) {
      const nombre = nombrePorId.get(t.assigneeId);
      for (const ceoId of direccionIds) {
        if (ceoId === t.assigneeId) continue;
        for (const base of propios) {
          salida.push({
            ...base,
            ref: `${base.ref}:dir:${ceoId}`,
            userId: ceoId,
            cuerpo: nombre ? `${base.cuerpo} Responsable: ${nombre}.` : base.cuerpo,
          });
        }
      }
    }
  }
  return salida;
}

export interface ProyectoVigilado {
  id: string;
  name: string;
  /** lead | disc | dev | rev | done, tal como los guarda el tablero. */
  status?: string;
  /** Última escritura, en ms. */
  updatedAt?: number | null;
  assigneeIds?: number[];
}

/** Estado de proyecto que significa "ya está entregado". */
const PROYECTO_TERMINADO = "done";

/** Etiquetas legibles de las etapas del embudo de proyectos del Hub. */
const ETAPA_PROYECTO_LABEL: Record<string, string> = {
  lead: "Lead", disc: "Descubrimiento", dev: "Desarrollo", rev: "Revisión", done: "Entregado",
};

/**
 * Avisos de proyectos abiertos que llevan tiempo sin tocarse.
 *
 * Es lo que el equipo llamó "tiempo de permanencia del proyecto en el panel", y
 * hoy no lo mira nadie.
 *
 * @param direccionIds  A quién copiar (CEO/superadmin) además de los asignados.
 *   Un proyecto sin nadie asignado igual les avisa a ellos: si no, nadie se
 *   entera de que quedó huérfano.
 * @param pendientesPorProyecto  Cuántas tareas sin terminar tiene cada proyecto,
 *   para que el aviso diga algo más que "lleva N días". Si no se entrega, el
 *   aviso omite el conteo (llamador no lo calculó). Si se entrega, un proyecto
 *   ausente del mapa cuenta como 0 -- puede llevar días parado y no tener
 *   ninguna tarea pendiente, y eso también hay que decirlo.
 */
export function avisosDeProyectos(
  proyectos: readonly ProyectoVigilado[],
  reglas: ReglasRecordatorio,
  ahora: Date = new Date(),
  direccionIds: readonly number[] = [],
  pendientesPorProyecto?: ReadonlyMap<string, number>,
): Aviso[] {
  const salida: Aviso[] = [];
  for (const p of proyectos) {
    if (normalizarEtapa(p.status) === PROYECTO_TERMINADO) continue;

    const quieto = diasDesde(p.updatedAt ?? null, ahora);
    const escalon = quieto === null ? null : escalonDe(quieto, reglas.diasProyectoParado);
    if (escalon === null || quieto === null) continue;

    const asignados = (p.assigneeIds ?? []).filter(
      (u): u is number => Number.isInteger(u) && u > 0,
    );
    const etiqueta = ETAPA_PROYECTO_LABEL[normalizarEtapa(p.status)] ?? String(p.status ?? "");
    // Ausente del mapa = 0, no "desconocido": el mapa lo arma el llamador
    // recorriendo TODAS las tareas no terminadas, así que si este proyecto no
    // aparece es porque de verdad no tiene ninguna pendiente.
    const pendientes = pendientesPorProyecto ? (pendientesPorProyecto.get(p.id) ?? 0) : null;
    const notaPendientes =
      pendientes !== null
        ? ` · ${plural(pendientes, "tarea pendiente", "tareas pendientes")}`
        : "";
    const cuerpoBase = `"${p.name}" lleva ${plural(quieto, "día", "días")} sin cambios en el panel. Etapa: ${etiqueta}${notaPendientes}.`;

    if (asignados.length === 0) {
      // Sin asignados no hay a quién avisar en el equipo -- un proyecto "de
      // todos" entrena a la agencia entera a ignorar notificaciones. Pero
      // dirección sí debe saber que uno quedó huérfano: nadie más lo va a mover.
      for (const ceoId of direccionIds) {
        if (!Number.isInteger(ceoId) || ceoId <= 0) continue;
        salida.push({
          tipo: "proyecto_parado",
          ref: `proyecto:${p.id}:${escalon}:${ceoId}`,
          titulo: "Proyecto sin movimiento",
          cuerpo: `${cuerpoBase} Sin nadie asignado.`,
          enlace: "/mis-tareas",
          userId: ceoId,
          dias: quieto,
        });
      }
      continue;
    }

    for (const userId of asignados) {
      salida.push({
        tipo: "proyecto_parado",
        ref: `proyecto:${p.id}:${escalon}:${userId}`,
        titulo: "Proyecto sin movimiento",
        cuerpo: cuerpoBase,
        enlace: "/mis-tareas",
        userId,
        dias: quieto,
      });
    }
    // Copia a dirección, salvo que ya esté entre los asignados.
    for (const ceoId of direccionIds) {
      if (asignados.includes(ceoId)) continue;
      salida.push({
        tipo: "proyecto_parado",
        ref: `proyecto:${p.id}:${escalon}:${ceoId}`,
        titulo: "Proyecto sin movimiento",
        cuerpo: cuerpoBase,
        enlace: "/mis-tareas",
        userId: ceoId,
        dias: quieto,
      });
    }
  }
  return salida;
}

/* ==================== Recorte final ===================================== */

/**
 * Tope de avisos por persona y ronda.
 *
 * Quien vuelve de vacaciones con treinta tareas paradas recibiría treinta
 * notificaciones de golpe, las silenciaría todas, y a partir de ahí el sistema
 * deja de servir.
 */
export const MAX_POR_PERSONA = 5;

/**
 * @param yaEnviados  Referencias ya notificadas: no se repiten.
 * @param recibidosHoy  Cuántos recordatorios lleva ya cada persona en el día.
 *   Sin esto el tope sería por ronda y no por persona: con treinta tareas
 *   paradas, cada pasada del job soltaría cinco más hasta mandarlas todas, que
 *   es exactamente la avalancha que el tope existe para evitar.
 */
export function filtrarAvisos(
  avisos: readonly Aviso[],
  yaEnviados: ReadonlySet<string>,
  maxPorPersona: number = MAX_POR_PERSONA,
  recibidosHoy: ReadonlyMap<number, number> = new Map(),
): Aviso[] {
  const porPersona = new Map<number, number>(recibidosHoy);
  const salida: Aviso[] = [];
  const vistos = new Set<string>();

  // Lo más parado primero: si hay que cortar, que sobrevivan los peores casos.
  for (const a of [...avisos].sort((x, y) => y.dias - x.dias)) {
    if (yaEnviados.has(a.ref) || vistos.has(a.ref)) continue;
    const n = porPersona.get(a.userId) ?? 0;
    if (n >= maxPorPersona) continue;
    porPersona.set(a.userId, n + 1);
    vistos.add(a.ref);
    salida.push(a);
  }
  return salida;
}

/* ==================== Puente con las notificaciones ===================== */

/** Tipo con el que se guardan estos avisos en `notifications`. */
export const TIPO_NOTIFICACION = "recordatorio";

/**
 * Enlace que se guarda en la notificación.
 *
 * La referencia viaja dentro de la URL a propósito: `notifications` no tiene
 * columna de dedupe, y así la ronda siguiente puede leer qué se mandó ya sin
 * añadir una tabla nueva. El destino sigue siendo una página real.
 */
export function enlaceConRef(aviso: Aviso): string {
  return `${aviso.enlace}?aviso=${encodeURIComponent(aviso.ref)}`;
}

/** Lee la referencia de un enlace guardado. Devuelve null si no la lleva. */
export function refDeEnlace(link: string | null | undefined): string | null {
  const m = /[?&]aviso=([^&]+)/.exec(String(link ?? ""));
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** Referencias ya notificadas, a partir de los enlaces guardados. */
export function refsEnviadas(links: readonly (string | null | undefined)[]): Set<string> {
  const set = new Set<string>();
  for (const l of links) {
    const ref = refDeEnlace(l);
    if (ref) set.add(ref);
  }
  return set;
}

/** Cuántos recordatorios recibió cada persona desde `desde`. */
export function recuentoReciente(
  previas: readonly { userId: number; createdAt: Date | string | number | null }[],
  desde: Date,
): Map<number, number> {
  const cuenta = new Map<number, number>();
  for (const p of previas) {
    if (!p.createdAt) continue;
    const t = p.createdAt instanceof Date ? p.createdAt.getTime() : new Date(p.createdAt).getTime();
    if (!Number.isFinite(t) || t < desde.getTime()) continue;
    cuenta.set(p.userId, (cuenta.get(p.userId) ?? 0) + 1);
  }
  return cuenta;
}
