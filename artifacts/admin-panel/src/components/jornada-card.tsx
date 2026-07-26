import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import {
  Clock3,
  Headphones,
  LogIn,
  Plus,
  Square,
  CheckSquare2,
  Trash2,
  Loader2,
  AlertTriangle,
  StopCircle,
} from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

/* ============================== Tipos API ================================ */

export interface JornadaOpenSession {
  id: number;
  workDate: string;
  checkIn: string;
  onDiscord: boolean;
  /** Verificación automática al marcar entrada: true/false, o null si no se pudo verificar. */
  discordCheckin: boolean | null;
  /** true = la abrió el bot al detectarte en el canal de voz de Discord. */
  autoStarted: boolean;
  stale: boolean;
}

export interface DayCloseSummary {
  totals: Record<string, number>;
  highlights: { entityType: string; action: string; label: string; at: string }[];
  checklistDone: number;
  checklistTotal: number;
  activityCount: number;
  minutes?: number;
}

export interface JornadaLogItem {
  id: number;
  text: string;
  done: boolean;
  createdAt: string;
}

export interface JornadaMe {
  date: string;
  open: JornadaOpenSession | null;
  todayMinutes: number;
  todaySessions: { id: number; checkIn: string; checkOut: string | null; onDiscord: boolean; minutes: number }[];
  week: { start: string; days: { date: string; minutes: number }[]; total: number };
  logs: JornadaLogItem[];
  /** true si un admin emparejó esta cuenta con Discord (verificación automática). */
  discordLinked: boolean;
}

/* ============================== Helpers ================================== */

const MAX_SESSION_MIN = 16 * 60;

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function openElapsedMin(open: JornadaOpenSession): number {
  const el = Math.floor((Date.now() - new Date(open.checkIn).getTime()) / 60000);
  return Math.min(Math.max(0, el), MAX_SESSION_MIN);
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });
}

