import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isTeamRole, normalizeRole, type TeamRole } from "@workspace/roles";

const STORAGE_KEY = "wm_view_as_role";

/**
 * "Ver como": la dirección recorre el panel con los ojos de otro rol.
 *
 * Es una vista previa, no un cambio de identidad: solo afecta lo que se
 * MUESTRA (menú, rutas, pantalla de inicio). El servidor sigue respondiendo
 * según el rol real, así que esto nunca puede dar más permisos de los que ya
 * se tienen — como mucho, muestra menos. Por eso es seguro dejarlo en el panel.
 */
interface ViewAsValue {
  /** Rol simulado; null = viendo con el rol propio. */
  viewAs: TeamRole | null;
  /** Rol con el que se dibuja el panel ahora mismo. */
  effectiveRole: TeamRole;
  /** Solo la dirección puede simular. */
  canSimulate: boolean;
  setViewAs: (role: TeamRole | null) => void;
}

const ViewAsContext = createContext<ViewAsValue>({
  viewAs: null,
  effectiveRole: "ceo",
  canSimulate: false,
  setViewAs: () => {},
});

export function ViewAsProvider({
  realRole,
  canSimulate,
  children,
}: {
  realRole: string | undefined;
  canSimulate: boolean;
  children: ReactNode;
}) {
  const [viewAs, setViewAsState] = useState<TeamRole | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && isTeamRole(saved) ? saved : null;
    } catch { return null; }
  });

  // Si la persona deja de poder simular, la vista previa se cae sola.
  useEffect(() => {
    if (!canSimulate && viewAs !== null) {
      setViewAsState(null);
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }, [canSimulate, viewAs]);

  const setViewAs = useCallback((role: TeamRole | null) => {
    setViewAsState(role);
    try {
      if (role) localStorage.setItem(STORAGE_KEY, role);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  const value = useMemo<ViewAsValue>(() => {
    const real = normalizeRole(realRole, false);
    return {
      viewAs: canSimulate ? viewAs : null,
      effectiveRole: canSimulate && viewAs ? viewAs : real,
      canSimulate,
      setViewAs,
    };
  }, [realRole, canSimulate, viewAs, setViewAs]);

  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

export function useViewAs() {
  return useContext(ViewAsContext);
}

/**
 * Rol con el que se debe dibujar el panel. Todo lo visual (menú, guardas de
 * ruta, pantalla de inicio) usa este, nunca `user.teamRole` directamente.
 */
export function useEffectiveRole(): TeamRole {
  return useContext(ViewAsContext).effectiveRole;
}

/** Al simular, el superadmin deja de saltarse los permisos: si no, no se ve nada. */
export function useEffectiveSuperAdmin(realRole: string | undefined, isSuperAdmin: boolean): boolean {
  const { viewAs } = useContext(ViewAsContext);
  void realRole;
  return viewAs ? false : isSuperAdmin;
}
