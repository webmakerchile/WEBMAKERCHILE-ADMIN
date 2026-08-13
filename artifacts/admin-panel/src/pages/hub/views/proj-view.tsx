import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { BoardNav, BoardScroller, useBoardNav } from "@/components/board-nav";
import { EmptyState } from "@/components/hub-kit";
import { LayoutDashboard, FileCheck2, FolderTree, Maximize2, Minimize2 } from "lucide-react";
import type { HubState, HubTask, Project, ProjView as ProjViewMode, StateUpdater } from "../shared";
import { advanceStageObj, prioW, projProg, STATUS, statusOf, TASK_STAGES, taskStatusOf } from "../shared";
import { DueChip, ProjCard, TaskCard } from "../small-components";
import { crearCarpetaAutoProyecto, DRIVE_API_BASE } from "../sheet-content";
import { Dictado, type ItemDictado } from "@/components/dictado";
import { crearTareaHub } from "@/lib/tareas-hub";

/** Marca especial para "tareas sin proyecto asignado" en el filtro de Scrum.
 *  Nunca choca con un id real: `uid()` siempre arranca con "id". */
const SIN_PROYECTO = "__sin_proyecto__";
/** Una tarea "Hecha" hace más de esto se oculta del Scrum general (vista sin
 *  proyecto filtrado). Sigue disponible completa al filtrar por su proyecto
 *  (o por "Sin proyecto" si no tenía) — no se borra nada, solo deja de
 *  saturar la columna "Hecho" del tablero mezclado. */
const DONE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dropdown buscable para elegir el proyecto que filtra el tablero Scrum.
 *
 * Sigue el patrón visual/interactivo propio del Hub (input + panel flotante,
 * como en GlobalSearch), no el combobox shadcn de las pantallas wmc — el Hub
 * tiene su propio sistema visual (hub.css) y mezclar los dos desentonaría.
 */
