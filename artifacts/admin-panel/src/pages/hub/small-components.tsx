import { useState, useEffect } from "react";
import { useListDriveFiles, useListDriveFolders } from "@workspace/api-client-react";
import type { Client, HubTask, Project, Task } from "./shared";
import { CRIT_COLOR, dueInfo, fmtDur, prioW, projProg, STATUS, TASK_STAGES, timerClass } from "./shared";

/* ============================================================
   ORBIT SVG
   ============================================================ */
export function buildOrbitSvg(projects: Project[]): string {
  const W = 460, H = 340;
  const esc = (s: string) => (s || "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c] || c));
  const groups = STATUS.map(s => ({ s, items: projects.filter(p => p.status === s.id).sort((a, b) => prioW(a.prio) - prioW(b.prio)) }));
  let defs = `<defs><filter id="nglow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="centerGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="var(--orange)" stop-opacity=".13"/><stop offset="100%" stop-color="var(--orange)" stop-opacity="0"/></radialGradient>`;
  let base = `<ellipse cx="${W/2}" cy="${H/2-12}" rx="205" ry="118" fill="url(#centerGlow)"/>`;
  const pos: Record<string, { x: number; y: number; p: Project; color: string }> = {};
  groups.forEach((g, gi) => {
    const x = 36 + gi * 97, n = g.items.length;
    const gap = Math.min(48, 240 / Math.max(n, 1));
    const y0 = (H - 44) / 2 - ((n - 1) * gap) / 2 + 8;
    g.items.forEach((p, i) => { pos[p.id] = { x: x + (n > 1 ? ((i % 2) ? 9 : -9) : 0), y: y0 + i * gap, p, color: g.s.color }; });
    base += `<line x1="${x}" y1="32" x2="${x}" y2="${H-48}" stroke="var(--line)" stroke-opacity=".38" stroke-dasharray="1 7"/>`;
    base += `<text x="${x}" y="${H-18}" text-anchor="middle" font-family="IBM Plex Mono" font-size="8.5" letter-spacing="1.5" fill="${n?"var(--dim)":"var(--faint)"}">${g.s.label.toUpperCase()} · ${n}</text>`;
  });
  if (!projects.length) return defs + `</defs>${base}<text x="${W/2}" y="${H/2}" text-anchor="middle" font-family="IBM Plex Mono" font-size="10" letter-spacing="1" fill="var(--faint)">SIN PROYECTOS ACTIVOS</text>`;
  const ne = groups.filter(g => g.items.length);
  let links = "", pulses = "", li = 0;
  for (let k = 0; k < ne.length - 1; k++) {
    const A = ne[k], Bg = ne[k + 1];
    A.items.forEach(a => {
      let targets = Bg.items;
      if (A.items.length * Bg.items.length > 14) targets = [...Bg.items].sort((u, v) => Math.abs(pos[u.id].y - pos[a.id].y) - Math.abs(pos[v.id].y - pos[a.id].y)).slice(0, 2);
      targets.forEach(b => {
        const Ap = pos[a.id], Bp = pos[b.id], mx = (Ap.x + Bp.x) / 2, id = "nl" + li++;
        defs += `<linearGradient id="lg${id}" gradientUnits="userSpaceOnUse" x1="${Ap.x}" y1="0" x2="${Bp.x}" y2="0"><stop offset="0%" stop-color="${Ap.color}"/><stop offset="100%" stop-color="${Bp.color}"/></linearGradient>`;
        links += `<path id="${id}" class="nn-link" data-a="${a.id}" data-b="${b.id}" d="M${Ap.x} ${Ap.y} C ${mx} ${Ap.y}, ${mx} ${Bp.y}, ${Bp.x} ${Bp.y}" stroke="url(#lg${id})"/>`;
        if (li % 3 === 1) {
          const dur = (2.4 + (li % 5) * 0.55).toFixed(2);
          pulses += `<circle r="2" fill="${Bp.color}" opacity=".9"><animateMotion dur="${dur}s" begin="${((li%7)*0.4).toFixed(1)}s" repeatCount="indefinite" path="M${Ap.x} ${Ap.y} C ${mx} ${Ap.y}, ${mx} ${Bp.y}, ${Bp.x} ${Bp.y}"/></circle>`;
        }
      });
    });
  }
  defs += "</defs>";
  let nodes = "";
  Object.values(pos).forEach(o => {
    const rad = o.p.prio === "crítica" ? 12 : o.p.prio === "alta" ? 10 : o.p.prio === "media" ? 8 : 6.5;
    const lbl = (o.p.client || o.p.name).slice(0, 16);
    const lx = o.x > W - 95 ? -1 : 1;
    nodes += `<g class="nn-node" data-id="${o.p.id}" transform="translate(${o.x},${o.y})"><circle class="halo" r="${rad+7}" fill="${o.color}" opacity=".12"/><circle class="n-dot" r="${rad}" fill="${o.color}" fill-opacity=".9" stroke="${o.color}" stroke-width="1.5" filter="url(#nglow)"/><text class="lbl" x="${lx*(rad+9)}" y="3.5" text-anchor="${lx>0?"start":"end"}" font-family="IBM Plex Mono" font-size="8.5" fill="var(--text)" stroke="var(--bg2)" stroke-width="3" paint-order="stroke">${esc(lbl)}</text><title>${esc(o.p.name)} — ${esc(o.p.client||"")}</title></g>`;
  });
  return defs + base + links + pulses + nodes;
}

/* ============================================================
   SUB-COMPONENTES REUTILIZABLES
   ============================================================ */
export function DueChip({ p }: { p: Project }) {
  const d = dueInfo(p);
  if (!d) return null;
  return <span className={`chip due ${d.cls}`}>{d.days < 0 ? "venció " : "vence "}{d.label}</span>;
}

/** Datalist con los clientes existentes: permite elegir uno o escribir uno nuevo. */
export function ClientOptions({ clients }: { clients: Client[] }) {
  return <datalist id="hub-client-options">{clients.map(c => <option key={c.id} value={c.name} />)}</datalist>;
}

export function StageTimer({ since }: { since: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  void tick;
  const ms = Date.now() - since;
  return <div className={`stage-timer ${timerClass(ms)}`}><span className="clk">⏱</span> {fmtDur(ms)}</div>;
}

export function DriveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={12} height={12} style={{ flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

/** Extract a Google Drive folder ID from a Drive URL, or null if not a folder link. */
export function extractDriveFolderId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Compact, browsable Drive folder panel rendered inside the project detail sheet. */
export function ProjectDriveInline({ folderId, rootName = "Carpeta del proyecto" }: { folderId: string; rootName?: string }) {
  const [currentId, setCurrentId] = useState<string>(folderId);
  const [history, setHistory] = useState<{ id: string; name: string }[]>([{ id: folderId, name: rootName }]);
  const [expanded, setExpanded] = useState(false);

  const { data: filesData, isLoading: filesLoading, error: filesError } = useListDriveFiles({ folderId: currentId });
  const { data: foldersData, isLoading: foldersLoading, error: foldersError } = useListDriveFolders({ parentId: currentId });

  const isLoading = filesLoading || foldersLoading;
  // Un fallo NO es una carpeta vacía. Este era el tercer explorador que los
  // pintaba igual: sin permiso de Drive, o con la raíz mal apuntada, decía
  // "La carpeta está vacía" y no había forma de enterarse.
  const fallo = filesError || foldersError;
  const folders = foldersData || [];
  const files = filesData?.files || [];
  const empty = !isLoading && !fallo && folders.length === 0 && files.length === 0;

  const goInto = (id: string, name: string) => {
    setHistory(prev => [...prev, { id, name }]);
    setCurrentId(id);
  };
  const goBack = () => {
    if (history.length <= 1) return;
    const next = history.slice(0, -1);
    setHistory(next);
    setCurrentId(next[next.length - 1].id);
  };

  return (
    <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
      {/* Header / toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--card2)", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width={16} height={16} style={{ color: "var(--orange2)", flexShrink: 0 }}><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", flex: 1 }}>Archivos en Drive</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={14} height={14} style={{ color: "var(--dim)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s" }}><path d="M6 9l6 6 6-6"/></svg>
      </button>

      {expanded && (
        <div style={{ background: "var(--card1)" }}>
          {/* Breadcrumb */}
          {history.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--line)", background: "var(--card2)" }}>
              <button onClick={goBack} style={{ padding: "3px 8px", background: "var(--card1)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 11, color: "var(--dim)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={12} height={12}><path d="M15 18l-6-6 6-6"/></svg>
                Atrás
              </button>
              <div style={{ fontSize: 12, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {history.map((h, i) => (
                  <span key={h.id}>
                    <span style={{ color: i === history.length - 1 ? "var(--text)" : "var(--faint)" }}>{h.name}</span>
                    {i < history.length - 1 && <span style={{ margin: "0 4px" }}>/</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Contents */}
          <div style={{ maxHeight: 300, overflowY: "auto", padding: "8px 0" }}>
            {isLoading && (
              <div style={{ padding: "16px 14px", fontSize: 12, color: "var(--faint)" }}>Cargando…</div>
            )}
            {fallo && (
              <div style={{ padding: "16px 14px", fontSize: 12 }}>
                <div style={{ color: "#f87171", fontWeight: 600 }}>No se pudo leer esta carpeta.</div>
                <div style={{ marginTop: 4, color: "var(--faint)" }}>
                  {(fallo as Error).message || "El servidor devolvió un error."} Si es de otra persona,
                  pídele que la comparta con tu cuenta.
                </div>
              </div>
            )}
            {empty && (
              <div style={{ padding: "16px 14px", fontSize: 12, color: "var(--faint)" }}>La carpeta está vacía.</div>
            )}
            {folders.map(folder => (
              <button key={folder.id} onClick={() => goInto(folder.id, folder.name)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "none", border: "none", borderBottom: "1px solid var(--line)", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--card2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width={16} height={16} style={{ color: "var(--orange2)", flexShrink: 0 }}><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>
                <span style={{ fontSize: 12.5, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={12} height={12} style={{ color: "var(--faint)", flexShrink: 0 }}><path d="M9 18l6-6-6-6"/></svg>
              </button>
            ))}
            {files.map(file => (
              <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid var(--line)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={16} height={16} style={{ color: "#6aa0c0", flexShrink: 0 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span style={{ fontSize: 12.5, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file.name}>{file.name}</span>
                {file.webViewLink && (
                  <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
                    style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: "var(--orange2)", textDecoration: "none", padding: "2px 6px", border: "1px solid var(--orange-line)", borderRadius: 5, background: "var(--orange-soft)" }}>
                    ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjCard({ p, tasks, onClick, onDragStart, onDragEnd, onRetryDrive, retryingDrive }: {
  p: Project; tasks: HubTask[]; onClick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
  /** Reintenta crear la carpeta automática cuando el primer intento falló. */
  onRetryDrive?: (p: Project) => void; retryingDrive?: boolean;
}) {
  const prog = projProg(p.id, tasks);
  return (
    <div className="pcard" draggable onClick={onClick} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="pt">{p.name}</div>
      <div className="cl">{p.client}</div>
      <div className="meta">
        <span className={`chip prio-${p.prio}`}>{p.prio}</span>
        <span className="chip">{p.type}</span>
        {p.owner && p.owner.trim() !== "—" && <span className="chip">{p.owner}</span>}
        <DueChip p={p} />
        {p.link && (
          <a href={p.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--orange2)", borderColor: "var(--orange-line)", textDecoration: "none" }}>
            <DriveIcon /> Drive
          </a>
        )}
        {/* Sin carpeta porque el intento automático falló (no porque nadie la
            vinculó todavía): se avisa aquí, en la tarjeta, para que no haga
            falta abrir el proyecto para enterarse. */}
        {!p.link && p.driveFolderError && (
          <button type="button" className="chip drive-warn" title={`No se pudo crear la carpeta: ${p.driveFolderError}`}
            onClick={e => { e.stopPropagation(); if (!retryingDrive) onRetryDrive?.(p); }} disabled={retryingDrive}>
            ⚠ {retryingDrive ? "Creando…" : "Sin carpeta · Reintentar"}
          </button>
        )}
      </div>
      <div className="bar-prog"><i style={{ width: prog.pct + "%" }} /></div>
      {prog.total > 0 && <div style={{ fontSize: "0.68em", color: "var(--muted)", marginTop: 2, textAlign: "right" }}>{prog.done}/{prog.total} tareas</div>}
      <StageTimer since={p.stageSince || p.updatedAt || p.createdAt || Date.now()} />
    </div>
  );
}

export function TaskCard({ t, projects, onClick, onDragStart, onDragEnd, onDelete }: { t: HubTask; projects: Project[]; onClick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onDelete?: () => void }) {
  const proj = projects.find(p => p.id === t.projectRef);
  const cl = t.checklist ?? [];
  const clDone = cl.filter(i => i.done).length;
  return (
    <div className="pcard tcard tcard--compact" draggable onClick={onClick} onDragStart={onDragStart} onDragEnd={onDragEnd}
      style={{ borderLeft: `3px solid ${CRIT_COLOR[t.priority] || "var(--line)"}`, position: "relative" }}>
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Eliminar tarea"
          style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", color: "var(--faint)", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: 3, borderRadius: 4 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#cc4444"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--faint)"; }}
        >✕</button>
      )}
      <div className="tcard-title" style={onDelete ? { paddingRight: 16 } : undefined}>{t.title}</div>
      <div className="tcard-meta">
        <span className={`chip prio-${t.priority}`}>{t.priority}</span>
        {t.origin && (
          <span
            className="chip"
            style={{ background: "rgba(56,152,236,.14)", color: "#5aa9f0" }}
            title={t.origin === "arranque_ia"
              ? "Requerimiento generado con IA al activarse el proyecto"
              : t.origin === "contenido_ia"
                ? "Tarea del plan semanal de contenido generado con IA"
                : "Requerimiento generado automáticamente desde el brief al activarse el proyecto"}
          >
            ⚡ {t.origin === "arranque_brief" ? "auto" : "IA"}
          </span>
        )}
        {t.pareja && (
          <span
            className="chip"
            style={t.pareja.stage === "done"
              ? { background: "rgba(29,184,123,.14)", color: "#1db87b" }
              : { background: "rgba(139,92,246,.14)", color: "#a78bfa" }}
            title={`Tarea enlazada: “${t.pareja.title}”${t.pareja.assigneeName ? ` (${t.pareja.assigneeName})` : ""} — contenido en par redes ↔ edición`}
          >
            🔗 {t.pareja.stage === "done" ? "par listo" : "en par"}
          </span>
        )}
        <span className="tcard-proj">{proj ? proj.name : "—"}</span>
        {t.assignee && <span className="tcard-timer" title={`Asignada a ${t.assignee.name || ""}`}>👤 {(t.assignee.name || "").split(" ")[0]}</span>}
        {cl.length > 0 && <span className="tcard-timer" title="Checklist" style={clDone === cl.length ? { color: "#1db87b" } : undefined}>☑ {clDone}/{cl.length}</span>}
        {t.dueDate && <span className="tcard-timer">{t.dueDate}</span>}
      </div>
    </div>
  );
}

export function StageTimerInline({ since }: { since: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(t); }, []);
  void tick;
  const ms = Date.now() - since;
  return <span className={`tcard-timer ${timerClass(ms)}`}>⏱{fmtDur(ms)}</span>;
}

export function StageBreakdown({ t }: { t: Task }) {
  const now = Date.now();
  return (
    <div className="stage-breakdown">
      {TASK_STAGES.map(s => {
        let ms = (t.stageTime?.[s.id]) || 0;
        const isNow = t.stage === s.id;
        if (isNow) ms += now - (t.stageSince || now);
        if (!ms && !isNow) return null;
        return (
          <div key={s.id} className={`sbrow ${isNow ? "now" : ""}`}>
            <span className="sbl"><span className="sbdot" style={{ background: s.color }} />{s.label}{isNow ? " · actual" : ""}</span>
            <span className="sbv">{fmtDur(ms)}</span>
          </div>
        );
      })}
    </div>
  );
}

