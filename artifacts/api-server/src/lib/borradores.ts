// Retención de los borradores de Historias y Posts IA.
//
// Las generaciones ya se guardaban en `community_content` — el problema era
// doble: nada en la interfaz las volvía a mostrar (así que salir de la página
// se sentía como perderlo todo) y NADA las borraba nunca. Cada fila lleva las
// imágenes en base64 dentro del JSON, así que la tabla crecía sin techo.
//
// Aquí vive solo la decisión de qué se purga. Fuera de la ruta para poder
// probarla sin base de datos: borrar es irreversible y una regla mal escrita
// se lleva por delante trabajo de alguien.

/** Días que se conserva un borrador. */
export const DIAS_RETENCION = 14;

/** Techo por tipo: pasado esto se van los más viejos aunque no hayan caducado. */
export const MAX_BORRADORES = 60;

/**
 * Nunca se baja de aquí, por antiguos que sean.
 *
 * Alguien que vuelve de vacaciones y encuentra la lista vacía no piensa "se
 * limpiaron solos", piensa "se rompió". Dejar los últimos siempre visibles
 * cuesta poco y evita justo esa lectura.
 */
export const MIN_CONSERVADOS = 5;

export interface FilaBorrador {
  id: number;
  createdAt: Date | string;
}

export type MotivoPurga = "caducado" | "excede_tope";

export interface PlanPurga {
  ids: number[];
  /** Por qué se va cada uno; sirve para el log, que es lo único que queda. */
  motivos: Record<number, MotivoPurga>;
}

function tiempo(v: Date | string): number {
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Qué borradores hay que eliminar.
 *
 * `filas` puede venir en cualquier orden: se ordena aquí de más nuevo a más
 * viejo. Depender del orden de la consulta era pedir que una cláusula
 * cambiada en el futuro borrase lo recién creado.
 */
export function planPurga(
  filas: readonly FilaBorrador[],
  ahora: Date = new Date(),
  opts?: { diasRetencion?: number; maxBorradores?: number; minConservados?: number },
): PlanPurga {
  const dias = opts?.diasRetencion ?? DIAS_RETENCION;
  const tope = opts?.maxBorradores ?? MAX_BORRADORES;
  const minimo = opts?.minConservados ?? MIN_CONSERVADOS;

  const ordenadas = [...filas].sort((a, b) => tiempo(b.createdAt) - tiempo(a.createdAt));
  const limite = ahora.getTime() - dias * 24 * 60 * 60 * 1000;

  const ids: number[] = [];
  const motivos: Record<number, MotivoPurga> = {};

  ordenadas.forEach((fila, i) => {
    if (i < minimo) return; // suelo intocable
    if (i >= tope) {
      ids.push(fila.id);
      motivos[fila.id] = "excede_tope";
      return;
    }
    if (tiempo(fila.createdAt) < limite) {
      ids.push(fila.id);
      motivos[fila.id] = "caducado";
    }
  });

  return { ids, motivos };
}

/** Días que le quedan a un borrador antes de purgarse (0 = hoy se va). */
export function diasRestantes(
  createdAt: Date | string,
  ahora: Date = new Date(),
  diasRetencion = DIAS_RETENCION,
): number {
  const transcurridos = (ahora.getTime() - tiempo(createdAt)) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(diasRetencion - transcurridos));
}

/** Aviso para la UI cuando a un borrador le queda poco. */
export function avisoCaducidad(createdAt: Date | string, ahora: Date = new Date()): string | null {
  const d = diasRestantes(createdAt, ahora);
  if (d > 3) return null;
  if (d <= 0) return "Se borra hoy";
  return d === 1 ? "Se borra mañana" : `Se borra en ${d} días`;
}
