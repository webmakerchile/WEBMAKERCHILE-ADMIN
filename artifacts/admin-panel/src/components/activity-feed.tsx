import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, ClipboardList, Film, Flag, FileText, FolderKanban, Loader2, MessageSquare, UserPlus } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export interface ActivityItem {
  id: number;
  actorId: number;
  actorName: string | null;
  actorEmail: string | null;
  actorPicture: string | null;
  entityType: string;
  entityId: string;
  entityLabel: string;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof Activity }> = {
  task: { label: "Tarea", icon: ClipboardList },
  ticket: { label: "Ticket", icon: MessageSquare },
  goal: { label: "Meta", icon: Flag },
  persona: { label: "Persona", icon: Activity },
  video: { label: "Video", icon: Film },
  contract: { label: "Contrato", icon: FileText },
  project: { label: "Proyecto", icon: FolderKanban },
};

export function actionLabel(a: ActivityItem): string {
  const d = (a.detail ?? {}) as { from?: string; to?: string };
  switch (a.action) {
    case "created": return "creó";
    case "completed": return "completó";
    case "assigned": return "asignó";
    case "commented": return "comentó en";
    case "stage_change":
    case "status_change":
      return d.from && d.to ? `movió (${d.from} → ${d.to})` : "actualizó";
    case "deleted": return "eliminó";
    default: return a.action;
  }
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

/**
 * Feed de bitácora de actividad.
 * - Sin props: actividad propia.
 * - `global`: actividad de todo el equipo (requiere rol supervisor; el
 *   servidor la rechaza si no corresponde). Incluye filtro por persona.
 */
export function ActivityFeed({
  global = false,
  today = false,
  people = [],
  limit = 50,
  showActor = global,
}: {
  global?: boolean;
  today?: boolean;
  people?: { id: number; name: string | null; email?: string | null }[];
  limit?: number;
  showActor?: boolean;
}) {
  const [personId, setPersonId] = useState<string>("all");
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

  const params = new URLSearchParams();
  if (global) params.set("userId", personId);
  if (today) { params.set("from", todayStr); params.set("to", todayStr); }
  params.set("limit", String(limit));

  const { data, isLoading, error } = useQuery<{ items: ActivityItem[] }>({
    queryKey: ["activity", global ? personId : "me", today ? todayStr : "any", limit],
    queryFn: async () => {
      const r = await fetch(`${API}/activity?${params.toString()}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "Error al cargar la actividad");
      return r.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return (
    <div className="bg-card/60 border border-foreground/10 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold leading-tight">{global ? "Actividad del equipo" : "Mi actividad"}</h2>
          <p className="text-[11px] text-muted-foreground">{today ? "Hoy" : "Últimos movimientos"}</p>
        </div>
        {global && people.length > 0 && (
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="text-xs bg-background border border-foreground/15 rounded-lg px-2 py-1.5 max-w-[10rem]"
          >
            <option value="all">Todo el equipo</option>
            {people.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name || p.email || `#${p.id}`}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando actividad…
        </div>
      ) : error ? (
        <p className="text-xs text-red-400 py-2">{error instanceof Error ? error.message : "Error"}</p>
      ) : !data?.items.length ? (
        <p className="text-xs text-muted-foreground py-2">Sin actividad registrada {today ? "hoy" : "aún"}.</p>
      ) : (
        <ul className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {data.items.map((a) => {
            const meta = TYPE_META[a.entityType] ?? { label: a.entityType, icon: Activity };
            const Icon = a.action === "completed" ? CheckCircle2 : a.action === "assigned" ? UserPlus : meta.icon;
            return (
              <li key={a.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-foreground/[0.04]">
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${a.action === "completed" ? "text-emerald-500" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0 text-xs leading-snug">
                  <p className="truncate">
                    {showActor && <span className="font-medium">{a.actorName || a.actorEmail || "Alguien"} </span>}
                    <span className="text-muted-foreground">{actionLabel(a)} {meta.label.toLowerCase()}</span>{" "}
                    <span className="font-medium">“{a.entityLabel}”</span>
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap mt-0.5">{timeAgo(a.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
