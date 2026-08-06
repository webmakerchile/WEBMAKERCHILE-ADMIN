import "./hub.css";
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/App";
import { useEffectiveRole, useViewAs } from "@/lib/view-as";
import { ALL_HUB_SCOPES, type HubScope, canManageSales, canSeeAttendance, roleHome } from "@workspace/roles";
import { TAREAS_QUERY_KEY } from "@/lib/tareas-hub";
import {
  blankState, hubStorageKey, clearHubStorage, loadState, saveState,
  fetchHubFromServer, patchHubToServer, migrate,
  HUB_API_BASE,
  type HubState, type HubTask, type TeamMember, type StateUpdater, type SheetKind, type Tab,
} from "./shared";

/**
 * A qué página del sidebar principal manda cada pestaña del ex-Hub. `null` =
 * pestaña retirada (Mi día y Tickets ya viven en el sidebar por su cuenta,
 * sin duplicado dentro del Hub).
 */
export const TAB_ROUTES: Partial<Record<Tab, string>> = {
  dash: "/dashboard-ejecutivo",
  torre: "/torre-ceo",
  proj: "/proyectos",
  clients: "/clientes",
  meet: "/reuniones",
  notes: "/notas",
  contracts: "/contratos",
  ventas: "/ventas",
  cobros: "/cobros",
  svc: "/servicios",
  drive: "/drive-hub",
  team: "/equipo-hoy",
  att: "/asistencia",
};

/**
 * Estado y lógica compartida por las 13 páginas en que se dividió el Hub
 * Ejecutivo: roles/permisos, el tablero (carga, guardado con reintentos,
 * fusión con el servidor), la hoja lateral (sheet), toasts y confirmaciones.
 *
 * Antes esto vivía una sola vez dentro de `EjecutivoPage`, con pestañas
 * internas. Ahora cada página es su propia ruta y monta su propia instancia
 * del hook — como el router solo monta una a la vez, el polling de 30s y las
 * queries no se multiplican.
 *
 * `currentTab` identifica a la página que llama (para que `navigateToTab`
 * sepa si el destino es "aquí mismo" — abre la hoja sin navegar — o "otra
 * página" — navega y le pasa la hoja a abrir por `?open=`).
 */
