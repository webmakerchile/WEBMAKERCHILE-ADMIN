// Asignar un proyecto a personas concretas, y su carpeta de Drive.
//
// Hasta ahora `owner` era texto libre: alguien escribía "Josué" y eso no se
// podía comparar con ningún usuario. Consecuencia: "mis proyectos" no existía
// como concepto, y /mis-tareas listaba TODOS los proyectos activos de la
// agencia a cualquiera que entrara. Lo único asignable de verdad era la tarea.
//
// Lo mismo con la carpeta: `link` es un string sin validar dentro de un blob
// sin esquema, así que a veces guarda una URL de Drive, a veces una carpeta
// compartida ajena, y a veces cualquier cosa.
//
// Estas funciones son puras para poder probarlas: equivocarse aquí no rompe una
// pantalla, hace que alguien vea proyectos que no le tocan o deje de ver los
// suyos.

/** Lo mínimo de un proyecto para decidir de quién es. */
export interface ProyectoAsignable {
  id: string;
  /** Ids reales de usuario. Es lo que manda. */
  assigneeIds?: number[];
  /** Nombre escrito a mano, del sistema anterior. Se respeta al leer. */
  owner?: string;
  /** Enlace o id de la carpeta de Drive. */
  link?: string;
  driveFolderId?: string;
  status?: string;
}

/** Ids asignados, saneados: sin repetidos, sin basura y en orden estable. */
export function asignadosDe(p: ProyectoAsignable | null | undefined): number[] {
  const crudos = Array.isArray(p?.assigneeIds) ? p!.assigneeIds : [];
  const limpios = crudos
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0);
  return [...new Set(limpios)].sort((a, b) => a - b);
}

/**
 * ¿Este proyecto es de esta persona?
 *
 * Si NADIE está asignado, el proyecto es de todos. Es deliberado: los proyectos
 * que ya existen no tienen `assigneeIds`, y tratarlos como "de nadie" los haría
 * desaparecer de la vista de todo el equipo el día que esto se despliegue.
 */
export function esMio(p: ProyectoAsignable, userId: number | null | undefined): boolean {
  const ids = asignadosDe(p);
  if (ids.length === 0) return true;
  return typeof userId === "number" && ids.includes(userId);
}

/** Proyectos de una persona, respetando el caso "sin asignar". */
export function misProyectos<T extends ProyectoAsignable>(
  proyectos: readonly T[],
  userId: number | null | undefined,
): T[] {
  return proyectos.filter((p) => esMio(p, userId));
}

/** ¿Hay alguien asignado explícitamente? Para saber si el filtro dice algo. */
export function tieneAsignados(p: ProyectoAsignable): boolean {
  return asignadosDe(p).length > 0;
}

/**
 * Añade o quita a alguien de un proyecto, devolviendo la lista nueva.
 *
 * No muta: el tablero se guarda entero y mutar en sitio hace que el diff no
 * detecte el cambio.
 */
export function alternarAsignado(actuales: readonly number[] | undefined, userId: number): number[] {
  const ids = asignadosDe({ id: "", assigneeIds: [...(actuales ?? [])] });
  return ids.includes(userId) ? ids.filter((v) => v !== userId) : [...ids, userId].sort((a, b) => a - b);
}

/* ==================== Carpeta de Drive ================================== */

/**
 * Saca el id de carpeta de cualquier forma en que se haya guardado.
 *
 * Acepta la URL completa, la de "carpetas compartidas conmigo" y el id suelto,
 * porque las tres aparecen en los datos que ya hay: quien pegó el enlace no
 * tenía por qué saber cuál era la buena.
 */
export function idDeCarpeta(valor: string | null | undefined): string | null {
  const s = String(valor ?? "").trim();
  if (!s) return null;

  const patrones = [
    /\/folders\/([A-Za-z0-9_-]{10,})/,
    /[?&]id=([A-Za-z0-9_-]{10,})/,
    /\/drive\/u\/\d+\/folders\/([A-Za-z0-9_-]{10,})/,
  ];
  for (const re of patrones) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  // Un id suelto: solo si NO parece una URL, para no quedarse con un trozo
  // cualquiera de un enlace que no reconocimos.
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

/** Id de carpeta del proyecto, mire donde mire que se haya guardado. */
export function carpetaDe(p: ProyectoAsignable): string | null {
  return idDeCarpeta(p.driveFolderId) ?? idDeCarpeta(p.link);
}

/** URL para abrir la carpeta en Drive. */
export function urlDeCarpeta(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

/**
 * Nombre de la carpeta que se crea para un proyecto.
 *
 * Lleva el cliente porque dos clientes piden "Landing" el mismo mes, y en la
 * lista de Drive dos carpetas iguales no se distinguen.
 */
export function nombreDeCarpeta(nombreProyecto: string, cliente?: string): string {
  const limpio = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  const base = limpio(nombreProyecto) || "Proyecto";
  const c = limpio(cliente ?? "");
  return (c ? `${base} — ${c}` : base).slice(0, 120);
}
