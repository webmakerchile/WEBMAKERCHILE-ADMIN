import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Torre de control del CEO: semáforo por área (SLA vencidos, gente saturada,
 * cumplimiento de metas), metas de empresa repartidas en metas personales que
 * consolidan solas, y rentabilidad por proyecto (horas reales × costo hora vs.
 * neto del contrato). Los montos solo llegan del servidor si el rol puede
 * verlos: aquí no se calcula ni oculta nada.
 */

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
  return body as T;
}

type Semaforo = "green" | "yellow" | "red";

interface AreaStatus {
  area: string;
  status: Semaforo;
  slaOverdue: Array<{ entityType: string; entityId: string; label: string; stage: string; stageLabel: string; hoursOver: number; responsible: string | null }>;
  saturated: Array<{ id: number; name: string; stagnant: number; overdue: number }>;
  goalsPct: number | null;
  goalsTotal: number;
  goalsDone: number;
}

interface CompanyGoal {
  id: number; title: string; description: string; period: string; periodKey: string;
  target: number | null; progress: number; pct: number; vigente: boolean;
  children: Array<{ id: number; assignedTo: number; assignedName: string; target: number | null; progress: number; status: string }>;
}

interface ProfitProject {
  projectRef: string; name: string; client: string; status: string; contractId: string | null;
  hours: number; cost: number; revenue: number | null; cobroEstado: string | null; margin: number | null;
  missingCost: string[];
  assignments: Array<{ userId: number; name: string; allocationPct: number; minutes: number; hourlyCost: number | null }>;
}

interface TeamMember { id: number; name: string | null; email: string }

const AREA_LABEL: Record<string, string> = {
  ceo: "Dirección", ejecutivo: "Ejecutivo", edicion: "Edición", marketing: "Marketing", rrhh: "RRHH",
};
const SEM_COLOR: Record<Semaforo, string> = { green: "#4faf6a", yellow: "#c9a44a", red: "#d9534f" };
const SEM_LABEL: Record<Semaforo, string> = { green: "Al día", yellow: "Atención", red: "Crítico" };
const PERIOD_LABEL: Record<string, string> = { diaria: "Hoy", semanal: "Esta semana", mensual: "Este mes" };

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
const borderStyle = { borderColor: "rgba(128,128,128,.35)" };

