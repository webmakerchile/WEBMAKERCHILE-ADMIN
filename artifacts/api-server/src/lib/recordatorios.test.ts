// Un fallo aquí no se ve como un fallo.
//
// Si avisa de menos, el equipo cree que nada está estancado. Si avisa de más,
// alguien silencia las notificaciones y a partir de ese día tampoco se entera de
// nada — y eso es indistinguible de que el sistema funcione. Por eso lo que más
// se prueba abajo no es que avise, sino CUÁNTAS veces avisa de lo mismo.

import { describe, it, expect } from "vitest";
import {
  REGLAS_POR_DEFECTO,
  normalizarReglas,
  puntosDeAviso,
  escalonDe,
  diasDeAtraso,
  avisosDeTareas,
  avisosDeProyectos,
  filtrarAvisos,
  refsEnviadas,
  recuentoReciente,
  enlaceConRef,
  refDeEnlace,
  MAX_POR_PERSONA,
  type TareaVigilada,
  type ProyectoVigilado,
} from "./recordatorios";

const AHORA = new Date("2026-07-31T15:00:00Z");
const HOY = "2026-07-31";

/** Un instante N días antes de AHORA. */
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

const tarea = (t: Partial<TareaVigilada> = {}): TareaVigilada => ({
  id: 1,
  title: "Maquetar la landing",
  stage: "doing",
  priority: "media",
  assigneeId: 7,
  stageSince: haceDias(10),
  ...t,
});

describe("normalizar las reglas", () => {
  it("rellena lo que falte con los valores por defecto", () => {
    expect(normalizarReglas(undefined)).toEqual(REGLAS_POR_DEFECTO);
    expect(normalizarReglas({})).toEqual(REGLAS_POR_DEFECTO);
    expect(normalizarReglas(null)).toEqual(REGLAS_POR_DEFECTO);
  });

  // Es lo que pasa si alguien deja el campo en blanco y el formulario manda 0:
  // el umbral 0 hace que TODA tarea abierta esté "estancada" desde el minuto
  // uno, y el job manda el tablero entero cada vez que corre.
  it("rechaza umbrales de cero o negativos", () => {
    expect(normalizarReglas({ diasTareaEstancada: 0 }).diasTareaEstancada).toBe(3);
    expect(normalizarReglas({ diasTareaEstancada: -5 }).diasTareaEstancada).toBe(3);
    expect(normalizarReglas({ diasProyectoParado: 0 }).diasProyectoParado).toBe(14);
    expect(normalizarReglas({ diasVencida: 0 }).diasVencida).toBe(1);
  });

  it("descarta lo que no es un número", () => {
    expect(normalizarReglas({ diasEnCola: "quince" as never }).diasEnCola).toBe(30);
    expect(normalizarReglas({ diasEnCola: NaN }).diasEnCola).toBe(30);
    expect(normalizarReglas({ diasEnCola: Infinity }).diasEnCola).toBe(30);
  });

  it("acota por arriba y trunca los decimales", () => {
    expect(normalizarReglas({ diasProyectoParado: 9999 }).diasProyectoParado).toBe(365);
    expect(normalizarReglas({ diasTareaEstancada: 4.9 }).diasTareaEstancada).toBe(4);
  });

  // La prioridad más alta del tablero se escribe "crítica", con tilde. Si la
  // configuración llega sin ella y no se normaliza, se cae al valor por defecto
  // y el filtro deja pasar tareas medias que nadie pidió.
  it("acepta la prioridad escrita como sea", () => {
    expect(normalizarReglas({ prioridadMinima: "critica" as never }).prioridadMinima).toBe("crítica");
    expect(normalizarReglas({ prioridadMinima: "CRÍTICA" as never }).prioridadMinima).toBe("crítica");
    expect(normalizarReglas({ prioridadMinima: " Alta " as never }).prioridadMinima).toBe("alta");
    expect(normalizarReglas({ prioridadMinima: "urgentísimo" as never }).prioridadMinima).toBe("media");
  });
});