function ProjectFilterCombobox({ projects, value, onChange }: { projects: Project[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => { setQ(""); setOpen(true); setTimeout(() => inputRef.current?.focus(), 30); };
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const pick = (v: string) => { onChange(v); close(); };

  const qlc = q.trim().toLowerCase();
  const filtered = qlc ? projects.filter(p => (p.name + " " + (p.client || "")).toLowerCase().includes(qlc)) : projects;
  const selectedProj = value && value !== SIN_PROYECTO ? projects.find(p => p.id === value) : null;
  const label = value === SIN_PROYECTO ? "Sin proyecto" : value ? (selectedProj ? selectedProj.name : "Proyecto eliminado") : "Todos los proyectos";

  return (
    <div
      className={cn("pfilter", value && "active")}
      // relatedTarget cae fuera del contenedor solo cuando el foco se va de
      // verdad del combobox (click afuera, Tab hacia otro control) — moverse
      // del botón al buscador o a una opción, ambos dentro, no lo dispara.
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={e => { if (e.key === "Escape") close(); }}
    >
      <button ref={triggerRef} type="button" className="pfilter-btn" aria-expanded={open} aria-haspopup="listbox" onClick={() => (open ? setOpen(false) : openMenu())}>
        <span className="pflabel">{label}</span>
        <span className="pfcaret">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="pfmenu" role="listbox">
          <div className="pfsearch"><span>🔍</span><input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar proyecto…" /></div>
          <div className="pflist">
            <button type="button" className={cn("pfopt", value === "" && "on")} onClick={() => pick("")}>Todos los proyectos</button>
            <button type="button" className={cn("pfopt", value === SIN_PROYECTO && "on")} onClick={() => pick(SIN_PROYECTO)}>Sin proyecto</button>
            {filtered.length > 0 && <div className="pfsep" />}
            {filtered.map(p => (
              <button key={p.id} type="button" className={cn("pfopt", value === p.id && "on")} onClick={() => pick(p.id)}>
                <span className="pfoptname">{p.name}</span>
                {p.client && <span className="pfoptsub">{p.client}</span>}
              </button>
            ))}
            {qlc && filtered.length === 0 && <div className="pfempty">Sin proyectos con ese nombre</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjView({ state, onSave, onOpenProject, onOpenTask, onToast, projView, setProjView, searchQ, setSearchQ, filterPrio, setFilterPrio, filterProject, setFilterProject, apiTasks, onRefreshTasks, canManage, onDeleteTask, onClearCompleted, onNew, boardFullscreen, setBoardFullscreen }: {
  state: HubState; onSave: (n: StateUpdater) => void; onOpenProject: (id: string) => void; onOpenTask: (id: number) => void;
  onToast: (m: string) => void; projView: ProjViewMode; setProjView: (v: ProjViewMode) => void;
  searchQ: string; setSearchQ: (v: string) => void; filterPrio: string; setFilterPrio: (v: string) => void;
  filterProject: string; setFilterProject: (v: string) => void;
  apiTasks: HubTask[]; onRefreshTasks: () => void;
  canManage: boolean; onDeleteTask: (id: number) => void; onClearCompleted: () => void; onNew: () => void;
  boardFullscreen: boolean; setBoardFullscreen: (v: boolean) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [retryingDriveIds, setRetryingDriveIds] = useState<Set<string>>(new Set());
  const retryDriveFolder = async (p: Project) => {
    if (retryingDriveIds.has(p.id)) return;
    setRetryingDriveIds(prev => new Set(prev).add(p.id));
    const resultado = await crearCarpetaAutoProyecto(p.name, p.client);
    setRetryingDriveIds(prev => { const next = new Set(prev); next.delete(p.id); return next; });
    // Fusión vía función: el reintento tarda (va a la red) y esta vista se
    // desmonta apenas se cambia de pestaña, así que un `state` de closure
    // podría estar viejo. `prev` lo entrega React al aplicar el cambio.
    if (resultado.ok) {
      onSave(prev => ({ ...prev, projects: prev.projects.map(x => x.id !== p.id ? x : { ...x, link: resultado.link, driveFolderId: resultado.driveFolderId, driveFolderError: undefined, updatedAt: Date.now() }) }));
      onToast(`Carpeta de Drive creada para "${p.name}"`);
    } else {
      onSave(prev => ({ ...prev, projects: prev.projects.map(x => x.id !== p.id ? x : { ...x, driveFolderError: resultado.error, updatedAt: Date.now() }) }));
      onToast(`No se pudo crear la carpeta: ${resultado.error}`);
    }
  };
  const fp = state.projects.filter(p => (!filterPrio || p.prio === filterPrio) && (!searchQ || (p.name + p.client + p.type).toLowerCase().includes(searchQ)));
  const ft = apiTasks.filter(t => {
    if (filterPrio && t.priority !== filterPrio) return false;
    if (searchQ) { const pj = state.projects.find(p => p.id === t.projectRef); if (!((t.title + " " + (pj ? pj.name : "")).toLowerCase().includes(searchQ))) return false; }
    if (filterProject === SIN_PROYECTO) {
      if (t.projectRef) return false;
    } else if (filterProject) {
      if (t.projectRef !== filterProject) return false;
    } else if (t.stage === "done" && t.completedAt && Date.now() - new Date(t.completedAt).getTime() > DONE_STALE_MS) {
      // "Todos los proyectos" (sin filtro): lo completado hace más de 7 días
      // se esconde para que "Hecho" no acumule el historial de todos los
      // proyectos. Al filtrar por un proyecto puntual (o "Sin proyecto") se
      // salta esta rama y vuelve a verse completo.
      return false;
    }
    return true;
  });
  const dropProj = (status: string) => {
    if (!dragId) return;
    const p = state.projects.find(x => x.id === dragId);
    if (p && p.status !== status) {
      const u: Record<string, unknown> = { ...p }; advanceStageObj(u, status, "status");
      onSave({ ...state, projects: state.projects.map(x => x.id === dragId ? u as unknown as Project : x) });
      onToast("Proyecto movido a " + statusOf(status).label);
    }
    setDragId(null); setDragOver(null);
  };
  const dropTask = async (stage: string) => {
    if (!dragId) return;
    const taskId = parseInt(dragId, 10);
    if (isNaN(taskId)) { setDragId(null); setDragOver(null); return; }
    const t = apiTasks.find(x => x.id === taskId);
    if (t && t.stage !== stage) {
      try {
        await fetch(`${DRIVE_API_BASE}/hub/tasks/${taskId}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
        onRefreshTasks();
        onToast("Tarea → " + taskStatusOf(stage).label);
      } catch { onToast("Error al mover tarea"); }
    }
    setDragId(null); setDragOver(null);
  };
  const scrumNav = useBoardNav();
  return (
    <div className={cn("wrap", boardFullscreen && "board-fullscreen")}>
      <div className="toolbar">
        <div className="tsearch"><span>🔍</span><input value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} placeholder="Buscar proyecto o tarea…" /></div>
        <div className="seg">
          {(["board","scrum"] as ProjViewMode[]).map(v => <button key={v} className={projView === v ? "on" : ""} onClick={() => setProjView(v)}>{v === "board" ? "Kanban" : "Scrum"}</button>)}
        </div>
        <select className="filter" value={filterPrio} onChange={e => setFilterPrio(e.target.value)}>
          <option value="">Prioridad</option><option value="crítica">Crítica</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
        </select>
        {projView === "scrum" && (
          <ProjectFilterCombobox projects={state.projects} value={filterProject} onChange={setFilterProject} />
        )}
        {projView === "scrum" && (() => {
          const doneCount = apiTasks.filter(t => t.stage === "done").length;
          return (
            <button
              onClick={onClearCompleted}
              disabled={doneCount === 0}
              title={doneCount === 0 ? "No hay tareas completadas" : `Eliminar ${doneCount} tarea${doneCount !== 1 ? "s" : ""} completada${doneCount !== 1 ? "s" : ""}`}
              style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: doneCount === 0 ? "var(--faint)" : "var(--dim)", cursor: doneCount === 0 ? "default" : "pointer", fontSize: "0.78em", whiteSpace: "nowrap", opacity: doneCount === 0 ? 0.5 : 1 }}
            >🧹 Limpiar completadas{doneCount > 0 ? ` (${doneCount})` : ""}</button>
          );
        })()}
        <button
          type="button"
          onClick={() => setBoardFullscreen(!boardFullscreen)}
          title={boardFullscreen ? "Salir de pantalla completa (Esc)" : "Ver el tablero en pantalla completa"}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", background: boardFullscreen ? "var(--orange-soft)" : "transparent", color: boardFullscreen ? "var(--orange2)" : "var(--dim)", cursor: "pointer", fontSize: "0.78em", whiteSpace: "nowrap" }}
        >
          {boardFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {boardFullscreen ? "Salir" : "Pantalla completa"}
        </button>
      </div>
      {projView === "board" && (
        <div className="board">
          {state.projects.length === 0 && <div style={{ gridColumn: "1/-1" }}><EmptyState title="Sin proyectos aún" hint="Crea un proyecto para organizar tu trabajo." icon={<FolderTree />} action={<button className="add-btn" style={{ width: "auto", padding: "8px 16px" }} onClick={onNew}>+ Nuevo</button>} /></div>}
          {STATUS.map(s => {
            const items = fp.filter(p => p.status === s.id).sort((a, b) => (prioW(a.prio) - prioW(b.prio)) || ((a.stageSince||0) - (b.stageSince||0)));
            return (
              <div key={s.id} className={`col ${dragOver === s.id ? "dragover" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(s.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => dropProj(s.id)}>
                <h3><span className="top"><span className="dot" style={{ background: s.color }} />{s.label}</span><span className="n">{items.length}</span></h3>
                {items.length ? items.map(p => <ProjCard key={p.id} p={p} tasks={apiTasks} onClick={() => onOpenProject(p.id)} onDragStart={e => { setDragId(p.id); e.dataTransfer.setData("text/plain", p.id); }} onDragEnd={() => { setDragId(null); setDragOver(null); }} onRetryDrive={retryDriveFolder} retryingDrive={retryingDriveIds.has(p.id)} />) : <div className="col-empty">—</div>}
              </div>
            );
          })}
        </div>
      )}
      {projView === "scrum" && canManage && (
        <div className="flex justify-end mb-2">
          <Dictado
            tipo="tareas"
            etiquetaDestino={(item: ItemDictado) => {
              const p = state.projects.find((x) => x.id === item.projectRef);
              return p ? p.name : "Sin proyecto";
            }}
            onCrear={async (items: ItemDictado[]) => {
              for (const item of items) {
                await crearTareaHub({
                  title: item.title,
                  notes: item.notes,
                  priority: item.priority,
                  projectRef: item.projectRef ?? null,
                });
              }
              onRefreshTasks();
              onToast(`${items.length} tarea(s) al Backlog`);
            }}
          />
        </div>
      )}
      {projView === "scrum" && (
        <>
          <BoardNav
            nav={scrumNav}
            stages={TASK_STAGES.map(s => ({ id: s.id, label: s.label, count: ft.filter(t => t.stage === s.id).length, color: s.color }))}
          />
          <BoardScroller nav={scrumNav}>
          <div
            className="board scrum6 bnav-scroll"
            ref={scrumNav.ref}
            data-dragging={dragId ? "true" : undefined}
            onDragOver={e => {
              // Auto-scroll horizontal al arrastrar cerca de los bordes, para
              // poder soltar la tarjeta en columnas fuera de pantalla.
              const el = e.currentTarget as HTMLDivElement;
              const r = el.getBoundingClientRect();
              if (e.clientX > r.right - 70) el.scrollLeft += 16;
              else if (e.clientX < r.left + 70) el.scrollLeft -= 16;
            }}
          >
          {!state.projects.length && !apiTasks.length && <div style={{ gridColumn: "1/-1" }}><EmptyState title="Tablero Scrum vacío" hint="Crea un proyecto primero, luego añade tareas." icon={<LayoutDashboard />} action={<button className="add-btn" style={{ width: "auto", padding: "8px 16px" }} onClick={onNew}>+ Nuevo</button>} /></div>}
          {TASK_STAGES.map(s => {
            const items = ft.filter(t => t.stage === s.id).sort((a, b) => (prioW(a.priority) - prioW(b.priority)) || (a.orderIndex - b.orderIndex));
            return (
              <div key={s.id} className={`col ${dragOver === s.id ? "dragover" : ""}`} data-bnav-col
                onDragOver={e => { e.preventDefault(); setDragOver(s.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => void dropTask(s.id)}>
                <h3><span className="top"><span className="dot" style={{ background: s.color }} />{s.label}</span><span className="n">{items.length}</span></h3>
                {items.length ? items.map(t => <TaskCard key={t.id} t={t} projects={state.projects} onClick={() => onOpenTask(t.id)} onDragStart={e => { setDragId(String(t.id)); e.dataTransfer.setData("text/plain", String(t.id)); }} onDragEnd={() => { setDragId(null); setDragOver(null); }} onDelete={canManage ? () => onDeleteTask(t.id) : undefined} />) : <div className="col-empty">—</div>}
              </div>
            );
          })}
          </div>
          </BoardScroller>
        </>
      )}
    </div>
  );
}

