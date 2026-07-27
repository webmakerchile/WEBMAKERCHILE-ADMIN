import { useQuery } from "@tanstack/react-query";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

/**
 * Asistencia del equipo para RRHH.
 *
 * Consume `/api/jornada/overview` — el mismo origen que la pantalla "Mi día" y
 * la pestaña Asistencia del Hub. Una sola fuente de verdad para las horas: si
 * RRHH y el Hub mostraran números distintos, ninguno serviría.
 */
export interface AsistenciaMiembro {
  id: number;
  name: string | null;
  email: string;
  teamRole: string;
  discordTag: string | null;
  today: {
    checkIn: string; checkOut: string | null; onDiscord: boolean; open: boolean;
    /** Minutos trabajados NETOS: las pausas ya vienen descontadas. */
    minutes: number;
    pausedMinutes: number;
    /** Pausa en curso, o null si el reloj está corriendo. */
    pausa: { id: number; startedAt: string; motivo: string } | null;
  } | null;
  discord: {
    linked: boolean;
    tag: string | null;
    /** % de verificaciones en que sí estaba en un canal de voz. */
    pct: number | null;
    inVoiceNow: boolean | null;
    lastSeenMin: number | null;
  } | null;
  weekTotal: number;
}

export interface AsistenciaOverview {
  date: string;
  members: AsistenciaMiembro[];
  summary: { working: number; finished: number; absent: number; totalMinutes: number };
}

export function useAsistencia(enabled = true) {
  return useQuery<AsistenciaOverview>({
    queryKey: ["jornada-overview"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/jornada/overview`, { credentials: "include" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}) as { error?: string });
        throw new Error((e as { error?: string }).error || "No se pudo cargar la asistencia");
      }
      return r.json();
    },
    enabled,
    refetchInterval: 60_000,
  });
}

/** Minutos → "7h 20m" / "45m". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
