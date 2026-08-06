import { useMemo } from "react";
import { useAuth } from "@/App";
import { ActivityFeed } from "@/components/activity-feed";
import { EmptyState } from "@/components/hub-kit";
import { TicketsInline } from "@/components/tickets-inline";
import { FolderTree } from "lucide-react";
import type { HubState, HubTask, SheetKind, Tab } from "../shared";
import { dueInfo, projProg, STATUS, statusOf } from "../shared";
import { buildOrbitSvg } from "../small-components";

export function DashView({ state, onOpenProject, onNavigate, apiTasks }: { state: HubState; onOpenProject: (id: string) => void; onNavigate: (tab: Tab, sheet?: SheetKind) => void; apiTasks: HubTask[] }) {
  const authUser = useAuth();
  const isDev = authUser?.teamRole === "dev";
  const active = state.projects.filter(p => p.status !== "done");
  const avg = state.projects.length ? Math.round(state.projects.reduce((a, p) => a + projProg(p.id, apiTasks).pct, 0) / state.projects.length) : 0;
  const urgent = state.projects.filter(p => p.prio === "alta" && p.status !== "done").length;
  const due7 = state.projects.filter(p => { if (!p.due || p.status === "done") return false; const d = dueInfo(p); return d != null && d.days <= 7; }).length;
  const prog = [...state.projects].sort((a, b) => projProg(b.id, apiTasks).pct - projProg(a.id, apiTasks).pct).slice(0, 8);
  const acts = [...state.projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 7);
  const orbitSvg = useMemo(() => buildOrbitSvg(state.projects), [state.projects]);
  return (
    <div className="wrap">
      <div className="kpis">
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => onNavigate("proj")}><div className="v">{active.length}</div><div className="k">Proyectos Activos</div></div>
        <div className="kpi accent"><div className="v">{avg}%</div><div className="k">Avance Promedio</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => onNavigate("clients")}><div className="v">{state.clients.length}</div><div className="k">Clientes en Cartera</div></div>
        <div className="kpi" style={{ cursor: "pointer" }} onClick={() => onNavigate("proj")}><div className="v">{urgent}</div><div className="k">Prioridad Alta</div></div>
        <div className="kpi"><div className="v">{due7}</div><div className="k">Vencen en 7 días</div></div>
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
            onClick={e => { const g = (e.target as Element).closest(".nn-node"); if (g) { onOpenProject(g.getAttribute("data-id") || ""); } }}
            onMouseEnter={e => { const g = (e.target as Element).closest(".nn-node"); if (!g) return; const svg = (e.currentTarget as SVGElement); svg.querySelectorAll(".nn-link").forEach(l => { if (l.getAttribute("data-a") === g.getAttribute("data-id") || l.getAttribute("data-b") === g.getAttribute("data-id")) l.classList.add("hl"); }); }}
            onMouseLeave={e => { (e.currentTarget as SVGElement).querySelectorAll(".nn-link.hl").forEach(l => l.classList.remove("hl")); }}
          />
        </div>
      </div>
      <div className="dstats">
        {STATUS.map(s => {
          const n = state.projects.filter(p => p.status === s.id).length;
          return <span key={s.id} className={n === 0 ? "z" : ""}><i style={{ background: s.color }} />{s.label} <b>{n}</b></span>;
        })}
      </div>
      <div className="dash-grid">
        <div className="panel">
          <h2>Avance por Proyecto</h2>
          {prog.length ? prog.map(p => (
            <div key={p.id} className="prow clickable" onClick={() => onNavigate("proj", { kind: "proj", id: p.id })}>
              <div className="pn"><b>{p.name}</b><small>{p.client}</small></div>
              <div className="pbarwrap"><div className="pbar"><i style={{ width: projProg(p.id, apiTasks).pct + "%" }} /></div></div>
              <div className="ppct">{projProg(p.id, apiTasks).pct}%</div>
            </div>
          )) : <EmptyState title="Sin proyectos aún" hint="Comienza a registrar tu cartera." icon={<FolderTree />} />}
        </div>
        <div className="panel activity">
          <h2>Actividad Reciente</h2>
          {acts.length ? acts.map(p => <div key={p.id} className="aitem"><span className="tag">{statusOf(p.status).label}</span><span>{p.name} · {p.client} → {projProg(p.id, apiTasks).pct}%</span></div>) : <EmptyState title="Sin actividad reciente" hint="Tu historial aparecerá aquí." icon={<ActivityFeed />} />}
        </div>
      </div>
      {/* Tickets del área de quien mira: Hub Ejecutivo lo visitan ventas/dirección
          Y dev, así que la bandeja no puede quedar fija en "ventas" o al dev
          nunca le muestra nada relevante. Va al final para no estorbar los
          KPIs ni el mapa. */}
      <div style={{ marginTop: 14 }}>
        {isDev
          ? <TicketsInline title="Solicitudes para desarrollo" area="desarrollo" />
          : <TicketsInline title="Solicitudes para ventas" area="ventas" />}
      </div>
    </div>
  );
}

