import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/App";
import { API_BASE } from "./api";
import {
  HUB_DRIVE_ROOT, STATUS, TASK_STAGES, TASK_STAGE_TO_STATUS,
  isContractStatus, isQuoteStatus, QUOTE_STATUSES,
} from "./constants";
import {
  creatableBody, useConvertQuote, useEntityMutations, useHubData, useMembers,
  type EntityMutations,
} from "./hooks";
import {
  advanceStageExtra, clientNameOf, ex, exNum, exStr, extractDriveFileId, fmtCLP,
  fmtDate, fromDateInput, fromDatetimeInput, isExpired, parseCLPAmount,
  resolveClientId, taskStageFromRow, toDateInput, toDatetimeInput,
} from "./lib";
import { buildContractPdf } from "./pdf";
import {
  AssigneePicker, ClientOptions, ClientSelect, DriveFolderSelector,
  MemberAvatarStack, PdfUploadField, StageBreakdown, type ToastFn,
} from "./shared";
import {
  emptyWiz,
  type ClientRow, type ContractRow, type MeetingRow, type NoteRow, type NoteScope,
  type PdfData, type ProjectRow, type QuoteItem, type QuoteRow, type SheetKind,
  type Tab, type TaskRow, type TaskStage, type WizData,
} from "./types";

/* ============================================================
   SHEET CONTENT — paneles de creación/edición (datos servidor)
   ============================================================ */

export interface SheetProps {
  sheet: SheetKind;
  onClose: () => void;
  onToast: ToastFn;
  onNavigate: (tab: Tab) => void;
  onOpenSheet: (s: SheetKind) => void;
  onConfirm: (msg: string, onYes: () => void) => void;
}

/** Reconstruye el estado del wizard desde un presupuesto guardado. */
function wizFromQuote(q: QuoteRow): WizData {
  if (q.wizData && typeof q.wizData === "object" && Array.isArray(q.wizData.modules)) {
    return { ...emptyWiz(), ...q.wizData };
  }
  return {
    ...emptyWiz(),
    client: q.clientName ?? "",
    project: q.title,
    scope: q.notes ?? "",
    date: q.issuedAt ? toDateInput(q.issuedAt) : new Date().toISOString().slice(0, 10),
    validityDays: q.validityDays ?? 15,
    notes: q.notes ?? "",
    modules: (q.items ?? []).map(it => ({
      id: Math.random().toString(36).slice(2),
      name: it.descripcion,
      desc: "",
      price: it.precioUnitario * (it.cantidad || 1),
    })),
  };
}