export function useHubBoard(currentTab: Tab) {
  const authUser = useAuth();
  const isAdmin = authUser?.role === "superadmin" || authUser?.role === "admin";
  // Rol efectivo: misma fuente única que el sidebar y el enrutador (respeta
  // "ver como" y colapsa alias legacy como "ejecutivo"/"edicion").
  const { viewAs } = useViewAs();
  const effectiveRole = useEffectiveRole();
  const isSuperAdmin = !viewAs && authUser?.role === "superadmin";
  const homeHref = roleHome(effectiveRole, isSuperAdmin);
  // Gestión de ventas (catálogo de servicios, torre de ventas/cobros): ceo/ventas.
  const canManageSvc = canManageSales(effectiveRole, isSuperAdmin);
  // Torre de control CEO: solo dirección. A propósito NO incluye a "tester"
  // (que sí tiene rutas comodín "*" para poder recorrer todo el panel de
  // revisión) — el backend de la torre solo acepta rol ceo, así que mostrarle
  // el panel real terminaría en puros 403; ver torre-ceo.tsx.
  const isCeo = isSuperAdmin || effectiveRole === "ceo";
  // La pestaña Servicios/Playbooks la ven admins y quienes pueden gestionarla (ceo/ventas).
  const canSeeSvc = isAdmin || canManageSvc;
  // Asistencia (pase de lista del equipo): dirección, ventas y RRHH. El resto
  // tiene su propia jornada en "Mi día".
  const canSeeAtt = canSeeAttendance(effectiveRole, isSuperAdmin);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const storageKey = hubStorageKey(authUser?.id);

  const { data: tasksData, refetch: refetchTasks } = useQuery({
    queryKey: ["hub-tasks"],
    queryFn: async () => {
      const res = await fetch(`${HUB_API_BASE}/hub/tasks`, { credentials: "include" });
      if (!res.ok) return { tasks: [] as HubTask[] };
      return res.json() as Promise<{ tasks: HubTask[] }>;
    },
    staleTime: 30000,
  });
  const apiTasks: HubTask[] = tasksData?.tasks ?? [];
  const onRefreshTasks = useCallback(() => { void refetchTasks(); }, [refetchTasks]);

  const { data: teamMembersData } = useQuery({
    queryKey: ["hub-team-members"],
    queryFn: async () => {
      const res = await fetch(`${HUB_API_BASE}/hub/tasks/team-members`, { credentials: "include" });
      if (!res.ok) return { users: [] as TeamMember[] };
      return res.json() as Promise<{ users: TeamMember[] }>;
    },
    staleTime: 120000,
  });
  const teamMembers: TeamMember[] = teamMembersData?.users ?? [];

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${HUB_API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    clearHubStorage();
    try { localStorage.removeItem("wm_auth_hint"); } catch { /* ignore */ }
    queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    window.location.reload();
  }, [queryClient]);

  const [state, setStateRaw] = useState<HubState>(() => migrate(loadState(storageKey)));
  const [scopes, setScopes] = useState<HubScope[]>(() => [...ALL_HUB_SCOPES]);
  const [writeScopes, setWriteScopes] = useState<HubScope[]>(() => [...ALL_HUB_SCOPES]);
  const [boardOwner, setBoardOwner] = useState<{ name: string | null; email: string } | null>(null);

  const serverSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  // Motivo del último fallo de guardado, o null. Se muestra fijo en pantalla:
  // un toast se lo pierde quien está mirando otra cosa, y aquí lo que está en
  // juego es un contrato que solo existe en este navegador.
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  /** Última versión del tablero que conocemos: la base para fusionar en el servidor. */
  const versionRef = useRef(0);
  /** Contador de guardados: si sube mientras viaja un PATCH, no pisamos lo que el usuario acaba de escribir. */
  const saveSeqRef = useRef(0);

  /** Adopta el tablero del servidor conservando las colecciones fuera de nuestro alcance. */
  const adoptServerData = useCallback((data: Partial<HubState> | null, version: number) => {
    versionRef.current = version;
    if (!data) return;
    setStateRaw(prev => {
      const merged = migrate(Object.assign(blankState(), prev, data));
      saveState(storageKey, merged);
      return merged;
    });
  }, [storageKey]);

  const setState = useCallback((nextOrUpdater: StateUpdater) => {
    dirtyRef.current = true;
    const seq = ++saveSeqRef.current;
    // Resolver la forma función DENTRO del setState de React (no contra un
    // `state`/`stateRef` de closure): es la única fuente que no se congela
    // si el componente que llamó a `onSave` se desmontó mientras tanto (p.
    // ej. una continuación async de "crear carpeta de Drive" que termina
    // después de que el modal que la disparó ya se cerró solo).
    setStateRaw(prev => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
      saveState(storageKey, next);
      if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);

      // Reintento con espera creciente. Un corte de red de unos segundos no
      // puede dejar el tablero guardado solo en el navegador de una persona.
      const enviar = (intento: number) => {
        void patchHubToServer(next, versionRef.current).then(result => {
          // Si el usuario siguió editando, ese cambio más nuevo manda: se
          // descarta este envío y su reintento.
          if (saveSeqRef.current !== seq) return;

          if (result.ok) {
            versionRef.current = result.version;
            dirtyRef.current = false;
            setErrorGuardado(null);
            adoptServerData(result.data, result.version);
            return;
          }

          if (!result.permanente && intento < 4) {
            const espera = 2000 * 2 ** intento;
            serverSaveTimer.current = setTimeout(() => enviar(intento + 1), espera);
            return;
          }
          // Agotados los reintentos (o fallo que no se arregla reintentando):
          // se dice. `dirtyRef` sigue en true a propósito — hay trabajo local
          // sin enviar y traer del servidor lo borraría.
          setErrorGuardado(result.error);
        });
      };

      // En StrictMode (dev) React puede invocar este updater dos veces; el
      // clearTimeout de arriba hace que solo el timer de la última llamada
      // sobreviva, así que el doble-invoke no duplica el guardado real.
      serverSaveTimer.current = setTimeout(() => enviar(0), 1500);
      return next;
    });
  }, [storageKey, adoptServerData]);

  useEffect(() => {
    let cancelled = false;
    const pull = () => {
      // Nunca traemos del servidor con cambios locales sin enviar: se perderían.
      if (dirtyRef.current) return;
      void fetchHubFromServer().then(snap => {
        if (cancelled || !snap || dirtyRef.current) return;
        setScopes(snap.scopes);
        setWriteScopes(snap.writeScopes);
        setBoardOwner(snap.owner);
        adoptServerData(snap.data, snap.version);
      });
    };
    pull();
    // El tablero es compartido: refrescamos para ver lo que hace el resto.
    const timer = setInterval(pull, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [storageKey, adoptServerData]);

  /** Refresco bajo demanda tras acciones que escriben el tablero directo en el
   *  servidor (agendar reunión de venta, registrar desenlace). Mismas reglas
   *  que el pull periódico: jamás por encima de cambios locales sin enviar. */
  const refreshBoard = useCallback(() => {
    if (dirtyRef.current) return;
    void fetchHubFromServer().then(snap => {
      if (!snap || dirtyRef.current) return;
      setScopes(snap.scopes);
      setWriteScopes(snap.writeScopes);
      setBoardOwner(snap.owner);
      adoptServerData(snap.data, snap.version);
    });
  }, [adoptServerData]);

  const canWrite = useCallback((scope: HubScope) => writeScopes.includes(scope), [writeScopes]);

  const [sheet, setSheetRaw] = useState<SheetKind>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; onYes: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 2200);
  }, []);

  const openSheet = useCallback((s: SheetKind) => setSheetRaw(s), []);
  const closeSheet = useCallback(() => setSheetRaw(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheetRaw(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Navegación entre páginas del Hub. Si el destino es esta misma página,
   * solo abre la hoja (sin recargar nada). Si es otra página, navega de
   * verdad y le pasa la hoja a abrir por `?open=` — un `setTimeout` no
   * funcionaría cruzando páginas: cada una monta su PROPIA instancia de este
   * hook, así que el `sheet` de la página de origen no existe en la de
   * destino.
   */
  const navigateToTab = useCallback((tab: Tab, sheetToOpen?: SheetKind) => {
    if (tab === currentTab) {
      if (sheetToOpen) openSheet(sheetToOpen);
      window.scrollTo(0, 0);
      return;
    }
    const path = TAB_ROUTES[tab];
    if (!path) return; // pestaña retirada (Mi día / Tickets): sin destino propio del Hub.
    setLocation(sheetToOpen ? `${path}?open=${encodeURIComponent(JSON.stringify(sheetToOpen))}` : path);
  }, [currentTab, openSheet, setLocation]);

  // Consume el `?open=` una sola vez: si se quedara en la URL, un recargue
  // reabriría la misma hoja aunque la persona ya la haya cerrado.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const raw = url.searchParams.get("open");
      if (raw) {
        setSheetRaw(JSON.parse(raw) as SheetKind);
        url.searchParams.delete("open");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    } catch { /* ignore */ }
    // Solo al montar: es un enlace de una sola vez, no algo que deba
    // reaplicarse si cambia cualquiera de estas referencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canManageTasks = authUser?.role === "superadmin" || authUser?.teamRole === "ceo";

  const handleDeleteTask = useCallback((id: number) => {
    setConfirm({
      msg: "¿Eliminar esta tarea? No se puede deshacer.",
      onYes: async () => {
        try {
          const r = await fetch(`${HUB_API_BASE}/hub/tasks/${id}`, { method: "DELETE", credentials: "include" });
          if (!r.ok) { const e = await r.json().catch(() => ({} as Record<string, unknown>)); showToast((e as { error?: string }).error || "Error al eliminar"); return; }
          showToast("Tarea eliminada");
          onRefreshTasks(); void queryClient.invalidateQueries({ queryKey: TAREAS_QUERY_KEY });
        } catch { showToast("Error de conexión"); }
      },
    });
  }, [showToast, onRefreshTasks, queryClient]);

  const handleClearCompleted = useCallback(() => {
    setConfirm({
      msg: "¿Eliminar todas las tareas completadas del tablero? No se puede deshacer.",
      onYes: async () => {
        try {
          const r = await fetch(`${HUB_API_BASE}/hub/tasks/clear-completed`, { method: "POST", credentials: "include" });
          if (!r.ok) { const e = await r.json().catch(() => ({} as Record<string, unknown>)); showToast((e as { error?: string }).error || "Error al limpiar"); return; }
          const d = await r.json().catch(() => ({ deleted: 0 }));
          const n = (d as { deleted?: number }).deleted ?? 0;
          showToast(`${n} tarea${n !== 1 ? "s" : ""} completada${n !== 1 ? "s" : ""} eliminada${n !== 1 ? "s" : ""}`);
          onRefreshTasks(); void queryClient.invalidateQueries({ queryKey: TAREAS_QUERY_KEY });
        } catch { showToast("Error de conexión"); }
      },
    });
  }, [showToast, onRefreshTasks, queryClient]);

  /**
   * Botón "+ Nuevo" de cada página: si el rol puede escribir en ese alcance
   * abre la hoja de creación, si no avisa por qué no pasó nada.
   */
  const newAction = useCallback((scope: HubScope, sheetToOpen: SheetKind) => () => {
    if (canWrite(scope)) openSheet(sheetToOpen);
    else showToast("Tu rol no puede crear elementos en esta sección");
  }, [canWrite, openSheet, showToast]);

  const importRef = useRef<HTMLInputElement>(null);
  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "webmaker-hub-respaldo-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast("Respaldo descargado");
  }, [state, showToast]);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data || typeof data !== "object" || !Array.isArray(data.projects)) { showToast("Archivo de respaldo no válido"); return; }
        setConfirm({ msg: "Esto reemplazará TODOS los datos actuales por los del respaldo. ¿Continuar?", onYes: () => { setState(migrate(Object.assign(blankState(), data))); showToast("Respaldo importado"); } });
      } catch { showToast("No se pudo leer el respaldo"); }
      finally { if (importRef.current) importRef.current.value = ""; }
    };
    reader.readAsText(file);
  }, [setState, showToast]);

  return {
    // identidad / rol
    authUser, isAdmin, effectiveRole, isSuperAdmin, homeHref,
    canManageSvc, isCeo, canSeeSvc, canSeeAtt,
    // datos
    apiTasks, onRefreshTasks, teamMembers,
    state, setState, scopes, writeScopes, boardOwner, errorGuardado, setErrorGuardado,
    canWrite, refreshBoard,
    // hoja / toast / confirmación
    sheet, openSheet, closeSheet, showToast, toast, confirm, setConfirm,
    // acciones
    handleLogout, handleDeleteTask, handleClearCompleted, canManageTasks, newAction,
    handleExport, handleImportFile, importRef,
    // navegación entre páginas del Hub
    navigateToTab,
  };
}