async function jfetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Error ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export function useJornadaMe() {
  return useQuery<JornadaMe>({
    queryKey: ["jornada-me"],
    queryFn: () => jfetch<JornadaMe>("/jornada/me"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Re-render cada 30 s mientras haya una jornada abierta (para el contador). */
function useNowTick(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [active]);
}

const DAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

/* ========================= Tarjeta completa (Mi Día) ===================== */

export function JornadaCard() {
  const { data, isLoading } = useJornadaMe();
  const qc = useQueryClient();
  const [discord, setDiscord] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [closeSummary, setCloseSummary] = useState<DayCloseSummary | null>(null);
  useNowTick(!!data?.open);

  const inv = () => qc.invalidateQueries({ queryKey: ["jornada-me"] });
  const onErr = (e: unknown) => setErr(e instanceof Error ? e.message : "Error inesperado");

  const checkIn = useMutation({
    // Si la cuenta está emparejada, la verificación es automática: no se autodeclara.
    mutationFn: () => jfetch("/jornada/check-in", { method: "POST", body: JSON.stringify({ onDiscord: data?.discordLinked ? false : discord }) }),
    onSuccess: () => { setErr(null); inv(); },
    onError: onErr,
  });
  const checkOut = useMutation({
    mutationFn: () => jfetch("/jornada/check-out", { method: "POST" }),
    onSuccess: (r: { summary?: DayCloseSummary | null }) => {
      setErr(null);
      setCloseSummary(r?.summary ?? null);
      inv();
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onError: onErr,
  });
  const addLog = useMutation({
    mutationFn: (text: string) => jfetch("/jornada/logs", { method: "POST", body: JSON.stringify({ text }) }),
    onSuccess: () => { setErr(null); setNewItem(""); inv(); },
    onError: onErr,
  });
  const toggleLog = useMutation({
    mutationFn: (p: { id: number; done: boolean }) =>
      jfetch(`/jornada/logs/${p.id}`, { method: "PATCH", body: JSON.stringify({ done: p.done }) }),
    onSuccess: inv,
    onError: onErr,
  });
  const delLog = useMutation({
    mutationFn: (id: number) => jfetch(`/jornada/logs/${id}`, { method: "DELETE" }),
    onSuccess: inv,
    onError: onErr,
  });

  if (isLoading) {
    return (
      <div className="bg-card/60 border border-foreground/10 rounded-2xl p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando jornada…
      </div>
    );
  }
  if (!data) return null;

  const open = data.open;
  const openMin = open ? openElapsedMin(open) : 0;
  const closedToday = data.todaySessions.filter((s) => s.checkOut).reduce((a, s) => a + s.minutes, 0);
  const todayMin = open && open.workDate === data.date ? closedToday + openMin : data.todayMinutes;
  const maxWeek = Math.max(...data.week.days.map((d) => d.minutes), 60);
  const doneCount = data.logs.filter((l) => l.done).length;

  const submitItem = () => {
    const t = newItem.trim();
    if (t && !addLog.isPending) addLog.mutate(t);
  };

  return (
    <div className="bg-card/60 border border-foreground/10 rounded-2xl p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Clock3 className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold leading-tight">Mi jornada</h2>
          <p className="text-[11px] text-muted-foreground">Hoy {fmtMin(todayMin)} · Semana {fmtMin(data.week.total)}</p>
        </div>
        {open?.autoStarted ? (
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Headphones className="w-3 h-3" /> Inicio automático por Discord
          </span>
        ) : open && data.discordLinked && open.discordCheckin !== null ? (
          <span className={cn("hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border",
            open.discordCheckin
              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              : "bg-amber-500/10 text-amber-500 border-amber-500/20")}>
            <Headphones className="w-3 h-3" /> {open.discordCheckin ? "Discord verificado" : "Sin voz al marcar"}
          </span>
        ) : open?.onDiscord ? (
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Headphones className="w-3 h-3" /> En Discord
          </span>
        ) : null}
      </div>

      {/* Estado / acciones */}
      {open ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 sm:p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                Trabajando · <span className="font-mono">{fmtMin(openMin)}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">Entrada {hhmm(open.checkIn)}</p>
            </div>
            <button
              onClick={() => checkOut.mutate()}
              disabled={checkOut.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border border-foreground/15 hover:border-red-400/50 hover:text-red-400 hover:bg-red-500/5 transition-colors disabled:opacity-50"
            >
              {checkOut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
              Terminar jornada
            </button>
          </div>
          {open.stale && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-500">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Esta jornada quedó abierta desde el {open.workDate}. Termínala y vuelve a iniciar la de hoy.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3 sm:p-4 mb-4">
          {closeSummary && (
            <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1.5">
              <p className="font-semibold text-sm">Resumen de tu jornada</p>
              <p className="text-muted-foreground">
                {typeof closeSummary.minutes === "number" && <>Trabajaste {fmtMin(closeSummary.minutes)} · </>}
                {closeSummary.activityCount} movimiento{closeSummary.activityCount !== 1 ? "s" : ""} registrados
                {closeSummary.checklistTotal > 0 && <> · checklist {closeSummary.checklistDone}/{closeSummary.checklistTotal}</>}
              </p>
              {closeSummary.highlights.length > 0 && (
                <ul className="space-y-0.5">
                  {closeSummary.highlights.slice(0, 5).map((h, i) => (
                    <li key={i} className="truncate text-muted-foreground">
                      • {h.action === "completed" ? "Completaste" : h.action === "created" ? "Creaste" : "Avanzaste"} “{h.label}”
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {data.todaySessions.length > 0 ? "Jornada terminada por hoy" : "Aún no marcas tu entrada"}
              </p>
              {data.discordLinked ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground select-none">
                  <Headphones className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  Conéctate al canal de voz y tu jornada parte sola (en 1–2 min)
                </p>
              ) : (
                <label className="mt-1.5 flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer select-none">
                  <button
                    type="button"
                    onClick={() => setDiscord((v) => !v)}
                    className={cn("w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0",
                      discord ? "bg-primary border-primary text-primary-foreground" : "border-foreground/30")}
                    aria-pressed={discord}
                  >
                    {discord && <CheckSquare2 className="w-3 h-3" />}
                  </button>
                  <Headphones className="w-3.5 h-3.5" /> Estoy conectado en Discord
                </label>
              )}
            </div>
            <button
              onClick={() => checkIn.mutate()}
              disabled={checkIn.isPending}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {checkIn.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              {data.todaySessions.length > 0 ? "Reanudar jornada" : "Iniciar jornada"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground/80">
            Recuerda: durante la jornada el equipo debe estar conectado en Discord.
          </p>
        </div>
      )}

      {err && <p className="text-[11px] text-red-400 mb-3">{err}</p>}

      {/* Semana */}
      <div className="flex items-end gap-1.5 mb-4 px-1" aria-label="Horas por día de la semana">
        {data.week.days.map((d, i) => {
          const isToday = d.date === data.date;
          const h = Math.max(4, Math.round((d.minutes / maxWeek) * 36));
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date} · ${fmtMin(d.minutes)}`}>
              <span className={cn("text-[9px] tabular-nums", d.minutes > 0 ? "text-muted-foreground" : "text-transparent")}>
                {fmtMin(d.minutes)}
              </span>
              <div
                className={cn("w-full max-w-[26px] rounded-sm transition-all",
                  isToday ? "bg-primary" : d.minutes > 0 ? "bg-primary/35" : "bg-foreground/10")}
                style={{ height: `${h}px` }}
              />
              <span className={cn("text-[10px]", isToday ? "text-primary font-semibold" : "text-muted-foreground")}>
                {DAY_LETTERS[i]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Checklist del día */}
      <div className="border-t border-foreground/10 pt-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">¿Qué hiciste hoy?</h3>
          {data.logs.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-foreground/10 text-muted-foreground tabular-nums">
              {doneCount}/{data.logs.length}
            </span>
          )}
        </div>
        <div className="space-y-1">
          {data.logs.map((l) => (
            <div key={l.id} className="group flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-foreground/5">
              <button
                onClick={() => toggleLog.mutate({ id: l.id, done: !l.done })}
                className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                aria-label={l.done ? "Desmarcar" : "Marcar como hecho"}
              >
                {l.done ? <CheckSquare2 className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
              </button>
              <span className={cn("flex-1 text-[13px] leading-snug", l.done && "line-through opacity-50")}>{l.text}</span>
              <button
                onClick={() => delLog.mutate(l.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all flex-shrink-0"
                aria-label="Eliminar ítem"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {data.logs.length === 0 && (
            <p className="text-[12px] text-muted-foreground/70 px-1 py-1">
              Anota aquí lo que vayas haciendo durante el día.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitItem(); }}
            maxLength={300}
            placeholder="Ej: Edité el video de la campaña X"
            className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl px-3 py-2 text-[13px] outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
          />
          <button
            onClick={submitItem}
            disabled={!newItem.trim() || addLog.isPending}
            className="p-2 rounded-xl bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-40"
            aria-label="Agregar ítem"
          >
            {addLog.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================== Chip compacto (sidebar del panel) ================== */

export function JornadaChip() {
  const { data } = useJornadaMe();
  const qc = useQueryClient();
  useNowTick(!!data?.open);
  const checkOut = useMutation({
    mutationFn: () => jfetch("/jornada/check-out", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jornada-me"] }),
  });

  if (!data) return null;
  const open = data.open;

  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-2 flex items-center gap-2.5">
      {open ? (
        <>
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <Link href="/mi-dia" className="flex-1 min-w-0 leading-tight">
            <p className="text-xs font-semibold font-mono">{fmtMin(openElapsedMin(open))}</p>
            <p className="text-[10px] text-muted-foreground truncate">En jornada{open.onDiscord ? " · 🎧" : ""}</p>
          </Link>
          <button
            onClick={() => checkOut.mutate()}
            disabled={checkOut.isPending}
            title="Terminar jornada"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0 disabled:opacity-50"
          >
            {checkOut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
          </button>
        </>
      ) : (
        <Link href="/mi-dia" className="flex-1 flex items-center gap-2 text-xs font-medium text-primary hover:opacity-80 transition-opacity">
          <LogIn className="w-3.5 h-3.5 flex-shrink-0" />
          Iniciar jornada
          <span className="ml-auto text-[10px] text-muted-foreground font-normal tabular-nums">
            hoy {fmtMin(data.todayMinutes)}
          </span>
        </Link>
      )}
    </div>
  );
}
