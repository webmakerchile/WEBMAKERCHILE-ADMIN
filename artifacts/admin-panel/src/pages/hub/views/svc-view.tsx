import { useState, useEffect, useCallback, useMemo } from "react";
import { EmptyState, SkeletonShimmer } from "@/components/hub-kit";
import { ConfigRecordatorios } from "@/components/config-recordatorios";
import { FolderTree, Package, AlertTriangle } from "lucide-react";
import type { HubService, HubServiceTier } from "../shared";
import { HUB_API_BASE } from "../shared";

export interface SvcDraft { name: string; category: string; description: string; includes: string; note: string; tiers: HubServiceTier[]; }
export const emptySvcDraft = (category: string): SvcDraft => ({
  name: "", category, description: "", includes: "", note: "",
  tiers: [
    { plan: "Inicia", price: "", detail: "" },
    { plan: "Escala", price: "", detail: "" },
    { plan: "Domina", price: "", detail: "" },
  ],
});

/** Playbooks: plantillas de proceso por tipo de trabajo. Se administran junto al catálogo. */
export type PlaybookRow = { id: number; name: string; workType: string; description: string; archived: boolean; tasks: Array<{ title: string; notes?: string; priority?: string }> };

export type SlaPolicyRow = { id: number; entityType: string; stage: string; maxHours: number };

export const SLA_TYPE_LABELS: Record<string, string> = { task: "Tareas", ticket: "Tickets", video: "Videos", project: "Proyectos", contract: "Contratos" };
export const SLA_STAGE_LABELS: Record<string, string> = {
  backlog: "Backlog", sprint: "Sprint", doing: "En curso", qa_sent: "QA enviado", qa_rev: "QA revisión",
  abierto: "Abierto", en_progreso: "En progreso", en_revision: "En revisión",
  borrador: "Borrador", aprobado: "Aprobado (sin programar)",
  lead: "Lead", disc: "Descubrimiento", dev: "Desarrollo", rev: "Revisión",
};

