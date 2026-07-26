import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CalendarX, CheckSquare2, ChevronDown, ChevronUp, ClipboardCheck, Loader2, Square, Trash2, TrendingUp } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...init });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as { error?: string })?.error || "Error de servidor");
  }
  return r.status === 204 ? (undefined as T) : r.json();
}

const fmtD = (v: string) => {
  const d = new Date(`${v}T12:00:00`);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
};

/* ===================== Mi onboarding (checklist) ========================= */

interface MyOnboarding {
  id: number;
  items: { text: string; done: boolean }[];
  completedAt: string | null;
}

export function OnboardingCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<MyOnboarding | null>({
    queryKey: ["me-onboarding"],
    queryFn: () => jfetch(`${API}/me/onboarding`),
  });

  const toggle = useMutation({
    mutationFn: ({ idx, done }: { idx: number; done: boolean }) =>
      jfetch(`${API}/me/onboarding/items/${idx}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-onboarding"] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!data || data.completedAt) return null;
  const done = data.items.filter((i) => i.done).length;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-primary" /> Tu onboarding
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">{done}/{data.items.length}</span>
      </div>
      <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${data.items.length ? Math.round((done / data.items.length) * 100) : 0}%` }} />
      </div>
      <ul className="space-y-1">
        {data.items.map((it, idx) => (
          <li key={idx}>
            <button
              className="flex items-start gap-2 text-left text-sm w-full hover:bg-foreground/5 rounded-lg px-1.5 py-1"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ idx, done: !it.done })}
            >
              {it.done
                ? <CheckSquare2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                : <Square className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
              <span className={it.done ? "line-through text-muted-foreground" : ""}>{it.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ================== Mis vacaciones, permisos y evaluaciones ============== */

interface LeaveData {
  balance: { allowance: number; usedDays: number; pendingDays: number; available: number; year: string };
  requests: { id: number; type: string; startDate: string; endDate: string; days: number; status: string; decisionNote: string }[];
}
interface MyReview {
  id: number; periodKey: string; goalsTotal: number; goalsMet: number;
  attendanceMinutes: number; attendanceDays: number; leaveDays: number; comment: string;
}

const STATUS_STYLE: Record<string, string> = {
  pendiente: "text-amber-400",
  aprobada: "text-emerald-400",
  rechazada: "text-red-400",
};

export function LeaveCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ type: "vacaciones", startDate: "", endDate: "", note: "" });

  const { data } = useQuery<LeaveData>({
    queryKey: ["me-leave"],
    queryFn: () => jfetch(`${API}/me/leave`),
  });
  const { data: reviews = [] } = useQuery<MyReview[]>({
    queryKey: ["me-reviews"],
    queryFn: () => jfetch(`${API}/me/reviews`),
  });

  const create = useMutation({
    mutationFn: () =>
      jfetch(`${API}/me/leave`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-leave"] });
      setDraft({ type: "vacaciones", startDate: "", endDate: "", note: "" });
      toast({ title: "Solicitud enviada a RRHH" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const cancel = useMutation({
    mutationFn: (id: number) => jfetch(`${API}/me/leave/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me-leave"] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const bal = data?.balance;
  const fmtH = (min: number) => `${Math.floor(min / 60)}h`;

  return (
    <div className="rounded-xl border border-foreground/10 bg-card/40 p-4 space-y-3">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen((o) => !o)}>
        <p className="text-sm font-semibold flex items-center gap-2">
          <CalendarX className="w-4 h-4 text-primary" /> Vacaciones y permisos
        </p>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {bal && <span>{bal.available} días disponibles</span>}
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <>
          {bal && (
            <p className="text-[11px] text-muted-foreground">
              {bal.year}: {bal.allowance} días al año · {bal.usedDays} usados · {bal.pendingDays} pendientes de aprobar · <span className="text-foreground font-medium">{bal.available} disponibles</span>
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 items-center">
            <select className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs" value={draft.type}
              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}>
              <option value="vacaciones">Vacaciones</option>
              <option value="permiso">Permiso</option>
            </select>
            <input type="date" className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs" value={draft.startDate}
              onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))} />
            <span className="text-xs text-muted-foreground">al</span>
            <input type="date" className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs" value={draft.endDate}
              onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))} />
            <input className="flex-1 min-w-[8rem] h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs" placeholder="Motivo (opcional)"
              value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
            <Button size="sm" variant="outline" disabled={!draft.startDate || !draft.endDate || create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Solicitar
            </Button>
          </div>

          {(data?.requests ?? []).length > 0 && (
            <ul className="space-y-1">
              {data!.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs rounded-lg border border-foreground/10 bg-card/40 px-2 py-1">
                  <span className="capitalize">{r.type}</span>
                  <span className="text-muted-foreground">{fmtD(r.startDate)} → {fmtD(r.endDate)} · {r.days}d hábiles</span>
                  <span className={`font-medium ${STATUS_STYLE[r.status] ?? ""}`}>{r.status}</span>
                  {r.decisionNote && <span className="text-muted-foreground">“{r.decisionNote}”</span>}
                  {r.status === "pendiente" && (
                    <button className="ml-auto text-muted-foreground hover:text-red-400" onClick={() => cancel.mutate(r.id)}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {reviews.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Mis evaluaciones
              </p>
              <ul className="space-y-1">
                {reviews.map((r) => (
                  <li key={r.id} className="text-[11px] text-muted-foreground rounded-lg border border-foreground/10 bg-card/40 px-2 py-1">
                    <span className="font-medium text-foreground">{r.periodKey}</span> · metas {r.goalsMet}/{r.goalsTotal} · {fmtH(r.attendanceMinutes)} trabajadas · {r.leaveDays}d ausente
                    {r.comment && <p className="mt-0.5 whitespace-pre-wrap">“{r.comment}”</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
