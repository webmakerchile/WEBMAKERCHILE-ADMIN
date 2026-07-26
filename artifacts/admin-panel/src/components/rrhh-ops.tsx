import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ROLES, type TeamRole } from "@workspace/roles";
import {
  CalendarX, CheckCircle2, ClipboardCheck, FileWarning, Loader2, Plus,
  Trash2, TrendingUp, X, Check, Pencil,
} from "lucide-react";

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

/* ======================= Vacaciones y permisos =========================== */

interface LeaveRow {
  id: number; userId: number; type: string; startDate: string; endDate: string;
  days: number; note: string; status: string; decisionNote: string; name: string | null; email: string;
}

export function LeaveManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [noteDraft, setNoteDraft] = useState<Record<number, string>>({});

  const { data: pending = [] } = useQuery<LeaveRow[]>({
    queryKey: ["hr-leave", "pendiente"],
    queryFn: () => jfetch(`${API}/hr/leave?status=pendiente`),
  });
  const { data: absences = [] } = useQuery<{ id: number; type: string; startDate: string; endDate: string; days: number; name: string }[]>({
    queryKey: ["team-absences"],
    queryFn: () => jfetch(`${API}/team/absences`),
  });

  const decide = useMutation({
    mutationFn: ({ id, action, note }: { id: number; action: "aprobar" | "rechazar"; note: string }) =>
      jfetch(`${API}/hr/leave/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["hr-leave"] });
      qc.invalidateQueries({ queryKey: ["team-absences"] });
      toast({ title: v.action === "aprobar" ? "Solicitud aprobada" : "Solicitud rechazada" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4 space-y-4">
        <p className="text-sm font-semibold flex items-center gap-2">
          <CalendarX className="w-4 h-4 text-primary" /> Vacaciones y permisos
        </p>
        {pending.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay solicitudes pendientes.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <li key={r.id} className="rounded-lg border border-amber-500/20 bg-card/40 p-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{r.name || r.email}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-foreground/10">{r.type}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtD(r.startDate)} → {fmtD(r.endDate)} · {r.days} día{r.days === 1 ? "" : "s"} hábil{r.days === 1 ? "" : "es"}
                  </span>
                </div>
                {r.note && <p className="text-xs text-muted-foreground">“{r.note}”</p>}
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    className="flex-1 min-w-[10rem] h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs"
                    placeholder="Nota (opcional)"
                    value={noteDraft[r.id] ?? ""}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                  />
                  <Button size="sm" variant="outline" disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, action: "aprobar", note: noteDraft[r.id] ?? "" })}>
                    <Check className="w-3.5 h-3.5 mr-1" /> Aprobar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, action: "rechazar", note: noteDraft[r.id] ?? "" })}>
                    <X className="w-3.5 h-3.5 mr-1" /> Rechazar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Ausencias próximas del equipo</p>
          {absences.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin ausencias aprobadas en los próximos 60 días.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {absences.map((a) => (
                <li key={a.id} className="text-[11px] px-2 py-1 rounded-lg border border-foreground/10 bg-card/40">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted-foreground"> · {a.type} {fmtD(a.startDate)}–{fmtD(a.endDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================ Onboarding ================================= */

interface OnboardingData {
  templates: { id: number; role: string; items: string[] }[];
  instances: {
    id: number; userId: number; role: string; name: string | null; email: string;
    completedAt: string | null; progress: { done: number; total: number };
    items: { text: string; done: boolean }[];
  }[];
}

export function OnboardingManager({ people }: { people: { id: number; name: string | null; email: string }[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [assignId, setAssignId] = useState("");
  const [editRole, setEditRole] = useState<string | null>(null);
  const [tplDraft, setTplDraft] = useState("");

  const { data } = useQuery<OnboardingData>({
    queryKey: ["hr-onboarding"],
    queryFn: () => jfetch(`${API}/hr/onboarding`),
  });

  const assign = useMutation({
    mutationFn: (userId: number) =>
      jfetch(`${API}/hr/onboarding/assign`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-onboarding"] }); toast({ title: "Onboarding asignado" }); setAssignId(""); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const saveTpl = useMutation({
    mutationFn: ({ role, items }: { role: string; items: string[] }) =>
      jfetch(`${API}/hr/onboarding/templates/${role}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-onboarding"] }); toast({ title: "Plantilla guardada" }); setEditRole(null); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const withOnboarding = useMemo(() => new Set((data?.instances ?? []).map((i) => i.userId)), [data]);
  const assignable = people.filter((p) => !withOnboarding.has(p.id));

  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4 space-y-4">
        <p className="text-sm font-semibold flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-primary" /> Onboarding
        </p>

        {(data?.instances ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nadie tiene un onboarding asignado todavía.</p>
        ) : (
          <ul className="space-y-1.5">
            {data!.instances.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 bg-card/40 px-2.5 py-1.5 text-sm">
                <span className="flex-1 min-w-[8rem] truncate">{i.name || i.email}</span>
                <span className="text-[11px] text-muted-foreground">{ROLES[i.role as TeamRole]?.label ?? i.role}</span>
                <div className="w-24 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${i.progress.total ? Math.round((i.progress.done / i.progress.total) * 100) : 0}%` }} />
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground">{i.progress.done}/{i.progress.total}</span>
                {i.completedAt && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <select className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs" value={assignId} onChange={(e) => setAssignId(e.target.value)}>
            <option value="">Asignar onboarding a…</option>
            {assignable.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
          </select>
          <Button size="sm" variant="outline" disabled={!assignId || assign.isPending} onClick={() => assign.mutate(Number(assignId))}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Asignar
          </Button>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Plantillas por rol</p>
          <div className="flex flex-wrap gap-1.5">
            {(data?.templates ?? []).map((t) => (
              <button key={t.id} className="text-[11px] px-2 py-1 rounded-lg border border-foreground/10 bg-card/40 hover:border-primary/40"
                onClick={() => { setEditRole(t.role); setTplDraft(t.items.join("\n")); }}>
                <Pencil className="w-3 h-3 inline mr-1" />{ROLES[t.role as TeamRole]?.label ?? t.role} ({t.items.length})
              </button>
            ))}
          </div>
          {editRole && (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-muted-foreground">Un paso por línea — {ROLES[editRole as TeamRole]?.label ?? editRole}. Solo afecta a los onboarding que se asignen desde ahora.</p>
              <textarea rows={6} className="w-full rounded-lg border border-foreground/15 bg-card/60 px-2.5 py-2 text-xs"
                value={tplDraft} onChange={(e) => setTplDraft(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" disabled={saveTpl.isPending}
                  onClick={() => saveTpl.mutate({ role: editRole, items: tplDraft.split("\n").map((s) => s.trim()).filter(Boolean) })}>
                  {saveTpl.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Guardar plantilla
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditRole(null)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ====================== Evaluación de desempeño ========================== */

interface ReviewData {
  metrics: { periodKey: string; goalsTotal: number; goalsMet: number; attendanceMinutes: number; attendanceDays: number; leaveDays: number };
  closed: { id: number; comment: string; closedAt: string } | null;
  history: { id: number; periodKey: string; goalsTotal: number; goalsMet: number; attendanceMinutes: number; attendanceDays: number; leaveDays: number; comment: string }[];
}

const fmtH = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
const currentMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }).slice(0, 7);

export function EvaluationsManager({ people }: { people: { id: number; name: string | null; email: string }[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [period, setPeriod] = useState(currentMonth());
  const [comment, setComment] = useState("");

  const { data, isFetching } = useQuery<ReviewData>({
    queryKey: ["hr-review", userId, period],
    queryFn: () => jfetch(`${API}/hr/reviews/${userId}?period=${period}`),
    enabled: !!userId && /^\d{4}-\d{2}$/.test(period),
  });

  const close = useMutation({
    mutationFn: () =>
      jfetch(`${API}/hr/reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(userId), periodKey: period, comment }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-review"] }); toast({ title: "Evaluación cerrada" }); setComment(""); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const m = data?.metrics;
  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" /> Evaluación de desempeño
        </p>
        <p className="text-[11px] text-muted-foreground">
          Las cifras salen solas de metas cumplidas y asistencia real del mes; tú solo agregas el comentario.
        </p>
        <div className="flex flex-wrap gap-2">
          <select className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Persona…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
          </select>
          <input type="month" className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs" value={period} onChange={(e) => setPeriod(e.target.value)} />
          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-primary mt-2" />}
        </div>

        {m && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Metas cumplidas", value: `${m.goalsMet}/${m.goalsTotal}` },
                { label: "Horas trabajadas", value: fmtH(m.attendanceMinutes) },
                { label: "Días con jornada", value: String(m.attendanceDays) },
                { label: "Días de ausencia", value: String(m.leaveDays) },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-foreground/10 bg-card/40 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
                  <p className="text-sm font-bold">{k.value}</p>
                </div>
              ))}
            </div>
            {data?.closed ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs">
                <p className="font-semibold text-emerald-400 mb-1">Evaluación cerrada</p>
                <p className="text-muted-foreground whitespace-pre-wrap">{data.closed.comment || "Sin comentario."}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea rows={3} className="w-full rounded-lg border border-foreground/15 bg-card/60 px-2.5 py-2 text-xs"
                  placeholder="Comentario de RRHH para cerrar la evaluación…"
                  value={comment} onChange={(e) => setComment(e.target.value)} />
                <Button size="sm" disabled={close.isPending} onClick={() => close.mutate()}>
                  {close.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Cerrar evaluación de {period}
                </Button>
              </div>
            )}
            {(data?.history ?? []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Historial</p>
                <ul className="space-y-1">
                  {data!.history.map((h) => (
                    <li key={h.id} className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{h.periodKey}</span> · metas {h.goalsMet}/{h.goalsTotal} · {fmtH(h.attendanceMinutes)} · {h.leaveDays} día(s) ausente
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ========================= Documentos de ficha =========================== */

interface Doc { id: number; name: string; url: string; expiresAt: string }

export function PersonDocuments({ userId }: { userId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ name: "", url: "", expiresAt: "" });

  const { data: docs = [] } = useQuery<Doc[]>({
    queryKey: ["hr-docs", userId],
    queryFn: () => jfetch(`${API}/hr/people/${userId}/documents`),
  });

  const add = useMutation({
    mutationFn: () =>
      jfetch(`${API}/hr/people/${userId}/documents`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-docs", userId] }); setDraft({ name: "", url: "", expiresAt: "" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => jfetch(`${API}/hr/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-docs", userId] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const soon = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toLocaleDateString("en-CA", { timeZone: "America/Santiago" }); })();

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
        <FileWarning className="w-3.5 h-3.5" /> Documentos con vencimiento
      </p>
      {docs.length > 0 && (
        <ul className="space-y-1">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs rounded-lg border border-foreground/10 bg-card/40 px-2 py-1">
              {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{d.name}</a> : <span>{d.name}</span>}
              {d.expiresAt ? (
                <span className={d.expiresAt < today ? "text-red-400" : d.expiresAt <= soon ? "text-amber-400" : "text-muted-foreground"}>
                  vence {fmtD(d.expiresAt)}
                </span>
              ) : <span className="text-muted-foreground">sin vencimiento</span>}
              <button className="ml-auto text-muted-foreground hover:text-red-400" onClick={() => remove.mutate(d.id)}>
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        <input className="flex-1 min-w-[8rem] h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs" placeholder="Nombre (ej: Contrato)"
          value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <input className="flex-1 min-w-[8rem] h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs" placeholder="Link (opcional)"
          value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} />
        <input type="date" className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs"
          value={draft.expiresAt} onChange={(e) => setDraft((d) => ({ ...d, expiresAt: e.target.value }))} />
        <Button size="sm" variant="outline" disabled={!draft.name.trim() || add.isPending} onClick={() => add.mutate()}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
