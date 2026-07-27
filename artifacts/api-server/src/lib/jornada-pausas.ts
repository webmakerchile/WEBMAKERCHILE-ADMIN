// Descuento de pausas dentro de una jornada.
//
// Hasta ahora la jornada corría de corrido entre la entrada y la salida: ir al
// baño, almorzar o salir a un trámite contaba como tiempo trabajado. Aquí vive
// toda la aritmética del descuento, separada de las rutas para poder probarla
// sin base de datos — medir mal las horas de la gente es un error caro.

/** Forma mínima de una pausa para calcular. */
export interface PausaCalculable {
  startedAt: Date | string;
  endedAt: Date | string | null;
}

/** Forma mínima de una sesión para calcular. */
export interface SesionCalculable {
  checkIn: Date | string;
  checkOut: Date | string | null;
}

const ms = (v: Date | string) => new Date(v).getTime();

/**
 * Minutos que suman las pausas dentro de una sesión.
 *
 * Recorta cada pausa al intervalo real de la sesión y fusiona las que se
 * solapen, para que dos pausas superpuestas (una abierta por la persona y otra
 * por quien supervisa) no se descuenten dos veces. Una pausa abierta cuenta
 * hasta `ahora`, que es lo que hace que el contador se detenga en vivo.
 */
export function minutosDePausas(
  sesion: SesionCalculable,
  pausas: PausaCalculable[],
  ahora: Date = new Date(),
): number {
  const inicioSesion = ms(sesion.checkIn);
  const finSesion = sesion.checkOut ? ms(sesion.checkOut) : ahora.getTime();
  if (!(finSesion > inicioSesion)) return 0;

  const intervalos = pausas
    .map((p) => {
      const desde = Math.max(ms(p.startedAt), inicioSesion);
      const hasta = Math.min(p.endedAt ? ms(p.endedAt) : ahora.getTime(), finSesion);
      return { desde, hasta };
    })
    .filter((i) => i.hasta > i.desde)
    .sort((a, b) => a.desde - b.desde);

  let total = 0;
  let cursor = -Infinity;
  for (const i of intervalos) {
    const desde = Math.max(i.desde, cursor);
    if (i.hasta > desde) {
      total += i.hasta - desde;
      cursor = i.hasta;
    }
  }
  return Math.round(total / 60000);
}

/**
 * Minutos NETOS de una sesión: los brutos menos las pausas, nunca negativos.
 *
 * `minutosBrutos` se recibe ya calculado para no duplicar aquí el tope de 16 h
 * que aplica la ruta a las sesiones que alguien olvidó cerrar.
 */
export function minutosNetos(minutosBrutos: number, minutosPausados: number): number {
  return Math.max(0, minutosBrutos - minutosPausados);
}

/** Formato humano de una duración en minutos: "2h 05m" o "45m". */
export function formatearDuracion(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${String(r).padStart(2, "0")}m` : `${r}m`;
}