describe("escalones de insistencia", () => {
  it("el primer aviso cae en el umbral configurado, no en el escalón fijo", () => {
    expect(puntosDeAviso(3)).toEqual([3, 7, 14, 30, 60, 90, 180, 365]);
    // Umbral 10: los escalones menores no aplican, pero el 10 sí.
    expect(puntosDeAviso(10)).toEqual([10, 14, 30, 60, 90, 180, 365]);
  });

  it("no avisa antes del umbral", () => {
    expect(escalonDe(0, 3)).toBeNull();
    expect(escalonDe(2, 3)).toBeNull();
    expect(escalonDe(9, 10)).toBeNull();
  });

  it("se queda en el escalón hasta que se alcanza el siguiente", () => {
    expect(escalonDe(3, 3)).toBe(3);
    expect(escalonDe(6, 3)).toBe(3);
    expect(escalonDe(7, 3)).toBe(7);
    expect(escalonDe(13, 3)).toBe(7);
    expect(escalonDe(30, 3)).toBe(30);
    expect(escalonDe(59, 3)).toBe(30);
  });

  // La razón de existir de los escalones: sin ellos serían 28 avisos.
  it("un mes parado son cuatro avisos, no veintiocho", () => {
    const distintos = new Set<number>();
    for (let d = 3; d <= 30; d++) distintos.add(escalonDe(d, 3)!);
    expect([...distintos].sort((a, b) => a - b)).toEqual([3, 7, 14, 30]);
  });

  it("un umbral alto no revive escalones más bajos", () => {
    // Con umbral 10 y 12 días, el escalón 7 ya pasó: avisar por él sería avisar
    // por un punto que nunca se configuró.
    expect(escalonDe(12, 10)).toBe(10);
    expect(escalonDe(14, 10)).toBe(14);
  });
});

describe("días de atraso de una fecha del Hub", () => {
  // `new Date("2026-07-31")` es medianoche UTC = 20:00 del día 30 en Santiago.
  // Restarle "ahora" daría 0.x días → floor 0 un día, 1 al siguiente por la
  // hora, no por la fecha. Comparando fechas el resultado no depende de la hora.
  it("el día del vencimiento no cuenta como atraso", () => {
    expect(diasDeAtraso("2026-07-31", HOY)).toBe(0);
  });

  it("cuenta los días pasados", () => {
    expect(diasDeAtraso("2026-07-30", HOY)).toBe(1);
    expect(diasDeAtraso("2026-07-01", HOY)).toBe(30);
  });

  it("una fecha futura da negativo, no un aviso", () => {
    expect(diasDeAtraso("2026-08-05", HOY)).toBe(-5);
    expect(escalonDe(diasDeAtraso("2026-08-05", HOY)!, 1)).toBeNull();
  });

  it("cruza el cambio de mes y el fin de año", () => {
    expect(diasDeAtraso("2026-02-28", "2026-03-01")).toBe(1);
    expect(diasDeAtraso("2025-12-31", "2026-01-01")).toBe(1);
  });

  it("lo que no es una fecha no avisa", () => {
    expect(diasDeAtraso(null, HOY)).toBeNull();
    expect(diasDeAtraso("", HOY)).toBeNull();
    expect(diasDeAtraso("mañana", HOY)).toBeNull();
    expect(diasDeAtraso("31/07/2026", HOY)).toBeNull();
  });
});

