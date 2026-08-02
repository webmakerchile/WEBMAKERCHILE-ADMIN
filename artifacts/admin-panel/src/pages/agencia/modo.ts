import { useAuth } from "@/App";
import { useEffectiveRole, useViewAs } from "@/lib/view-as";

export type ModoAgencia = "completo" | "equipo";

/**
 * Modo de la sección Agencia.
 *
 * La frontera de datos REAL vive en el servidor (decide con el rol de la
 * sesión y manda todo saneado al equipo); este hook solo decide qué dibujar.
 * Respeta "ver como": el CEO simulando otro rol ve exactamente lo que ese rol
 * vería, aunque el servidor le siga mandando los datos completos.
 */
export function useModoAgencia(): ModoAgencia {
  const user = useAuth();
  const { viewAs } = useViewAs();
  const effectiveRole = useEffectiveRole();
  if (!viewAs && user?.role === "superadmin") return "completo";
  return effectiveRole === "ceo" ? "completo" : "equipo";
}
