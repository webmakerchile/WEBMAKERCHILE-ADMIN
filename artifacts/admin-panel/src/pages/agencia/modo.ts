import { canSeeMoney } from "@workspace/roles";
import { useAuth } from "@/App";
import { useEffectiveRole, useViewAs } from "@/lib/view-as";

export type ModoAgencia = "completo" | "equipo" | "acotado";

/**
 * Mismos roles que ya dejan entrar las páginas WMC (dev/ventas/ceo).
 * Duplicado a propósito en el frontend -- la aplicación real vive en el
 * servidor en cada llamada (igual que ESTADOS_FINALES en proyectos.tsx).
 */
const ROLES_WMC = ["dev", "ventas", "ceo"];

export interface AccesoAgencia {
  modo: ModoAgencia;
  /** Solo relevante en modo "acotado": ¿ve Finanzas? (canSeeMoney del rol). */
  puedeFinanzas: boolean;
  /** Solo relevante en modo "acotado": ¿ve Proyectos/Propuestas? (mismos roles que WMC). */
  puedeProyectos: boolean;
}

/**
 * Acceso a la sección Agencia, calculado con la MISMA lógica que
 * `infoAcceso` en el servidor (routes/panel/index.ts) para que el menú y
 * las pestañas coincidan con lo que el backend realmente deja pasar.
 *
 * La frontera de datos REAL vive en el servidor (decide con el rol de la
 * sesión y manda todo saneado/bloqueado); este hook solo decide qué dibujar.
 * Respeta "ver como": la dirección simulando otro rol ve exactamente lo que
 * ese rol vería, aunque el servidor le siga mandando los datos completos.
 */
export function useAccesoAgencia(): AccesoAgencia {
  const user = useAuth();
  const { viewAs } = useViewAs();
  const effectiveRole = useEffectiveRole();
  const isSuperAdmin = !viewAs && user?.role === "superadmin";

  if (isSuperAdmin) return { modo: "completo", puedeFinanzas: true, puedeProyectos: true };
  if (effectiveRole === "ceo") return { modo: "completo", puedeFinanzas: true, puedeProyectos: true };
  if (effectiveRole === "tester") return { modo: "equipo", puedeFinanzas: true, puedeProyectos: true };
  return {
    modo: "acotado",
    puedeFinanzas: canSeeMoney(effectiveRole),
    puedeProyectos: ROLES_WMC.includes(effectiveRole),
  };
}

/** Atajo para el caso más común: "¿este modo sigue viendo exactamente lo de siempre?". */
export function useModoAgencia(): ModoAgencia {
  return useAccesoAgencia().modo;
}

/**
 * Único flag para decidir si se muestran montos/plata en pantalla: todo modo
 * que no sea "equipo" ve los montos tal cual (completo Y acotado, que ya no
 * pasan por el saneador del servidor). Para acciones exclusivas de dirección
 * (compartir proyectos con el equipo, etc.) sigue usando `modo === "completo"`.
 */
export function useVeMontos(): boolean {
  return useAccesoAgencia().modo !== "equipo";
}
