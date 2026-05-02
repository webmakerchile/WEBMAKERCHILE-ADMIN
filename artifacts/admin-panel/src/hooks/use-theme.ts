import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "webmaker.theme";
const THEME_EVENT = "webmaker:theme-change";

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* ignore */
  }
  return "dark";
}

function applyTheme(mode: ThemeMode): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  const resolved: "light" | "dark" =
    mode === "system" ? (getSystemPrefersDark() ? "dark" : "light") : mode;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  root.dataset.theme = resolved;
  return resolved;
}

/**
 * Aplica el tema almacenado lo antes posible (anti-FOUC).
 * Llamar desde main.tsx ANTES de renderizar React.
 */
export function bootstrapTheme(): void {
  applyTheme(readStoredMode());
}

export function useTheme(): {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  cycle: () => void;
} {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [resolved, setResolved] = useState<"light" | "dark">(() =>
    mode === "system" ? (getSystemPrefersDark() ? "dark" : "light") : mode,
  );

  // Reaccionar a cambios del sistema cuando estamos en "system"
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolved(applyTheme("system"));
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [mode]);

  // Sincronizar entre pestañas
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = readStoredMode();
      setModeState(next);
      setResolved(applyTheme(next));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Sincronizar entre múltiples instancias del hook en la MISMA pestaña.
  // El evento `storage` no se dispara en la pestaña que escribió, por eso
  // emitimos un CustomEvent al cambiar y todas las instancias lo reciben.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const next = (e as CustomEvent<ThemeMode>).detail;
      if (next !== "light" && next !== "dark" && next !== "system") return;
      setModeState(next);
      setResolved(
        next === "system" ? (getSystemPrefersDark() ? "dark" : "light") : next,
      );
    };
    window.addEventListener(THEME_EVENT, handler as EventListener);
    return () =>
      window.removeEventListener(THEME_EVENT, handler as EventListener);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setModeState(next);
    setResolved(applyTheme(next));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<ThemeMode>(THEME_EVENT, { detail: next }),
      );
    }
  }, []);

  const cycle = useCallback(() => {
    setMode(mode === "light" ? "dark" : mode === "dark" ? "system" : "light");
  }, [mode, setMode]);

  return { mode, resolved, setMode, cycle };
}
