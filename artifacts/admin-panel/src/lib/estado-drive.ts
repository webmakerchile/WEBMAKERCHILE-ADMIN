// Máquina de estados de la autorización de Drive (la parte pura del hook
// `useEstadoDrive`).
//
// La regla que protege es "cerrado por defecto": al empezar CUALQUIER
// comprobación se olvida el `conectado` anterior, y una respuesta fallida o
// no-OK deja la cuenta como NO conectada. Sin esto, un permiso revocado (o un
// fallo de red en plena revalidación) dejaba pasar consultas a Drive con el
// estado de la vez anterior, y el explorador enseñaba caché de una sesión que
// ya no tenía permiso.
//
// Es un módulo aparte para poderlo probar en node sin montar React: el error
// que se busca evitar es de transiciones, no de pintado.

export interface EstadoDriveBase {
  /** Solo es `true` si la comprobación EN CURSO respondió que sí. */
  conectado: boolean;
  /** Hay una comprobación pendiente: nadie debería decidir todavía. */
  cargando: boolean;
  /** URL a la que mandar para dar el permiso. */
  conectar: string;
}

export const RUTA_CONECTAR_POR_DEFECTO = "/api/auth/drive";

/** Estado antes de saber nada. Con la comprobación apagada, ni carga ni deja pasar. */
export function estadoInicial(activo: boolean): EstadoDriveBase {
  return { conectado: false, cargando: activo, conectar: RUTA_CONECTAR_POR_DEFECTO };
}

/** Arranca una (re)comprobación: cerrado mientras no responda la de AHORA. */
export function alComprobar(prev: EstadoDriveBase): EstadoDriveBase {
  return { ...prev, conectado: false, cargando: true };
}

/** Se apagó la comprobación (p. ej. se cerró el explorador) sin esperar respuesta. */
export function alApagar(prev: EstadoDriveBase): EstadoDriveBase {
  return { ...prev, cargando: false };
}

/**
 * Aplica la respuesta de la comprobación. `null` significa fallo de red o
 * respuesta no-OK: la cuenta queda desconectada y se ofrece el botón, nunca se
 * conserva un "conectado" viejo.
 */
export function alResponder(
  prev: EstadoDriveBase,
  respuesta: { conectado?: unknown; conectar?: unknown } | null,
): EstadoDriveBase {
  return {
    conectado: respuesta ? respuesta.conectado === true : false,
    cargando: false,
    conectar:
      typeof respuesta?.conectar === "string" && respuesta.conectar
        ? respuesta.conectar
        : prev.conectar,
  };
}
