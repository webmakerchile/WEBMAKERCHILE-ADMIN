import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/App";
import { CONTRACT_STATUSES, CRIT_COLOR, QUOTE_STATUSES, SERVICES, STATUS, TASK_STAGES, TASK_STAGE_TO_STATUS, isQuoteStatus } from "./constants";
import { useEntityMutations, useHubData, useMembers } from "./hooks";
import {
  advanceStageExtra, clientNameOf, exStr, fmtCLP, fmtDate, fmtDateTime, isExpired,
  isoToMs, prioW, stageSinceMs, statusOf, taskStageFromRow, taskStageOf,
} from "./lib";
import { buildOrbitSvg } from "./orbit";
import { DriveIcon, DueBadge, GoogleCalendarSection, MemberAvatarStack, PushOptInCard, StageTimer, type ToastFn } from "./shared";
import type { MemberRow, ProjectRow, ProjView as ProjViewMode, SheetKind, Tab, TaskRow } from "./types";

/* ============================================================
   TARJETAS
   ============================================================ */

function ProjCard({ p, clientName, onClick, onDragStart, onDragEnd }: {
  p: ProjectRow; clientName: string; onClick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const type = exStr(p.extra, "type");
  const owner = exStr(p.extra, "owner");
  const link = exStr(p.extra, "link");
  return (
    <div className="pcard" draggable onClick={onClick} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="pt">{p.name}</div>
      <div className="cl">{clientName}</div>
      <div className="meta">
        <span className={`chip prio-${p.priority}`}>{p.priority}</span>
        {type && <span className="chip">{type}</span>}
        {owner && owner.trim() !== "—" && <span className="chip">{owner}</span>}
        <DueBadge iso={p.dueDate} />
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--orange2)", borderColor: "var(--orange-line)", textDecoration: "none" }}>
            <DriveIcon /> Drive
          </a>
        )}
      </div>
      <div className="bar-prog"><i style={{ width: (p.progress ?? 0) + "%" }} /></div>
      <StageTimer since={stageSinceMs(p.extra, p.updatedAt || p.createdAt)} />
    </div>
  );
}