/** SLA por etapa: horas máximas antes de avisar al responsable y a la dirección. */
export function SlaManager({ canManage, showToast }: { canManage: boolean; showToast: (msg: string) => void }) {
  const [rows, setRows] = useState<SlaPolicyRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${HUB_API_BASE}/sla/policies`, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRows(Array.isArray(data.policies) ? data.policies : []);
    } catch { setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const savePolicy = async (p: SlaPolicyRow) => {
    const raw = drafts[p.id];
    if (raw === undefined) return;
    const maxHours = parseInt(raw, 10);
    if (isNaN(maxHours) || maxHours < 0) { showToast("Horas inválidas"); return; }
    const res = await fetch(`${HUB_API_BASE}/sla/policies/${p.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxHours }),
    });
    if (res.ok) { showToast("SLA actualizado"); setDrafts(d => { const n = { ...d }; delete n[p.id]; return n; }); load(); }
    else { const b = await res.json().catch(() => ({})); showToast(b.error || "No se pudo guardar"); }
  };

  const byType = new Map<string, SlaPolicyRow[]>();
  for (const p of rows ?? []) {
    if (!byType.has(p.entityType)) byType.set(p.entityType, []);
    byType.get(p.entityType)!.push(p);
  }

  return (
    <div className="svc-cat" style={{ marginTop: 28 }}>
      <div className="svc-toolbar">
        <div className="hint" style={{ flex: "1 1 240px" }}>
          <b>SLA por etapa</b> — horas máximas esperadas en cada estado. Al pasarse, se avisa al responsable y a la dirección y se pide el motivo del atraso (0 = sin límite).
        </div>
      </div>
      {rows === null && <SkeletonShimmer style={{ height: 120, margin: "24px 0" }} />}
      {Array.from(byType.entries()).map(([type, policies]) => (
        <div key={type} className="svc">
          <div className="sh"><h3>{SLA_TYPE_LABELS[type] ?? type}</h3></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
            {policies.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85em" }}>
                <span style={{ color: "var(--muted)" }}>{SLA_STAGE_LABELS[p.stage] ?? p.stage}:</span>
                {canManage ? (
                  <>
                    <input
                      type="number" min={0} style={{ width: 70 }}
                      value={drafts[p.id] ?? String(p.maxHours)}
                      onChange={e => setDrafts(d => ({ ...d, [p.id]: e.target.value }))}
                    />
                    <span>h</span>
                    {drafts[p.id] !== undefined && drafts[p.id] !== String(p.maxHours) && (
                      <button className="svc-act" onClick={() => savePolicy(p)}>Guardar</button>
                    )}
                  </>
                ) : (
                  <b>{p.maxHours}h</b>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlaybooksManager({ canManage, showToast }: { canManage: boolean; showToast: (msg: string) => void }) {
  const [rows, setRows] = useState<PlaybookRow[] | null>(null);
  const [editor, setEditor] = useState<{ id: number | null; name: string; workType: string; description: string; tasksText: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${HUB_API_BASE}/hub/playbooks`, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRows(Array.isArray(data.playbooks) ? data.playbooks : []);
    } catch { setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editor) return;
    const tasks = editor.tasksText.split("\n").map(l => l.trim()).filter(Boolean).map(l => ({ title: l.slice(0, 200) }));
    if (!editor.name.trim()) { showToast("Ponle nombre al playbook"); return; }
    setSaving(true);
    try {
      const res = await fetch(
        editor.id === null ? `${HUB_API_BASE}/hub/playbooks` : `${HUB_API_BASE}/hub/playbooks/${editor.id}`,
        {
          method: editor.id === null ? "POST" : "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editor.name.trim(), workType: editor.workType.trim(), description: editor.description.trim(), tasks }),
        },
      );
      if (!res.ok) { const b = await res.json().catch(() => ({})); showToast(b.error || "No se pudo guardar"); return; }
      setEditor(null); showToast("Playbook guardado"); load();
    } finally { setSaving(false); }
  };

  const setArchivedPb = async (pb: PlaybookRow, archived: boolean) => {
    const res = await fetch(`${HUB_API_BASE}/hub/playbooks/${pb.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    if (res.ok) { showToast(archived ? "Playbook archivado" : "Playbook restaurado"); load(); }
    else showToast("No se pudo actualizar");
  };

  const active = (rows ?? []).filter(p => !p.archived);
  const archived = (rows ?? []).filter(p => p.archived);

  return (
    <div className="svc-cat" style={{ marginTop: 28 }}>
      <div className="svc-toolbar">
        <div className="hint" style={{ flex: "1 1 240px" }}>
          <b>Playbooks</b> — plantillas de proceso por tipo de trabajo. Al crear un proyecto puedes elegir uno y se generan sus tareas estándar.
        </div>
        {canManage && <button className="svc-new" onClick={() => setEditor({ id: null, name: "", workType: "", description: "", tasksText: "" })}>+ Nuevo playbook</button>}
      </div>
      {rows === null && <SkeletonShimmer style={{ height: 120, margin: "24px 0" }} />}
      {rows !== null && active.length === 0 && <EmptyState title="No hay playbooks activos" hint="Crea una plantilla de proceso para estandarizar tus tareas." icon={<FolderTree />} />}
      {active.map(pb => (
        <div key={pb.id} className="svc">
          <div className="sh">
            <h3>{pb.name} <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.8em" }}>· {pb.tasks.length} tareas{pb.workType ? ` · ${pb.workType}` : ""}</span></h3>
            {canManage && (
              <div className="svc-acts">
                <button className="svc-act" onClick={() => setEditor({ id: pb.id, name: pb.name, workType: pb.workType, description: pb.description, tasksText: pb.tasks.map(t => t.title).join("\n") })}>Editar</button>
                <button className="svc-act" onClick={() => setArchivedPb(pb, true)}>Archivar</button>
              </div>
            )}
          </div>
          {pb.description && <div className="sd">{pb.description}</div>}
          <div className="incl"><b>Tareas:</b> {pb.tasks.map(t => t.title).join(" · ")}</div>
        </div>
      ))}
      {archived.length > 0 && canManage && (
        <div style={{ marginTop: 10 }}>
          {archived.map(pb => (
            <div key={pb.id} className="svc" style={{ opacity: 0.55 }}>
              <div className="sh"><h3>{pb.name} <span style={{ fontWeight: 400, fontSize: "0.8em" }}>(archivado)</span></h3>
                <div className="svc-acts"><button className="svc-act" onClick={() => setArchivedPb(pb, false)}>Restaurar</button></div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editor && (
        <div className="svc" style={{ border: "1px solid var(--accent, #ff7800)", marginTop: 12 }}>
          <div className="field"><label>Nombre</label><input type="text" value={editor.name} onChange={e => setEditor({ ...editor, name: e.target.value })} placeholder="Ej: Sitio Web" /></div>
          <div className="two field">
            <div><label>Tipo de trabajo</label><input type="text" value={editor.workType} onChange={e => setEditor({ ...editor, workType: e.target.value })} placeholder="Sitio Web, Campaña…" /></div>
            <div><label>Descripción</label><input type="text" value={editor.description} onChange={e => setEditor({ ...editor, description: e.target.value })} /></div>
          </div>
          <div className="field">
            <label>Tareas estándar (una por línea)</label>
            <textarea rows={8} value={editor.tasksText} onChange={e => setEditor({ ...editor, tasksText: e.target.value })} placeholder={"Kickoff con el cliente\nDiseño UI\nQA y publicación"} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="save" disabled={saving} onClick={save}>{saving ? "Guardando…" : "Guardar playbook"}</button>
            <button className="svc-act" onClick={() => setEditor(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SvcView({ canManage, showToast }: { canManage: boolean; showToast: (msg: string) => void }) {
  const [services, setServices] = useState<HubService[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<{ id: number | null; draft: SvcDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch(`${HUB_API_BASE}/hub/services`, { credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setServices(Array.isArray(data.services) ? data.services : []);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => (services ?? []).filter(s => !s.archived), [services]);
  const archived = useMemo(() => (services ?? []).filter(s => s.archived), [services]);
  const grouped = useMemo(() => {
    const map = new Map<string, HubService[]>();
    active.forEach(s => {
      const arr = map.get(s.category);
      if (arr) arr.push(s); else map.set(s.category, [s]);
    });
    return Array.from(map.entries()).map(([cat, items]) => ({ cat, items }));
  }, [active]);
  const categories = useMemo(() => Array.from(new Set((services ?? []).map(s => s.category))), [services]);

  const apiCall = useCallback(async (path: string, init?: RequestInit): Promise<{ ok: boolean; body: any }> => {
    try {
      const res = await fetch(`${HUB_API_BASE}${path}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      let body: any = null;
      try { body = await res.json(); } catch { /* sin cuerpo */ }
      return { ok: res.ok, body };
    } catch {
      return { ok: false, body: { error: "Error de conexión" } };
    }
  }, []);

  const patchDraft = (p: Partial<SvcDraft>) => setEditor(e => (e ? { ...e, draft: { ...e.draft, ...p } } : e));
  const setTier = (i: number, p: Partial<HubServiceTier>) =>
    setEditor(e => (e ? { ...e, draft: { ...e.draft, tiers: e.draft.tiers.map((t, ti) => (ti === i ? { ...t, ...p } : t)) } } : e));
  const addTier = () => setEditor(e => (e && e.draft.tiers.length < 6 ? { ...e, draft: { ...e.draft, tiers: [...e.draft.tiers, { plan: "", price: "", detail: "" }] } } : e));
  const removeTier = (i: number) => setEditor(e => (e ? { ...e, draft: { ...e.draft, tiers: e.draft.tiers.filter((_, ti) => ti !== i) } } : e));

  const openNew = () => { setSaveError(null); setEditor({ id: null, draft: emptySvcDraft(grouped[0]?.cat || "") }); };
  const openEdit = (s: HubService) => {
    setSaveError(null);
    setEditor({ id: s.id, draft: { name: s.name, category: s.category, description: s.description, includes: s.includes, note: s.note, tiers: s.tiers.map(t => ({ ...t })) } });
  };

  const save = async () => {
    if (!editor) return;
    const d = editor.draft;
    const tiers = d.tiers
      .filter(t => t.plan.trim() || t.price.trim() || t.detail.trim())
      .map(t => ({ plan: t.plan.trim(), price: t.price.trim(), detail: t.detail.trim() }));
    if (!d.name.trim() || !d.category.trim()) { setSaveError("Nombre y categoría son obligatorios"); return; }
    if (tiers.some(t => !t.plan)) { setSaveError("Cada plan necesita un nombre (ej: Inicia)"); return; }
    const payload = { name: d.name.trim(), category: d.category.trim(), description: d.description.trim(), includes: d.includes.trim(), note: d.note.trim(), tiers };
    setSaving(true); setSaveError(null);
    const { ok, body } = editor.id == null
      ? await apiCall("/hub/services", { method: "POST", body: JSON.stringify(payload) })
      : await apiCall(`/hub/services/${editor.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    setSaving(false);
    if (!ok) { setSaveError(body?.error || "No se pudo guardar el servicio"); return; }
    const wasNew = editor.id == null;
    setEditor(null);
    showToast(wasNew ? "Servicio creado" : "Servicio actualizado");
    load();
  };

  const duplicate = async (s: HubService) => {
    setBusyId(s.id);
    const { ok, body } = await apiCall(`/hub/services/${s.id}/duplicate`, { method: "POST" });
    setBusyId(null);
    if (ok) { showToast(`"${s.name}" duplicado`); load(); }
    else showToast(body?.error || "No se pudo duplicar");
  };

  const setArchived = async (s: HubService, arch: boolean) => {
    setBusyId(s.id);
    const { ok, body } = await apiCall(`/hub/services/${s.id}`, { method: "PATCH", body: JSON.stringify({ archived: arch }) });
    setBusyId(null);
    if (ok) { showToast(arch ? "Servicio archivado" : "Servicio restaurado"); load(); }
    else showToast(body?.error || "No se pudo actualizar");
  };

  const move = async (s: HubService, dir: -1 | 1) => {
    if (reordering) return; // serializa: un reorder en vuelo a la vez
    const g = grouped.find(x => x.cat === s.category);
    if (!g) return;
    const idx = g.items.findIndex(x => x.id === s.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= g.items.length) return;
    const swapped = [...g.items];
    [swapped[idx], swapped[j]] = [swapped[j]!, swapped[idx]!];
    const flat: number[] = [];
    grouped.forEach(x => (x.cat === s.category ? swapped : x.items).forEach(it => flat.push(it.id)));
    archived.forEach(it => flat.push(it.id));
    const prev = services;
    const orderMap = new Map(flat.map((id, i) => [id, (i + 1) * 10]));
    setReordering(true);
    setServices(sv => (sv ?? [])
      .map(x => ({ ...x, sortOrder: orderMap.get(x.id) ?? x.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
    const { ok, body } = await apiCall("/hub/services/reorder", { method: "POST", body: JSON.stringify({ ids: flat }) });
    setReordering(false);
    if (!ok) {
      setServices(prev);
      showToast(body?.error || "No se pudo reordenar");
      load(); // re-sincroniza con el servidor (ej: 409 por catálogo desfasado)
    } else if (Array.isArray(body?.services)) {
      setServices(body.services);
    }
  };

  return (
    <div className="wrap">
      <div className="svc-toolbar">
        <div className="hint" style={{ flex: "1 1 240px" }}>
          Catálogo de referencia del equipo.{" "}
          {canManage ? "Crea, edita, reordena o archiva servicios según los acuerdos vigentes." : "Solo CEO/Ejecutivo pueden modificar el catálogo."}
        </div>
        {canManage && <button className="svc-new" onClick={openNew}>+ Nuevo servicio</button>}
      </div>

      {services === null && !loadError && <SkeletonShimmer style={{ height: 160, margin: "24px 0" }} />}
      {loadError && services === null && (
        <EmptyState title="Error de conexión" hint="No se pudo cargar el catálogo de servicios." icon={<AlertTriangle />} action={<button className="add-btn" style={{ width: "auto", padding: "8px 16px" }} onClick={load}>Reintentar</button>} />
      )}
      {services !== null && active.length === 0 && (
        <EmptyState title="Catálogo vacío" hint={canManage ? "Crea el primer servicio para definir el catálogo." : "No hay servicios definidos aún."} icon={<Package />} action={canManage ? <button className="add-btn" style={{ width: "auto", padding: "8px 16px" }} onClick={openNew}>+ Nuevo servicio</button> : undefined} />
      )}

      {grouped.map(g => (
        <div key={g.cat} className="svc-cat">
          <h2>{g.cat} <span className="n">· {g.items.length}</span></h2>
          {g.items.map((s, i) => (
            <div key={s.id} className="svc">
              <div className="sh">
                <h3>{s.name}</h3>
                {canManage && (
                  <div className="svc-acts">
                    <button className="svc-act" title="Subir" aria-label={`Subir ${s.name}`} disabled={i === 0 || busyId === s.id || reordering} onClick={() => move(s, -1)}>↑</button>
                    <button className="svc-act" title="Bajar" aria-label={`Bajar ${s.name}`} disabled={i === g.items.length - 1 || busyId === s.id || reordering} onClick={() => move(s, 1)}>↓</button>
                    <button className="svc-act" onClick={() => openEdit(s)}>Editar</button>
                    <button className="svc-act" disabled={busyId === s.id} onClick={() => duplicate(s)}>Duplicar</button>
                    <button className="svc-act" disabled={busyId === s.id} onClick={() => setArchived(s, true)}>Archivar</button>
                  </div>
                )}
              </div>
              {s.description && <div className="sd">{s.description}</div>}
              {s.includes && <div className="incl"><b>Incluye:</b> {s.includes}</div>}
              {s.tiers.length > 0 ? (
                <div className="tiers">
                  {s.tiers.map((t, ti) => (
                    <div key={ti} className={`tier ${ti === 1 ? "t2" : ""}`}>
                      <div className="tn">{t.plan}</div>
                      <div className={`tp ${!t.price || t.price === "—" ? "muted" : ""}`}>{t.price || "—"}</div>
                      {t.detail && <div className="tx">{t.detail}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="incl" style={{ color: "var(--orange2)" }}>Se cotiza según alcance.</div>
              )}
              {s.note && <div className="note-line">{s.note}</div>}
            </div>
          ))}
        </div>
      ))}

      {archived.length > 0 && (
        <div className="svc-archived">
          <button className="svc-arch-toggle" onClick={() => setShowArchived(v => !v)}>
            {showArchived ? "▾" : "▸"} Archivados ({archived.length})
          </button>
          {showArchived && archived.map(s => (
            <div key={s.id} className="svc svc--archived">
              <div className="sh">
                <h3>{s.name}</h3>
                <div className="svc-acts">
                  <span className="svc-arch-cat">{s.category}</span>
                  {canManage && <button className="svc-act" disabled={busyId === s.id} onClick={() => setArchived(s, false)}>Restaurar</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <>
          <div className="overlay" onClick={() => { if (!saving) setEditor(null); }} />
          <div className="sheet" role="dialog" aria-label={editor.id == null ? "Nuevo servicio" : "Editar servicio"}>
            <div className="sheet-head">
              <h2>{editor.id == null ? "Nuevo servicio" : "Editar servicio"}</h2>
              <button className="close-btn" onClick={() => setEditor(null)}>✕</button>
            </div>
            <div className="field">
              <label>Nombre *</label>
              <input type="text" value={editor.draft.name} maxLength={120} placeholder="Ej: Landing Page" onChange={e => patchDraft({ name: e.target.value })} />
            </div>
            <div className="field">
              <label>Categoría *</label>
              <input type="text" list="svc-cats" value={editor.draft.category} maxLength={60} placeholder="Ej: 🌐 Sitios Web" onChange={e => patchDraft({ category: e.target.value })} />
              <datalist id="svc-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="field">
              <label>Descripción</label>
              <textarea value={editor.draft.description} maxLength={600} placeholder="Qué resuelve este servicio, en una frase." onChange={e => patchDraft({ description: e.target.value })} />
            </div>
            <div className="field">
              <label>Qué incluye</label>
              <textarea value={editor.draft.includes} maxLength={1500} placeholder="Entregables separados por coma." onChange={e => patchDraft({ includes: e.target.value })} />
            </div>
            <div className="field">
              <label>Nota (opcional)</label>
              <input type="text" value={editor.draft.note} maxLength={400} placeholder='Ej: "Se cotiza según alcance"' onChange={e => patchDraft({ note: e.target.value })} />
            </div>
            <div className="field">
              <label>Planes y precios</label>
              {editor.draft.tiers.map((t, i) => (
                <div key={i} className="svc-tier-edit">
                  <div className="two">
                    <input type="text" value={t.plan} maxLength={40} placeholder="Plan (ej: Inicia)" onChange={e => setTier(i, { plan: e.target.value })} />
                    <input type="text" value={t.price} maxLength={40} placeholder="Precio (ej: $100.000)" onChange={e => setTier(i, { price: e.target.value })} />
                  </div>
                  <input type="text" value={t.detail} maxLength={300} placeholder="Qué incluye este plan" onChange={e => setTier(i, { detail: e.target.value })} />
                  <button className="svc-tier-del" onClick={() => removeTier(i)}>Quitar plan</button>
                </div>
              ))}
              {editor.draft.tiers.length < 6 && <button className="svc-tier-add" onClick={addTier}>+ Agregar plan</button>}
              {editor.draft.tiers.length === 0 && <div className="pdf-hint" style={{ marginTop: "6px" }}>Sin planes, el servicio mostrará "Se cotiza según alcance".</div>}
            </div>
            {saveError && <div className="svc-save-err">⚠ {saveError}</div>}
            <button className="save" disabled={saving} onClick={save}>{saving ? "Guardando…" : "Guardar servicio"}</button>
          </div>
        </>
      )}

      <PlaybooksManager canManage={canManage} showToast={showToast} />
      <SlaManager canManage={canManage} showToast={showToast} />
      <ConfigRecordatorios />
    </div>
  );
}