export default function TorrePanel({ showToast }: { showToast: (msg: string) => void }) {
  const qc = useQueryClient();

  const semaforo = useQuery<{ areas: AreaStatus[] }>({
    queryKey: ["torre-semaforo"],
    queryFn: () => req("/hub/torre/semaforo"),
    refetchInterval: 5 * 60_000,
  });
  const metas = useQuery<{ companyGoals: CompanyGoal[] }>({
    queryKey: ["torre-company-goals"],
    queryFn: () => req("/hub/torre/company-goals"),
  });
  const [monthFrom, setMonthFrom] = useState(() => todayStr().slice(0, 7));
  const range = useMemo(() => {
    const [y, m] = monthFrom.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, "0");
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
  }, [monthFrom]);
  const renta = useQuery<{ from: string; to: string; projects: ProfitProject[] }>({
    queryKey: ["torre-rentabilidad", range.from, range.to],
    queryFn: () => req(`/hub/torre/rentabilidad?from=${range.from}&to=${range.to}`),
  });
  const team = useQuery<TeamMember[]>({
    queryKey: ["hr-people-lite"],
    queryFn: async () => {
      const rows = await req<Array<TeamMember & { approvalStatus: string }>>("/hr/people");
      return rows.filter(r => r.approvalStatus === "approved");
    },
  });

  const [openArea, setOpenArea] = useState<string | null>(null);

  if (semaforo.isLoading) return <div className="p-6 text-sm opacity-60">Cargando torre de control…</div>;
  if (semaforo.isError) return <div className="p-6 text-sm text-red-400">No se pudo cargar la torre: {(semaforo.error as Error).message}</div>;

  const areas = semaforo.data?.areas ?? [];

  return (
    <div className="p-4 md:p-6 space-y-8 overflow-y-auto">
      {/* ============ Semáforo por área ============ */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-3">Semáforo por área</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {areas.map(a => (
            <button
              key={a.area}
              onClick={() => setOpenArea(openArea === a.area ? null : a.area)}
              className="rounded-xl border p-3 text-left hover:bg-foreground/5 transition"
              style={{ ...borderStyle, borderLeftColor: SEM_COLOR[a.status], borderLeftWidth: 4 }}
              data-testid={`card-semaforo-${a.area}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{AREA_LABEL[a.area] ?? a.area}</span>
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: SEM_COLOR[a.status] }} />
              </div>
              <div className="text-xs opacity-70 mt-1">{SEM_LABEL[a.status]}</div>
              <div className="text-[11px] opacity-60 mt-2 space-y-0.5">
                <div>{a.slaOverdue.length} SLA vencido{a.slaOverdue.length === 1 ? "" : "s"}</div>
                <div>{a.saturated.length} persona{a.saturated.length === 1 ? "" : "s"} saturada{a.saturated.length === 1 ? "" : "s"}</div>
                <div>{a.goalsPct === null ? "Sin metas vigentes" : `Metas: ${a.goalsPct}% (${a.goalsDone}/${a.goalsTotal})`}</div>
              </div>
            </button>
          ))}
        </div>
        {openArea && (() => {
          const a = areas.find(x => x.area === openArea);
          if (!a) return null;
          return (
            <div className="mt-3 rounded-xl border p-4 space-y-3" style={borderStyle} data-testid={`detail-semaforo-${a.area}`}>
              <div className="font-medium">{AREA_LABEL[a.area] ?? a.area} — detalle</div>
              <div>
                <div className="text-xs uppercase tracking-wide opacity-60 mb-1">SLA vencidos</div>
                {a.slaOverdue.length === 0 ? <div className="text-sm opacity-60">Ninguno 🎉</div> : (
                  <ul className="text-sm space-y-1">
                    {a.slaOverdue.map(s => (
                      <li key={`${s.entityType}-${s.entityId}`} className="flex flex-wrap gap-x-2">
                        <span className="font-medium">{s.label}</span>
                        <span className="opacity-70">en «{s.stageLabel}»</span>
                        <span className="text-red-400">+{s.hoursOver} h sobre el SLA</span>
                        {s.responsible && <span className="opacity-60">· {s.responsible}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide opacity-60 mb-1">Personas saturadas</div>
                {a.saturated.length === 0 ? <div className="text-sm opacity-60">Nadie en rojo</div> : (
                  <ul className="text-sm space-y-1">
                    {a.saturated.map(p => (
                      <li key={p.id}>
                        <span className="font-medium">{p.name}</span>
                        <span className="opacity-70"> — {p.stagnant} estancada{p.stagnant === 1 ? "" : "s"}, {p.overdue} vencida{p.overdue === 1 ? "" : "s"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="text-sm opacity-70">
                Metas vigentes: {a.goalsPct === null ? "sin metas asignadas al área" : `${a.goalsPct}% de cumplimiento (${a.goalsDone} de ${a.goalsTotal} cumplidas)`}
              </div>
            </div>
          );
        })()}
      </section>

      {/* ============ Metas de empresa ============ */}
      <CompanyGoalsSection metas={metas.data?.companyGoals ?? []} loading={metas.isLoading} team={team.data ?? []} showToast={showToast} />

      {/* ============ Rentabilidad ============ */}
      <section>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Rentabilidad por proyecto</h2>
          <input
            type="month" value={monthFrom} onChange={e => setMonthFrom(e.target.value)}
            className="bg-transparent border rounded px-2 py-1 text-sm" style={borderStyle}
            data-testid="input-renta-month"
          />
        </div>
        {renta.isLoading ? <div className="text-sm opacity-60">Calculando…</div>
          : renta.isError ? <div className="text-sm text-red-400">{(renta.error as Error).message}</div>
          : <RentaTable projects={renta.data?.projects ?? []} team={team.data ?? []} showToast={showToast} rangeLabel={`${range.from} → ${range.to}`} />}
      </section>
    </div>
  );
}

/* ============================ Metas de empresa =========================== */

function CompanyGoalsSection({ metas, loading, team, showToast }: {
  metas: CompanyGoal[]; loading: boolean; team: TeamMember[]; showToast: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("mensual");
  const [target, setTarget] = useState<string>("");
  const [dist, setDist] = useState<Array<{ userId: number; target: string }>>([]);

  const create = useMutation({
    mutationFn: () => req("/hub/torre/company-goals", {
      method: "POST",
      body: JSON.stringify({
        title, period,
        target: target === "" ? null : Number(target),
        distribution: dist.map(d => ({ userId: d.userId, target: d.target === "" ? null : Number(d.target) })),
      }),
    }),
    onSuccess: () => {
      showToast("Meta de empresa creada y repartida");
      setCreating(false); setTitle(""); setTarget(""); setDist([]);
      qc.invalidateQueries({ queryKey: ["torre-company-goals"] });
      qc.invalidateQueries({ queryKey: ["torre-semaforo"] });
    },
    onError: (e: Error) => showToast(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => req(`/hub/torre/company-goals/${id}`, { method: "DELETE" }),
    onSuccess: () => { showToast("Meta eliminada"); qc.invalidateQueries({ queryKey: ["torre-company-goals"] }); },
    onError: (e: Error) => showToast(e.message),
  });

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Metas de empresa</h2>
        <button
          onClick={() => setCreating(v => !v)}
          className="text-xs rounded-lg border px-2.5 py-1 hover:bg-foreground/5" style={borderStyle}
          data-testid="button-new-company-goal"
        >{creating ? "Cancelar" : "+ Nueva meta"}</button>
      </div>

      {creating && (
        <div className="rounded-xl border p-4 mb-4 space-y-3" style={borderStyle} data-testid="form-company-goal">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="rounded-lg border bg-transparent px-2.5 py-1.5 text-sm md:col-span-2" style={borderStyle}
              placeholder="Título de la meta (ej: 20 publicaciones del mes)"
              value={title} onChange={e => setTitle(e.target.value)} data-testid="input-cg-title" />
            <select className="rounded-lg border bg-transparent px-2 py-1.5 text-sm" style={borderStyle}
              value={period} onChange={e => setPeriod(e.target.value)} data-testid="select-cg-period">
              <option value="diaria">Hoy</option>
              <option value="semanal">Esta semana</option>
              <option value="mensual">Este mes</option>
            </select>
          </div>
          <input type="number" min={1} className="rounded-lg border bg-transparent px-2.5 py-1.5 text-sm w-48" style={borderStyle}
            placeholder="Meta total (opcional)" value={target} onChange={e => setTarget(e.target.value)} data-testid="input-cg-target" />
          <div>
            <div className="text-xs uppercase tracking-wide opacity-60 mb-1">Reparto por persona</div>
            <div className="space-y-2">
              {dist.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select className="rounded-lg border bg-transparent px-2 py-1 text-sm" style={borderStyle}
                    value={d.userId} onChange={e => setDist(ds => ds.map((x, j) => j === i ? { ...x, userId: Number(e.target.value) } : x))}>
                    {team.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                  </select>
                  <input type="number" min={1} className="rounded-lg border bg-transparent px-2 py-1 text-sm w-28" style={borderStyle}
                    placeholder="Su parte" value={d.target}
                    onChange={e => setDist(ds => ds.map((x, j) => j === i ? { ...x, target: e.target.value } : x))} />
                  <button className="text-xs opacity-60 hover:opacity-100" onClick={() => setDist(ds => ds.filter((_, j) => j !== i))}>Quitar</button>
                </div>
              ))}
              <button
                className="text-xs rounded-lg border px-2.5 py-1 hover:bg-foreground/5" style={borderStyle}
                onClick={() => team[0] && setDist(ds => [...ds, { userId: team.find(u => !ds.some(d => d.userId === u.id))?.id ?? team[0].id, target: "" }])}
                data-testid="button-cg-add-person"
              >+ Agregar persona</button>
            </div>
          </div>
          <button
            className="rounded-lg bg-foreground text-background px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={title.trim().length < 3 || dist.length === 0 || create.isPending}
            onClick={() => create.mutate()}
            data-testid="button-cg-save"
          >{create.isPending ? "Creando…" : "Crear y repartir"}</button>
        </div>
      )}

      {loading ? <div className="text-sm opacity-60">Cargando metas…</div>
        : metas.length === 0 ? <div className="text-sm opacity-60">Sin metas de empresa vigentes. Crea una y repártela al equipo.</div>
        : (
          <div className="space-y-3">
            {metas.map(g => (
              <div key={g.id} className="rounded-xl border p-4" style={borderStyle} data-testid={`card-company-goal-${g.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.title}</span>
                  <span className="text-xs rounded px-1.5 py-0.5 bg-foreground/10">{PERIOD_LABEL[g.period] ?? g.period} · {g.periodKey}</span>
                  <span className="ml-auto text-sm font-semibold">{g.pct}%</span>
                  <button className="text-xs opacity-60 hover:opacity-100 hover:text-red-400" onClick={() => { if (confirm("¿Eliminar esta meta de empresa y sus metas personales?")) remove.mutate(g.id); }} data-testid={`button-delete-cg-${g.id}`}>Eliminar</button>
                </div>
                <div className="mt-2 h-2 rounded bg-foreground/10 overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${Math.min(g.pct, 100)}%`, background: g.pct >= 100 ? "#4faf6a" : "#6aa0c0" }} />
                </div>
                <div className="text-xs opacity-60 mt-1">
                  {g.target != null ? `${g.progress} de ${g.target}` : `${g.children.filter(c => c.status === "cumplida").length} de ${g.children.length} cumplidas`}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {g.children.map(c => (
                    <span key={c.id} className="text-xs rounded-lg border px-2 py-1" style={borderStyle}>
                      {c.assignedName}: {c.target != null ? `${c.progress}/${c.target}` : c.status === "cumplida" ? "cumplida ✓" : "pendiente"}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}

/* ============================== Rentabilidad ============================= */

function RentaTable({ projects, team, showToast, rangeLabel }: {
  projects: ProfitProject[]; team: TeamMember[]; showToast: (m: string) => void; rangeLabel: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Array<{ userId: number; allocationPct: number }>>([]);

  const save = useMutation({
    mutationFn: (projectRef: string) => req("/hub/torre/assignments", {
      method: "PUT",
      body: JSON.stringify({ projectRef, assignments: draft }),
    }),
    onSuccess: () => {
      showToast("Dedicación guardada");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["torre-rentabilidad"] });
    },
    onError: (e: Error) => showToast(e.message),
  });

  const withData = projects.filter(p => p.assignments.length > 0 || p.contractId);
  const rest = projects.filter(p => !(p.assignments.length > 0 || p.contractId));

  const row = (p: ProfitProject) => (
    <div key={p.projectRef} className="rounded-xl border p-3" style={borderStyle} data-testid={`row-renta-${p.projectRef}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{p.name || "(sin nombre)"}</span>
        {p.client && <span className="text-xs opacity-60">{p.client}</span>}
        <span className="text-xs rounded px-1.5 py-0.5 bg-foreground/10">{p.status}</span>
        <span className="ml-auto text-sm tabular-nums">{p.hours} h · costo {clp(p.cost)}</span>
        {p.revenue != null && <span className="text-sm tabular-nums opacity-80">venta {clp(p.revenue)} neto{p.cobroEstado ? ` (${p.cobroEstado})` : ""}</span>}
        {p.margin != null && (
          <span className={`text-sm font-semibold tabular-nums ${p.margin >= 0 ? "text-emerald-400" : "text-red-400"}`} data-testid={`text-margin-${p.projectRef}`}>
            {p.margin >= 0 ? "+" : ""}{clp(p.margin)}
          </span>
        )}
        <button
          className="text-xs rounded-lg border px-2 py-0.5 hover:bg-foreground/5" style={borderStyle}
          onClick={() => {
            if (editing === p.projectRef) { setEditing(null); return; }
            setEditing(p.projectRef);
            setDraft(p.assignments.map(a => ({ userId: a.userId, allocationPct: a.allocationPct })));
          }}
          data-testid={`button-edit-assign-${p.projectRef}`}
        >Dedicación</button>
      </div>
      {p.missingCost.length > 0 && (
        <div className="text-xs text-amber-400 mt-1">Sin costo hora en ficha: {p.missingCost.join(", ")} — el costo real es mayor.</div>
      )}
      {p.assignments.length > 0 && editing !== p.projectRef && (
        <div className="mt-1 flex flex-wrap gap-2 text-xs opacity-70">
          {p.assignments.map(a => <span key={a.userId}>{a.name} {a.allocationPct}% ({Math.round(a.minutes / 6) / 10} h)</span>)}
        </div>
      )}
      {editing === p.projectRef && (
        <div className="mt-2 space-y-2">
          {draft.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <select className="rounded-lg border bg-transparent px-2 py-1 text-sm" style={borderStyle}
                value={d.userId} onChange={e => setDraft(ds => ds.map((x, j) => j === i ? { ...x, userId: Number(e.target.value) } : x))}>
                {team.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
              </select>
              <input type="number" min={1} max={100} className="rounded-lg border bg-transparent px-2 py-1 text-sm w-20" style={borderStyle}
                value={d.allocationPct}
                onChange={e => setDraft(ds => ds.map((x, j) => j === i ? { ...x, allocationPct: Math.max(1, Math.min(100, Number(e.target.value) || 1)) } : x))} />
              <span className="text-xs opacity-60">%</span>
              <button className="text-xs opacity-60 hover:opacity-100" onClick={() => setDraft(ds => ds.filter((_, j) => j !== i))}>Quitar</button>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="text-xs rounded-lg border px-2.5 py-1 hover:bg-foreground/5" style={borderStyle}
              onClick={() => team[0] && setDraft(ds => [...ds, { userId: team.find(u => !ds.some(d => d.userId === u.id))?.id ?? team[0].id, allocationPct: 100 }])}
            >+ Persona</button>
            <button className="text-xs rounded-lg bg-foreground text-background px-2.5 py-1 disabled:opacity-40"
              disabled={save.isPending} onClick={() => save.mutate(p.projectRef)} data-testid={`button-save-assign-${p.projectRef}`}
            >{save.isPending ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="text-xs opacity-60">Horas de jornada del rango {rangeLabel}, repartidas según % de dedicación, × costo hora de la ficha RRHH.</div>
      {projects.length === 0 && <div className="text-sm opacity-60">No hay proyectos en el Hub.</div>}
      {withData.map(row)}
      {rest.length > 0 && (
        <details>
          <summary className="text-xs opacity-60 cursor-pointer">Proyectos sin contrato ni dedicación ({rest.length})</summary>
          <div className="space-y-2 mt-2">{rest.map(row)}</div>
        </details>
      )}
    </div>
  );
}