describe("avisos de tareas", () => {
  const reglas = REGLAS_POR_DEFECTO;

  it("avisa de una tarea parada en su etapa", () => {
    const [a] = avisosDeTareas([tarea({ stageSince: haceDias(8) })], reglas, AHORA, HOY);
    expect(a.tipo).toBe("estancada");
    expect(a.userId).toBe(7);
    expect(a.dias).toBe(8);
    expect(a.cuerpo).toContain("8 días");
  });

  // Sin asignado no hay a quién avisar. Mandárselo a dirección convierte el
  // aviso en ruido para quien no puede moverlo.
  it("sin asignado no avisa a nadie", () => {
    expect(avisosDeTareas([tarea({ assigneeId: null })], reglas, AHORA, HOY)).toEqual([]);
    expect(avisosDeTareas([tarea({ assigneeId: 0 })], reglas, AHORA, HOY)).toEqual([]);
  });

  it("una tarea terminada no está estancada", () => {
    expect(avisosDeTareas([tarea({ stage: "done" })], reglas, AHORA, HOY)).toEqual([]);
    expect(avisosDeTareas([tarea({ stage: "DONE" })], reglas, AHORA, HOY)).toEqual([]);
  });

  // backlog es una lista de pendientes, no trabajo parado: con el umbral corto
  // sonaría para casi todo el tablero al cuarto día de crearlo.
  it("backlog usa su propio plazo, mucho más largo", () => {
    expect(avisosDeTareas([tarea({ stage: "backlog", stageSince: haceDias(10) })], reglas, AHORA, HOY)).toEqual([]);
    const [a] = avisosDeTareas([tarea({ stage: "backlog", stageSince: haceDias(40) })], reglas, AHORA, HOY);
    expect(a.tipo).toBe("en_cola");
  });

  it("las etapas de espera sí cuentan: es donde el trabajo se pierde", () => {
    // Una tarea en "enviado a QA" tres semanas está parada aunque nadie la mire.
    const [a] = avisosDeTareas([tarea({ stage: "qa_sent", stageSince: haceDias(21) })], reglas, AHORA, HOY);
    expect(a.tipo).toBe("estancada");
  });

  it("respeta el filtro de prioridad, con tilde o sin ella", () => {
    const soloAltas = { ...reglas, prioridadMinima: "alta" as const };
    expect(avisosDeTareas([tarea({ priority: "baja" })], soloAltas, AHORA, HOY)).toEqual([]);
    expect(avisosDeTareas([tarea({ priority: "media" })], soloAltas, AHORA, HOY)).toEqual([]);
    expect(avisosDeTareas([tarea({ priority: "alta" })], soloAltas, AHORA, HOY)).toHaveLength(1);
    // La columna guarda "crítica" con tilde: si no se normaliza, la más urgente
    // se degrada a "media" y el filtro se la come.
    expect(avisosDeTareas([tarea({ priority: "crítica" })], soloAltas, AHORA, HOY)).toHaveLength(1);
  });

  it("sin prioridad legible se trata como media", () => {
    expect(avisosDeTareas([tarea({ priority: null })], reglas, AHORA, HOY)).toHaveLength(1);
    const soloAltas = { ...reglas, prioridadMinima: "alta" as const };
    expect(avisosDeTareas([tarea({ priority: null })], soloAltas, AHORA, HOY)).toEqual([]);
  });

  it("sin fecha de etapa no se inventa una antigüedad", () => {
    expect(avisosDeTareas([tarea({ stageSince: null })], reglas, AHORA, HOY)).toEqual([]);
    expect(avisosDeTareas([tarea({ stageSince: "no es fecha" })], reglas, AHORA, HOY)).toEqual([]);
  });

  // Es el agujero que deja `checkHubTaskDueReminders`: avisa el día antes y el
  // día de, y en cuanto la fecha pasa se calla para siempre.
  it("avisa de una tarea atrasada, que hoy no avisa nunca", () => {
    const avisos = avisosDeTareas(
      [tarea({ stageSince: haceDias(1), dueDate: "2026-07-25" })],
      reglas, AHORA, HOY,
    );
    const vencida = avisos.find((a) => a.tipo === "vencida");
    expect(vencida?.dias).toBe(6);
    expect(vencida?.cuerpo).toContain("venció hace 6 días");
  });

  it("el atraso es independiente de la etapa: puede moverse y seguir atrasada", () => {
    const avisos = avisosDeTareas(
      [tarea({ stage: "doing", stageSince: haceDias(0), dueDate: "2026-07-20" })],
      reglas, AHORA, HOY,
    );
    expect(avisos.map((a) => a.tipo)).toEqual(["vencida"]);
  });

  it("una tarea que vence en el futuro no avisa", () => {
    const avisos = avisosDeTareas(
      [tarea({ stageSince: haceDias(1), dueDate: "2026-08-15" })],
      reglas, AHORA, HOY,
    );
    expect(avisos).toEqual([]);
  });

  // Si cambian la fecha, el aviso anterior deja de valer y se puede volver a
  // avisar: la referencia lleva el dueDate dentro.
  it("cambiar la fecha de vencimiento cambia la referencia", () => {
    const uno = avisosDeTareas([tarea({ dueDate: "2026-07-20", stageSince: haceDias(0) })], reglas, AHORA, HOY);
    const dos = avisosDeTareas([tarea({ dueDate: "2026-07-10", stageSince: haceDias(0) })], reglas, AHORA, HOY);
    expect(uno[0].ref).not.toBe(dos[0].ref);
  });

  it("plural correcto para un solo día", () => {
    const [a] = avisosDeTareas([tarea({ stageSince: haceDias(3) })], { ...reglas, diasTareaEstancada: 1 }, AHORA, HOY);
    expect(a.cuerpo).toContain("3 días");
    const [b] = avisosDeTareas([tarea({ stageSince: haceDias(1) })], { ...reglas, diasTareaEstancada: 1 }, AHORA, HOY);
    expect(b.cuerpo).toContain("1 día en");
  });
});