export function SheetContent({ sheet, onClose, onToast, onNavigate, onOpenSheet, onConfirm }: SheetProps) {
  const authUser = useAuth();
  const { clients, projects, tasks, meetings, notes, contracts, quotes } = useHubData();
  const members = useMembers().data ?? [];

  const clientsM = useEntityMutations<ClientRow>("clients");
  const projectsM = useEntityMutations<ProjectRow>("projects");
  const tasksM = useEntityMutations<TaskRow>("tasks");
  const meetingsM = useEntityMutations<MeetingRow>("meetings");
  const notesM = useEntityMutations<NoteRow>("notes");
  const contractsM = useEntityMutations<ContractRow>("contracts");
  const quotesM = useEntityMutations<QuoteRow>("quotes");
  const convertQuote = useConvertQuote();

  const r = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>({});
  const R = (k: string) => (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => { r.current[k] = el; };
  const V = (k: string) => (r.current[k] as HTMLInputElement | null)?.value ?? "";

  const [progVal, setProgVal] = useState(0);
  const [driveFolderLink, setDriveFolderLink] = useState("");
  const [projNameDraft, setProjNameDraft] = useState("");
  const [clientIdSel, setClientIdSel] = useState<number | null>(null);
  const [assignees, setAssignees] = useState<number[]>([]);
  const [noteScope, setNoteScope] = useState<NoteScope>("team");
  const [pdfData, setPdfData] = useState<PdfData | null>(null);
  const [wizStep, setWizStep] = useState(1);
  const [wiz, setWiz] = useState<WizData>(emptyWiz);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState("");
  const [meetingExtracting, setMeetingExtracting] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "ai"; text: string }[]>([]);

  /* Inicialización por sheet — SOLO al cambiar de sheet (los refetch de fondo no resetean el formulario). */
  const initRef = useRef<SheetKind>(null);
  useEffect(() => {
    if (!sheet || initRef.current === sheet) return;
    initRef.current = sheet;
    if (sheet.kind === "proj") {
      const p = projects.find(x => x.id === sheet.id);
      if (p) { setProgVal(p.progress ?? 0); setDriveFolderLink(exStr(p.extra, "link")); setProjNameDraft(p.name); setClientIdSel(p.clientId); }
    }
    if (sheet.kind === "new-proj") { setProgVal(0); setDriveFolderLink(""); setProjNameDraft(""); setClientIdSel(null); }
    if (sheet.kind === "task") {
      const t = tasks.find(x => x.id === sheet.id);
      setAssignees(t?.assigneeIds ?? []);
    }
    if (sheet.kind === "new-task") setAssignees(authUser ? [authUser.id] : []);
    if (sheet.kind === "meet") {
      const m = meetings.find(x => x.id === sheet.id);
      setClientIdSel(m?.clientId ?? null);
    }
    if (sheet.kind === "new-meet") setClientIdSel(null);
    if (sheet.kind === "note") {
      const n = notes.find(x => x.id === sheet.id);
      setNoteScope(n?.scope === "personal" ? "personal" : "team");
    }
    if (sheet.kind === "new-note") setNoteScope("team");
    if (sheet.kind === "contract") {
      const c = contracts.find(x => x.id === sheet.id);
      const url = c ? exStr(c.extra, "pdfUrl") : "";
      setPdfData(url ? { url, title: exStr(c?.extra, "pdfTitle"), uploadedAt: exNum(c?.extra, "pdfUploadedAt") ?? 0 } : null);
      setClientIdSel(c?.clientId ?? null);
      setChatHistory([]); setChatInput("");
    }
    if (sheet.kind === "new-contract") { setPdfData(null); setAiExtracting(false); setClientIdSel(null); }
    if (sheet.kind === "new-contract-meeting") { setMeetingNotes(""); setMeetingExtracting(false); setClientIdSel(null); }
    if (sheet.kind === "quote-wizard") {
      const q = sheet.id != null ? quotes.find(x => x.id === sheet.id) : undefined;
      setWiz(q ? wizFromQuote(q) : emptyWiz());
      setWizStep(1); setGeneratingPdf(false); setMeetingNotes(""); setMeetingExtracting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  const extractFromMeeting = async (notesText: string, onFill: (data: Record<string, string>) => void) => {
    setMeetingExtracting(true);
    try {
      const res = await fetch(`${API_BASE}/hub/contracts/extract-from-meeting`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesText }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({} as Record<string, string>)); onToast((e as { error?: string }).error || "Error al procesar las notas"); return; }
      const data = await res.json() as Record<string, string>;
      onFill(data);
      onToast("Información extraída de la reunión ✓");
    } catch { onToast("Error de conexión"); }
    finally { setMeetingExtracting(false); }
  };

  /** Borra con toast de deshacer (el deshacer re-crea la fila vía POST). */
  function deleteWithUndo<T extends { id: number }>(m: EntityMutations<T>, row: T, msg: string) {
    m.remove.mutate(row.id, { onError: err => onToast(`Error al eliminar: ${err.message}`) });
    onClose();
    onToast(msg, () => {
      m.create.mutate(creatableBody(row as unknown as Record<string, unknown>), {
        onError: err => onToast(`No se pudo restaurar: ${err.message}`),
      });
    });
  }

  /** Composición de notas desde una reunión guardada (para los flujos con IA). */
  const meetingToNotes = (m: MeetingRow) => [
    m.title && `Reunión: ${m.title}`,
    m.clientId != null && `Cliente: ${clientNameOf(clients, m.clientId)}`,
    m.date && `Fecha: ${toDateInput(m.date)}`,
    m.summary && `Resumen: ${m.summary}`,
    m.notes,
  ].filter(Boolean).join("\n\n");

  if (!sheet) return null;

  /* ---- Nueva tarea ---- */
  if (sheet.kind === "new-task") {
    return (<>
      <div className="sheet-head"><h2>Nueva tarea</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("t")} placeholder="Ej: Maquetar checkout" /></div>
      <div className="two field">
        <div><label>Proyecto</label><select ref={R("proj")}><option value="">— sin proyecto —</option>{projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></div>
        <div><label>Criticidad</label><select ref={R("crit")} defaultValue="media"><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
      </div>
      <div className="two field">
        <div><label>Etapa</label><select ref={R("stage")}>{TASK_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Fecha límite</label><input type="date" ref={R("due")} /></div>
      </div>
      <div className="field"><label>Responsables</label>
        <AssigneePicker value={assignees} onChange={setAssignees} members={members} />
      </div>
      <div className="field"><label>Notas</label><textarea ref={R("notes") as React.Ref<HTMLTextAreaElement>} rows={4} /></div>
      <button className="add-btn" onClick={() => {
        const title = V("t").trim(); if (!title) { onToast("Ponle un título a la tarea"); return; }
        const stage = (V("stage") || "backlog") as TaskStage;
        tasksM.create.mutate({
          title,
          description: V("notes"),
          projectId: V("proj") ? Number(V("proj")) : null,
          priority: V("crit") || "media",
          status: TASK_STAGE_TO_STATUS[stage],
          dueDate: fromDateInput(V("due")),
          assigneeIds: assignees,
          extra: { stage, stageSince: Date.now(), stageTime: {} },
        }, { onError: err => onToast(`Error al crear la tarea: ${err.message}`) });
        onClose(); onNavigate("tareas"); onToast("Tarea creada");
      }}>Crear tarea</button>
    </>);
  }

  /* ---- Detalle tarea ---- */
  if (sheet.kind === "task") {
    const t = tasks.find(x => x.id === sheet.id); if (!t) return null;
    const curStage = taskStageFromRow(t);
    return (<>
      <div className="sheet-head"><h2>Tarea</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="detail-meta">
        <span className={`chip prio-${t.priority}`}>{t.priority}</span>
        <span className="badge">{TASK_STAGES.find(s => s.id === curStage)?.label}</span>
        {t.dueDate && <span className={`chip due ${isExpired(t.dueDate) ? "overdue" : ""}`}>{isExpired(t.dueDate) ? "vencida " : "vence "}{fmtDate(t.dueDate)}</span>}
        <MemberAvatarStack ids={t.assigneeIds ?? []} members={members} />
      </div>
      <div className="field"><label>Título</label><input type="text" ref={R("t")} defaultValue={t.title} /></div>
      <div className="two field">
        <div><label>Proyecto</label><select ref={R("proj")} defaultValue={t.projectId != null ? String(t.projectId) : ""}><option value="">— sin proyecto —</option>{projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></div>
        <div><label>Criticidad</label><select ref={R("crit")} defaultValue={t.priority ?? "media"}>{["alta", "media", "baja"].map(x => <option key={x} value={x}>{x}</option>)}</select></div>
      </div>
      <div className="two field">
        <div><label>Etapa</label><select ref={R("stage")} defaultValue={curStage}>{TASK_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Fecha límite</label><input type="date" ref={R("due")} defaultValue={toDateInput(t.dueDate)} /></div>
      </div>
      <div className="field"><label>Responsables</label>
        <AssigneePicker value={assignees} onChange={setAssignees} members={members} />
      </div>
      <div className="field"><label>Notas</label><textarea ref={R("notes") as React.Ref<HTMLTextAreaElement>} rows={5} defaultValue={t.description || ""} /></div>
      <div className="detail-block"><h4>Tiempo por etapa</h4><StageBreakdown t={t} /></div>
      <button className="save" onClick={() => {
        const newStage = (V("stage") || curStage) as TaskStage;
        let extra = { ...ex(t.extra), stage: newStage };
        if (newStage !== curStage) extra = { ...advanceStageExtra(extra, curStage), stage: newStage };
        tasksM.update.mutate({
          id: t.id,
          patch: {
            title: V("t").trim() || t.title,
            projectId: V("proj") ? Number(V("proj")) : null,
            priority: V("crit"),
            description: V("notes"),
            dueDate: fromDateInput(V("due")),
            assigneeIds: assignees,
            status: TASK_STAGE_TO_STATUS[newStage],
            extra,
          },
        }, { onError: err => onToast(`Error al guardar: ${err.message}`) });
        onClose(); onToast("Tarea actualizada");
      }}>Guardar cambios</button>
      <button className="del-link" onClick={() => deleteWithUndo(tasksM, t, "Tarea eliminada")}>Eliminar tarea</button>
    </>);
  }

  /* ---- Nuevo proyecto ---- */
  if (sheet.kind === "new-proj") {
    return (<>
      <div className="sheet-head"><h2>Nuevo proyecto</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Nombre</label><input type="text" ref={R("n")} placeholder="Ej: Landing Page Corporativa" value={projNameDraft} onChange={e => setProjNameDraft(e.target.value)} /></div>
      <div className="two field">
        <div><label>Cliente</label><ClientSelect value={clientIdSel} onChange={setClientIdSel} clients={clients} /></div>
        <div><label>Tipo</label><input type="text" ref={R("ty")} placeholder="E-commerce, Landing…" /></div>
      </div>
      <div className="three field">
        <div><label>Prioridad</label><select ref={R("prio")}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
        <div><label>Estado</label><select ref={R("st")}>{STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Dueño</label><input type="text" ref={R("ow")} /></div>
      </div>
      <div className="field"><label>Fecha límite (opcional)</label><input type="date" ref={R("due")} /></div>
      <div className="field"><label>Carpeta de Drive</label>
        <DriveFolderSelector value={driveFolderLink} onChange={setDriveFolderLink} projectName={projNameDraft} onToast={onToast} />
      </div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} /></div>
      <button className="add-btn" onClick={() => {
        const name = projNameDraft.trim(); if (!name) { onToast("Ponle un nombre al proyecto"); return; }
        projectsM.create.mutate({
          name,
          clientId: clientIdSel,
          status: V("st") || "lead",
          priority: V("prio") || "media",
          progress: 0,
          dueDate: fromDateInput(V("due")),
          description: V("no"),
          extra: { type: V("ty").trim(), owner: V("ow").trim(), link: driveFolderLink, stageSince: Date.now(), stageTime: {} },
        }, { onError: err => onToast(`Error al crear el proyecto: ${err.message}`) });
        onClose(); onNavigate("proyectos"); onToast("Proyecto creado");
      }}>Crear proyecto</button>
    </>);
  }

  /* ---- Detalle proyecto ---- */
  if (sheet.kind === "proj") {
    const p = projects.find(x => x.id === sheet.id); if (!p) return null;
    return (<>
      <div className="sheet-head"><h2>Proyecto</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="detail-meta"><span className={`chip prio-${p.priority}`}>{p.priority}</span><span className="badge">{STATUS.find(s => s.id === p.status)?.label ?? "Lead"}</span></div>
      <div className="field"><label>Nombre</label><input type="text" ref={R("n")} value={projNameDraft} onChange={e => setProjNameDraft(e.target.value)} /></div>
      <div className="two field">
        <div><label>Cliente</label><ClientSelect value={clientIdSel} onChange={setClientIdSel} clients={clients} /></div>
        <div><label>Tipo</label><input type="text" ref={R("ty")} defaultValue={exStr(p.extra, "type")} /></div>
      </div>
      <div className="three field">
        <div><label>Prioridad</label><select ref={R("prio")} defaultValue={p.priority ?? "media"}>{["alta", "media", "baja"].map(x => <option key={x} value={x}>{x}</option>)}</select></div>
        <div><label>Estado</label><select ref={R("st")} defaultValue={p.status ?? "lead"}>{STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Dueño</label><input type="text" ref={R("ow")} defaultValue={exStr(p.extra, "owner")} /></div>
      </div>
      <div className="field"><label>Fecha límite</label><input type="date" ref={R("due")} defaultValue={toDateInput(p.dueDate)} /></div>
      <div className="field"><label>Avance <b>{progVal}%</b></label><div className="rangewrap"><input type="range" min={0} max={100} value={progVal} onChange={e => setProgVal(Number(e.target.value))} /></div></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={6} defaultValue={p.description || ""} /></div>
      <div className="field">
        <label>Carpeta de Drive</label>
        <DriveFolderSelector value={driveFolderLink} onChange={setDriveFolderLink} projectName={p.name} onToast={onToast} />
      </div>
      <button className="save" onClick={() => {
        const newStatus = V("st") || p.status || "lead";
        let extra = { ...ex(p.extra), type: V("ty").trim(), owner: V("ow").trim(), link: driveFolderLink };
        if (newStatus !== p.status) extra = { ...advanceStageExtra(extra, p.status || "lead"), type: V("ty").trim(), owner: V("ow").trim(), link: driveFolderLink };
        projectsM.update.mutate({
          id: p.id,
          patch: {
            name: projNameDraft.trim() || p.name,
            clientId: clientIdSel,
            priority: V("prio"),
            status: newStatus,
            progress: progVal,
            dueDate: fromDateInput(V("due")),
            description: V("no"),
            extra,
          },
        }, { onError: err => onToast(`Error al guardar: ${err.message}`) });
        onClose(); onToast("Proyecto actualizado");
      }}>Guardar cambios</button>
      <button className="del-link" onClick={() => {
        const doDelete = () => deleteWithUndo(projectsM, p, "Proyecto eliminado");
        const nTasks = tasks.filter(t => t.projectId === p.id).length;
        if (nTasks > 0) onConfirm(`Este proyecto tiene ${nTasks} tarea${nTasks !== 1 ? "s" : ""} asociada${nTasks !== 1 ? "s" : ""} que quedará${nTasks !== 1 ? "n" : ""} sin proyecto. ¿Eliminar de todas formas?`, doDelete);
        else doDelete();
      }}>Eliminar proyecto</button>
    </>);
  }

  /* ---- Nuevo cliente ---- */
  if (sheet.kind === "new-client") {
    return (<>
      <div className="sheet-head"><h2>Nuevo cliente</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Nombre / Empresa</label><input type="text" ref={R("n")} /></div>
      <div className="two field"><div><label>Empresa</label><input type="text" ref={R("co")} /></div><div><label>Email</label><input type="text" ref={R("em")} /></div></div>
      <div className="field"><label>Teléfono</label><input type="text" ref={R("ph")} /></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} /></div>
      <button className="add-btn" onClick={() => {
        const name = V("n").trim(); if (!name) { onToast("Ponle un nombre al cliente"); return; }
        clientsM.create.mutate({
          name, company: V("co").trim() || null, email: V("em").trim() || null, phone: V("ph").trim() || null, notes: V("no"),
        }, { onError: err => onToast(`Error al crear el cliente: ${err.message}`) });
        onClose(); onNavigate("clientes"); onToast("Cliente creado");
      }}>Crear cliente</button>
    </>);
  }

  /* ---- Detalle cliente ---- */
  if (sheet.kind === "client") {
    const c = clients.find(x => x.id === sheet.id); if (!c) return null;
    const projs = projects.filter(p => p.clientId === c.id);
    return (<>
      <div className="sheet-head"><h2>Cliente</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Nombre / Empresa</label><input type="text" ref={R("n")} defaultValue={c.name} /></div>
      <div className="two field"><div><label>Empresa</label><input type="text" ref={R("co")} defaultValue={c.company || ""} /></div><div><label>Email</label><input type="text" ref={R("em")} defaultValue={c.email || ""} /></div></div>
      <div className="field"><label>Teléfono</label><input type="text" ref={R("ph")} defaultValue={c.phone || ""} /></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={5} defaultValue={c.notes || ""} /></div>
      <button className="save" onClick={() => {
        clientsM.update.mutate({
          id: c.id,
          patch: { name: V("n").trim() || c.name, company: V("co").trim() || null, email: V("em").trim() || null, phone: V("ph").trim() || null, notes: V("no") },
        }, { onError: err => onToast(`Error al guardar: ${err.message}`) });
        onClose(); onToast("Cliente actualizado");
      }}>Guardar cambios</button>
      <button className="del-link" onClick={() => {
        const doDelete = () => deleteWithUndo(clientsM, c, "Cliente eliminado");
        const nProjs = projects.filter(p => p.clientId === c.id).length;
        const nMeets = meetings.filter(m => m.clientId === c.id).length;
        if (nProjs > 0 || nMeets > 0) {
          const partes = [
            nProjs > 0 ? `${nProjs} proyecto${nProjs !== 1 ? "s" : ""}` : "",
            nMeets > 0 ? `${nMeets} reuni${nMeets !== 1 ? "ones" : "ón"}` : "",
          ].filter(Boolean).join(" y ");
          onConfirm(`"${c.name}" tiene ${partes} vinculado${nProjs + nMeets !== 1 ? "s" : ""}. No se eliminarán, pero quedarán sin cliente en la cartera. ¿Eliminar de todas formas?`, doDelete);
        } else doDelete();
      }}>Eliminar cliente</button>
      {projs.length > 0 && <div className="detail-block" style={{ marginTop: 20 }}><h4>Proyectos vinculados</h4><p>{projs.map(p => p.name + " — " + (STATUS.find(s => s.id === p.status)?.label ?? "Lead")).join("\n")}</p></div>}
    </>);
  }

  /* ---- Nueva reunión ---- */
  if (sheet.kind === "new-meet") {
    return (<>
      <div className="sheet-head"><h2>Nueva reunión</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("ti")} placeholder="Ej: Kickoff rediseño web" /></div>
      <div className="two field">
        <div><label>Cliente</label><ClientSelect value={clientIdSel} onChange={setClientIdSel} clients={clients} /></div>
        <div><label>Fecha y hora</label><input type="datetime-local" ref={R("dt")} /></div>
      </div>
      <div className="field"><label>Resumen</label><textarea ref={R("sm") as React.Ref<HTMLTextAreaElement>} rows={3} /></div>
      <div className="field"><label>Notas completas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={6} /></div>
      <div className="field"><label>Seguimiento</label><textarea ref={R("fu") as React.Ref<HTMLTextAreaElement>} rows={2} placeholder="Próximos pasos acordados…" /></div>
      <button className="add-btn" onClick={() => {
        const clientName = clientNameOf(clients, clientIdSel);
        const title = V("ti").trim() || (clientName ? `Reunión — ${clientName}` : "");
        if (!title) { onToast("Ponle un título o cliente a la reunión"); return; }
        meetingsM.create.mutate({
          title, clientId: clientIdSel, date: fromDatetimeInput(V("dt")), summary: V("sm"), notes: V("no"), followUp: V("fu"),
        }, { onError: err => onToast(`Error al guardar la reunión: ${err.message}`) });
        onClose(); onNavigate("reuniones"); onToast("Reunión guardada");
      }}>Guardar reunión</button>
    </>);
  }

  /* ---- Detalle reunión ---- */
  if (sheet.kind === "meet") {
    const m = meetings.find(x => x.id === sheet.id); if (!m) return null;
    return (<>
      <div className="sheet-head"><h2>Reunión</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("ti")} defaultValue={m.title} /></div>
      <div className="two field">
        <div><label>Cliente</label><ClientSelect value={clientIdSel} onChange={setClientIdSel} clients={clients} /></div>
        <div><label>Fecha y hora</label><input type="datetime-local" ref={R("dt")} defaultValue={toDatetimeInput(m.date)} /></div>
      </div>
      <div className="field"><label>Resumen</label><textarea ref={R("sm") as React.Ref<HTMLTextAreaElement>} rows={3} defaultValue={m.summary || ""} /></div>
      <div className="field"><label>Notas completas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={7} defaultValue={m.notes || ""} /></div>
      <div className="field"><label>Seguimiento</label><textarea ref={R("fu") as React.Ref<HTMLTextAreaElement>} rows={2} defaultValue={m.followUp || ""} /></div>
      <button className="save" onClick={() => {
        meetingsM.update.mutate({
          id: m.id,
          patch: { title: V("ti").trim() || m.title, clientId: clientIdSel, date: fromDatetimeInput(V("dt")), summary: V("sm"), notes: V("no"), followUp: V("fu") },
        }, { onError: err => onToast(`Error al guardar: ${err.message}`) });
        onClose(); onToast("Reunión actualizada");
      }}>Guardar cambios</button>
      <button className="del-link" onClick={() => deleteWithUndo(meetingsM, m, "Reunión eliminada")}>Eliminar reunión</button>
    </>);
  }

  /* ---- Nueva nota ---- */
  if (sheet.kind === "new-note") {
    return (<>
      <div className="sheet-head"><h2>Nueva nota</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("ti")} /></div>
      <div className="field"><label>Visibilidad</label>
        <div className="scope-toggle">
          <button type="button" className={noteScope === "team" ? "on" : ""} onClick={() => setNoteScope("team")}>👥 Equipo</button>
          <button type="button" className={noteScope === "personal" ? "on" : ""} onClick={() => setNoteScope("personal")}>🔒 Personal</button>
        </div>
        <div className="scope-hint">{noteScope === "team" ? "Visible para todo el equipo." : "Solo tú puedes verla."}</div>
      </div>
      <div className="field"><label>Contenido</label><textarea ref={R("bo") as React.Ref<HTMLTextAreaElement>} rows={6} /></div>
      <button className="add-btn" onClick={() => {
        const title = V("ti").trim(); if (!title) { onToast("Ponle un título a la nota"); return; }
        notesM.create.mutate({ title, content: V("bo"), scope: noteScope }, { onError: err => onToast(`Error al crear la nota: ${err.message}`) });
        onClose(); onNavigate("notas"); onToast("Nota creada");
      }}>Crear nota</button>
    </>);
  }

  /* ---- Detalle nota ---- */
  if (sheet.kind === "note") {
    const n = notes.find(x => x.id === sheet.id); if (!n) return null;
    return (<>
      <div className="sheet-head"><h2>Nota</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("ti")} defaultValue={n.title || ""} /></div>
      <div className="field"><label>Visibilidad</label>
        <div className="scope-toggle">
          <button type="button" className={noteScope === "team" ? "on" : ""} onClick={() => setNoteScope("team")}>👥 Equipo</button>
          <button type="button" className={noteScope === "personal" ? "on" : ""} onClick={() => setNoteScope("personal")}>🔒 Personal</button>
        </div>
      </div>
      <div className="field"><label>Contenido</label><textarea ref={R("bo") as React.Ref<HTMLTextAreaElement>} rows={8} defaultValue={n.content || ""} /></div>
      <button className="save" onClick={() => {
        notesM.update.mutate({
          id: n.id,
          patch: { title: V("ti").trim() || n.title, content: V("bo"), scope: noteScope },
        }, { onError: err => onToast(`Error al guardar: ${err.message}`) });
        onClose(); onToast("Nota actualizada");
      }}>Guardar cambios</button>
      <button className="del-link" onClick={() => deleteWithUndo(notesM, n, "Nota eliminada")}>Eliminar nota</button>
    </>);
  }

  /* ---- Selector modo contrato ---- */
  if (sheet.kind === "new-contract-mode") {
    return (<>
      <div className="sheet-head"><h2>Nuevo contrato</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="cms-selector">
        <p className="cms-hint">¿Qué quieres agregar?</p>
        <button className="cms-opt" onClick={() => { onNavigate("presupuestos"); onOpenSheet({ kind: "quote-wizard" }); }}>
          <span className="cms-icon">✨</span>
          <div className="cms-text">
            <strong>Nueva cotización</strong>
            <small>Crea el presupuesto en la tab Presupuestos con el wizard y genera el PDF de WebMaker Latam</small>
          </div>
          <span className="cms-arr">→</span>
        </button>
        <button className="cms-opt" onClick={() => onOpenSheet({ kind: "new-contract-meeting" })}>
          <span className="cms-icon">🎙️</span>
          <div className="cms-text">
            <strong>Desde reunión</strong>
            <small>Pega las notas de tu reunión y la IA rellena el contrato automáticamente</small>
          </div>
          <span className="cms-arr">→</span>
        </button>
        <button className="cms-opt" onClick={() => onOpenSheet({ kind: "new-contract" })}>
          <span className="cms-icon">📁</span>
          <div className="cms-text">
            <strong>Contrato existente</strong>
            <small>Sube el PDF que ya tienes — extrae los datos automáticamente con IA</small>
          </div>
          <span className="cms-arr">→</span>
        </button>
      </div>
    </>);
  }

  /* ---- Nuevo contrato desde reunión ---- */
  if (sheet.kind === "new-contract-meeting") {
    const existingMeetings = [...meetings].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).slice(0, 10);
    return (<>
      <div className="sheet-head"><h2>Contrato desde reunión</h2><button className="close-btn" onClick={onClose}>✕</button></div>

      <div className="field">
        <label>Notas de la reunión</label>
        {existingMeetings.length > 0 && (
          <select style={{ marginBottom: 8 }} defaultValue="" onChange={e => {
            const m = meetings.find(x => String(x.id) === e.target.value);
            if (m) setMeetingNotes(meetingToNotes(m));
          }}>
            <option value="">— Cargar reunión existente —</option>
            {existingMeetings.map(m => (
              <option key={m.id} value={String(m.id)}>{m.date ? `${toDateInput(m.date)} — ` : ""}{m.title || clientNameOf(clients, m.clientId) || "Sin título"}</option>
            ))}
          </select>
        )}
        <textarea rows={7} value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} placeholder="Pega aquí las notas de tu reunión con el cliente: qué servicios se acordaron, precio, fechas, alcance, nombre del cliente, etc. La IA leerá todo y completará el formulario automáticamente." style={{ fontFamily: "inherit" }} />
      </div>
      <button className="ai-extract-btn" disabled={meetingExtracting || meetingNotes.trim().length < 10} onClick={() => extractFromMeeting(meetingNotes, (data) => {
        if (r.current["ti"] && (data.title || data.project_name)) r.current["ti"].value = data.title || data.project_name;
        if (r.current["cl"] && data.client) r.current["cl"].value = data.client;
        if (r.current["va"] && data.value) r.current["va"].value = data.value;
        if (r.current["st"] && isContractStatus(data.status)) (r.current["st"] as HTMLSelectElement).value = data.status;
        if (r.current["si"] && data.signedAt) r.current["si"].value = data.signedAt;
        if (r.current["ex"] && data.expiresAt) r.current["ex"].value = data.expiresAt;
        if (r.current["no"] && data.notes) (r.current["no"] as HTMLTextAreaElement).value = data.notes;
      })}>
        {meetingExtracting ? "⏳ Analizando reunión con IA…" : "✨ Completar formulario con IA"}
      </button>

      <div className="field"><label>Título / Descripción</label><input type="text" ref={R("ti")} placeholder="Ej: Servicio de Marketing Digital" /></div>
      <div className="field"><label>Cliente</label><input type="text" ref={R("cl")} placeholder="Nombre del cliente" list="hub-client-options" /><ClientOptions clients={clients} /></div>
      <div className="field"><label>Valor</label><input type="text" ref={R("va")} placeholder="Ej: $290.000 / mes" /></div>
      <div className="field"><label>Estado</label>
        <select ref={R("st")}>
          <option value="borrador">Borrador</option>
          <option value="activo">Activo</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
      <div className="field"><label>Fecha de firma</label><input type="date" ref={R("si")} /></div>
      <div className="field"><label>Fecha de vencimiento</label><input type="date" ref={R("ex")} /></div>
      <div className="field"><label>Notas / Alcance</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} placeholder="Términos, detalles, observaciones…" /></div>
      <button className="add-btn" onClick={() => {
        const title = V("ti").trim(); if (!title) { onToast("Ponle un título al contrato"); return; }
        const clientName = V("cl").trim();
        contractsM.create.mutate({
          title,
          clientName: clientName || null,
          clientId: resolveClientId(clients, clientName),
          status: V("st") || "borrador",
          amount: parseCLPAmount(V("va")),
          currency: "CLP",
          issuedAt: fromDateInput(V("si")),
          expiresAt: fromDateInput(V("ex")),
          body: V("no"),
          extra: { valueText: V("va").trim() },
        }, { onError: err => onToast(`Error al crear el contrato: ${err.message}`) });
        onClose(); onNavigate("contratos"); onToast("Contrato creado");
      }}>Crear contrato</button>
    </>);
  }

  /* ---- Nuevo contrato (existente / subida) ---- */
  if (sheet.kind === "new-contract") {
    return (<>
      <div className="sheet-head"><h2>Contrato existente</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Documento PDF</label>
        <PdfUploadField value={pdfData} onChange={setPdfData} onToast={onToast} />
      </div>
      {pdfData && (
        <button className="ai-extract-btn" disabled={aiExtracting} onClick={async () => {
          const fileId = extractDriveFileId(pdfData.url);
          if (!fileId) { onToast("No se pudo identificar el archivo en Drive"); return; }
          setAiExtracting(true);
          try {
            const res = await fetch(`${API_BASE}/hub/contracts/extract-pdf`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId }) });
            if (!res.ok) { const e = await res.json().catch(() => ({} as Record<string, string>)); onToast((e as Record<string, string>).error || "Error al extraer datos"); return; }
            const data = await res.json() as Record<string, string>;
            if (r.current["ti"] && data.title) r.current["ti"].value = data.title;
            if (r.current["cl"] && data.client) r.current["cl"].value = data.client;
            if (r.current["va"] && data.value) r.current["va"].value = data.value;
            if (r.current["st"] && isContractStatus(data.status)) (r.current["st"] as HTMLSelectElement).value = data.status;
            if (r.current["si"] && data.signedAt) r.current["si"].value = data.signedAt;
            if (r.current["ex"] && data.expiresAt) r.current["ex"].value = data.expiresAt;
            if (r.current["no"] && data.notes) (r.current["no"] as HTMLTextAreaElement).value = data.notes;
            onToast("Datos extraídos con IA ✓");
          } catch { onToast("Error de conexión al extraer datos"); }
          finally { setAiExtracting(false); }
        }}>{aiExtracting ? "⏳ Extrayendo datos…" : "✨ Extraer datos con IA"}</button>
      )}
      <div className="field"><label>Título / Descripción</label><input type="text" ref={R("ti")} placeholder="Ej: Servicio de Marketing Digital" /></div>
      <div className="field"><label>Cliente</label><input type="text" ref={R("cl")} placeholder="Nombre del cliente" list="hub-client-options" /><ClientOptions clients={clients} /></div>
      <div className="field"><label>Valor</label><input type="text" ref={R("va")} placeholder="Ej: $290.000 / mes" /></div>
      <div className="field"><label>Estado</label>
        <select ref={R("st")}>
          <option value="borrador">Borrador</option>
          <option value="activo">Activo</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
      <div className="field"><label>Fecha de firma</label><input type="date" ref={R("si")} /></div>
      <div className="field"><label>Fecha de vencimiento</label><input type="date" ref={R("ex")} /></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} placeholder="Términos, detalles, observaciones…" /></div>
      <button className="add-btn" onClick={() => {
        const title = V("ti").trim(); if (!title) { onToast("Ponle un título al contrato"); return; }
        const clientName = V("cl").trim();
        contractsM.create.mutate({
          title,
          clientName: clientName || null,
          clientId: resolveClientId(clients, clientName),
          status: V("st") || "borrador",
          amount: parseCLPAmount(V("va")),
          currency: "CLP",
          issuedAt: fromDateInput(V("si")),
          expiresAt: fromDateInput(V("ex")),
          body: V("no"),
          driveFileId: pdfData ? extractDriveFileId(pdfData.url) : null,
          extra: { valueText: V("va").trim(), pdfUrl: pdfData?.url ?? null, pdfTitle: pdfData?.title ?? null, pdfUploadedAt: pdfData?.uploadedAt ?? null },
        }, { onError: err => onToast(`Error al crear el contrato: ${err.message}`) });
        onClose(); onNavigate("contratos"); onToast("Contrato creado");
      }}>Crear contrato</button>
    </>);
  }

  /* ---- Detalle contrato ---- */
  if (sheet.kind === "contract") {
    const c = contracts.find(x => x.id === sheet.id); if (!c) return null;
    const previewFileId = pdfData ? extractDriveFileId(pdfData.url) : c.driveFileId;
    const valueText = exStr(c.extra, "valueText") || (c.amount != null ? fmtCLP(c.amount) : "");
    return (<>
      <div className="sheet-head"><h2>Contrato</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título / Descripción</label><input type="text" ref={R("ti")} defaultValue={c.title} /></div>
      <div className="field"><label>Cliente</label><input type="text" ref={R("cl")} defaultValue={c.clientName || clientNameOf(clients, c.clientId)} list="hub-client-options" /><ClientOptions clients={clients} /></div>
      <div className="field"><label>Valor</label><input type="text" ref={R("va")} defaultValue={valueText} /></div>
      <div className="field"><label>Estado</label>
        <select ref={R("st")} defaultValue={c.status ?? "borrador"}>
          <option value="borrador">Borrador</option>
          <option value="activo">Activo</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
      <div className="field"><label>Fecha de firma</label><input type="date" ref={R("si")} defaultValue={toDateInput(c.issuedAt)} /></div>
      <div className="field"><label>Fecha de vencimiento</label><input type="date" ref={R("ex")} defaultValue={toDateInput(c.expiresAt)} /></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} defaultValue={c.body || ""} /></div>
      <div className="field"><label>Documento PDF</label>
        <PdfUploadField value={pdfData} onChange={setPdfData} onToast={onToast} />
      </div>
      {previewFileId && (
        <div className="field">
          <label>Vista previa</label>
          <div className="pdf-preview-wrap">
            <iframe src={`https://drive.google.com/file/d/${previewFileId}/preview`} className="pdf-preview-frame" allow="autoplay" title="Vista previa del contrato" />
            {pdfData && <a href={pdfData.url} target="_blank" rel="noopener noreferrer" className="pdf-preview-ext">Abrir en Drive ↗</a>}
          </div>
        </div>
      )}
      <button className="save" onClick={() => {
        const clName = V("cl").trim();
        const cid = resolveClientId(clients, clName) ?? (clName === (c.clientName ?? "") ? c.clientId : null);
        contractsM.update.mutate({
          id: c.id,
          patch: {
            title: V("ti").trim() || c.title,
            clientName: clName || null,
            clientId: cid,
            status: V("st"),
            amount: parseCLPAmount(V("va")),
            issuedAt: fromDateInput(V("si")),
            expiresAt: fromDateInput(V("ex")),
            body: V("no"),
            driveFileId: pdfData ? extractDriveFileId(pdfData.url) : null,
            extra: { ...ex(c.extra), valueText: V("va").trim(), pdfUrl: pdfData?.url ?? null, pdfTitle: pdfData?.title ?? null, pdfUploadedAt: pdfData?.uploadedAt ?? null },
          },
        }, { onError: err => onToast(`Error al guardar: ${err.message}`) });
        onClose(); onToast("Contrato actualizado");
      }}>Guardar cambios</button>

      {/* ---- Chat IA para modificar el contrato ---- */}
      <div style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: "1.1em" }}>✨</span>
          <strong style={{ fontSize: "0.92em" }}>Modificar con IA</strong>
          <span style={{ fontSize: "0.75em", color: "var(--faint)", fontWeight: 400 }}>Dile a la IA qué cambiar y aplicará los cambios al formulario</span>
        </div>

        {chatHistory.length > 0 && (
          <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {chatHistory.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                background: msg.role === "user" ? "var(--orange-soft)" : "var(--card2)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: "7px 12px",
                fontSize: "0.82em",
                maxWidth: "88%",
                lineHeight: 1.45,
                color: msg.role === "user" ? "var(--orange2)" : "var(--text)",
              }}>{msg.text}</div>
            ))}
            {chatLoading && (
              <div style={{ alignSelf: "flex-start", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, padding: "7px 12px", fontSize: "0.82em" }}>
                ⏳ Modificando contrato…
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 6 }}>
          <textarea
            rows={2}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!chatLoading && chatInput.trim()) document.getElementById("ai-chat-send")?.click(); } }}
            placeholder="Ej: Cambia el precio a $350.000/mes, extiende el vencimiento 6 meses, agrega nota sobre soporte…"
            style={{ flex: 1, resize: "none", fontFamily: "inherit", fontSize: "0.85em", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--card2)", color: "var(--text)" }}
            disabled={chatLoading}
          />
          <button
            id="ai-chat-send"
            disabled={chatLoading || chatInput.trim().length < 3}
            onClick={async () => {
              const instruction = chatInput.trim();
              setChatInput("");
              setChatHistory(h => [...h, { role: "user", text: instruction }]);
              setChatLoading(true);
              try {
                const currentContract = {
                  title: V("ti") || c.title,
                  client: V("cl") || (c.clientName ?? ""),
                  value: V("va") || valueText,
                  status: V("st") || (c.status ?? "borrador"),
                  signedAt: V("si") || toDateInput(c.issuedAt),
                  expiresAt: V("ex") || toDateInput(c.expiresAt),
                  notes: V("no") || (c.body ?? ""),
                };
                const res = await fetch(`${API_BASE}/hub/contracts/ai-chat`, {
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ contract: currentContract, instruction }),
                });
                if (!res.ok) { const e = await res.json().catch(() => ({} as Record<string, string>)); setChatHistory(h => [...h, { role: "ai", text: (e as { error?: string }).error || "Error al procesar" }]); return; }
                const data = await res.json() as Record<string, string>;
                if (r.current["ti"] && data.title) r.current["ti"].value = data.title;
                if (r.current["cl"] && data.client) r.current["cl"].value = data.client;
                if (r.current["va"] && data.value) r.current["va"].value = data.value;
                if (r.current["st"] && isContractStatus(data.status)) (r.current["st"] as HTMLSelectElement).value = data.status;
                if (r.current["si"] && data.signedAt) r.current["si"].value = data.signedAt;
                if (r.current["ex"] && data.expiresAt) r.current["ex"].value = data.expiresAt;
                if (r.current["no"] && data.notes) (r.current["no"] as HTMLTextAreaElement).value = data.notes;
                setChatHistory(h => [...h, { role: "ai", text: "✓ Cambios aplicados. Revisa los campos arriba y guarda cuando estés listo." }]);
              } catch { setChatHistory(h => [...h, { role: "ai", text: "Error de conexión" }]); }
              finally { setChatLoading(false); }
            }}
            style={{ padding: "0 14px", borderRadius: 8, border: "1px solid var(--orange-line)", background: "var(--orange-soft)", color: "var(--orange2)", cursor: "pointer", fontWeight: 600, fontSize: "1em", flexShrink: 0 }}
          >→</button>
        </div>
        <p style={{ fontSize: "0.72em", color: "var(--faint)", marginTop: 5 }}>Los cambios se aplican al formulario — haz clic en "Guardar cambios" para confirmar.</p>
      </div>

      <button className="del-link" style={{ marginTop: 16 }} onClick={() => deleteWithUndo(contractsM, c, "Contrato eliminado")}>Eliminar contrato</button>
    </>);
  }

  /* ---- Detalle presupuesto ---- */
  if (sheet.kind === "quote") {
    const q = quotes.find(x => x.id === sheet.id); if (!q) return null;
    const status = isQuoteStatus(q.status) ? q.status : "borrador";
    const st = QUOTE_STATUSES[status];
    const expired = (status === "borrador" || status === "enviado") && isExpired(q.expiresAt);
    const items: QuoteItem[] = q.items ?? [];
    const pdfUrl = exStr(q.extra, "pdfUrl");
    return (<>
      <div className="sheet-head"><h2>Presupuesto</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="detail-meta">
        <span className="chip" style={{ color: st.color, borderColor: st.color + "55", background: st.color + "18" }}>{st.label}</span>
        {expired && <span className="chip due overdue">Vencido</span>}
        {q.total != null && q.total > 0 && <span className="chip">{fmtCLP(q.total)}</span>}
      </div>
      <div className="detail-block"><h4>Datos</h4>
        <p>{[
          `Título: ${q.title}`,
          `Cliente: ${q.clientName || clientNameOf(clients, q.clientId) || "—"}`,
          q.issuedAt ? `Emitida: ${fmtDate(q.issuedAt)}` : "",
          q.expiresAt ? `Vence: ${fmtDate(q.expiresAt)}` : "",
        ].filter(Boolean).join("\n")}</p>
      </div>
      {items.length > 0 && (
        <div className="detail-block"><h4>Módulos</h4>
          <div className="quote-items">
            {items.map((it, i) => (
              <div key={i} className="quote-item">
                <span className="qi-name">{it.cantidad > 1 ? `${it.cantidad} × ` : ""}{it.descripcion}</span>
                <span className="qi-price">{fmtCLP(it.precioUnitario * (it.cantidad || 1))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {(q.subtotal != null || q.total != null) && (
        <div className="detail-block"><h4>Totales</h4>
          <div className="quote-items">
            <div className="quote-item"><span className="qi-name">Neto</span><span className="qi-price">{fmtCLP(q.subtotal ?? 0)}</span></div>
            {(q.discount ?? 0) > 0 && <div className="quote-item"><span className="qi-name">Descuento</span><span className="qi-price">−{fmtCLP(q.discount ?? 0)}</span></div>}
            <div className="quote-item"><span className="qi-name">IVA 19%</span><span className="qi-price">{fmtCLP(q.tax ?? 0)}</span></div>
            <div className="quote-item total"><span className="qi-name">Total</span><span className="qi-price">{fmtCLP(q.total ?? 0)}</span></div>
          </div>
        </div>
      )}
      {q.notes && <div className="detail-block"><h4>Notas</h4><p>{q.notes}</p></div>}
      {pdfUrl && (
        <div className="field">
          <a className="chip pdf-badge" href={pdfUrl} target="_blank" rel="noopener noreferrer">
            📄 {exStr(q.extra, "pdfTitle") || "PDF de la cotización"}
          </a>
        </div>
      )}

      <div className="field"><label>Estado</label>
        <select value={status} onChange={e => {
          const next = e.target.value;
          if (!isQuoteStatus(next)) return;
          quotesM.update.mutate({ id: q.id, patch: { status: next } }, { onError: err => onToast(`Error al cambiar el estado: ${err.message}`) });
          onToast(`Estado cambiado a ${QUOTE_STATUSES[next].label}`);
        }}>
          {(Object.entries(QUOTE_STATUSES) as [string, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <button className="save" onClick={() => onOpenSheet({ kind: "quote-wizard", id: q.id })}>✏️ Editar cotización</button>

      <button className="save" style={{ marginTop: 8 }} disabled={generatingPdf} onClick={async () => {
        setGeneratingPdf(true);
        try {
          const wizSaved = wizFromQuote(q);
          const blob = await buildContractPdf(wizSaved);
          const fname = `Cotizacion-${(q.clientName || "cliente").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
          const fd = new FormData();
          fd.append("file", new File([blob], fname, { type: "application/pdf" }));
          fd.append("parentId", HUB_DRIVE_ROOT);
          const upRes = await fetch(`${API_BASE}/drive/upload-pdf`, { method: "POST", credentials: "include", body: fd });
          if (upRes.ok) {
            const up = await upRes.json() as { webViewLink: string; name: string; uploadedAt: number };
            quotesM.update.mutate({
              id: q.id,
              patch: { extra: { ...ex(q.extra), pdfUrl: up.webViewLink, pdfTitle: up.name, pdfUploadedAt: up.uploadedAt } },
            }, { onError: err => onToast(`Error al guardar el PDF: ${err.message}`) });
            onToast("PDF regenerado y subido a Drive ✓");
          } else {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = fname; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 3000);
            onToast("PDF regenerado y descargado (Drive no disponible)");
          }
        } catch (e: unknown) {
          onToast("Error generando el PDF: " + (e instanceof Error ? e.message : "desconocido"));
        } finally { setGeneratingPdf(false); }
      }}>{generatingPdf ? "⏳ Generando PDF…" : "📄 Regenerar PDF"}</button>

      {q.contractId != null ? (
        <div className="quote-converted">✓ Ya convertida en contrato</div>
      ) : (
        <button className="add-btn wiz-gen-btn" style={{ marginTop: 8 }} disabled={convertQuote.isPending} onClick={() => {
          convertQuote.mutate(q.id, {
            onSuccess: () => { onClose(); onNavigate("contratos"); onToast("Contrato creado desde la cotización ✓"); },
            onError: err => onToast(`Error al convertir: ${err.message}`),
          });
        }}>{convertQuote.isPending ? "⏳ Convirtiendo…" : "📑 Convertir en contrato"}</button>
      )}

      <button className="del-link" style={{ marginTop: 16 }} onClick={() => deleteWithUndo(quotesM, q, "Presupuesto eliminado")}>Eliminar presupuesto</button>
    </>);
  }

  /* ---- Wizard: cotización (crear/editar presupuesto) ---- */
  if (sheet.kind === "quote-wizard") {
    const editing = sheet.id != null ? quotes.find(x => x.id === sheet.id) : undefined;
    const WIZ_STEPS = ["Datos", "Módulos", "Pago"];
    const tNeto = wiz.modules.reduce((a, m) => a + m.price, 0);
    const tIva = Math.round(tNeto * 0.19);
    const tTotal = tNeto + tIva;
    const newModId = () => Math.random().toString(36).slice(2);

    return (<>
      <div className="sheet-head"><h2>{editing ? "Editar cotización" : "Nueva cotización"}</h2><button className="close-btn" onClick={onClose}>✕</button></div>

      {/* Stepper */}
      <div className="wiz-stepper">
        {WIZ_STEPS.map((label, i) => (
          <button key={i} className={`wiz-step-btn${wizStep === i + 1 ? " active" : ""}${wizStep > i + 1 ? " done" : ""}`} onClick={() => { if (wizStep > i + 1) setWizStep(i + 1); }}>
            <span className="wiz-dot">{wizStep > i + 1 ? "✓" : i + 1}</span>
            <span className="wiz-step-lbl">{label}</span>
          </button>
        ))}
      </div>

      {/* STEP 1: Datos generales */}
      {wizStep === 1 && (
        <div className="wiz-body">
          <div className="field"><label>Cliente *</label>
            <input type="text" value={wiz.client} onChange={e => setWiz(w => ({ ...w, client: e.target.value }))} placeholder="Nombre del cliente o empresa" list="hub-client-options" />
            <ClientOptions clients={clients} />
          </div>
          <div className="field"><label>Nombre del servicio / proyecto *</label>
            <input type="text" value={wiz.project} onChange={e => setWiz(w => ({ ...w, project: e.target.value }))} placeholder="Ej: Diseño y animación de mascota" />
          </div>
          <div className="field"><label>Descripción del alcance</label>
            <textarea rows={4} value={wiz.scope} onChange={e => setWiz(w => ({ ...w, scope: e.target.value }))} placeholder="¿Qué incluye este servicio? Escribe el detalle…" />
          </div>
          <div className="two field">
            <div><label>Fecha de emisión</label>
              <input type="date" value={wiz.date} onChange={e => setWiz(w => ({ ...w, date: e.target.value }))} />
            </div>
            <div><label>Asesor / Responsable</label>
              <input type="text" value={wiz.advisor} onChange={e => setWiz(w => ({ ...w, advisor: e.target.value }))} placeholder="Ej: Equipo WebMaker Latam" />
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>🎙️</span> Notas de reunión <span style={{ fontSize: "0.7em", fontWeight: 400, color: "var(--faint)" }}>(opcional — la IA completa los campos)</span>
            </label>
            {meetings.length > 0 && (
              <select style={{ marginBottom: 6 }} defaultValue="" onChange={e => {
                const m = meetings.find(x => String(x.id) === e.target.value);
                if (m) setMeetingNotes(meetingToNotes(m));
              }}>
                <option value="">— Cargar reunión guardada —</option>
                {[...meetings].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).slice(0, 10).map(m => (
                  <option key={m.id} value={String(m.id)}>{m.date ? `${toDateInput(m.date)} — ` : ""}{m.title || clientNameOf(clients, m.clientId) || "Sin título"}</option>
                ))}
              </select>
            )}
            <textarea rows={4} value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} placeholder="Pega las notas de tu reunión aquí — la IA las leerá y rellenará cliente, nombre del proyecto, alcance y precio automáticamente." style={{ fontFamily: "inherit" }} />
          </div>
          {meetingNotes.trim().length >= 10 && (
            <button className="ai-extract-btn" style={{ marginBottom: 8 }} disabled={meetingExtracting} onClick={() => extractFromMeeting(meetingNotes, (data) => {
              setWiz(w => ({
                ...w,
                client: data.client || w.client,
                project: data.title || data.project_name || w.project,
                scope: data.scope_detail || data.notes || w.scope,
              }));
            })}>
              {meetingExtracting ? "⏳ Analizando reunión con IA…" : "✨ Completar campos con IA"}
            </button>
          )}

          <button className="add-btn" onClick={() => {
            if (!wiz.client.trim() || !wiz.project.trim()) { onToast("Cliente y nombre del proyecto son requeridos"); return; }
            setWizStep(2);
          }}>Continuar →</button>
        </div>
      )}

      {/* STEP 2: Módulos */}
      {wizStep === 2 && (
        <div className="wiz-body">
          <div className="wiz-mod-header-row">
            <span className="wiz-mod-title">Módulos de la cotización</span>
            <button className="wiz-add-mod-btn" onClick={() => setWiz(w => ({ ...w, modules: [...w.modules, { id: newModId(), name: "", desc: "", price: 0 }] }))}>+ Módulo</button>
          </div>
          {wiz.modules.map((m, i) => {
            const mIva = Math.round(m.price * 0.19), mTotal = m.price + mIva;
            return (
              <div key={m.id} className="wiz-module">
                <div className="wiz-mod-num-row">
                  <span className="wiz-mod-num">{i + 1}</span>
                  {wiz.modules.length > 1 && (
                    <button className="wiz-mod-del-btn" onClick={() => setWiz(w => ({ ...w, modules: w.modules.filter(x => x.id !== m.id) }))}>✕</button>
                  )}
                </div>
                <div className="field"><label>Nombre del módulo</label>
                  <input type="text" value={m.name} onChange={e => setWiz(w => ({ ...w, modules: w.modules.map(x => x.id === m.id ? { ...x, name: e.target.value } : x) }))} placeholder="Ej: Dirección de arte" />
                </div>
                <div className="field"><label>Descripción breve</label>
                  <input type="text" value={m.desc} onChange={e => setWiz(w => ({ ...w, modules: w.modules.map(x => x.id === m.id ? { ...x, desc: e.target.value } : x) }))} placeholder="Ej: Ajuste de propuesta a diseño consistente" />
                </div>
                <div className="field"><label>Precio neto (CLP)</label>
                  <input type="number" value={m.price || ""} min={0} onChange={e => setWiz(w => ({ ...w, modules: w.modules.map(x => x.id === m.id ? { ...x, price: Number(e.target.value) || 0 } : x) }))} placeholder="0" />
                  {m.price > 0 && <div className="wiz-price-hint"><span>+IVA: {fmtCLP(mIva)}</span><span className="wiz-total-mod">= {fmtCLP(mTotal)}</span></div>}
                </div>
              </div>
            );
          })}
          {tNeto > 0 && (
            <div className="wiz-grand-total">
              <span>Neto: <strong>{fmtCLP(tNeto)}</strong></span>
              <span>IVA: <strong>{fmtCLP(tIva)}</strong></span>
              <span className="wiz-grand-v">Total: <strong>{fmtCLP(tTotal)}</strong></span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="save" onClick={() => setWizStep(1)}>← Atrás</button>
            <button className="add-btn" style={{ flex: 1 }} onClick={() => setWizStep(3)}>Continuar →</button>
          </div>
        </div>
      )}

      {/* STEP 3: Condiciones de pago */}
      {wizStep === 3 && (
        <div className="wiz-body">
          <div className="field"><label>% de pago al iniciar</label>
            <input type="number" value={wiz.downPct} min={0} max={100} onChange={e => setWiz(w => ({ ...w, downPct: Math.min(100, Math.max(0, Number(e.target.value) || 50)) }))} />
            <div className="wiz-price-hint">
              <span>Al iniciar: <strong>{wiz.downPct}%</strong>{tTotal > 0 ? ` (${fmtCLP(Math.round(tTotal * wiz.downPct / 100))})` : ""}</span>
              <span>A la entrega: <strong>{100 - wiz.downPct}%</strong>{tTotal > 0 ? ` (${fmtCLP(tTotal - Math.round(tTotal * wiz.downPct / 100))})` : ""}</span>
            </div>
          </div>
          <div className="two field">
            <div><label>Mensualidad (opcional)</label>
              <input type="text" value={wiz.monthly} onChange={e => setWiz(w => ({ ...w, monthly: e.target.value }))} placeholder="Ej: Soporte técnico mensual" />
            </div>
            <div><label>Precio mensualidad (neto CLP)</label>
              <input type="number" value={wiz.monthlyPrice || ""} min={0} onChange={e => setWiz(w => ({ ...w, monthlyPrice: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div className="field"><label>Vigencia de la cotización (días)</label>
            <input type="number" value={wiz.validityDays || ""} min={0} onChange={e => setWiz(w => ({ ...w, validityDays: Math.max(0, Number(e.target.value) || 0) }))} placeholder="15" />
            <div className="wiz-price-hint"><span>{wiz.validityDays > 0 ? `Vence ${wiz.validityDays} día${wiz.validityDays !== 1 ? "s" : ""} después de la emisión (${wiz.date || "hoy"})` : "Sin fecha de vencimiento"}</span></div>
          </div>
          <div className="field"><label>Notas de cierre</label>
            <textarea rows={3} value={wiz.notes} onChange={e => setWiz(w => ({ ...w, notes: e.target.value }))} placeholder="Ej: Cotización vigente por 15 días…" />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="save" onClick={() => setWizStep(2)}>← Atrás</button>
            <button className="add-btn wiz-gen-btn" style={{ flex: 1 }} disabled={generatingPdf} onClick={async () => {
              if (!wiz.client.trim() || !wiz.project.trim()) { onToast("Completa cliente y nombre del proyecto primero"); return; }
              setGeneratingPdf(true);
              try {
                const blob = await buildContractPdf(wiz);
                const fname = `Cotizacion-${wiz.client.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
                const fd = new FormData();
                fd.append("file", new File([blob], fname, { type: "application/pdf" }));
                fd.append("parentId", HUB_DRIVE_ROOT);
                let pdfUrl = "", pdfTitleOut = "", pdfUploadedAt = 0;
                const upRes = await fetch(`${API_BASE}/drive/upload-pdf`, { method: "POST", credentials: "include", body: fd });
                if (upRes.ok) {
                  const up = await upRes.json() as { webViewLink: string; name: string; uploadedAt: number };
                  pdfUrl = up.webViewLink; pdfTitleOut = up.name; pdfUploadedAt = up.uploadedAt;
                } else {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob); a.download = fname; a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
                  onToast("PDF descargado localmente (Drive no disponible)");
                }
                const issuedAtInput = wiz.date || new Date().toISOString().slice(0, 10);
                let expiresAt: string | null = null;
                if (wiz.validityDays > 0) {
                  const exp = new Date(issuedAtInput + "T12:00:00");
                  exp.setDate(exp.getDate() + wiz.validityDays);
                  expiresAt = exp.toISOString();
                }
                const validMods = wiz.modules.filter(m => m.name.trim() !== "");
                const items: QuoteItem[] = validMods.map(m => ({ descripcion: m.name, cantidad: 1, precioUnitario: m.price }));
                const prevPdf = editing ? exStr(editing.extra, "pdfUrl") : "";
                const body: Record<string, unknown> = {
                  title: wiz.project,
                  clientName: wiz.client.trim() || null,
                  clientId: resolveClientId(clients, wiz.client),
                  currency: "CLP",
                  items,
                  subtotal: tNeto,
                  discount: 0,
                  tax: tIva,
                  total: tTotal,
                  validityDays: wiz.validityDays,
                  issuedAt: fromDateInput(issuedAtInput),
                  expiresAt,
                  notes: wiz.notes || wiz.scope,
                  wizData: wiz,
                  extra: {
                    ...(editing ? ex(editing.extra) : {}),
                    pdfUrl: pdfUrl || prevPdf || null,
                    pdfTitle: pdfUrl ? pdfTitleOut : (editing ? exStr(editing.extra, "pdfTitle") : null),
                    pdfUploadedAt: pdfUrl ? pdfUploadedAt : (editing ? exNum(editing.extra, "pdfUploadedAt") : null),
                  },
                };
                if (editing) {
                  quotesM.update.mutate({ id: editing.id, patch: body }, { onError: err => onToast(`Error al guardar: ${err.message}`) });
                } else {
                  quotesM.create.mutate({ ...body, status: "borrador" }, { onError: err => onToast(`Error al crear el presupuesto: ${err.message}`) });
                }
                onClose(); onNavigate("presupuestos");
                onToast(pdfUrl ? (editing ? "Cotización actualizada y PDF subido a Drive ✓" : "Presupuesto creado y PDF subido a Drive ✓") : (editing ? "Cotización actualizada" : "Presupuesto creado"));
              } catch (e: unknown) {
                onToast("Error generando el PDF: " + (e instanceof Error ? e.message : "desconocido"));
              } finally { setGeneratingPdf(false); }
            }}>{generatingPdf ? "⏳ Generando PDF…" : editing ? "✨ Guardar y regenerar PDF" : "✨ Guardar presupuesto y PDF"}</button>
          </div>
        </div>
      )}
    </>);
  }

  return null;
}