function TaskCard({ t, projects, members, onClick, onDragStart, onDragEnd }: {
  t: TaskRow; projects: ProjectRow[]; members: MemberRow[];
  onClick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const proj = projects.find(p => p.id === t.projectId);
  return (
    <div className="pcard tcard" draggable onClick={onClick} onDragStart={onDragStart} onDragEnd={onDragEnd}
      style={{ borderLeft: `3px solid ${CRIT_COLOR[t.priority ?? ""] || "var(--line)"}` }}>
      <div className="pt">{t.title}</div>
      <div className="cl">{proj ? proj.name : "— sin proyecto"}</div>
      <div className="meta">
        <span className={`chip prio-${t.priority}`}>{t.priority}</span>
        <DueBadge iso={t.dueDate} prefix={["vencida ", "vence "]} />
        <MemberAvatarStack ids={t.assigneeIds ?? []} members={members} />
      </div>
      <StageTimer since={stageSinceMs(t.extra, t.createdAt)} />
    </div>
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */

export function DashView({ onOpenProject, onNavigate, onToast }: {
  onOpenProject: (id: number) => void; onNavigate: (t: Tab) => void; onToast: ToastFn;
}) {
  const { clients, projects, tasks, quotes } = useHubData();
  const active = projects.filter(p => p.status !== "done");
  const avg = projects.length ? Math.round(projects.reduce((a, p) => a + Number(p.progress || 0), 0) / projects.length) : 0;
  const openTasks = tasks.filter(t => t.status !== "hecho").length;
  const openQuotes = quotes.filter(q => q.status === "borrador" || q.status === "enviado").length;
  const urgent = projects.filter(p => p.priority === "alta" && p.status !== "done").length;
  const prog = [...projects].sort((a, b) => Number(b.progress ?? 0) - Number(a.progress ?? 0)).slice(0, 8);
  const acts = [...projects].sort((a, b) => isoToMs(b.updatedAt) - isoToMs(a.updatedAt)).slice(0, 7);
  const orbitSvg = useMemo(() => buildOrbitSvg(projects, id => clientNameOf(clients, id)), [projects, clients]);
  return (
    <div className="wrap">
      <PushOptInCard onToast={onToast} />
      <div className="kpis">
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => onNavigate("proyectos")}><div className="v">{active.length}</div><div className="k">Proyectos Activos</div></div>
        <div className="kpi accent"><div className="v">{avg}%</div><div className="k">Avance Promedio</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => onNavigate("clientes")}><div className="v">{clients.length}</div><div className="k">Clientes en Cartera</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => onNavigate("tareas")}><div className="v">{openTasks}</div><div className="k">Tareas Abiertas</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => onNavigate("presupuestos")}><div className="v">{openQuotes}</div><div className="k">Presupuestos Abiertos</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => onNavigate("proyectos")}><div className="v">{urgent}</div><div className="k">Prioridad Alta</div></div>
      </div>
      <div className="hero">
        <div className="htext">
          <div className="eyebrow">Mapa de Cartera en Vivo</div>
          <h1>Tu pipeline, tejido como una red neuronal</h1>
          <p>Cada nodo es un proyecto; las fibras conectan las etapas del flujo y los pulsos avanzan hacia la entrega. Tamaño = prioridad, color = etapa. Toca un nodo para abrirlo.</p>
          <div className="legend-row">{STATUS.map(s => <div key={s.id} className="li"><span className="dot" style={{ background: s.color }} />{s.label}</div>)}</div>
        </div>
        <div className="orbit-wrap">
          <svg viewBox="0 0 460 340" dangerouslySetInnerHTML={{ __html: orbitSvg }}
            onClick={e => { const g = (e.target as Element).closest(".nn-node"); if (g) { const id = Number(g.getAttribute("data-id")); if (id) onOpenProject(id); } }}
            onMouseEnter={e => { const g = (e.target as Element).closest(".nn-node"); if (!g) return; const svg = (e.currentTarget as SVGElement); svg.querySelectorAll(".nn-link").forEach(l => { if (l.getAttribute("data-a") === g.getAttribute("data-id") || l.getAttribute("data-b") === g.getAttribute("data-id")) l.classList.add("hl"); }); }}
            onMouseLeave={e => { (e.currentTarget as SVGElement).querySelectorAll(".nn-link.hl").forEach(l => l.classList.remove("hl")); }}
          />
        </div>
      </div>
      <div style={{ marginTop: 8, fontFamily: "IBM Plex Mono,monospace", fontSize: 9, color: "var(--faint)", letterSpacing: 1.2, textTransform: "uppercase" }}>
        {STATUS.map((s, i) => <span key={s.id}>{i > 0 && " · "}{s.label} · {projects.filter(p => p.status === s.id).length}</span>)}
      </div>
      <div className="dash-grid">
        <div className="panel">
          <h2>Avance por Proyecto</h2>
          {prog.length ? prog.map(p => (
            <div key={p.id} className="prow clickable" onClick={() => { onNavigate("proyectos"); setTimeout(() => onOpenProject(p.id), 80); }}>
              <div className="pn"><b>{p.name}</b><small>{clientNameOf(clients, p.clientId)}</small></div>
              <div className="pbarwrap"><div className="pbar"><i style={{ width: (p.progress ?? 0) + "%" }} /></div></div>
              <div className="ppct">{p.progress ?? 0}%</div>
            </div>
          )) : <div className="col-empty">Sin proyectos aún</div>}
        </div>
        <div className="panel activity">
          <h2>Actividad Reciente</h2>
          {acts.length ? acts.map(p => <div key={p.id} className="aitem"><span className="tag">{statusOf(p.status).label}</span><span>{p.name} · {clientNameOf(clients, p.clientId)} → {p.progress ?? 0}%</span></div>) : <div className="col-empty">Sin actividad reciente</div>}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PROYECTOS (kanban + lista)
   ============================================================ */