describe("avisos de proyectos", () => {
  const reglas = REGLAS_POR_DEFECTO;
  const proyecto = (p: Partial<ProyectoVigilado> = {}): ProyectoVigilado => ({
    id: "p1",
    name: "Landing M&M",
    status: "dev",
    updatedAt: haceDias(30).getTime(),
    assigneeIds: [7],
    ...p,
  });

  it("avisa a cada persona asignada", () => {
    const avisos = avisosDeProyectos([proyecto({ assigneeIds: [7, 9] })], reglas, AHORA);
    expect(avisos.map((a) => a.userId).sort()).toEqual([7, 9]);
    expect(avisos[0].dias).toBe(30);
  });

  // Un proyecto sin asignar es "de todos" en la vista, pero notificar a todos
  // es exactamente cómo se entrena al equipo para ignorar las notificaciones.
  it("un proyecto sin asignar no notifica a nadie", () => {
    expect(avisosDeProyectos([proyecto({ assigneeIds: [] })], reglas, AHORA)).toEqual([]);
    expect(avisosDeProyectos([proyecto({ assigneeIds: undefined })], reglas, AHORA)).toEqual([]);
  });

  it("descarta ids que no son de usuario", () => {
    // El tablero es un blob sin esquema: puede llegar cualquier cosa.
    const avisos = avisosDeProyectos([proyecto({ assigneeIds: [0, -3, 1.5, 7] as number[] })], reglas, AHORA);
    expect(avisos.map((a) => a.userId)).toEqual([7]);
  });

  it("un proyecto entregado no está parado", () => {
    expect(avisosDeProyectos([proyecto({ status: "done" })], reglas, AHORA)).toEqual([]);
  });

  it("no avisa antes del plazo", () => {
    expect(avisosDeProyectos([proyecto({ updatedAt: haceDias(13).getTime() })], reglas, AHORA)).toEqual([]);
    expect(avisosDeProyectos([proyecto({ updatedAt: haceDias(14).getTime() })], reglas, AHORA)).toHaveLength(1);
  });

  it("sin fecha de actualización no se inventa antigüedad", () => {
    expect(avisosDeProyectos([proyecto({ updatedAt: null })], reglas, AHORA)).toEqual([]);
    expect(avisosDeProyectos([proyecto({ updatedAt: 0 })], reglas, AHORA)).toEqual([]);
  });
});

describe("recorte antes de mandar", () => {
  const aviso = (userId: number, dias: number, ref = `r${userId}-${dias}`) => ({
    tipo: "estancada" as const,
    ref, titulo: "t", cuerpo: "c", enlace: "/mis-tareas", userId, dias,
  });

  it("no repite lo ya mandado", () => {
    const salida = filtrarAvisos([aviso(1, 5, "x"), aviso(1, 9, "y")], new Set(["x"]));
    expect(salida.map((a) => a.ref)).toEqual(["y"]);
  });

  it("no manda dos veces la misma referencia en la misma ronda", () => {
    // Dos personas asignadas al mismo proyecto generan refs iguales solo si el
    // usuario coincide; aquí se prueba el duplicado exacto.
    const salida = filtrarAvisos([aviso(1, 5, "x"), aviso(1, 5, "x")], new Set());
    expect(salida).toHaveLength(1);
  });

  // Quien vuelve de vacaciones con treinta tareas paradas recibiría treinta
  // avisos, los silenciaría todos, y desde ese día el sistema no sirve.
  it("limita cuántos recibe cada persona", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => aviso(1, i + 1));
    expect(filtrarAvisos(muchos, new Set())).toHaveLength(MAX_POR_PERSONA);
  });

  it("el tope es por persona, no global", () => {
    const salida = filtrarAvisos(
      [...Array.from({ length: 8 }, (_, i) => aviso(1, i + 1)),
       ...Array.from({ length: 8 }, (_, i) => aviso(2, i + 1))],
      new Set(),
    );
    expect(salida.filter((a) => a.userId === 1)).toHaveLength(MAX_POR_PERSONA);
    expect(salida.filter((a) => a.userId === 2)).toHaveLength(MAX_POR_PERSONA);
  });

  // Si hay que cortar, que sobrevivan los peores: cortar por orden de llegada
  // dejaría fuera justo lo que lleva más tiempo parado.
  it("cuando recorta, deja pasar lo más parado", () => {
    const muchos = Array.from({ length: 10 }, (_, i) => aviso(1, i + 1));
    const salida = filtrarAvisos(muchos, new Set());
    expect(salida.map((a) => a.dias)).toEqual([10, 9, 8, 7, 6]);
  });

  it("un tope de cero no manda nada", () => {
    expect(filtrarAvisos([aviso(1, 5)], new Set(), 0)).toEqual([]);
  });

  // Sin esto el tope sería por ronda, no por persona: con treinta tareas
  // paradas, cada pasada del job soltaría cinco más hasta mandarlas todas, y la
  // avalancha llegaría igual, solo que a plazos.
  it("descuenta los que la persona ya recibió hoy", () => {
    const muchos = Array.from({ length: 10 }, (_, i) => aviso(1, i + 1));
    expect(filtrarAvisos(muchos, new Set(), MAX_POR_PERSONA, new Map([[1, 3]]))).toHaveLength(2);
    expect(filtrarAvisos(muchos, new Set(), MAX_POR_PERSONA, new Map([[1, 5]]))).toEqual([]);
    expect(filtrarAvisos(muchos, new Set(), MAX_POR_PERSONA, new Map([[1, 99]]))).toEqual([]);
  });

  it("el recuento de una persona no limita a las demás", () => {
    const salida = filtrarAvisos(
      [aviso(1, 5), aviso(2, 5)], new Set(), MAX_POR_PERSONA, new Map([[1, 5]]),
    );
    expect(salida.map((a) => a.userId)).toEqual([2]);
  });
});

