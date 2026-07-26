import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export interface JornadaOpen {
  id: number;
  source: "discord" | "manual";
  channelName: string;
  startedAt: string;
  lastSeenAt: string;
  seconds: number;
}

export interface JornadaMe {
  discord: { linked: boolean; username: string | null; linkedAt: string | null; canLink: boolean };
  todaySeconds: number;
  weekSeconds: number;
  todayLabel: string;
  weekLabel: string;
  days: { date: string; seconds: number }[];
  open: JornadaOpen | null;
}

export interface JornadaStatus {
  configured: boolean;
  oauthConfigured: boolean;
  guildId: string;
  workChannelIds: string[];
  lastPollAt: string | null;
  lastPollOk: boolean;
  lastError: string | null;
  linkedUsers: number;
}

export interface TeamAttendance {
  weekStart: string;
  people: {
    id: number;
    name: string | null;
    email: string;
    picture: string | null;
    linked: boolean;
    discordUsername: string | null;
    online: boolean;
    channelName: string;
    todaySeconds: number;
    weekSeconds: number;
    todayLabel: string;
    weekLabel: string;
  }[];
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}) as { error?: string });
    throw new Error((e as { error?: string }).error || "Error de conexión");
  }
  return r.json() as Promise<T>;
}

/** Mi jornada. Se refresca sola: el reloj lo lleva la presencia en Discord. */
export function useJornada() {
  return useQuery<JornadaMe>({
    queryKey: ["jornada-me"],
    queryFn: () => api<JornadaMe>("/jornada/me"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useJornadaStatus() {
  return useQuery<JornadaStatus>({
    queryKey: ["jornada-status"],
    queryFn: () => api<JornadaStatus>("/jornada/status"),
    staleTime: 5 * 60_000,
  });
}

export function useTeamAttendance(enabled = true) {
  return useQuery<TeamAttendance>({
    queryKey: ["jornada-team"],
    queryFn: () => api<TeamAttendance>("/jornada/team"),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useJornadaControls() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["jornada-me"] });
    void qc.invalidateQueries({ queryKey: ["jornada-team"] });
  };
  return {
    start: useMutation({
      mutationFn: () => api<unknown>("/jornada/start", { method: "POST", body: JSON.stringify({}) }),
      onSuccess: invalidate,
    }),
    stop: useMutation({
      mutationFn: () => api<unknown>("/jornada/stop", { method: "POST", body: JSON.stringify({}) }),
      onSuccess: invalidate,
    }),
  };
}

/**
 * Enlace directo al canal de voz de trabajo. Se prefiere el esquema `discord://`
 * (abre la app de escritorio, donde la presencia de voz es fiable) y se cae a la
 * web si no está instalada.
 */
export function discordChannelLink(status?: JornadaStatus): { app: string; web: string } | null {
  if (!status?.guildId) return null;
  const channel = status.workChannelIds[0];
  const path = channel ? `${status.guildId}/${channel}` : status.guildId;
  return {
    app: `discord://discord.com/channels/${path}`,
    web: `https://discord.com/channels/${path}`,
  };
}

/** Segundos → "2h 14m". Igual que en el servidor, para que ambos digan lo mismo. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