export function ProjView({ onOpenProject, onToast, projView, setProjView, searchQ, setSearchQ, filterPrio, setFilterPrio }: {
  onOpenProject: (id: number) => void; onToast: ToastFn;
  projView: ProjViewMode; setProjView: (v: ProjViewMode) => void;
  searchQ: string; setSearchQ: (v: string) => void; filterPrio: string; setFilterPrio: (v: string) => void;
}) {
  const { clients, projects } = useHubData();
  const projectsM = useEntityMutations<ProjectRow>("projects");
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const fp = projects.filter(p => {
    if (filterPrio && p.priority !== filterPrio) return false;
    if (!searchQ) return true;
    const cn = clientNameOf(clients, p.clientId);
    return (p.name + " " + cn + " " + exStr(p.extra, "type")).toLowerCase().includes(searchQ);
  });

  const dropProj = (status: string) => {
    if (dragId == null) { setDragId(null); setDragOver(null); return; }
    const p = projects.find(x => x.id === dragId);
    if (p && p.status !== status) {
      const extra = advanceStageExtra(p.extra, p.status || "lead");
      projectsM.update.mutate({ id: p.id, patch: { status, extra } }, { onError: err => onToast(`Error al mover: ${err.message}`) });
      onToast("Proyecto movido a " + statusOf(status).label);
    }
    setDragId(null); setDragOver(null);
  };

  return (
    <div className="wrap">
      <div className="toolbar">
        <div className="tsearch"><span>🔍</span><input value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} placeholder="Buscar proyecto…" /></div>
        <div className="seg">
          {(["board", "list"] as ProjViewMode[]).map(v => <button key={v} className={projView === v ? "on" : ""} onClick={() => setProjView(v)}>{v === "board" ? "Kanban" : "Lista"}</button>)}
        </div>
        <select className="filter" value={filterPrio} onChange={e => setFilterPrio(e.target.value)}>
          <option value="">Prioridad</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
        </select>
      </div>
      {projView === "board" && (
        <div className="board">
          {projects.length === 0 && <div className="empty-all" style={{ gridColumn: "1/-1" }}>Sin proyectos aún. <strong>+ Nuevo</strong> para comenzar.</div>}
          {STATUS.map(s => {
            const items = fp.filter(p => p.status === s.id).sort((a, b) => (prioW(a.priority) - prioW(b.priority)) || (stageSinceMs(a.extra, a.createdAt) - stageSinceMs(b.extra, b.createdAt)));
            return (
              <div key={s.id} className={`col ${dragOver === s.id ? "dragover" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(s.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => dropProj(s.id)}>
                <h3><span className="top"><span className="dot" style={{ background: s.color }} />{s.label}</span><span className="n">{items.length}</span></h3>
                {items.length ? items.map(p => <ProjCard key={p.id} p={p} clientName={clientNameOf(clients, p.clientId)} onClick={() => onOpenProject(p.id)} onDragStart={e => { setDragId(p.id); e.dataTransfer.setData("text/plain", String(p.id)); }} onDragEnd={() => { setDragId(null); setDragOver(null); }} />) : <div className="col-empty">—</div>}
              </div>
            );
          })}
        </div>
      )}
      {projView === "list" && (
        <div className="cardlist">
          {fp.map(p => (
            <div key={p.id} className="gcard" onClick={() => onOpenProject(p.id)}>
              <div className="gt">{p.name}</div><div className="gsub">{clientNameOf(clients, p.clientId) || "—"}{exStr(p.extra, "type") ? ` · ${exStr(p.extra, "type")}` : ""}</div>
              <div className="gbody">{p.description || ""}</div>
              <div className="gfoot"><span className={`chip prio-${p.priority}`}>{p.priority}</span><span className="badge">{statusOf(p.status).label}</span><DueBadge iso={p.dueDate} /><span className="gdate">{p.progress ?? 0}%</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TAREAS (scrumban con responsables)
   ============================================================ */

export function TasksView({ onOpenTask, onToast, searchQ, setSearchQ, filterPrio, setFilterPrio, mineOnly, setMineOnly }: {
  onOpenTask: (id: number) => void; onToast: ToastFn;
  searchQ: string; setSearchQ: (v: string) => void; filterPrio: string; setFilterPrio: (v: string) => void;
  mineOnly: boolean; setMineOnly: (v: boolean) => void;
}) {
  const authUser = useAuth();
  const { projects, tasks } = useHubData();
  const members = useMembers().data ?? [];
  const tasksM = useEntityMutations<TaskRow>("tasks");
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const ft = tasks.filter(t => {
    if (mineOnly && authUser && !(t.assigneeIds ?? []).includes(authUser.id)) return false;
    if (filterPrio && t.priority !== filterPrio) return false;
    if (searchQ) {
      const pj = projects.find(p => p.id === t.projectId);
      if (!((t.title + " " + (pj ? pj.name : "")).toLowerCase().includes(searchQ))) return false;
    }
    return true;
  });

  const dropTask = (stage: string) => {
    if (dragId == null) { setDragId(null); setDragOver(null); return; }
    const t = tasks.find(x => x.id === dragId);
    if (t) {
      const cur = taskStageFromRow(t);
      if (cur !== stage) {
        const extra = { ...advanceStageExtra(t.extra, cur), stage };
        tasksM.update.mutate({
          id: t.id,
          patch: { status: TASK_STAGE_TO_STATUS[stage as keyof typeof TASK_STAGE_TO_STATUS], extra },
        }, { onError: err => onToast(`Error al mover: ${err.message}`) });
        onToast("Tarea → " + taskStageOf(stage).label);
      }
    }
    setDragId(null); setDragOver(null);
  };

  return (
    <div className="wrap">
      <div className="toolbar">
        <div className="tsearch"><span>🔍</span><input value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} placeholder="Buscar tarea…" /></div>
        <div className="seg">
          <button className={mineOnly ? "on" : ""} onClick={() => setMineOnly(true)}>Mis tareas</button>
          <button className={!mineOnly ? "on" : ""} onClick={() => setMineOnly(false)}>Todas</button>
        </div>
        <select className="filter" value={filterPrio} onChange={e => setFilterPrio(e.target.value)}>
          <option value="">Prioridad</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
        </select>
      </div>
      <div className="board scrum6">
        {!tasks.length && <div className="col-empty" style={{ gridColumn: "1/-1" }}>Sin tareas aún. Crea la primera con <strong>+ Nuevo</strong>.</div>}
        {TASK_STAGES.map(s => {
          const items = ft.filter(t => taskStageFromRow(t) === s.id).sort((a, b) => (prioW(a.priority) - prioW(b.priority)) || (stageSinceMs(a.extra, a.createdAt) - stageSinceMs(b.extra, b.createdAt)));
          return (
            <div key={s.id} className={`col ${dragOver === s.id ? "dragover" : ""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(s.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => dropTask(s.id)}>
              <h3><span className="top"><span className="dot" style={{ background: s.color }} />{s.label}</span><span className="n">{items.length}</span></h3>
              {items.length ? items.map(t => <TaskCard key={t.id} t={t} projects={projects} members={members} onClick={() => onOpenTask(t.id)} onDragStart={e => { setDragId(t.id); e.dataTransfer.setData("text/plain", String(t.id)); }} onDragEnd={() => { setDragId(null); setDragOver(null); }} />) : <div className="col-empty">—</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   CLIENTES
   ============================================================ */

export function ClientsView({ onOpen, searchQ, setSearchQ }: { onOpen: (id: number) => void; searchQ: string; setSearchQ: (v: string) => void }) {
  const { clients, projects } = useHubData();
  const list = clients.filter(c => !searchQ || (c.name + " " + (c.company || "") + " " + (c.email || "") + " " + (c.phone || "")).toLowerCase().includes(searchQ));
  return (
    <div className="wrap">
      <div className="toolbar"><div className="tsearch"><span>🔍</span><input value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} placeholder="Buscar cliente…" /></div></div>
      {clients.length === 0 && <div className="empty-all">Sin clientes aún. <strong>+ Nuevo</strong> para comenzar.</div>}
      <div className="cardlist">
        {list.map(c => {
          const np = projects.filter(p => p.clientId === c.id).length;
          const contact = [c.company, c.email, c.phone].filter(Boolean).join(" · ");
          return (
            <div key={c.id} className="gcard" onClick={() => onOpen(c.id)}>
              <div className="gt">{c.name}</div><div className="gsub">{contact || "—"}</div>
              <div className="gbody">{c.notes || ""}</div>
              <div className="gfoot"><span className="badge">{np} proyecto{np !== 1 ? "s" : ""}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   REUNIONES
   ============================================================ */

export function MeetView({ onOpen }: { onOpen: (id: number) => void }) {
  const { clients, meetings } = useHubData();
  const meetTs = (m: { date: string | null; createdAt: string }) => isoToMs(m.date) || isoToMs(m.createdAt);
  const list = [...meetings].sort((a, b) => meetTs(b) - meetTs(a));
  return (
    <div className="wrap">
      <GoogleCalendarSection />
      <div style={{ fontFamily: "var(--font-mono,monospace)", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--dim)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Reuniones manuales
      </div>
      {meetings.length === 0 && <div className="empty-all">Sin reuniones aún. <strong>+ Nuevo</strong> para comenzar.</div>}
      <div className="cardlist">
        {list.map(m => (
          <div key={m.id} className="gcard" onClick={() => onOpen(m.id)}>
            <div className="gt">{m.title || clientNameOf(clients, m.clientId) || "Reunión"}</div>
            <div className="gsub">{[clientNameOf(clients, m.clientId), m.date ? fmtDateTime(m.date) : fmtDate(m.createdAt)].filter(Boolean).join(" · ")}</div>
            <div className="gbody">{m.summary || ""}</div>
            <div className="gfoot">
              {m.followUp && <span className="chip">Seguimiento</span>}
              <span className="gdate">{fmtDate(m.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   NOTAS
   ============================================================ */

export function NotesView({ onOpen, filterScope, setFilterScope, searchQ, setSearchQ }: {
  onOpen: (id: number) => void; filterScope: string; setFilterScope: (v: string) => void; searchQ: string; setSearchQ: (v: string) => void;
}) {
  const { notes } = useHubData();
  const list = notes
    .filter(n => (!filterScope || n.scope === filterScope) && (!searchQ || ((n.title || "") + " " + (n.content || "")).toLowerCase().includes(searchQ)))
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (isoToMs(b.updatedAt || b.createdAt) - isoToMs(a.updatedAt || a.createdAt)));
  return (
    <div className="wrap">
      <div className="toolbar">
        <div className="tsearch"><span>🔍</span><input value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} placeholder="Buscar nota…" /></div>
        <select className="filter" value={filterScope} onChange={e => setFilterScope(e.target.value)}>
          <option value="">Todas</option>
          <option value="team">Equipo</option>
          <option value="personal">Personales</option>
        </select>
      </div>
      {notes.length === 0 && <div className="empty-all">Sin notas aún. <strong>+ Nuevo</strong> para comenzar.</div>}
      <div className="cardlist">
        {list.map(n => (
          <div key={n.id} className="gcard" onClick={() => onOpen(n.id)}>
            <div className="gt">{n.pinned ? "📌 " : ""}{n.title || "Sin título"}</div>
            <div className="gsub">
              <span className={`badge scope-${n.scope}`}>{n.scope === "personal" ? "🔒 Personal" : "👥 Equipo"}</span>
            </div>
            <div className="gbody">{n.content || ""}</div>
            <div className="gfoot"><span className="gdate">{fmtDate(n.updatedAt || n.createdAt)}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   CONTRATOS
   ============================================================ */

export function ContractsView({ onOpen, onNewQuote }: { onOpen: (id: number) => void; onNewQuote: () => void }) {
  const { clients, contracts } = useHubData();
  const list = [...contracts].sort((a, b) => isoToMs(b.createdAt) - isoToMs(a.createdAt));
  return (
    <div className="wrap">
      <div className="toolbar">
        <button className="toolbar-cta" onClick={onNewQuote}>✨ Nueva cotización</button>
      </div>
      {contracts.length === 0 && <div className="empty-all">Sin contratos aún. <strong>+ Nuevo</strong> para agregar uno.</div>}
      <div className="cardlist">
        {list.map(c => {
          const expired = c.status !== "cancelado" && isExpired(c.expiresAt);
          const s = expired ? CONTRACT_STATUSES.vencido : (CONTRACT_STATUSES[(c.status ?? "borrador") as keyof typeof CONTRACT_STATUSES] || CONTRACT_STATUSES.borrador);
          const valueText = exStr(c.extra, "valueText") || (c.amount != null ? fmtCLP(c.amount) : "");
          const pdfUrl = exStr(c.extra, "pdfUrl");
          return (
            <div key={c.id} className="gcard" onClick={() => onOpen(c.id)}>
              <div className="gt">{c.title}</div>
              <div className="gsub">{c.clientName || clientNameOf(clients, c.clientId) || "—"}</div>
              <div className="meta" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                <span className="chip" style={{ color: s.color, borderColor: s.color + "55", background: s.color + "18" }}>{s.label}</span>
                {valueText && <span className="chip">{valueText}</span>}
                {c.expiresAt && <span className="chip" style={expired ? { color: "#e0795a", borderColor: "rgba(224,121,90,.4)" } : undefined}>Vence: {fmtDate(c.expiresAt)}</span>}
                {pdfUrl && (
                  <a className="chip pdf-badge" href={pdfUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    📄 {exStr(c.extra, "pdfTitle") || "PDF"}
                  </a>
                )}
              </div>
              <div className="gbody" style={{ marginTop: "6px" }}>{c.body || ""}</div>
              <div className="gfoot"><span className="gdate">{fmtDate(c.createdAt)}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   PRESUPUESTOS
   ============================================================ */

export function QuotesView({ onOpen, onNew }: { onOpen: (id: number) => void; onNew: () => void }) {
  const { clients, quotes } = useHubData();
  const list = [...quotes].sort((a, b) => isoToMs(b.updatedAt || b.createdAt) - isoToMs(a.updatedAt || a.createdAt));
  return (
    <div className="wrap">
      <div className="toolbar">
        <button className="toolbar-cta" onClick={onNew}>✨ Nueva cotización</button>
      </div>
      {quotes.length === 0 && (
        <div className="empty-all">Sin presupuestos aún. Crea el primero con <strong>✨ Nueva cotización</strong>.</div>
      )}
      <div className="cardlist">
        {list.map(q => {
          const status = isQuoteStatus(q.status) ? q.status : "borrador";
          const st = QUOTE_STATUSES[status];
          const expired = (status === "borrador" || status === "enviado") && isExpired(q.expiresAt);
          const pdfUrl = exStr(q.extra, "pdfUrl");
          return (
            <div key={q.id} className="gcard" onClick={() => onOpen(q.id)}>
              <div className="gt">{q.title}</div>
              <div className="gsub">{q.clientName || clientNameOf(clients, q.clientId) || "—"}</div>
              <div className="meta" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                <span className="chip" style={{ color: st.color, borderColor: st.color + "55", background: st.color + "18" }}>{st.label}</span>
                {expired && <span className="chip due overdue">Vencido</span>}
                {q.total != null && q.total > 0 && <span className="chip">{fmtCLP(q.total)}</span>}
                {q.expiresAt && !expired && <span className="chip">Vence: {fmtDate(q.expiresAt)}</span>}
                {q.contractId != null && <span className="chip" style={{ color: "var(--done)", borderColor: "rgba(79,175,106,.4)" }}>→ Contrato</span>}
                {pdfUrl && (
                  <a className="chip pdf-badge" href={pdfUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    📄 PDF
                  </a>
                )}
              </div>
              <div className="gbody" style={{ marginTop: "6px" }}>{q.notes || ""}</div>
              <div className="gfoot"><span className="gdate">{q.issuedAt ? `Emitida ${fmtDate(q.issuedAt)}` : fmtDate(q.createdAt)}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   SERVICIOS
   ============================================================ */

export function SvcView() {
  return (
    <div className="wrap">
      <div className="hint">Precios referenciales · Actualiza este catálogo según los acuerdos internos vigentes del equipo.</div>
      {SERVICES.map(cat => (
        <div key={cat.cat} className="svc-cat">
          <h2>{cat.cat}</h2>
          {cat.items.map(s => (
            <div key={s.n} className="svc">
              <div className="sh"><h3>{s.n}</h3></div>
              <div className="sd">{s.d}</div>
              {s.incl && <div className="incl"><b>Incluye:</b> {s.incl}</div>}
              {s.t && s.t.length > 0 ? (
                <div className="tiers">{s.t.map((t, i) => <div key={t[0]} className={`tier ${i === 1 ? "t2" : ""}`}><div className="tn">{t[0]}</div><div className="tp">{t[1]}</div><div className="tx">{t[2]}</div></div>)}</div>
              ) : <div className="incl" style={{ color: "var(--orange2)" }}>Se cotiza según alcance.</div>}
              {s.note && <div className="note-line">{s.note}</div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   BÚSQUEDA GLOBAL (datos del servidor, incluye presupuestos)
   ============================================================ */

interface SResult { t: string; n: string; s: string; go: () => void; }

export function GlobalSearch({ onOpen, onNavigate }: { onOpen: (s: SheetKind) => void; onNavigate: (t: Tab) => void }) {
  const { clients, projects, tasks, meetings, notes, contracts, quotes } = useHubData();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SResult[]>([]);
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const go = useCallback((tab: Tab, sk: SheetKind) => { onNavigate(tab); setTimeout(() => onOpen(sk), 80); setQ(""); setShow(false); }, [onNavigate, onOpen]);

  useEffect(() => {
    const q2 = q.toLowerCase().trim();
    if (!q2 || q2.length < 2) { setResults([]); setShow(false); return; }
    const out: SResult[] = [];
    projects.forEach(p => { const cn = clientNameOf(clients, p.clientId); if ((p.name + " " + cn).toLowerCase().includes(q2)) out.push({ t: "Proyecto", n: p.name, s: cn, go: () => go("proyectos", { kind: "proj", id: p.id }) }); });
    clients.forEach(c => { if ((c.name + " " + (c.company || "") + " " + (c.email || "")).toLowerCase().includes(q2)) out.push({ t: "Cliente", n: c.name, s: c.company || c.email || "", go: () => go("clientes", { kind: "client", id: c.id }) }); });
    notes.forEach(n => { if (((n.title || "") + " " + (n.content || "")).toLowerCase().includes(q2)) out.push({ t: "Nota", n: n.title || "Sin título", s: n.scope === "personal" ? "Personal" : "Equipo", go: () => go("notas", { kind: "note", id: n.id }) }); });
    meetings.forEach(m => { const cn = clientNameOf(clients, m.clientId); if ((m.title + " " + cn + " " + (m.summary || "")).toLowerCase().includes(q2)) out.push({ t: "Reunión", n: m.title || cn || "Reunión", s: m.summary || "", go: () => go("reuniones", { kind: "meet", id: m.id }) }); });
    tasks.forEach(t => { const pj = projects.find(p => p.id === t.projectId); if ((t.title + " " + (pj?.name || "")).toLowerCase().includes(q2)) out.push({ t: "Tarea", n: t.title, s: pj?.name || "", go: () => go("tareas", { kind: "task", id: t.id }) }); });
    contracts.forEach(c => { const cn = c.clientName || clientNameOf(clients, c.clientId); if ((c.title + " " + cn).toLowerCase().includes(q2)) out.push({ t: "Contrato", n: c.title, s: cn, go: () => go("contratos", { kind: "contract", id: c.id }) }); });
    quotes.forEach(qt => { const cn = qt.clientName || clientNameOf(clients, qt.clientId); if ((qt.title + " " + cn).toLowerCase().includes(q2)) out.push({ t: "Presupuesto", n: qt.title, s: cn, go: () => go("presupuestos", { kind: "quote", id: qt.id }) }); });
    setResults(out.slice(0, 8)); setShow(true);
  }, [q, clients, projects, tasks, meetings, notes, contracts, quotes, go]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { e.preventDefault(); inputRef.current?.focus(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="search">
      <span>🔍</span>
      <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente, proyecto, presupuesto…"
        onFocus={() => results.length > 0 && setShow(true)} onBlur={() => setTimeout(() => setShow(false), 150)} />
      <kbd>/</kbd>
      {show && (
        <div className="sresults">
          {results.length ? results.map((res, i) => (
            <button key={i} className="sr" onMouseDown={e => { e.preventDefault(); res.go(); }}>
              <span className="srt">{res.t}</span><span className="srn">{res.n}</span><span className="srs">{res.s.slice(0, 44)}</span>
            </button>
          )) : <div className="sr-empty">Sin resultados</div>}
        </div>
      )}
    </div>
  );
}