describe("recuento de lo ya recibido", () => {
  const AYER = new Date(AHORA.getTime() - 26 * 3_600_000);
  const HACE_UNA_HORA = new Date(AHORA.getTime() - 3_600_000);
  const desde = new Date(AHORA.getTime() - 24 * 3_600_000);

  it("cuenta por persona dentro de la ventana", () => {
    const cuenta = recuentoReciente(
      [
        { userId: 7, createdAt: HACE_UNA_HORA },
        { userId: 7, createdAt: HACE_UNA_HORA },
        { userId: 9, createdAt: HACE_UNA_HORA },
      ],
      desde,
    );
    expect(cuenta.get(7)).toBe(2);
    expect(cuenta.get(9)).toBe(1);
  });

  // Lo de anteayer no puede seguir bloqueando los avisos de hoy: si contara,
  // una semana movida dejaría a alguien sin recordatorios para siempre.
  it("lo de fuera de la ventana no cuenta", () => {
    const cuenta = recuentoReciente([{ userId: 7, createdAt: AYER }], desde);
    expect(cuenta.get(7)).toBeUndefined();
  });

  it("una fecha ilegible no suma", () => {
    const cuenta = recuentoReciente(
      [{ userId: 7, createdAt: null }, { userId: 7, createdAt: "cualquier cosa" }],
      desde,
    );
    expect(cuenta.get(7)).toBeUndefined();
  });
});

describe("dedupe a través del enlace guardado", () => {
  const uno = {
    tipo: "estancada" as const, ref: "tarea:12:estancada:7",
    titulo: "t", cuerpo: "c", enlace: "/mis-tareas", userId: 7, dias: 8,
  };

  it("el enlace sigue llevando a una página real", () => {
    expect(enlaceConRef(uno).startsWith("/mis-tareas?")).toBe(true);
  });

  it("la referencia se recupera del enlace", () => {
    expect(refDeEnlace(enlaceConRef(uno))).toBe(uno.ref);
  });

  it("un enlace sin referencia no ensucia el conjunto", () => {
    expect(refDeEnlace("/mis-tareas")).toBeNull();
    expect(refDeEnlace(null)).toBeNull();
    expect(refsEnviadas(["/mi-dia", null, undefined])).toEqual(new Set());
  });

  // El ciclo completo: lo que se guardó en la ronda anterior no se vuelve a
  // mandar en esta. Si esto se rompiera, el aviso se repetiría cada 10 minutos.
  it("lo guardado ayer no se manda hoy", () => {
    const enviadas = refsEnviadas([enlaceConRef(uno)]);
    expect(filtrarAvisos([uno], enviadas)).toEqual([]);
  });

  it("al cambiar de escalón vuelve a pasar", () => {
    const enviadas = refsEnviadas([enlaceConRef(uno)]);
    const siguiente = { ...uno, ref: "tarea:12:estancada:14", dias: 15 };
    expect(filtrarAvisos([siguiente], enviadas)).toHaveLength(1);
  });
});
