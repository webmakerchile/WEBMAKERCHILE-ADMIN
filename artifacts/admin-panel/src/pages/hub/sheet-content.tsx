import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListDriveFolders } from "@workspace/api-client-react";
import { useAuth } from "@/App";
import type { HubScope } from "@workspace/roles";
import { ConectarDrive, useEstadoDrive } from "@/components/conectar-drive";
import { Adjuntos } from "@/components/adjuntos";
import { hashDocContrato, hashBriefContrato } from "@/lib/contrato-hash";
import { EnlaceFirma, EnlaceFirmaProyecto } from "@/components/enlace-firma";
import { ReunionesOportunidad } from "@/components/reuniones-oportunidad";
import { AsignarProyecto } from "@/components/asignar-proyecto";
import { ElegirDelCatalogo } from "@/components/elegir-del-catalogo";
import { asignadosDe, idDeCarpeta, nombreDeCarpeta } from "@/lib/proyecto-asignacion";
import { SheetHeader, OptionCard, SectionHeader, StatusChip } from "@/components/hub-kit";
import { TAREAS_QUERY_KEY } from "@/lib/tareas-hub";
import {
  Users2, FileText, FileCheck2, FolderTree, Package,
  AlertTriangle, Clock3, Send, ChevronDown, ChevronUp, Pin, Headphones, Sun,
} from "lucide-react";
import type {
  Contract, ContractBrief, ContractStatus, ChecklistItem, HubState, HubTask, NoteCat, Prio,
  Project, ProjStatus, SheetKind, StateUpdater, Tab, TaskComment, TaskHistoryItem, TeamMember, WizData,
} from "./shared";
import {
  advanceStageObj, CRIT_COLOR, DESENLACE_REUNION_LABEL, emptyWiz, fmtDate, HUB_DRIVE_ROOT, insertNoteSnippet,
  isContractStatus, linkWhatsapp, MOTIVO_LABEL, MOTIVOS_PERDIDA, NOTE_CAT_COLORS, NOTE_CATS,
  projProg, renderNoteFmt, STATUS, statusOf, TASK_STAGES, taskStatusOf, TIPO_REUNION_LABEL,
  toggleChecklistLine, uid,
} from "./shared";
import { ClientOptions, extractDriveFolderId, ProjectDriveInline } from "./small-components";

/* ============================================================
   CONTRACT HELPERS
   ============================================================ */
export const fmtCLP = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

export function extractDriveFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export const DOC_IVA = 0.19;

/** Suma los módulos con nombre del documento (neto) y calcula IVA + total. */
export function docTotals(d: WizData) {
  const neto = (d.modules || []).filter(m => (m.name || "").trim() !== "").reduce((a, m) => a + (Number(m.price) || 0), 0);
  const iva = Math.round(neto * DOC_IVA);
  return { neto, iva, total: neto + iva };
}

/** "$1.234.567" → 1234567 */
export function parseCLP(v: string): number {
  const n = Number(String(v || "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Fecha de vencimiento derivada de emisión + vigencia. */
export function docExpiry(d: WizData): string {
  if (!d.validityDays || d.validityDays <= 0) return "";
  const base = d.date || new Date().toISOString().slice(0, 10);
  const exp = new Date(base + "T12:00:00");
  if (isNaN(exp.getTime())) return "";
  exp.setDate(exp.getDate() + d.validityDays);
  return exp.toISOString().slice(0, 10);
}

/** Documento base para contratos sin `doc` (creados antes o subidos como PDF externo). */
export function docFromContract(c: Contract): WizData {
  const totalConIva = parseCLP(c.value);
  const neto = totalConIva > 0 ? Math.round(totalConIva / (1 + DOC_IVA)) : 0;
  return {
    client: c.client || "",
    project: c.title || "",
    scope: c.notes || "",
    date: c.signedAt || new Date().toISOString().slice(0, 10),
    advisor: "",
    modules: [{ id: uid(), name: c.title || "Servicio", desc: c.notes || "", price: neto }],
    downPct: 50, notes: "", monthly: "", monthlyPrice: "", validityDays: 15,
  };
}

/** Mezcla los cambios que devuelve la IA sobre el documento actual y sanea tipos. */
export function normalizeDoc(base: WizData, incoming?: Partial<WizData> | null): WizData {
  const d = { ...base, ...(incoming || {}) } as WizData;
  const mods = Array.isArray(d.modules) ? d.modules : [];
  d.modules = mods.map(m => ({
    id: m?.id || uid(),
    name: String(m?.name ?? ""),
    desc: String(m?.desc ?? ""),
    price: Number(m?.price) || 0,
  }));
  if (d.modules.length === 0) d.modules = [{ id: uid(), name: "", desc: "", price: 0 }];
  d.downPct = Math.min(100, Math.max(0, Number(d.downPct) || 0));
  d.validityDays = Math.max(0, Number(d.validityDays) || 0);
  d.monthlyPrice = String(d.monthlyPrice ?? "");
  d.client = String(d.client ?? ""); d.project = String(d.project ?? "");
  d.scope = String(d.scope ?? ""); d.notes = String(d.notes ?? "");
  d.advisor = String(d.advisor ?? ""); d.monthly = String(d.monthly ?? "");
  d.date = String(d.date ?? "");
  return d;
}


/* ------------------------------------------------------------------
   Versión técnica del contrato.

   Del mismo trato salen dos documentos: la cotización comercial (con precios,
   para el cliente) y este brief (sin ningún monto, para quien construye).
   Se genera y se sube sola cada vez que el contrato nace o cambia.
   ------------------------------------------------------------------ */
/** Motivo del último brief que no se pudo generar; lo lee el flujo de creación. */
export let ultimoErrorBrief: string | null = null;

/**
 * Pide el brief técnico al servidor.
 *
 * Devolvía `null` ante cualquier fallo y nadie preguntaba por qué: el contrato
 * se guardaba sin versión técnica y el único indicio era una variación del
 * texto de un toast que nadie lee. Y un contrato activo sin brief hace que el
 * handoff entregue a desarrollo tres tareas genéricas como si fueran el
 * alcance real. Ahora el motivo queda registrado para poder decirlo.
 */
export async function fetchContractBrief(doc: WizData, contract?: Partial<Contract>): Promise<ContractBrief | null> {
  ultimoErrorBrief = null;
  try {
    const res = await fetch(`${DRIVE_API_BASE}/hub/contracts/brief`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc, contract }),
    });
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
      ultimoErrorBrief = cuerpo?.error || `El servidor respondió ${res.status}`;
      return null;
    }
    const data = await res.json() as { brief?: ContractBrief };
    if (!data.brief) ultimoErrorBrief = "El servidor no devolvió un brief.";
    return data.brief ?? null;
  } catch (e) {
    ultimoErrorBrief = e instanceof Error && e.message ? e.message : "No se pudo contactar al servidor";
    return null;
  }
}

/* ------------------------------------------------------------------
   PDFs del contrato — los dibuja el SERVIDOR con la plantilla WebMaker
   (la misma línea gráfica que la cotización original). Aquí solo se pide,
   se descarga o se manda a Drive. Nada de jspdf ni de matemática de
   dinero en el navegador.
   ------------------------------------------------------------------ */

export function descargarBlob(blob: Blob, nombre: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/**
 * Descarga un PDF del contrato renderizado por el servidor.
 * Devuelve null si salió bien; si no, el motivo para mostrarlo.
 */
export async function descargarDocPdf(
  tipo: "cliente" | "tecnico",
  payload: { doc?: WizData | null; brief?: ContractBrief | null },
): Promise<string | null> {
  try {
    const res = await fetch(`${DRIVE_API_BASE}/hub/contracts/docs/pdf`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, doc: payload.doc ?? undefined, brief: payload.brief ?? undefined }),
    });
    if (!res.ok) {
      const e = (await res.json().catch(() => null)) as { error?: string } | null;
      return e?.error || `El servidor respondió ${res.status}`;
    }
    const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1]
      || (tipo === "cliente" ? "Cotizacion.pdf" : "Documento-Tecnico.pdf");
    descargarBlob(await res.blob(), nombre);
    return null;
  } catch {
    return "No se pudo contactar al servidor";
  }
}

export interface DocsRegenerados {
  ok: boolean;
  code?: string;
  error?: string;
  pdf?: { url: string; title: string; uploadedAt: number };
  brief?: { url: string; title: string; uploadedAt: number };
  docHash?: string;
  briefHash?: string;
}

/**
 * Regenera los documentos en el servidor y los sube a Drive (carpeta del Hub).
 * Con `ok: false` puede venir igual lo que alcanzó a subir (fallo parcial).
 */
export async function regenerarDocsServidor(payload: {
  doc?: WizData;
  brief?: ContractBrief;
  meta?: { client?: string; project?: string; date?: string };
}): Promise<DocsRegenerados> {
  try {
    const res = await fetch(`${DRIVE_API_BASE}/hub/contracts/docs/regenerar`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const cuerpo = (await res.json().catch(() => null)) as
      | (DocsRegenerados & { parcial?: Partial<DocsRegenerados> })
      | null;
    if (res.ok && cuerpo) return { ...cuerpo, ok: true };
    return {
      ok: false,
      code: cuerpo?.code || `http_${res.status}`,
      error: cuerpo?.error || `El servidor respondió ${res.status}`,
      ...(cuerpo?.parcial || {}),
    };
  } catch {
    return { ok: false, code: "red", error: "No se pudo contactar al servidor" };
  }
}


/* ============================================================
   DRIVE FOLDER PICKER (for project sheets)
   ============================================================ */
export const DRIVE_API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export function FolderPickerPanel({ onSelect }: { onSelect: (id: string, name: string, url: string) => void }) {
  const [currentId, setCurrentId] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<{ id: string | undefined; name: string }[]>([{ id: undefined, name: "Mi Drive" }]);
  const { data: foldersData, isLoading } = useListDriveFolders({ parentId: currentId });
  const folders = foldersData || [];

  const goInto = (id: string, name: string) => { setHistory(prev => [...prev, { id, name }]); setCurrentId(id); };
  const goBack = () => {
    if (history.length <= 1) return;
    const next = history.slice(0, -1);
    setHistory(next); setCurrentId(next[next.length - 1].id);
  };
  const cur = history[history.length - 1];

  const rowBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--line-soft)", color: "var(--text)", padding: "9px 12px", textAlign: "left", cursor: "pointer", fontSize: 13 };
  const miniBtn: React.CSSProperties = { background: "var(--card1)", border: "1px solid var(--line)", color: "var(--dim)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" };
  const selBtn: React.CSSProperties = { background: "var(--orange)", border: "none", color: "hsl(var(--primary-foreground))", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", marginTop: 8 }}>
      <div style={{ background: "var(--card2)", padding: "8px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid var(--line)" }}>
        {history.length > 1 && <button style={miniBtn} onClick={goBack}>← Atrás</button>}
        <span style={{ flex: 1, fontSize: 11.5, color: "var(--faint)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {history.map(h => h.name).join(" / ")}
        </span>
        {cur.id && (
          <button style={selBtn} onClick={() => onSelect(cur.id!, cur.name, `https://drive.google.com/drive/folders/${cur.id}`)}>
            ✓ Seleccionar esta carpeta
          </button>
        )}
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {isLoading && <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--faint)" }}>Cargando carpetas…</div>}
        {!isLoading && folders.length === 0 && <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--faint)" }}>No hay subcarpetas aquí.</div>}
        {folders.map(f => (
          <button key={f.id} style={rowBtn} onClick={() => goInto(f.id!, f.name!)}>
            <svg viewBox="0 0 24 24" fill="currentColor" width={15} height={15} style={{ color: "var(--orange2)", flexShrink: 0 }}><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>
            <span style={{ flex: 1 }}>{f.name}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={13} height={13} style={{ color: "var(--faint)" }}><path d="M9 18l6-6-6-6"/></svg>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Crea la carpeta automática de un proyecto en Drive.
 *
 * La usan dos flujos: el intento silencioso al crear el proyecto y el botón
 * de reintentar cuando ese primer intento falló. Antes cada uno tenía su
 * propio fetch — al agregar el reintento hubiera quedado una tercera copia.
 */
export async function crearCarpetaAutoProyecto(
  name: string,
  cliente: string,
): Promise<{ ok: true; link: string; driveFolderId?: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${DRIVE_API_BASE}/drive/mkdir`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nombreDeCarpeta(name, cliente), parentId: "hub" }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(e.error || `El servidor respondió ${res.status}`);
    }
    const d = await res.json() as { id?: string; webViewLink?: string };
    const link = d.webViewLink || (d.id ? `https://drive.google.com/drive/folders/${d.id}` : "");
    if (!link) throw new Error("Drive no devolvió un enlace utilizable");
    return { ok: true, link, driveFolderId: d.id };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "error desconocido" };
  }
}

export function DriveFolderSelector({ value, onChange, projectName, clientName, onToast, error }: {
  value: string; onChange: (link: string) => void; projectName: string; clientName?: string; onToast: (msg: string) => void;
  /** Motivo del último intento automático fallido (ver `Project.driveFolderError`). */
  error?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // Pegar el enlace a mano es la salida cuando Drive no está conectado. Sin
  // esto, seleccionar o crear la carpeta eran las DOS únicas formas de vincular
  // una carpeta, así que una cuenta sin Google no podía guardar el link del
  // proyecto — y el proyecto no arrancaba por algo que no tiene que ver con él.
  const [pegando, setPegando] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const folderId = extractDriveFolderId(value);

  const handleCreate = async () => {
    // El nombre lleva el cliente porque dos clientes piden "Landing" el mismo
    // mes, y en la lista de Drive dos carpetas iguales no se distinguen.
    const name = nombreDeCarpeta(projectName, clientName);
    setCreating(true);
    try {
      const res = await fetch(`${DRIVE_API_BASE}/drive/mkdir`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        // Sin parentId la carpeta se creaba suelta en "Mi unidad" de quien la
        // creó, no dentro de la raíz de clientes: nadie más volvía a verla.
        credentials: "include", body: JSON.stringify({ name, parentId: "hub" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error((err as { error?: string }).error || "Error al crear la carpeta");
      }
      const data = await res.json() as { id?: string; webViewLink?: string };
      const link = data.webViewLink || `https://drive.google.com/drive/folders/${data.id}`;
      onChange(link);
      onToast(`Carpeta "${name}" creada en Drive`);
    } catch (e: unknown) {
      onToast(`Error al crear carpeta: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCreating(false);
    }
  };

  const wrapBox: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 9, padding: "10px 13px", background: "var(--card2)", fontSize: 13 };
  const btnSec: React.CSSProperties = { background: "var(--card1)", border: "1px solid var(--line)", color: "var(--dim)", borderRadius: 8, padding: "8px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" };
  const btnPrimary: React.CSSProperties = { background: "var(--orange)", border: "none", color: "hsl(var(--primary-foreground))", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };

  const shortName = projectName.length > 22 ? projectName.slice(0, 22) + "…" : projectName;

  return (
    <div>
      {/* Cualquier enlace vinculado cuenta, no solo los que Drive sabe parsear:
          si no, un enlace pegado a mano se guardaba pero se seguía viendo
          "Sin carpeta vinculada" y parecía que no se había guardado. */}
      {value ? (
        <div style={{ ...wrapBox, display: "flex", alignItems: "center", gap: 10 }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16} style={{ color: "var(--orange2)", flexShrink: 0 }}><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>
          <span style={{ flex: 1, fontSize: 12.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{projectName || "Carpeta vinculada"}</span>
          <a href={value} target="_blank" rel="noopener noreferrer" style={{ ...btnSec, textDecoration: "none" }}>↗ Abrir</a>
          <button style={{ ...btnSec, color: "var(--faint)", padding: "8px 9px" }} title="Desvincular carpeta" onClick={() => { onChange(""); setPickerOpen(false); }}>✕</button>
        </div>
      ) : (
        <div style={{ ...wrapBox, color: "var(--faint)", fontSize: 12 }}>Sin carpeta de Drive vinculada</div>
      )}
      {!value && error && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: "#f87171", lineHeight: 1.4 }}>
          ⚠ La carpeta automática no se pudo crear: {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button style={btnSec} onClick={() => setPickerOpen(v => !v)}>
          {pickerOpen ? "Cerrar selector" : value ? "Cambiar carpeta" : "Seleccionar carpeta"}
        </button>
        <button style={btnSec} onClick={() => { setPegando(v => !v); setLinkDraft(value || ""); }}>
          {pegando ? "Cerrar" : "Pegar enlace"}
        </button>
        {!value && (
          <button style={btnPrimary} onClick={handleCreate} disabled={creating}>
            {creating ? "Creando…" : `+ Crear carpeta${shortName ? ` "${shortName}"` : ""}`}
          </button>
        )}
      </div>
      {pegando && (
        <div style={{ ...wrapBox, marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="url"
            value={linkDraft}
            onChange={e => setLinkDraft(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            style={{ flex: 1, minWidth: 220, background: "var(--card1)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5 }}
          />
          <button
            style={btnPrimary}
            onClick={() => {
              const l = linkDraft.trim();
              if (!l) { onChange(""); setPegando(false); return; }
              if (!/^https?:\/\//i.test(l)) { onToast("El enlace tiene que empezar con http:// o https://"); return; }
              onChange(l);
              setPegando(false);
              onToast("Enlace vinculado");
            }}
          >Vincular</button>
        </div>
      )}

      {pickerOpen && (
        <FolderPickerPanel onSelect={(id, name, url) => {
          onChange(url); setPickerOpen(false); onToast(`Carpeta "${name}" vinculada`);
        }} />
      )}
      {folderId && !pickerOpen && (
        <ProjectDriveInline key={folderId} folderId={folderId} rootName={projectName || "Carpeta del proyecto"} />
      )}
    </div>
  );
}

/* ============================================================
   PDF UPLOAD FIELD
   ============================================================ */
export interface PdfData { url: string; title: string; uploadedAt: number; }
export function PdfUploadField({ value, onChange, onToast }: { value: PdfData | null; onChange: (d: PdfData | null) => void; onToast: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [faltaDrive, setFaltaDrive] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      onToast("Solo se aceptan archivos PDF"); return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("parentId", HUB_DRIVE_ROOT);
      const res = await fetch(`${DRIVE_API_BASE}/drive/upload-pdf`, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as { error?: string; code?: string };
        // El motivo real casi siempre es que la cuenta no autorizó Drive. Un
        // "Error al subir PDF" a secas no daba ninguna pista de qué hacer.
        if (e.code === "google_no_conectado") setFaltaDrive(true);
        onToast(e.error || "Error al subir PDF");
        return;
      }
      const data = await res.json() as { name: string; webViewLink: string; uploadedAt: number };
      onChange({ url: data.webViewLink, title: data.name, uploadedAt: data.uploadedAt });
      onToast("PDF subido a Drive");
    } catch { onToast("Error de conexión al subir PDF"); }
    finally { setUploading(false); }
  };

  if (value) {
    return (
      <div className="pdf-chip">
        <input ref={replaceRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        <span className="pdf-icon">📄</span>
        {editingTitle ? (
          <input
            className="pdf-title-input"
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => { onChange({ ...value, title: titleDraft.trim() || value.title }); setEditingTitle(false); }}
            onKeyDown={e => { if (e.key === "Enter") { onChange({ ...value, title: titleDraft.trim() || value.title }); setEditingTitle(false); } }}
          />
        ) : (
          <button type="button" className="pdf-title-btn" onClick={() => { setTitleDraft(value.title); setEditingTitle(true); }} title="Editar título">{value.title}</button>
        )}
        <span className="pdf-date">{new Date(value.uploadedAt).toLocaleDateString("es-CL")}</span>
        <a className="pdf-open" href={value.url} target="_blank" rel="noopener noreferrer">Abrir</a>
        <button type="button" className="pdf-replace-btn" disabled={uploading} onClick={() => replaceRef.current?.click()} title="Reemplazar PDF">
          {uploading ? "Subiendo…" : "Cambiar"}
        </button>
        <button type="button" className="pdf-remove" onClick={() => onChange(null)} title="Quitar PDF">✕</button>
      </div>
    );
  }

  return (
    <div className="pdf-upload-area">
      <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      <button type="button" className="pdf-select-btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? "Subiendo…" : "📎 Adjuntar PDF"}
      </button>
      <span className="pdf-hint">Solo PDF · máx 50 MB · se guarda en Google Drive</span>
      {/* Si el adjunto falló porque la cuenta no autorizó Drive, el arreglo va
          aquí mismo: antes solo salía un toast que no decía qué hacer. */}
      {faltaDrive && (
        <div style={{ marginTop: 8, width: "100%" }}>
          <ConectarDrive volverA="contratos" motivo="Por eso no se pudo subir el PDF." />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TAREAS: CHECKLIST, COMENTARIOS E HISTORIAL
   ============================================================ */
export function ChecklistEditor({ items, onChange }: { items: ChecklistItem[]; onChange: (next: ChecklistItem[]) => void }) {
  const [draft, setDraft] = useState("");
  const done = items.filter(i => i.done).length;
  const add = () => {
    const text = draft.trim(); if (!text) return;
    onChange([...items, { id: uid(), text, done: false }]);
    setDraft("");
  };
  return (
    <div className="field">
      <label>Checklist{items.length > 0 ? ` · ${done}/${items.length}` : ""}</label>
      {items.length > 0 && (
        <div style={{ height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden", margin: "2px 0 8px" }}>
          <div style={{ height: "100%", width: `${Math.round((done / items.length) * 100)}%`, background: done === items.length ? "#1db87b" : "var(--orange)", transition: "width .25s" }} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map(it => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)" }}>
            <input type="checkbox" checked={it.done} onChange={() => onChange(items.map(x => x.id === it.id ? { ...x, done: !x.done } : x))} style={{ flexShrink: 0, width: 14, height: 14, accentColor: "var(--orange)", cursor: "pointer" }} />
            <span style={{ flex: 1, fontSize: "0.82em", color: it.done ? "var(--faint)" : "var(--text)", textDecoration: it.done ? "line-through" : "none" }}>{it.text}</span>
            <button onClick={() => onChange(items.filter(x => x.id !== it.id))} title="Quitar" style={{ background: "none", border: "none", color: "var(--faint)", cursor: "pointer", fontSize: 11, padding: 2, lineHeight: 1 }}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: items.length ? 6 : 0 }}>
        <input type="text" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Agregar subtarea…" style={{ flex: 1 }} />
        <button onClick={add} disabled={!draft.trim()} style={{ flexShrink: 0, padding: "0 14px", borderRadius: 8, border: "1px solid var(--orange-line)", background: "transparent", color: "var(--orange2)", cursor: draft.trim() ? "pointer" : "default", opacity: draft.trim() ? 1 : 0.4, fontSize: 14 }}>+</button>
      </div>
    </div>
  );
}

export function fmtCommentDate(x: string): string {
  try { return new Date(x).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return x; }
}

export function TaskComments({ taskId, onToast }: { taskId: number; onToast: (msg: string) => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const { data, isLoading } = useQuery<{ comments: TaskComment[] }>({
    queryKey: ["hub-task-comments", taskId],
    queryFn: async () => {
      const r = await fetch(`${DRIVE_API_BASE}/hub/tasks/${taskId}/comments`, { credentials: "include" });
      if (!r.ok) throw new Error("comments");
      return r.json();
    },
    staleTime: 15_000,
  });
  const comments = data?.comments ?? [];
  const send = async () => {
    const body = draft.trim(); if (!body || sending) return;
    setSending(true);
    try {
      const r = await fetch(`${DRIVE_API_BASE}/hub/tasks/${taskId}/comments`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({} as Record<string, unknown>)); onToast((e as { error?: string }).error || "Error al comentar"); return; }
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["hub-task-comments", taskId] });
    } catch { onToast("Error de conexión"); }
    finally { setSending(false); }
  };
  return (
    <div className="field" style={{ marginTop: 14 }}>
      <label>Comentarios{comments.length > 0 ? ` · ${comments.length}` : ""}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {isLoading && <div style={{ fontSize: "0.78em", color: "var(--faint)" }}>Cargando…</div>}
        {!isLoading && comments.length === 0 && <div style={{ fontSize: "0.78em", color: "var(--faint)" }}>Sin comentarios aún.</div>}
        {comments.map(c => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)" }}>
            {c.authorPicture
              ? <img src={c.authorPicture} alt="" referrerPolicy="no-referrer" style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1 }} />
              : <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: "var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{(c.authorName || "?").charAt(0).toUpperCase()}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <strong style={{ fontSize: "0.78em" }}>{c.authorName || "—"}</strong>
                <span style={{ fontSize: "0.68em", color: "var(--faint)" }}>{fmtCommentDate(c.createdAt)}</span>
              </div>
              <div style={{ fontSize: "0.82em", whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 2 }}>{c.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input type="text" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void send(); } }} placeholder="Escribe un comentario…" style={{ flex: 1 }} />
        <button onClick={() => void send()} disabled={!draft.trim() || sending} style={{ flexShrink: 0, padding: "0 12px", borderRadius: 8, border: "1px solid var(--orange-line)", background: "transparent", color: "var(--orange2)", cursor: draft.trim() && !sending ? "pointer" : "default", opacity: draft.trim() && !sending ? 1 : 0.4, display: "flex", alignItems: "center" }} title="Enviar"><Send size={13} /></button>
      </div>
    </div>
  );
}

export function historyLabel(a: TaskHistoryItem): string {
  const stageLabel = (id: string | null) => TASK_STAGES.find(s => s.id === id)?.label ?? id ?? "";
  if (a.action === "created") return "creó la tarea";
  if (a.action === "assigned") return "reasignó la tarea";
  if (a.action === "commented") return "comentó";
  if (a.action === "stage_change") return `movió a ${stageLabel(a.newStage)}`;
  return a.action;
}

export function TaskHistory({ taskId }: { taskId: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<{ items: TaskHistoryItem[] }>({
    queryKey: ["hub-task-history", taskId],
    queryFn: async () => {
      const r = await fetch(`${DRIVE_API_BASE}/hub/tasks/${taskId}/activity`, { credentials: "include" });
      if (!r.ok) throw new Error("history");
      return r.json();
    },
    enabled: open,
    staleTime: 15_000,
  });
  const items = data?.items ?? [];
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.78em", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Historial
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
          {isLoading && <div style={{ fontSize: "0.74em", color: "var(--faint)" }}>Cargando…</div>}
          {!isLoading && items.length === 0 && <div style={{ fontSize: "0.74em", color: "var(--faint)" }}>Sin movimientos registrados.</div>}
          {items.map(a => (
            <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: "0.74em", color: "var(--muted)" }}>
              <span style={{ color: "var(--faint)", flexShrink: 0 }}>{fmtCommentDate(a.createdAt)}</span>
              <span style={{ overflowWrap: "anywhere" }}><strong style={{ color: "var(--text)" }}>{a.actorName || "—"}</strong> {historyLabel(a)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SHEET CONTENT
   ============================================================ */

/**
 * Bloque de la versión técnica del contrato. Es lo único del contrato que ve
 * quien construye, así que aquí no se renderiza ningún dato comercial.
 */
export function BriefView({ brief, briefUrl, doc, onGenerate, generating, estadoContrato }: {
  brief?: ContractBrief; briefUrl?: string; doc?: WizData;
  /** Estado del contrato: activo sin brief es un problema, borrador no. */
  estadoContrato?: string;
  /** Solo se pasa cuando el rol puede escribir contratos: genera o rehace el brief. */
  onGenerate?: () => void; generating?: boolean;
}) {
  const mods = brief?.alcance ?? [];
  return (
    <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      {/* Un contrato ACTIVO sin brief no es un detalle pendiente: al cerrar la
          venta, el handoff no encuentra módulos y le entrega a desarrollo tres
          tareas genéricas ("Kickoff interno", "Levantamiento…") como si fueran
          el alcance real del proyecto. */}
      {!brief && estadoContrato === "activo" && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.35)", borderRadius: 10, padding: "8px 10px", marginBottom: 12 }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <div style={{ fontSize: "0.76em", lineHeight: 1.45 }}>
            <strong>Este contrato ya está activo y no tiene versión técnica.</strong>{" "}
            Las tareas que recibió desarrollo son las genéricas de arranque, no el alcance
            real. Genera el brief y reparte las tareas desde ahí.
          </div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "1em" }}>🛠️</span>
        <strong style={{ fontSize: "0.92em" }}>Versión técnica</strong>
        {briefUrl && (
          <a href={briefUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75em", color: "var(--accent, #ff7800)" }}>
            Abrir PDF ↗
          </a>
        )}
      </div>

      {!brief ? (
        <>
          <p style={{ fontSize: "0.78em", color: "var(--muted)", margin: "0 0 10px" }}>
            Este contrato todavía no tiene versión técnica. Genérala para que el equipo vea
            los requerimientos sin acceder a la información comercial.
          </p>
          {onGenerate && (
            <button
              disabled={generating}
              onClick={onGenerate}
              style={{
                width: "100%", padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)",
                background: "rgba(255,120,0,0.1)", color: "var(--accent, #ff7800)",
                fontWeight: 600, fontSize: "0.86em", cursor: generating ? "not-allowed" : "pointer",
              }}
            >{generating ? "⏳ Redactando el brief con IA…" : "🛠️ Generar brief técnico"}</button>
          )}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "0.8em" }}>
          {brief.objetivo && (
            <div><div style={{ fontSize: "0.85em", color: "var(--muted)", marginBottom: 2 }}>Objetivo</div>{brief.objetivo}</div>
          )}
          {mods.length > 0 && (
            <div>
              <div style={{ fontSize: "0.85em", color: "var(--muted)", marginBottom: 4 }}>Alcance por módulo</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {mods.map((m, i) => (
                  <div key={i} style={{ padding: "8px 11px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 600 }}>{m.modulo}</div>
                    {m.descripcion && <div style={{ color: "var(--muted)", marginTop: 2 }}>{m.descripcion}</div>}
                    {m.entregables?.length > 0 && (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 16, color: "var(--muted)" }}>
                        {m.entregables.map((e, j) => <li key={j}>{e}</li>)}
                      </ul>
                    )}
                    {m.requisitos?.length > 0 && (
                      <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                        {m.requisitos.map((r, j) => <li key={j}>{r}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {brief.criteriosAceptacion?.length > 0 && (
            <div>
              <div style={{ fontSize: "0.85em", color: "var(--muted)", marginBottom: 2 }}>Criterios de aceptación</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>{brief.criteriosAceptacion.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {brief.fueraDeAlcance?.length > 0 && (
            <div>
              <div style={{ fontSize: "0.85em", color: "var(--muted)", marginBottom: 2 }}>Fuera de alcance</div>
              <ul style={{ margin: 0, paddingLeft: 16, color: "var(--muted)" }}>{brief.fueraDeAlcance.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          {brief.stackSugerido?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {brief.stackSugerido.map((x, i) => (
                <span key={i} style={{ fontSize: "0.9em", padding: "2px 8px", borderRadius: 10, background: "var(--card-bg)", border: "1px solid var(--border)" }}>{x}</span>
              ))}
            </div>
          )}
          {doc?.scope && !brief.objetivo && <div style={{ color: "var(--muted)" }}>{doc.scope}</div>}
          {onGenerate && (
            <button
              disabled={generating}
              onClick={onGenerate}
              style={{
                marginTop: 2, padding: "8px 0", borderRadius: 8, border: "1px solid var(--border)",
                background: "transparent", color: "var(--fg)", fontWeight: 500, fontSize: "0.95em",
                cursor: generating ? "not-allowed" : "pointer",
              }}
            >{generating ? "⏳ Rehaciendo el brief…" : "↻ Rehacer brief técnico"}</button>
          )}
        </div>
      )}
    </div>
  );
}

export interface SheetProps { sheet: SheetKind; state: HubState; onClose: () => void; onSave: (next: StateUpdater) => void; onToast: (msg: string, undo?: () => void) => void; onNavigate: (tab: Tab) => void; onOpenSheet: (s: SheetKind) => void; onConfirm: (msg: string, onYes: () => void) => void; canWrite: (scope: HubScope) => boolean; apiTasks: HubTask[]; teamMembers: TeamMember[]; onRefreshTasks: () => void; onBoardRefresh: () => void; }

export function SheetContent({ sheet, state, onClose, onSave, onToast, onNavigate, onOpenSheet, onConfirm, canWrite, apiTasks, teamMembers, onRefreshTasks, onBoardRefresh }: SheetProps) {
  const authUser = useAuth();
  const queryClient = useQueryClient();
  const canDeleteTasks = authUser?.role === "superadmin" || authUser?.teamRole === "ceo";
  const r = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>({});
  const R = (k: string) => (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => { r.current[k] = el; };
  const V = (k: string) => (r.current[k] as HTMLInputElement | null)?.value ?? "";
  const [taskChecklist, setTaskChecklist] = useState<ChecklistItem[]>([]);
  const [driveFolderLink, setDriveFolderLink] = useState("");
  /** Si el área de marketing trabaja en el proyecto abierto (opt-in explícito). */
  const [marketingOn, setMarketingOn] = useState(false);
  /** A quién le toca el proyecto abierto, por id real de usuario. */
  const [asignados, setAsignados] = useState<number[]>([]);
  const [projNameDraft, setProjNameDraft] = useState("");
  const [pdfData, setPdfData] = useState<PdfData | null>(null);
  const [wizStep, setWizStep] = useState(1);
  const [wiz, setWiz] = useState<WizData>(emptyWiz);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [cotJson, setCotJson] = useState("");
  // Si la persona editó el JSON a mano, el PDF que sube ya no es fiel reflejo
  // del documento estructurado (wiz): en ese caso NO se guarda huella de
  // frescura y el panel dirá "desactualizado" hasta regenerar. Honesto.
  const [cotEdited, setCotEdited] = useState(false);
  const [cotHtml, setCotHtml] = useState<string | null>(null);
  const [cotError, setCotError] = useState<string | null>(null);
  const [cotLoading, setCotLoading] = useState(false);
  const [cotShowJson, setCotShowJson] = useState(false);
  const [cotEstimated, setCotEstimated] = useState(false);
  const [wizAdvanced, setWizAdvanced] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState("");
  const [meetingExtracting, setMeetingExtracting] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [extractingProject, setExtractingProject] = useState(false);
  const [scrumLoading, setScrumLoading] = useState(false);
  const [scrumProposed, setScrumProposed] = useState<Array<{ title: string; crit: string; notes: string; selected: boolean }>>([]);
  const [projPrefilledByAI, setProjPrefilledByAI] = useState(false);
  const projPreFillRef = useRef<Record<string, string>>({});
  const [projectCreatedContractIds, setProjectCreatedContractIds] = useState<Set<string>>(new Set());
  const [duplicateProjectWarning, setDuplicateProjectWarning] = useState<{ name: string; client: string; pendingPrefill: Record<string, string> } | null>(null);
  const newProjFromContractIdRef = useRef<string | null>(null);
  // Playbooks: plantillas de proceso que generan tareas estándar al crear proyecto.
  const [playbookId, setPlaybookId] = useState<string>("");
  const { data: playbooksData } = useQuery<{ playbooks: Array<{ id: number; name: string; workType: string; archived: boolean; tasks: Array<{ title: string }> }> }>({
    queryKey: ["hub-playbooks"],
    queryFn: async () => {
      const r = await fetch(`${DRIVE_API_BASE}/hub/playbooks`, { credentials: "include" });
      if (!r.ok) throw new Error("playbooks");
      return r.json();
    },
    enabled: sheet?.kind === "new-proj",
    staleTime: 5 * 60_000,
  });
  // Carga de trabajo por persona: semáforo al momento de asignar.
  const { data: workloadData } = useQuery<{ members: Array<{ id: number; total: number; semaphore: "green" | "yellow" | "red" }> }>({
    queryKey: ["team-workload"],
    queryFn: async () => {
      const r = await fetch(`${DRIVE_API_BASE}/team/workload`, { credentials: "include" });
      if (!r.ok) throw new Error("workload");
      return r.json();
    },
    enabled: sheet?.kind === "new-task" || sheet?.kind === "task",
    staleTime: 60_000,
  });
  const workloadOf = (userId: number): string => {
    const w = workloadData?.members.find(m => m.id === userId);
    if (!w) return "";
    const dot = w.semaphore === "red" ? "🔴" : w.semaphore === "yellow" ? "🟡" : "🟢";
    return ` ${dot} ${w.total} abierta${w.total === 1 ? "" : "s"}`;
  };
  const lastScrumProjIdRef = useRef<string | null>(null);
  // Documento (cotización) del contrato abierto: borrador editable por el chat IA.
  const [docDraft, setDocDraft] = useState<WizData | null>(null);
  const [faltaDriveDocs, setFaltaDriveDocs] = useState(false);
  // Se consulta ANTES de que la persona intente regenerar algo: a ventas
  // nunca se le ofreció "Conectar Google Drive" en una página a la que
  // tuviera acceso, así que sin esto el primer aviso llegaba recién después
  // de un intento fallido (y muchas veces ni se leía el toast).
  const estadoDriveDocs = useEstadoDrive(sheet?.kind === "contract");
  const [descargandoDoc, setDescargandoDoc] = useState<"cliente" | "tecnico" | null>(null);
  const [regeneratingDoc, setRegeneratingDoc] = useState(false);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const lastContractSheetIdRef = useRef<string | null>(null);
  // Editor de notas: categoría/pin como estado (chips), vista previa del formato ligero
  const [noteDraftCat, setNoteDraftCat] = useState<NoteCat>("proyecto");
  const [noteDraftPinned, setNoteDraftPinned] = useState(false);
  const [notePreviewOn, setNotePreviewOn] = useState(false);
  const [noteBodyTick, setNoteBodyTick] = useState(0);
  const noteInitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (sheet?.kind === "proj") {
      const p = state.projects.find(x => x.id === (sheet as { id: string }).id);
      if (p) { setDriveFolderLink(p.link || ""); setProjNameDraft(p.name || ""); setMarketingOn(p.marketing === true); setAsignados(asignadosDe(p)); }
      // Reset Scrum proposals when switching to a different project
      if (lastScrumProjIdRef.current !== (sheet as { id: string }).id) {
        setScrumProposed([]); setScrumLoading(false);
        lastScrumProjIdRef.current = (sheet as { id: string }).id;
      }
    }
    if (sheet?.kind === "new-proj") {
      const pf = projPreFillRef.current;
      const hasPrefill = Object.keys(pf).length > 0;
      setDriveFolderLink("");
      setMarketingOn(false);
      setProjNameDraft(hasPrefill ? (pf.name || "") : "");
      setProjPrefilledByAI(hasPrefill);
      newProjFromContractIdRef.current = pf.fromContractId || null;
      setPlaybookId("");
      projPreFillRef.current = {}; // clear after reading so next fresh open starts blank
    }
    if (sheet?.kind === "contract") {
      // Solo reiniciamos chat/documento al abrir OTRO contrato: al guardar
      // (regenerar PDF) el estado cambia y el sheet sigue abierto.
      const id = (sheet as { id: string }).id;
      const c = state.contracts.find(x => x.id === id);
      if (lastContractSheetIdRef.current !== id) {
        lastContractSheetIdRef.current = id;
        if (c && c.pdfUrl) setPdfData({ url: c.pdfUrl, title: c.pdfTitle || "", uploadedAt: c.pdfUploadedAt || 0 });
        else setPdfData(null);
        setChatHistory([]); setChatInput(""); setExtractingProject(false);
        setDuplicateProjectWarning(null);
        setDocDraft(c?.doc ? normalizeDoc(c.doc) : null);
        setFaltaDriveDocs(false); setDescargandoDoc(null); setRegeneratingDoc(false);
      }
    } else {
      lastContractSheetIdRef.current = null;
    }
    if (sheet?.kind === "new-contract") { setPdfData(null); setAiExtracting(false); }
    if (sheet?.kind === "new-contract-meeting") { setMeetingNotes(""); setMeetingExtracting(false); }
    // Draft de nota: inicializa solo cuando cambia la identidad del sheet (no cuando state.notes
    // muta con el sheet abierto, p.ej. pin/unpin desde una tarjeta), para no perder cambios en curso.
    const noteKey = sheet?.kind === "new-note" ? "new-note" : sheet?.kind === "note" ? `note:${sheet.id}` : null;
    if (noteKey !== noteInitKeyRef.current) {
      noteInitKeyRef.current = noteKey;
      if (noteKey === "new-note") {
        setNoteDraftCat("proyecto"); setNoteDraftPinned(false); setNotePreviewOn(false); setNoteBodyTick(0);
      } else if (noteKey && sheet?.kind === "note") {
        const n = state.notes.find(x => x.id === sheet.id);
        setNoteDraftCat(n?.cat ?? "proyecto"); setNoteDraftPinned(!!n?.pinned); setNotePreviewOn(false); setNoteBodyTick(0);
      }
    }
  }, [sheet, state.projects, state.contracts, state.notes]);

  useEffect(() => {
    if (sheet?.kind === "new-contract-wizard") { setWizStep(1); setWiz(emptyWiz()); setGeneratingPdf(false); setMeetingNotes(""); setMeetingExtracting(false); setCotJson(""); setCotHtml(null); setCotError(null); setCotLoading(false); setCotShowJson(false); setCotEdited(false); }
  }, [sheet?.kind]);

  // Sincroniza el checklist local al abrir una tarea (o resetear en tarea nueva).
  useEffect(() => {
    if (sheet?.kind === "task") {
      const t = apiTasks.find(x => x.id === (sheet as { kind: "task"; id: number }).id);
      setTaskChecklist(t?.checklist ?? []);
    } else if (sheet?.kind === "new-task") {
      setTaskChecklist([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  const extractFromMeeting = async (notes: string, onFill: (data: Record<string, string>) => void) => {
    setMeetingExtracting(true);
    try {
      const res = await fetch(`${DRIVE_API_BASE}/hub/contracts/extract-from-meeting`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({} as Record<string,string>)); onToast((e as {error?:string}).error || "Error al procesar las notas"); return; }
      const data = await res.json() as Record<string, string>;
      onFill(data);
      onToast("Información extraída de la reunión ✓");
    } catch { onToast("Error de conexión"); }
    finally { setMeetingExtracting(false); }
  };

  /**
   * Regenera el PDF del contrato a partir del documento (`d`), lo sube a Drive
   * y persiste documento + ficha + nuevo enlace. Es lo que hace que los cambios
   * del chat IA lleguen al documento que ve el cliente.
   */
  const regenerateContractDoc = async (c: Contract, d: WizData) => {
    setRegeneratingDoc(true);
    try {
      // 1) Brief nuevo desde el documento actual. Si la IA falla se conserva
      //    el anterior (y se dice), pero la cotización no se detiene por eso.
      const briefNuevo = await fetchContractBrief(d, { title: c.title, client: c.client, notes: c.notes });

      // 2) El servidor dibuja los PDFs con la plantilla WebMaker y los sube a
      //    Drive. Si el brief no se pudo rehacer, NO se re-sube el viejo (ya no
      //    describe este documento): el técnico queda marcado desactualizado.
      const r = await regenerarDocsServidor(briefNuevo ? { doc: d, brief: briefNuevo } : { doc: d });

      // La ficha siempre queda alineada con el documento. Los hashes SOLO se
      // actualizan si su PDF de verdad llegó a Drive: si no subió, el PDF
      // viejo sigue allá afuera y el panel debe seguir diciendo "desactualizado".
      const totals = docTotals(d);
      const exp = docExpiry(d);
      if (r.pdf) setPdfData({ url: r.pdf.url, title: r.pdf.title, uploadedAt: r.pdf.uploadedAt });
      onSave({
        ...state,
        contracts: state.contracts.map(x => x.id !== c.id ? x : {
          ...x,
          title: (V("ti").trim() || d.project || x.title),
          client: d.client || V("cl"),
          value: totals.total > 0 ? fmtCLP(totals.total) : V("va"),
          status: (V("st") || x.status) as ContractStatus,
          signedAt: d.date || V("si"),
          expiresAt: exp || V("ex"),
          notes: V("no") || d.scope,
          doc: d,
          brief: briefNuevo ?? x.brief,
          ...(r.pdf ? { pdfUrl: r.pdf.url, pdfTitle: r.pdf.title, pdfUploadedAt: r.pdf.uploadedAt, docHash: r.docHash } : {}),
          ...(r.brief ? { briefUrl: r.brief.url, briefTitle: r.brief.title, briefUploadedAt: r.brief.uploadedAt, briefHash: r.briefHash } : {}),
          // Sin brief nuevo, la huella del técnico se borra: su PDF describe un
          // documento que ya no existe y debe verse "desactualizado".
          ...(briefNuevo ? {} : { briefHash: undefined }),
          updatedAt: Date.now(),
        }),
      });

      if (r.ok) {
        setFaltaDriveDocs(false);
        onToast(briefNuevo
          ? "Documentos regenerados y subidos a Drive ✓"
          : `Cotización regenerada y subida a Drive ✓ — el brief no se pudo rehacer${ultimoErrorBrief ? ` (${ultimoErrorBrief})` : ""} y quedó marcado desactualizado.`);
      } else if (r.code === "google_no_conectado") {
        setFaltaDriveDocs(true);
        onToast("Cambios guardados, pero falta conectar Google Drive: mientras tanto puedes descargar los PDFs desde las tarjetas.");
      } else {
        onToast(`Cambios guardados, pero Drive falló al subir (${r.error || "error desconocido"}). Descarga los PDFs desde las tarjetas.`);
      }
    } finally {
      setRegeneratingDoc(false);
    }
  };

  /**
   * Genera (o rehace) solo la versión técnica de un contrato, sin tocar la
   * cotización comercial ni su PDF. Sirve para los contratos que ya existían
   * antes de que el brief fuera automático.
   */
  const generateBriefFor = async (c: Contract) => {
    // Si el contrato no tiene documento estructurado (PDF externo o carga
    // manual), se arma uno desde la ficha para tener algo que describir.
    const source = docDraft ?? c.doc ?? docFromContract(c);
    setGeneratingBrief(true);
    try {
      const brief = await fetchContractBrief(source, { title: c.title, client: c.client, notes: c.notes });
      if (!brief) { onToast(`No se pudo generar el brief técnico${ultimoErrorBrief ? ` (${ultimoErrorBrief})` : ""}`); return; }
      // Solo el técnico: sin `doc` no lleva montos y no exige permisos de dinero.
      const r = await regenerarDocsServidor({ brief, meta: { client: source.client, project: source.project, date: source.date } });
      onSave({
        ...state,
        contracts: state.contracts.map(x => x.id !== c.id ? x : {
          ...x,
          doc: x.doc ?? source,
          brief,
          ...(r.brief ? { briefUrl: r.brief.url, briefTitle: r.brief.title, briefUploadedAt: r.brief.uploadedAt, briefHash: r.briefHash } : {}),
          updatedAt: Date.now(),
        }),
      });
      if (r.ok) { setFaltaDriveDocs(false); onToast("Brief técnico generado y subido a Drive ✓"); }
      else if (r.code === "google_no_conectado") { setFaltaDriveDocs(true); onToast("Brief generado. Falta conectar Google Drive para subirlo: descárgalo desde la tarjeta."); }
      else onToast(`Brief generado, pero Drive falló al subir (${r.error || "error desconocido"}). Descárgalo desde la tarjeta.`);
    } finally {
      setGeneratingBrief(false);
    }
  };

  if (!sheet) return null;

  /* ---- Nueva tarea ---- */
  if (sheet.kind === "new-task") {
    return (<>
      <div className="sheet-head"><h2>Nueva tarea</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("t")} placeholder="Ej: Maquetar checkout" /></div>
      <div className="two field">
        <div><label>Proyecto</label><select ref={R("proj")}><option value="">— sin proyecto —</option>{state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label>Prioridad</label><select ref={R("crit")}><option value="crítica">Crítica</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
      </div>
      <div className="two field">
        <div><label>Etapa</label><select ref={R("stage")}>{TASK_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Vencimiento</label><input type="date" ref={R("due")} /></div>
      </div>
      {teamMembers.length > 0 && (
        <div className="field"><label>Asignar a</label><select ref={R("assignee")}><option value="">— sin asignar —</option>{teamMembers.map(m => <option key={m.id} value={m.id}>{(m.name || m.email) + workloadOf(m.id)}</option>)}</select></div>
      )}
      <div className="field"><label>Notas</label><textarea ref={R("notes") as React.Ref<HTMLTextAreaElement>} rows={4} /></div>
      <ChecklistEditor items={taskChecklist} onChange={setTaskChecklist} />
      <button className="add-btn" onClick={async () => {
        const title = V("t").trim(); if (!title) { onToast("Ponle un título a la tarea"); return; }
        const assigneeRaw = V("assignee");
        const assigneeId = assigneeRaw ? parseInt(assigneeRaw, 10) : null;
        const dueRaw = V("due");
        const body: Record<string, unknown> = { title, notes: V("notes") || undefined, priority: V("crit") || "media", stage: V("stage") || "backlog", projectRef: V("proj") || undefined };
        if (assigneeId && !isNaN(assigneeId)) body["assigneeId"] = assigneeId;
        if (dueRaw) body["dueDate"] = dueRaw;
        if (taskChecklist.length) body["checklist"] = taskChecklist;
        try {
          const res = await fetch(`${DRIVE_API_BASE}/hub/tasks`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (!res.ok) { const e = await res.json().catch(() => ({} as Record<string, unknown>)); onToast((e as { error?: string }).error || "Error al crear tarea"); return; }
          onRefreshTasks();
          onClose(); onNavigate("proj"); onToast("Tarea creada");
        } catch { onToast("Error de conexión"); }
      }}>Crear tarea</button>
    </>);
  }

  /* ---- Detalle tarea ---- */
  if (sheet.kind === "task") {
    const t = apiTasks.find(x => x.id === (sheet as { kind: "task"; id: number }).id); if (!t) return null;
    return (<>
      <div className="sheet-head"><h2>Tarea</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="detail-meta"><span className={`chip prio-${t.priority}`}>{t.priority}</span><span className="badge">{taskStatusOf(t.stage).label}</span>{t.dueDate && <span className="badge">📅 {t.dueDate}</span>}</div>
      <div className="field"><label>Título</label><input type="text" ref={R("t")} defaultValue={t.title} /></div>
      <div className="two field">
        <div><label>Proyecto</label><select ref={R("proj")} defaultValue={t.projectRef || ""}><option value="">— sin proyecto —</option>{state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label>Prioridad</label><select ref={R("crit")} defaultValue={t.priority}>{["crítica","alta","media","baja"].map(x => <option key={x} value={x}>{x}</option>)}</select></div>
      </div>
      <div className="two field">
        <div><label>Etapa</label><select ref={R("stage")} defaultValue={t.stage}>{TASK_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Vencimiento</label><input type="date" ref={R("due")} defaultValue={t.dueDate || ""} /></div>
      </div>
      {teamMembers.length > 0 && (
        <div className="field"><label>Asignar a</label><select ref={R("assignee")} defaultValue={t.assigneeId != null ? String(t.assigneeId) : ""}><option value="">— sin asignar —</option>{teamMembers.map(m => <option key={m.id} value={m.id}>{(m.name || m.email) + workloadOf(m.id)}</option>)}</select></div>
      )}
      <div className="field"><label>Notas</label><textarea ref={R("notes") as React.Ref<HTMLTextAreaElement>} rows={5} defaultValue={t.notes || ""} /></div>
      <ChecklistEditor items={taskChecklist} onChange={setTaskChecklist} />
      {t.assignee && <div style={{ fontSize: "0.78em", color: "var(--muted)", marginBottom: 8 }}>Asignada a: <strong>{t.assignee.name}</strong></div>}
      <button className="save" onClick={async () => {
        const assigneeRaw = V("assignee");
        const assigneeId = assigneeRaw ? parseInt(assigneeRaw, 10) : null;
        const dueRaw = V("due");
        const body: Record<string, unknown> = { title: V("t").trim() || t.title, notes: V("notes") || null, priority: V("crit"), stage: V("stage"), projectRef: V("proj") || null, assigneeId: assigneeId && !isNaN(assigneeId) ? assigneeId : null, dueDate: dueRaw || null, checklist: taskChecklist };
        try {
          const res = await fetch(`${DRIVE_API_BASE}/hub/tasks/${t.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (!res.ok) { const e = await res.json().catch(() => ({} as Record<string, unknown>)); onToast((e as { error?: string }).error || "Error al guardar"); return; }
          onRefreshTasks(); onClose(); onToast("Tarea actualizada");
        } catch { onToast("Error de conexión"); }
      }}>Guardar cambios</button>
      {(canDeleteTasks || t.createdById === authUser?.id) && (
        <button className="del-link" onClick={() => onConfirm("¿Eliminar esta tarea? No se puede deshacer.", async () => {
          try {
            await fetch(`${DRIVE_API_BASE}/hub/tasks/${t.id}`, { method: "DELETE", credentials: "include" });
            onRefreshTasks(); void queryClient.invalidateQueries({ queryKey: TAREAS_QUERY_KEY }); onClose(); onToast("Tarea eliminada");
          } catch { onToast("Error al eliminar"); }
        })}>Eliminar tarea</button>
      )}
      <TaskComments taskId={t.id} onToast={onToast} />
      <TaskHistory taskId={t.id} />
    </>);
  }

  /* ---- Nuevo proyecto ---- */
  if (sheet.kind === "new-proj") {
    // projPreFillRef.current is read here (before useEffect clears it after mount)
    // uncontrolled inputs use defaultValue (applied only on mount) — safe to read from ref here
    const pf = projPreFillRef.current;
    return (<>
      <div className="sheet-head">
        <h2>Nuevo proyecto</h2>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>
      {projPrefilledByAI && (
        <div style={{ margin: "0 0 10px", padding: "8px 12px", borderRadius: 8, background: "rgba(0,200,120,0.08)", border: "1px solid rgba(0,200,120,0.25)", fontSize: "0.78em", color: "#1db87b" }}>
          ✨ Pre-rellenado por IA desde el contrato — revisa y ajusta los campos antes de crear.
        </div>
      )}
      <div className="field"><label>Nombre</label><input type="text" ref={R("n")} placeholder="Ej: Landing Page Corporativa" value={projNameDraft} onChange={e => setProjNameDraft(e.target.value)} /></div>
      <div className="two field">
        <div><label>Cliente</label><input type="text" ref={R("cli")} list="hub-client-options" defaultValue={pf.client || ""} /><ClientOptions clients={state.clients} /></div>
        <div><label>Tipo</label><input type="text" ref={R("ty")} placeholder="E-commerce, Landing…" defaultValue={pf.type || ""} /></div>
      </div>
      <div className="three field">
        <div><label>Prioridad</label><select ref={R("prio")} defaultValue={pf.prio || "media"}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
        <div><label>Estado</label><select ref={R("st")}>{STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Dueño</label><input type="text" ref={R("ow")} /></div>
      </div>
      <div className="field"><label>Fecha límite (opcional)</label><input type="date" ref={R("due")} defaultValue={pf.due || ""} /></div>
      <div className="field"><label>Carpeta de Drive</label>
        <DriveFolderSelector value={driveFolderLink} onChange={setDriveFolderLink} projectName={projNameDraft} clientName={V("cli")} onToast={onToast} />
      </div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} defaultValue={pf.notes || ""} /></div>
      {(playbooksData?.playbooks?.filter(pb => !pb.archived).length ?? 0) > 0 && (
        <div className="field">
          <label>Playbook (tareas estándar)</label>
          <select value={playbookId} onChange={e => setPlaybookId(e.target.value)}>
            <option value="">Sin playbook</option>
            {playbooksData!.playbooks.filter(pb => !pb.archived).map(pb => (
              <option key={pb.id} value={String(pb.id)}>{pb.name} · {pb.tasks.length} tareas</option>
            ))}
          </select>
        </div>
      )}
      <button className="add-btn" onClick={() => {
        const name = projNameDraft.trim(); if (!name) { onToast("Ponle un nombre al proyecto"); return; }
        const now = Date.now();
        const fromCid = newProjFromContractIdRef.current || undefined;
        // Un contrato, un proyecto.
        //
        // Al pasar a "activo" el servidor ya crea el proyecto solo. Si además
        // se creaba a mano, quedaban DOS para el mismo contrato — y la única
        // defensa era un estado local que se pierde al cerrar el panel, porque
        // este componente se desmonta. Aquí se mira el tablero, que sí sobrevive.
        const yaExiste = fromCid ? state.projects.find(p => p.contractId === fromCid) : undefined;
        if (yaExiste) {
          onToast(`Ese contrato ya tiene el proyecto "${yaExiste.name}". Ábrelo en vez de crear otro.`);
          newProjFromContractIdRef.current = null;
          onClose(); onNavigate("proj");
          return;
        }
        const newProjId = uid();
        const cliente = V("cli").trim();
        onSave({ ...state, projects: [...state.projects, { id: newProjId, name, client: cliente, type: V("ty").trim(), prio: V("prio") as Prio, status: V("st") as ProjStatus, owner: V("ow").trim(), due: V("due"), prog: 0, notes: V("no"), link: driveFolderLink, driveFolderId: idDeCarpeta(driveFolderLink) ?? undefined, contractId: fromCid, createdAt: now, updatedAt: now }] });

        // Carpeta automática: si nadie eligió ni creó una, se crea sola. Era un
        // botón que había que acordarse de pulsar, así que la mitad de los
        // proyectos acababa sin carpeta y el trabajo se repartía por chats.
        //
        // Va DESPUÉS de guardar el proyecto y sin bloquear: si Drive falla, el
        // proyecto ya existe. Al revés, un fallo de Drive impediría crear el
        // proyecto por algo que no tiene nada que ver con él.
        if (!driveFolderLink) {
          void (async () => {
            const resultado = await crearCarpetaAutoProyecto(name, cliente);
            // Se fusiona vía función, no contra un `state`/ref capturado: el
            // modal ya se cerró solo (`onClose()` corrió junto al `onSave`
            // que creó el proyecto), así que este componente puede llevar
            // rato desmontado. Solo el `prev` que entrega React al momento
            // de aplicar el cambio es prueba de que el proyecto ya existe.
            if (resultado.ok) {
              onSave(prev => ({ ...prev, projects: prev.projects.map(p => p.id !== newProjId ? p : { ...p, link: resultado.link, driveFolderId: resultado.driveFolderId, driveFolderError: undefined, updatedAt: Date.now() }) }));
              onToast(`Carpeta de Drive creada para "${name}"`);
            } else {
              // Se guarda el fallo en el proyecto, no solo en un toast: un
              // toast se pierde en segundos y nadie más volvía a enterarse de
              // que la carpeta automática nunca se creó hasta ir a buscar los
              // archivos. Queda visible en la tarjeta con un botón para
              // reintentar.
              onSave(prev => ({ ...prev, projects: prev.projects.map(p => p.id !== newProjId ? p : { ...p, driveFolderError: resultado.error, updatedAt: Date.now() }) }));
              onToast(`El proyecto se creó, pero no se pudo crear su carpeta: ${resultado.error}`);
            }
          })();
        }
        if (playbookId) {
          // Genera las tareas estándar del playbook para el proyecto recién creado.
          fetch(`${DRIVE_API_BASE}/hub/playbooks/${playbookId}/apply`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectRef: newProjId }),
          }).then(async r => {
            if (r.ok) { const d = await r.json(); onToast(`${d.created} tareas creadas desde el playbook`); onRefreshTasks?.(); }
            else onToast("No se pudieron crear las tareas del playbook");
          }).catch(() => onToast("No se pudieron crear las tareas del playbook"));
        }
        if (fromCid) {
          setProjectCreatedContractIds(prev => new Set([...prev, fromCid]));
          newProjFromContractIdRef.current = null;
        }
        onClose(); onNavigate("proj"); onToast("Proyecto creado");
      }}>Crear proyecto</button>
    </>);
  }

  /* ---- Detalle proyecto ---- */
  if (sheet.kind === "proj") {
    const p = state.projects.find(x => x.id === sheet.id); if (!p) return null;
    // Mismo corte que ya usa Ventas en el resto del Hub (torre-panel, catálogo
    // de servicios): dirección y ejecutivos comerciales generan los enlaces
    // de firma, el resto del equipo no.
    const canFirmarProyecto = authUser?.role === "superadmin" || authUser?.teamRole === "ceo" || authUser?.teamRole === "ventas" || (authUser?.teamRole as string) === "ejecutivo";
    return (<>
      <SheetHeader title="Proyecto" subtitle={p.name} icon={<FolderTree className="w-5 h-5" />} onClose={onClose} />
      
      <div className="detail-meta" style={{ marginBottom: "20px" }}>
        <StatusChip label={p.prio} color={CRIT_COLOR[p.prio] || "var(--faint)"} />
        <StatusChip label={statusOf(p.status).label} color={statusOf(p.status).color} />
      </div>

      <SectionHeader title="Datos principales" />
      <div className="field"><label>Nombre</label><input type="text" ref={R("n")} value={projNameDraft} onChange={e => setProjNameDraft(e.target.value)} /></div>
      <div className="two field"><div><label>Cliente</label><input type="text" ref={R("cli")} defaultValue={p.client} list="hub-client-options" /><ClientOptions clients={state.clients} /></div><div><label>Tipo</label><input type="text" ref={R("ty")} defaultValue={p.type} /></div></div>
      <div className="three field">
        <div><label>Prioridad</label><select ref={R("prio")} defaultValue={p.prio}>{["crítica","alta","media","baja"].map(x => <option key={x} value={x}>{x}</option>)}</select></div>
        <div><label>Estado</label><select ref={R("st")} defaultValue={p.status}>{STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Dueño</label><input type="text" ref={R("ow")} defaultValue={p.owner || ""} /></div>
      </div>
      <AsignarProyecto asignados={asignados} soloLectura={!canWrite("projects")} onChange={setAsignados} />
      <div className="field"><label>Fecha límite</label><input type="date" ref={R("due")} defaultValue={p.due || ""} /></div>
      
      {p.contractId && (() => {
        const c = state.contracts.find(x => x.id === p.contractId);
        if (!c) return null;
        const statusColor: Record<ContractStatus, string> = { borrador: "#6aa0c0", activo: "#1db87b", vencido: "#e0795a", cancelado: "#888", perdido: "#8a6a6a" };
        return (
          <div style={{ margin: "0 0 16px", padding: "12px", borderRadius: 10, background: "var(--card-bg, var(--card1))", border: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
            <FileText className="w-5 h-5" style={{ color: "var(--orange2)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--faint)", marginBottom: 4 }}>Contrato origen</div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: "15px", fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <StatusChip label={c.status} color={statusColor[c.status]} />
                {c.value && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "var(--dim)" }}>{c.value}</span>}
              </div>
            </div>
            <button onClick={() => onOpenSheet({ kind: "contract", id: c.id })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg2)", color: "var(--text)", fontSize: "12px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", transition: "border-color 0.2s" }}>Ver detalle →</button>
          </div>
        );
      })()}
      
      {(() => {
        const { done, total, pct } = projProg(p.id, apiTasks);
        return (
          <div className="field" style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span>Avance</span>
              {total > 0 ? <span style={{ color: "var(--text)" }}>{done}/{total} completadas ({pct}%)</span> : <span style={{ color: "var(--faint)", fontWeight: 400 }}>Sin tareas</span>}
            </label>
            <div className="rangewrap" style={{ pointerEvents: "none" }}>
              <div style={{ height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden", width: "100%" }}>
                <div style={{ height: "100%", width: pct + "%", background: pct === 100 ? "#1db87b" : "var(--orange)", borderRadius: 3, transition: "width .3s" }} />
              </div>
            </div>
          </div>
        );
      })()}
      
      <SectionHeader title="Detalles operativos" />
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={6} defaultValue={p.notes || ""} /></div>
      <div className="field">
        <label>Áreas involucradas</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", cursor: "pointer", color: "var(--text)" }}>
          <input type="checkbox" checked={marketingOn} onChange={(e) => setMarketingOn(e.target.checked)} />
          <span>Marketing trabaja en este proyecto</span>
        </label>
        <p style={{ fontSize: "11.5px", color: "var(--dim)", margin: "6px 0 0", lineHeight: 1.4 }}>
          Programación recibe todos los proyectos. Marketing solo los que marques aquí, porque no todos los clientes contratan publicidad.
        </p>
      </div>
      <div className="field">
        <label>Carpeta de Drive</label>
        <DriveFolderSelector value={driveFolderLink} onChange={setDriveFolderLink} projectName={p.name} onToast={onToast} error={p.driveFolderError} />
      </div>
      <button className="save" onClick={() => {
        const newStatus = V("st") as ProjStatus;
        const projects = state.projects.map(x => {
          if (x.id !== p.id) return x;
          const computedProg = projProg(x.id, apiTasks).pct;
          // Guardar un enlace a mano también cuenta como resolver la carpeta:
          // si quedaba un aviso de fallo automático, ya no tiene sentido.
          const u: Record<string, unknown> = { ...x, name: V("n").trim() || x.name, client: V("cli").trim(), type: V("ty").trim(), prio: V("prio"), owner: V("ow").trim(), due: V("due"), prog: computedProg, notes: V("no"), link: driveFolderLink, driveFolderId: idDeCarpeta(driveFolderLink) ?? undefined, driveFolderError: driveFolderLink ? undefined : x.driveFolderError, assigneeIds: asignados, marketing: marketingOn, updatedAt: Date.now() };
          if (newStatus !== x.status) advanceStageObj(u, newStatus, "status");
          return u as unknown as Project;
        });
        onSave({ ...state, projects }); onClose(); onToast("Proyecto actualizado");
      }}>Guardar cambios</button>

      {canFirmarProyecto && <EnlaceFirmaProyecto projectId={p.id} />}

      {/* ---- Generar tareas Scrum con IA ---- */}
      <SectionHeader title="Asistente de tareas" icon={<Sun className="w-4 h-4" />} />
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: "12.5px", color: "var(--dim)", margin: "0 0 14px", lineHeight: 1.5 }}>La IA analiza los requerimientos del proyecto y propone tareas listas para agregar al Backlog.</p>

        {scrumProposed.length === 0 && (
          <button
            disabled={scrumLoading}
            onClick={async () => {
              setScrumLoading(true);
              try {
                const res = await fetch(`${DRIVE_API_BASE}/hub/projects/ai-extract-tasks`, {
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ project: { id: p.id, name: V("n") || p.name, client: V("cli") || p.client, type: V("ty") || p.type, notes: V("no") || p.notes, assigneeIds: p.assigneeIds } }),
                });
                if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; onToast(e.error || "Error al generar tareas"); return; }
                const data = await res.json() as { tasks?: Array<{ title: string; crit: string; notes: string }> };
                const tasks = (data.tasks || []).slice(0, 15).map(t => ({ ...t, selected: true }));
                if (tasks.length === 0) { onToast("La IA no pudo generar tareas — agrega más notas al proyecto"); return; }
                setScrumProposed(tasks);
              } catch { onToast("Error de conexión"); }
              finally { setScrumLoading(false); }
            }}
            className="ai-extract-btn"
            style={{ margin: 0, justifyContent: "center" }}
          >
            {scrumLoading ? <><Clock3 className="w-4 h-4" /> Generando tareas Scrum…</> : <><Sun className="w-4 h-4" /> Generar tareas Scrum</>}
          </button>
        )}

        {scrumProposed.length > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: "12px", color: "var(--dim)", fontFamily: "'IBM Plex Mono', monospace" }}>{scrumProposed.filter(t => t.selected).length} / {scrumProposed.length} seleccionadas</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setScrumProposed(ts => ts.map(t => ({ ...t, selected: true })))} style={{ fontSize: "11px", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card1)", color: "var(--dim)", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }}>Todas</button>
                <button onClick={() => setScrumProposed(ts => ts.map(t => ({ ...t, selected: false })))} style={{ fontSize: "11px", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card1)", color: "var(--dim)", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }}>Ninguna</button>
                <button onClick={() => setScrumProposed([])} aria-label="Descartar propuestas" title="Descartar propuestas" style={{ fontSize: "11px", padding: "4px 10px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card1)", color: "var(--dim)", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }}>✕</button>
              </div>
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {scrumProposed.map((t, i) => (
                <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 10, border: `1px solid ${t.selected ? "var(--orange-line)" : "var(--line)"}`, background: t.selected ? "var(--orange-soft)" : "var(--card1)", cursor: "pointer", userSelect: "none", transition: "border-color 0.2s, background 0.2s" }}>
                  <input type="checkbox" checked={t.selected} onChange={() => setScrumProposed(ts => ts.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: "14.5px", fontWeight: 500, color: "var(--text)" }}>{t.title}</span>
                      <StatusChip label={t.crit} color={CRIT_COLOR[t.crit] || "var(--faint)"} />
                    </div>
                    {t.notes && <p style={{ margin: "0", fontSize: "12px", color: "var(--dim)", lineHeight: 1.5 }}>{t.notes}</p>}
                  </div>
                </label>
              ))}
            </div>
            <button
              disabled={scrumProposed.filter(t => t.selected).length === 0}
              onClick={async () => {
                const selected = scrumProposed.filter(t => t.selected);
                if (!selected.length) return;
                const payload = { tasks: selected.map(t => ({ title: t.title, notes: t.notes || undefined, priority: (["crítica","alta","media","baja"].includes(t.crit) ? t.crit : "media") as Prio, projectRef: p.id })) };
                try {
                  const res = await fetch(`${DRIVE_API_BASE}/hub/tasks/batch`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                  if (!res.ok) { const e = await res.json().catch(() => ({} as Record<string, unknown>)); onToast((e as { error?: string }).error || "Error al crear tareas"); return; }
                  onRefreshTasks();
                  setScrumProposed([]);
                  onToast(`${selected.length} tarea${selected.length !== 1 ? "s" : ""} agregada${selected.length !== 1 ? "s" : ""} al Backlog ✓`);
                } catch { onToast("Error de conexión"); }
              }}
              style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid #1db87b", background: "rgba(0,200,120,0.1)", color: "#1db87b", fontWeight: 600, fontFamily: "'Oswald', sans-serif", fontSize: "14px", letterSpacing: "0.5px", textTransform: "uppercase", cursor: scrumProposed.filter(t => t.selected).length === 0 ? "not-allowed" : "pointer", opacity: scrumProposed.filter(t => t.selected).length === 0 ? 0.5 : 1, transition: "opacity 0.2s" }}
            >
              ✓ Agregar {scrumProposed.filter(t => t.selected).length} tarea{scrumProposed.filter(t => t.selected).length !== 1 ? "s" : ""} al Backlog
            </button>
            <button onClick={async () => {
              setScrumProposed([]);
              setScrumLoading(true);
              try {
                const res = await fetch(`${DRIVE_API_BASE}/hub/projects/ai-extract-tasks`, {
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ project: { id: p.id, name: V("n") || p.name, client: V("cli") || p.client, type: V("ty") || p.type, notes: V("no") || p.notes, assigneeIds: p.assigneeIds } }),
                });
                if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; onToast(e.error || "Error al regenerar tareas"); return; }
                const data = await res.json() as { tasks?: Array<{ title: string; crit: string; notes: string }> };
                setScrumProposed((data.tasks || []).slice(0, 15).map(t => ({ ...t, selected: true })));
              } catch { onToast("Error de conexión"); }
              finally { setScrumLoading(false); }
            }} style={{ marginTop: 8, width: "100%", padding: "8px 0", borderRadius: 8, border: "0", background: "none", color: "var(--dim)", fontSize: "12.5px", cursor: "pointer", transition: "color 0.2s" }} onMouseOver={e => e.currentTarget.style.color = "var(--text)"} onMouseOut={e => e.currentTarget.style.color = "var(--dim)"}>
              ↻ Regenerar propuestas
            </button>
          </>
        )}
      </div>

      <button className="del-link" onClick={() => {
        const snap = [...state.projects];
        const doDelete = () => {
          onSave({ ...state, projects: state.projects.filter(x => x.id !== p.id) });
          onClose(); onToast("Proyecto eliminado", () => onSave({ ...state, projects: snap }));
        };
        const nTasks = apiTasks.filter(t => t.projectRef === p.id).length;
        if (nTasks > 0) onConfirm(`Este proyecto tiene ${nTasks} tarea${nTasks !== 1 ? "s" : ""} asociada${nTasks !== 1 ? "s" : ""} que quedará${nTasks !== 1 ? "n" : ""} sin proyecto. ¿Eliminar de todas formas?`, doDelete);
        else doDelete();
      }}>Eliminar proyecto</button>
    </>);
  }

  /* ---- Nuevo cliente ---- */
  if (sheet.kind === "new-client") {
    return (<>
      <SheetHeader title="Nuevo cliente" icon={<Users2 className="w-5 h-5" />} onClose={onClose} />
      <div className="field"><label>Nombre / Empresa</label><input type="text" ref={R("n")} /></div>
      <div className="two field"><div><label>Contacto</label><input type="text" ref={R("ct")} placeholder="Nombre de quien decide" /></div><div><label>Segmento</label><input type="text" ref={R("sg")} /></div></div>
      <div className="two field"><div><label>WhatsApp</label><input type="tel" ref={R("wa")} placeholder="+56 9 1234 5678" /></div><div><label>Correo</label><input type="email" ref={R("em")} /></div></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} /></div>
      <button className="add-btn" onClick={() => {
        const name = V("n").trim(); if (!name) { onToast("Ponle un nombre al cliente"); return; }
        onSave({ ...state, clients: [...state.clients, { id: uid(), name, contact: V("ct").trim(), segment: V("sg").trim(), whatsapp: V("wa").trim(), email: V("em").trim(), notes: V("no"), createdAt: Date.now() }] });
        onClose(); onNavigate("clients"); onToast("Cliente creado");
      }}>Crear cliente</button>
    </>);
  }

  /* ---- Detalle cliente ---- */
  if (sheet.kind === "client") {
    const c = state.clients.find(x => x.id === sheet.id); if (!c) return null;
    const projs = state.projects.filter(p => p.client === c.name);
    return (<>
      <SheetHeader title="Cliente" subtitle={c.name} icon={<Users2 className="w-5 h-5" />} onClose={onClose} />
      
      <SectionHeader title="Datos de contacto" />
      <div className="field"><label>Nombre / Empresa</label><input type="text" ref={R("n")} defaultValue={c.name} /></div>
      <div className="two field"><div><label>Contacto</label><input type="text" ref={R("ct")} defaultValue={c.contact || ""} placeholder="Nombre de quien decide" /></div><div><label>Segmento</label><input type="text" ref={R("sg")} defaultValue={c.segment || ""} /></div></div>
      <div className="two field">
        <div>
          <label style={{ display: "flex", justifyContent: "space-between" }}>
            <span>WhatsApp</span>
            {linkWhatsapp(c.whatsapp) && (
              <a href={linkWhatsapp(c.whatsapp)!} target="_blank" rel="noopener noreferrer" style={{ color: "var(--orange2)", textDecoration: "none", textTransform: "none", letterSpacing: "normal", fontSize: "11px", fontWeight: 500 }}>↗ Abrir chat</a>
            )}
          </label>
          <input type="tel" ref={R("wa")} defaultValue={c.whatsapp || ""} placeholder="+56 9 1234 5678" />
        </div>
        <div><label>Correo</label><input type="email" ref={R("em")} defaultValue={c.email || ""} /></div>
      </div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={5} defaultValue={c.notes || ""} /></div>
      <button className="save" onClick={() => {
        onSave({ ...state, clients: state.clients.map(x => x.id !== c.id ? x : { ...x, name: V("n").trim() || x.name, contact: V("ct").trim(), segment: V("sg").trim(), whatsapp: V("wa").trim(), email: V("em").trim(), notes: V("no") }) });
        onClose(); onToast("Cliente actualizado");
      }}>Guardar cambios</button>

      {projs.length > 0 && (
        <>
          <SectionHeader title="Proyectos vinculados" count={projs.length} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {projs.map(p => (
              <div key={p.id} style={{ padding: "12px", background: "var(--card1)", border: "1px solid var(--line)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: "14.5px", color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{p.name}</div>
                  <StatusChip label={statusOf(p.status).label} color={statusOf(p.status).color} />
                </div>
                <button onClick={() => onOpenSheet({ kind: "proj", id: p.id })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg2)", color: "var(--text)", fontSize: "12px", fontWeight: 500, cursor: "pointer", transition: "border-color 0.2s" }}>Ver →</button>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="del-link" onClick={() => {
        const snap = [...state.clients];
        const doDelete = () => {
          onSave({ ...state, clients: state.clients.filter(x => x.id !== c.id) });
          onClose(); onToast("Cliente eliminado", () => onSave({ ...state, clients: snap }));
        };
        const nProjs = state.projects.filter(p => p.client === c.name).length;
        const nMeets = state.meetings.filter(m => m.client === c.name).length;
        if (nProjs > 0 || nMeets > 0) {
          const partes = [
            nProjs > 0 ? `${nProjs} proyecto${nProjs !== 1 ? "s" : ""}` : "",
            nMeets > 0 ? `${nMeets} reuni${nMeets !== 1 ? "ones" : "ón"}` : "",
          ].filter(Boolean).join(" y ");
          onConfirm(`"${c.name}" tiene ${partes} vinculado${nProjs + nMeets !== 1 ? "s" : ""}. No se eliminarán, pero quedarán sin cliente en la cartera. ¿Eliminar de todas formas?`, doDelete);
        } else doDelete();
      }}>Eliminar cliente</button>
    </>);
  }

  /* ---- Nueva reunión ---- */
  if (sheet.kind === "new-meet") {
    return (<>
      <SheetHeader title="Nueva reunión" icon={<Headphones className="w-5 h-5" />} onClose={onClose} />
      <div className="two field"><div><label>Cliente</label><input type="text" ref={R("cl")} list="hub-client-options" /><ClientOptions clients={state.clients} /></div><div><label>Fecha</label><input type="date" ref={R("dt")} /></div></div>
      <div className="field"><label>Resumen</label><textarea ref={R("sm") as React.Ref<HTMLTextAreaElement>} rows={3} /></div>
      <div className="field"><label>Notas completas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={6} /></div>
      <button className="add-btn" onClick={() => {
        const client = V("cl").trim(); if (!client) { onToast("Indica el cliente de la reunión"); return; }
        onSave({ ...state, meetings: [...state.meetings, { id: uid(), client, date: V("dt"), summary: V("sm"), notes: V("no"), createdAt: Date.now() }] });
        onClose(); onNavigate("meet"); onToast("Reunión guardada");
      }}>Guardar reunión</button>
    </>);
  }

  /* ---- Detalle reunión ---- */
  if (sheet.kind === "meet") {
    const m = state.meetings.find(x => x.id === sheet.id); if (!m) return null;
    return (<>
      <SheetHeader title="Reunión" subtitle={m.client || "Sin cliente asignado"} icon={<Headphones className="w-5 h-5" />} onClose={onClose} />
      
      {m.contractId && (
        <div style={{ marginBottom: 24, padding: "14px", background: "var(--card1)", border: "1px solid var(--orange-line)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", fontFamily: "'Oswald', sans-serif" }}>Oportunidad de Venta</span>
            <StatusChip label={m.tipo ? TIPO_REUNION_LABEL[m.tipo] || m.tipo : "reunión"} color="var(--disc)" />
            {m.desenlace && <StatusChip label={DESENLACE_REUNION_LABEL[m.desenlace] || m.desenlace} color={m.desenlace === "perdido" ? "#8a6a6a" : "var(--orange2)"} />}
          </div>
          {state.contracts.some(x => x.id === m.contractId) && (
            <button type="button" onClick={() => onOpenSheet({ kind: "contract", id: m.contractId! })} style={{ alignSelf: "flex-start", padding: "8px 14px", background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)", fontSize: "12.5px", fontWeight: 500, cursor: "pointer", transition: "border-color 0.2s" }}>
              Ver oportunidad en Ventas →
            </button>
          )}
        </div>
      )}
      
      <SectionHeader title="Datos de la reunión" />
      <div className="two field"><div><label>Cliente</label><input type="text" ref={R("cl")} defaultValue={m.client || ""} list="hub-client-options" /><ClientOptions clients={state.clients} /></div><div><label>Fecha</label><input type="date" ref={R("dt")} defaultValue={m.date || ""} /></div></div>
      <div className="field"><label>Resumen</label><textarea ref={R("sm") as React.Ref<HTMLTextAreaElement>} rows={3} defaultValue={m.summary || ""} /></div>
      <div className="field"><label>Notas completas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={7} defaultValue={m.notes || ""} /></div>
      <button className="save" onClick={() => {
        // Sin subir updatedAt, la fusión del servidor puede preferir la copia
        // vieja si otro proceso (p. ej. un desenlace) tocó la misma reunión.
        onSave({ ...state, meetings: state.meetings.map(x => x.id !== m.id ? x : { ...x, client: V("cl").trim(), date: V("dt"), summary: V("sm"), notes: V("no"), updatedAt: Date.now() }) });
        onClose(); onToast("Reunión actualizada");
      }}>Guardar cambios</button>
      <button className="del-link" onClick={() => {
        const snap = [...state.meetings];
        onSave({ ...state, meetings: state.meetings.filter(x => x.id !== m.id) });
        onClose(); onToast("Reunión eliminada", () => onSave({ ...state, meetings: snap }));
      }}>Eliminar reunión</button>
    </>);
  }

  /* ---- Editor de notas (compartido nueva/detalle) ---- */
  const noteEditorBody = (defaultBody: string) => (
    <div className="field">
      <label>Contenido</label>
      <div className="note-tools">
        <button type="button" className="note-ins" title="Insertar título" onClick={() => { insertNoteSnippet(r.current["bo"] as HTMLTextAreaElement | null, "# "); setNoteBodyTick(t => t + 1); }}># Título</button>
        <button type="button" className="note-ins" title="Insertar viñeta" onClick={() => { insertNoteSnippet(r.current["bo"] as HTMLTextAreaElement | null, "- "); setNoteBodyTick(t => t + 1); }}>• Viñeta</button>
        <button type="button" className="note-ins" title="Insertar tarea" onClick={() => { insertNoteSnippet(r.current["bo"] as HTMLTextAreaElement | null, "[ ] "); setNoteBodyTick(t => t + 1); }}>☑ Tarea</button>
        <span className="grow" />
        <div className="seg seg-mini" role="tablist" aria-label="Modo de edición">
          <button type="button" className={!notePreviewOn ? "on" : ""} onClick={() => setNotePreviewOn(false)}>Escribir</button>
          <button type="button" className={notePreviewOn ? "on" : ""} onClick={() => { setNoteBodyTick(t => t + 1); setNotePreviewOn(true); }}>Vista</button>
        </div>
      </div>
      <textarea ref={R("bo") as React.Ref<HTMLTextAreaElement>} rows={10} defaultValue={defaultBody}
        placeholder={"Escribe libre, o dale estructura:\n# Título de sección\n- una viñeta\n[ ] tarea pendiente"}
        style={notePreviewOn ? { display: "none" } : undefined} />
      {notePreviewOn && (
        <div className="note-preview note-fmt clickable" key={noteBodyTick}>
          {((r.current["bo"] as HTMLTextAreaElement | null)?.value || "").trim()
            ? renderNoteFmt((r.current["bo"] as HTMLTextAreaElement).value, undefined, idx => {
                const el = r.current["bo"] as HTMLTextAreaElement | null;
                if (el) { el.value = toggleChecklistLine(el.value, idx); setNoteBodyTick(t => t + 1); }
              })
            : <span style={{ color: "var(--faint)", fontSize: 12.5 }}>Nada que previsualizar todavía.</span>}
        </div>
      )}
      {!notePreviewOn && <p className="note-hint">Formato: <b>#</b> título · <b>-</b> viñeta · <b>[ ]</b> tarea (en Vista puedes marcarlas)</p>}
    </div>
  );
  const noteCatPicker = (
    <div className="field"><label>Categoría</label>
      <div className="fchips" role="group" aria-label="Categoría de la nota">
        {(Object.entries(NOTE_CATS) as [NoteCat, string][]).map(([k, v]) => (
          <button key={k} type="button" className={`fchip${noteDraftCat === k ? " on" : ""}`} aria-pressed={noteDraftCat === k} onClick={() => setNoteDraftCat(k)}>
            <span className="fdot" style={{ background: NOTE_CAT_COLORS[k] }} />{v}
          </button>
        ))}
      </div>
    </div>
  );

  /* ---- Nueva nota ---- */
  if (sheet.kind === "new-note") {
    return (<>
      <div className="sheet-head"><h2>Nueva nota</h2><button className="close-btn" onClick={onClose} aria-label="Cerrar">✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("ti")} placeholder="Ej: Acuerdos kickoff · ideas branding" /></div>
      {noteCatPicker}
      {noteEditorBody("")}
      <button type="button" className={`pin-toggle${noteDraftPinned ? " on" : ""}`} aria-pressed={noteDraftPinned} onClick={() => setNoteDraftPinned(p => !p)}>
        <Pin className="w-3.5 h-3.5" style={noteDraftPinned ? { fill: "currentColor" } : undefined} />{noteDraftPinned ? "Fijada arriba" : "Fijar arriba"}
      </button>
      <button className="add-btn" onClick={() => {
        const title = V("ti").trim(); if (!title) { onToast("Ponle un título a la nota"); return; }
        const now = Date.now();
        onSave({ ...state, notes: [...state.notes, { id: uid(), title, cat: noteDraftCat, body: V("bo"), pinned: noteDraftPinned || undefined, createdAt: now, updatedAt: now }] });
        onClose(); onNavigate("notes"); onToast("Nota creada");
      }}>Crear nota</button>
    </>);
  }

  /* ---- Detalle nota ---- */
  if (sheet.kind === "note") {
    const n = state.notes.find(x => x.id === sheet.id); if (!n) return null;
    return (<>
      <div className="sheet-head"><h2>Nota</h2><button className="close-btn" onClick={onClose} aria-label="Cerrar">✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("ti")} defaultValue={n.title} /></div>
      {noteCatPicker}
      {noteEditorBody(n.body || "")}
      <button type="button" className={`pin-toggle${noteDraftPinned ? " on" : ""}`} aria-pressed={noteDraftPinned} onClick={() => setNoteDraftPinned(p => !p)}>
        <Pin className="w-3.5 h-3.5" style={noteDraftPinned ? { fill: "currentColor" } : undefined} />{noteDraftPinned ? "Fijada arriba" : "Fijar arriba"}
      </button>
      <button className="save" onClick={() => {
        onSave({ ...state, notes: state.notes.map(x => x.id !== n.id ? x : { ...x, title: V("ti").trim() || x.title, cat: noteDraftCat, body: V("bo"), pinned: noteDraftPinned || undefined, updatedAt: Date.now() }) });
        onClose(); onToast("Nota actualizada");
      }}>Guardar cambios</button>
      <p className="note-hint" style={{ marginTop: 10 }}>Creada {fmtDate(n.createdAt)}{n.updatedAt && n.updatedAt !== n.createdAt ? ` · editada ${fmtDate(n.updatedAt)}` : ""}</p>
      <button className="del-link" onClick={() => {
        const snap = [...state.notes];
        onSave({ ...state, notes: state.notes.filter(x => x.id !== n.id) });
        onClose(); onToast("Nota eliminada", () => onSave({ ...state, notes: snap }));
      }}>Eliminar nota</button>
    </>);
  }

  /* ---- Selector modo contrato ---- */
  if (sheet.kind === "new-contract-mode") {
    return (<>
      <SheetHeader title="Nuevo contrato" subtitle="¿Qué tipo de contrato quieres agregar?" icon={<FileCheck2 className="w-5 h-5" />} onClose={onClose} />
      <div className="cms-selector" style={{ display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "16px" }}>
        <OptionCard
          icon={<FileCheck2 className="w-6 h-6 text-orange-500" />}
          title="Contrato nuevo"
          desc="Crea la cotización desde cero y genera el PDF con el diseño de WebMaker Latam."
          previewCue="→ 100% personalizable"
          onClick={() => onOpenSheet({ kind: "new-contract-wizard" })}
        />
        <OptionCard
          icon={<Headphones className="w-6 h-6 text-blue-500" />}
          title="Desde reunión"
          desc="Pega las notas de tu reunión y la IA rellena el contrato automáticamente."
          previewCue="→ Ahorra 15 minutos de redacción"
          onClick={() => onOpenSheet({ kind: "new-contract-meeting" })}
        />
        <OptionCard
          icon={<Package className="w-6 h-6 text-green-500" />}
          title="Contrato existente"
          desc="Sube el PDF que ya tienes — extrae los datos automáticamente con IA."
          previewCue="→ Solo subir y listo"
          onClick={() => onOpenSheet({ kind: "new-contract" })}
        />
      </div>
    </>);
  }

  /* ---- Nuevo contrato desde reunión ---- */
  if (sheet.kind === "new-contract-meeting") {
    const existingMeetings = [...state.meetings].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
    return (<>
      <SheetHeader title="Contrato desde reunión" subtitle="Sintetiza acuerdos y fechas" icon={<Headphones className="w-5 h-5" />} onClose={onClose} />

      <SectionHeader title="Fuente de información" />
      <div className="field">
        <label>Notas de la reunión</label>
        {existingMeetings.length > 0 && (
          <select style={{ marginBottom: 8 }} defaultValue="" onChange={e => {
            const m = state.meetings.find(x => x.id === e.target.value);
            if (m) setMeetingNotes([m.client && `Cliente: ${m.client}`, m.date && `Fecha: ${m.date}`, m.summary && `Resumen: ${m.summary}`, m.notes].filter(Boolean).join("\n\n"));
          }}>
            <option value="">— Cargar reunión existente —</option>
            {existingMeetings.map(m => (
              <option key={m.id} value={m.id}>{m.date ? `${m.date} — ` : ""}{m.client || m.summary || "Sin título"}</option>
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
        {meetingExtracting ? <><Clock3 className="w-4 h-4" /> Analizando reunión con IA…</> : <><Sun className="w-4 h-4" /> Completar formulario con IA</>}
      </button>

      <SectionHeader title="Datos extraídos" />
      <div className="field"><label>Título / Descripción</label><input type="text" ref={R("ti")} placeholder="Ej: Servicio de Marketing Digital" /></div>
      <div className="field"><label>Cliente</label><input type="text" ref={R("cl")} placeholder="Nombre del cliente" /></div>
      <div className="field"><label>Valor</label><input type="text" ref={R("va")} placeholder="Ej: $290.000 / mes" /></div>
      <div className="field"><label>Estado</label>
        <select ref={R("st")}>
          <option value="borrador">Borrador</option>
          <option value="activo">Activo</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
          <option value="perdido">Perdido (no se ganó)</option>
        </select>
      </div>
      <div className="field"><label>Fecha de firma</label><input type="date" ref={R("si")} /></div>
      <div className="field"><label>Fecha de vencimiento</label><input type="date" ref={R("ex")} /></div>
      <div className="field"><label>Notas / Alcance</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} placeholder="Términos, detalles, observaciones…" /></div>
      <button className="add-btn" onClick={() => {
        const title = V("ti").trim(); if (!title) { onToast("Ponle un título al contrato"); return; }
        const now = Date.now();
        onSave({ ...state, contracts: [...state.contracts, { id: uid(), title, client: V("cl"), value: V("va"), status: V("st") as ContractStatus, signedAt: V("si"), expiresAt: V("ex"), notes: V("no"), createdAt: now, updatedAt: now }] });
        onClose(); onNavigate("contracts"); onToast("Contrato creado");
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
            const res = await fetch(`${DRIVE_API_BASE}/hub/contracts/extract-pdf`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId }) });
            if (!res.ok) { const e = await res.json().catch(() => ({} as Record<string,string>)); onToast((e as Record<string,string>).error || "Error al extraer datos"); return; }
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
      <div className="field"><label>Cliente</label><input type="text" ref={R("cl")} placeholder="Nombre del cliente" /></div>
      <div className="field"><label>Valor</label><input type="text" ref={R("va")} placeholder="Ej: $290.000 / mes" /></div>
      <div className="field"><label>Estado</label>
        <select ref={R("st")}>
          <option value="borrador">Borrador</option>
          <option value="activo">Activo</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
          <option value="perdido">Perdido (no se ganó)</option>
        </select>
      </div>
      <div className="field"><label>Fecha de firma</label><input type="date" ref={R("si")} /></div>
      <div className="field"><label>Fecha de vencimiento</label><input type="date" ref={R("ex")} /></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} placeholder="Términos, detalles, observaciones…" /></div>
      <button className="add-btn" onClick={() => {
        const title = V("ti").trim(); if (!title) { onToast("Ponle un título al contrato"); return; }
        const now = Date.now();
        onSave({ ...state, contracts: [...state.contracts, { id: uid(), title, client: V("cl"), value: V("va"), status: V("st") as ContractStatus, signedAt: V("si"), expiresAt: V("ex"), notes: V("no"), pdfUrl: pdfData?.url, pdfTitle: pdfData?.title, pdfUploadedAt: pdfData?.uploadedAt, createdAt: now, updatedAt: now }] });
        onClose(); onNavigate("contracts"); onToast("Contrato creado");
      }}>Crear contrato</button>
    </>);
  }

  /* ---- Detalle contrato ---- */
  if (sheet.kind === "contract") {
    const c = state.contracts.find(x => x.id === sheet.id); if (!c) return null;
    const previewFileId = pdfData ? extractDriveFileId(pdfData.url) : null;
    const readOnlyContract = !canWrite("contracts");

    // Vista técnica: es lo que recibe quien construye. El servidor ya quitó los
    // montos y el PDF comercial, así que aquí solo se muestran requerimientos.
    if (c.moneyRedacted) {
      return (<>
        <div className="sheet-head"><h2>Requerimientos</h2><button className="close-btn" onClick={onClose}>✕</button></div>
        <div className="detail-meta"><span className="badge">{c.status}</span><span className="badge">Vista técnica</span></div>
        <div className="field"><label>Servicio</label><div className="ro-value">{c.title}</div></div>
        <div className="field"><label>Cliente</label><div className="ro-value">{c.client || "—"}</div></div>
        {c.signedAt && <div className="field"><label>Inicio</label><div className="ro-value">{c.signedAt}</div></div>}
        {c.notes && <div className="field"><label>Alcance acordado</label><div className="ro-value" style={{ whiteSpace: "pre-wrap" }}>{c.notes}</div></div>}
        <BriefView brief={c.brief} briefUrl={c.briefUrl} doc={c.doc} estadoContrato={c.status} />
        <p style={{ fontSize: "0.72em", color: "var(--muted)", marginTop: 14 }}>
          Esta es la versión técnica del contrato: describe qué construir. La información comercial
          (valores, precios por módulo y forma de pago) no forma parte de esta vista.
        </p>
      </>);
    }

    return (<>
      <div className="sheet-head"><h2>Contrato</h2><button className="close-btn" onClick={onClose} aria-label="Cerrar">✕</button></div>
      <div className="sheet-sec"><h4>Datos del contrato</h4>
        <div className="field"><label>Título / Descripción</label><input type="text" ref={R("ti")} defaultValue={c.title} /></div>
        <div className="field"><label>Cliente</label><input type="text" ref={R("cl")} defaultValue={c.client} /></div>
        <div className="two field">
          <div><label>Valor</label><input type="text" ref={R("va")} defaultValue={c.value} /></div>
          <div><label>Estado</label>
            <select ref={R("st")} defaultValue={c.status}>
              <option value="borrador">Borrador</option>
              <option value="activo">Activo</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
              <option value="perdido">Perdido (no se ganó)</option>
            </select>
          </div>
        </div>
      </div>
      {/* El motivo solo aparece cuando hace falta: un campo siempre visible que
          casi nunca aplica se ignora, y entonces "perdido" no dice nada. */}
      {c.status === "perdido" && (
        <div className="sheet-sec"><h4>Por qué se perdió</h4>
          <div className="field">
            <select ref={R("mp")} defaultValue={c.motivoPerdida || ""}>
              <option value="">Sin indicar</option>
              {MOTIVOS_PERDIDA.map(m => <option key={m} value={m}>{MOTIVO_LABEL[m]}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="sheet-sec"><h4>Vigencia</h4>
        <div className="two field">
          <div><label>Fecha de firma</label><input type="date" ref={R("si")} defaultValue={c.signedAt} /></div>
          <div><label>Fecha de vencimiento</label><input type="date" ref={R("ex")} defaultValue={c.expiresAt} /></div>
        </div>
      </div>
      {/* Contacto del cliente, traído de la cartera. Estaba a dos pantallas de
          distancia justo cuando más se necesita: al gestionar el contrato. */}
      {(() => {
        const cli = state.clients.find(x => x.name === c.client);
        if (!cli) {
          return c.client ? (
            <div className="sheet-sec"><h4>Contacto</h4>
              <p style={{ fontSize: "0.8em", color: "var(--muted)", margin: 0 }}>
                "{c.client}" no está en la cartera todavía. Créalo como cliente para tener aquí su WhatsApp y su correo.
              </p>
            </div>
          ) : null;
        }
        const wa = linkWhatsapp(cli.whatsapp);
        return (
          <div className="sheet-sec"><h4>Contacto</h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: "0.85em" }}>
              {cli.contact && <span>{cli.contact}</span>}
              {wa
                ? <a href={wa} target="_blank" rel="noopener noreferrer" style={{ color: "var(--orange2)", textDecoration: "none" }}>WhatsApp {cli.whatsapp} ↗</a>
                : <span style={{ color: "var(--muted)" }}>Sin WhatsApp cargado</span>}
              {cli.email
                ? <a href={`mailto:${cli.email}`} style={{ color: "var(--orange2)", textDecoration: "none" }}>{cli.email}</a>
                : <span style={{ color: "var(--muted)" }}>Sin correo</span>}
            </div>
          </div>
        );
      })()}
      <div className="sheet-sec"><h4>Notas</h4>
        <div className="field"><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} defaultValue={c.notes || ""} aria-label="Notas del contrato" /></div>
      </div>
      {(c.status === "borrador" || state.meetings.some(m => m.contractId === c.id)) && (
        <ReunionesOportunidad
          contractId={c.id}
          estado={c.status}
          futuroFecha={c.futuroFecha}
          futuroMotivo={c.futuroMotivo}
          futuroNota={c.futuroNota}
          meetings={state.meetings}
          canManage={!readOnlyContract}
          onToast={onToast}
          onChanged={onBoardRefresh}
          onCloseSheet={onClose}
        />
      )}
      <EnlaceFirma contractId={c.id} />
      <div className="sheet-sec"><h4>Documento PDF</h4>
        <div className="field">
          <PdfUploadField value={pdfData} onChange={setPdfData} onToast={onToast} />
        </div>
        {previewFileId && (
          <div className="field">
            <label>Vista previa</label>
            <div className="pdf-preview-wrap">
              <iframe src={`https://drive.google.com/file/d/${previewFileId}/preview`} className="pdf-preview-frame" allow="autoplay" title="Vista previa del contrato" />
              <a href={pdfData!.url} target="_blank" rel="noopener noreferrer" className="pdf-preview-ext">Abrir en Drive ↗</a>
            </div>
          </div>
        )}
      </div>
      {!readOnlyContract && <button className="save" disabled={regeneratingDoc} onClick={() => {
        // Guardar es guardar, nada más. Si el documento quedó desactualizado
        // respecto del PDF, la sección Documentos lo dice sola (comparando
        // contenido) y ahí vive el botón para regenerar.
        onSave({ ...state, contracts: state.contracts.map(x => x.id !== c.id ? x : { ...x, title: V("ti").trim() || x.title, client: V("cl"), value: V("va"), status: V("st") as ContractStatus, motivoPerdida: V("mp") || x.motivoPerdida, signedAt: V("si"), expiresAt: V("ex"), notes: V("no"), doc: docDraft ?? x.doc, pdfUrl: pdfData?.url, pdfTitle: pdfData?.title, pdfUploadedAt: pdfData?.uploadedAt, updatedAt: Date.now() }) });
        onClose(); onToast("Contrato actualizado");
      }}>Guardar cambios</button>}

      {/* ---- Documentos del contrato: cotización cliente + versión técnica ---- */}
      <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "1em" }}>📄</span>
          <strong style={{ fontSize: "0.92em" }}>Documentos</strong>
        </div>

        {(() => {
          const sinMontos = !!c.moneyRedacted;
          const totals = docDraft ? docTotals(docDraft) : null;
          const abono = docDraft && totals ? Math.round(totals.total * docDraft.downPct / 100) : 0;
          const mods = docDraft ? docDraft.modules.filter(m => (m.name || "").trim() !== "") : [];
          // Frescura REAL: se compara el contenido actual contra la huella con
          // la que se generó cada PDF. Editar con la IA sin cambiar nada NO
          // desactualiza; cambiar un precio sí. Contratos de antes (sin huella)
          // se asumen desactualizados una vez y se sanan al regenerar.
          const docStale = !!docDraft && !!c.pdfUrl && (c.docHash ? hashDocContrato(docDraft) !== c.docHash : true);
          const briefStale = !!c.brief && (c.briefUrl ? (docStale || (c.briefHash ? hashBriefContrato(c.brief) !== c.briefHash : true)) : true);
          const clienteEstado: "ok" | "viejo" | "sin" = !docDraft || !c.pdfUrl ? "sin" : docStale ? "viejo" : "ok";
          const tecnicoEstado: "ok" | "viejo" | "sin" = !c.brief ? "sin" : briefStale ? "viejo" : "ok";
          const hayQueRegenerar = !!docDraft && mods.length > 0 && (clienteEstado !== "ok" || briefStale);
          const fmtDia = (ts?: number) => ts ? new Date(ts).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : "—";
          const descargarDoc = async (tipo: "cliente" | "tecnico") => {
            setDescargandoDoc(tipo);
            const err = await descargarDocPdf(tipo, tipo === "cliente" ? { doc: docDraft } : { brief: c.brief, doc: docDraft ?? c.doc ?? null });
            setDescargandoDoc(null);
            if (err) onToast(`No se pudo descargar: ${err}`);
          };
          const badge = (estado: "ok" | "viejo" | "sin") =>
            estado === "ok" ? <span style={{ fontSize: "0.68em", fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "rgba(0,200,120,0.12)", color: "#1db87b" }}>Al día ✓</span>
            : estado === "viejo" ? <span style={{ fontSize: "0.68em", fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "rgba(255,180,0,0.15)", color: "#e0a52a" }}>Desactualizado</span>
            : <span style={{ fontSize: "0.68em", fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "rgba(255,255,255,0.07)", color: "var(--muted)" }}>Sin generar</span>;
          const btnMini: React.CSSProperties = { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--fg)", fontSize: "0.74em", fontWeight: 600, cursor: "pointer" };

          return (<>
            {/* Proactivo: se sabe ANTES de tocar nada, no recién tras un 409.
                Ventas nunca tuvo dónde conectar Drive — este es ese lugar. */}
            {!estadoDriveDocs.cargando && !estadoDriveDocs.conectado && (
              <div style={{ marginBottom: 10 }}>
                <ConectarDrive volverA="contratos" motivo="Sin esto, los documentos no se pueden subir a Drive: se generan pero no queda dónde guardarlos." />
              </div>
            )}
            {/* Resumen compacto: lo esencial de un vistazo, sin muro de texto */}
            {docDraft && totals && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginBottom: 10, fontSize: "0.78em", padding: "10px 12px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                <div><div style={{ fontSize: "0.85em", color: "var(--muted)" }}>Cliente</div><div style={{ fontWeight: 600 }}>{docDraft.client || "—"}</div></div>
                <div><div style={{ fontSize: "0.85em", color: "var(--muted)" }}>Proyecto</div><div style={{ fontWeight: 600 }}>{docDraft.project || "—"}</div></div>
                <div><div style={{ fontSize: "0.85em", color: "var(--muted)" }}>Alcance</div><div>{mods.length} módulo{mods.length !== 1 ? "s" : ""}</div></div>
                <div><div style={{ fontSize: "0.85em", color: "var(--muted)" }}>Vigencia</div><div>{docDraft.validityDays > 0 ? `${docDraft.validityDays} días${docExpiry(docDraft) ? ` · hasta ${docExpiry(docDraft)}` : ""}` : "—"}</div></div>
                {!sinMontos && <div><div style={{ fontSize: "0.85em", color: "var(--muted)" }}>Inversión</div><div>Neto {fmtCLP(totals.neto)} · IVA {fmtCLP(totals.iva)} · <strong>Total {fmtCLP(totals.total)}</strong></div></div>}
                {!sinMontos && <div><div style={{ fontSize: "0.85em", color: "var(--muted)" }}>Pago</div><div>{docDraft.downPct}% inicio ({fmtCLP(abono)}) · {100 - docDraft.downPct}% entrega</div></div>}
                {!sinMontos && docDraft.monthly && <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: "0.85em", color: "var(--muted)" }}>Mensualidad</div><div>{docDraft.monthly}{docDraft.monthlyPrice ? ` · ${fmtCLP(Number(docDraft.monthlyPrice) || 0)} neto/mes` : ""}</div></div>}
              </div>
            )}

            {/* Dos documentos, cada uno con su estado y acciones */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {!sinMontos && (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "0.82em" }}>Cotización para el cliente</strong>
                    {badge(clienteEstado)}
                  </div>
                  <div style={{ fontSize: "0.72em", color: "var(--muted)", marginTop: 3 }}>
                    {clienteEstado === "sin"
                      ? (docDraft ? "Todavía no hay PDF en Drive con este contenido." : "Necesita el documento estructurado — créalo aquí abajo.")
                      : clienteEstado === "viejo"
                        ? `El PDF en Drive es del ${fmtDia(c.pdfUploadedAt)} y el contenido cambió después.`
                        : `PDF en Drive al día (${fmtDia(c.pdfUploadedAt)}).`}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {docDraft && mods.length > 0 && (
                      <button style={btnMini} disabled={descargandoDoc !== null} onClick={() => void descargarDoc("cliente")}>
                        {descargandoDoc === "cliente" ? "⏳ Generando…" : "⬇ Descargar PDF"}
                      </button>
                    )}
                    {c.pdfUrl && <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnMini, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Abrir en Drive ↗</a>}
                  </div>
                </div>
              )}

              <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.82em" }}>Documento técnico (interno, sin montos)</strong>
                  {badge(tecnicoEstado)}
                </div>
                <div style={{ fontSize: "0.72em", color: "var(--muted)", marginTop: 3 }}>
                  {tecnicoEstado === "sin"
                    ? "El equipo aún no tiene la versión técnica de este contrato."
                    : tecnicoEstado === "viejo"
                      ? (c.briefUrl ? `El PDF en Drive quedó atrás (${fmtDia(c.briefUploadedAt)}).` : "El brief existe pero su PDF nunca llegó a Drive.")
                      : `PDF en Drive al día (${fmtDia(c.briefUploadedAt)}).`}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {c.brief && (
                    <button style={btnMini} disabled={descargandoDoc !== null} onClick={() => void descargarDoc("tecnico")}>
                      {descargandoDoc === "tecnico" ? "⏳ Generando…" : "⬇ Descargar PDF"}
                    </button>
                  )}
                  {c.briefUrl && <a href={c.briefUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnMini, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Abrir en Drive ↗</a>}
                  {!c.brief && !readOnlyContract && (
                    <button style={{ ...btnMini, color: "var(--accent, #ff7800)", borderColor: "rgba(255,120,0,0.4)" }} disabled={generatingBrief} onClick={() => void generateBriefFor(c)}>
                      {generatingBrief ? "⏳ Redactando con IA…" : "🛠️ Generar brief técnico"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Un contrato ACTIVO sin brief deja a desarrollo con tareas genéricas */}
            {!c.brief && c.status === "activo" && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.35)", borderRadius: 10, padding: "8px 10px", marginTop: 8 }}>
                <span style={{ flexShrink: 0 }}>⚠️</span>
                <div style={{ fontSize: "0.76em", lineHeight: 1.45 }}>
                  <strong>Este contrato ya está activo y no tiene versión técnica.</strong>{" "}
                  Las tareas que recibió desarrollo son las genéricas de arranque, no el alcance real.
                  Genera el brief y reparte las tareas desde ahí.
                </div>
              </div>
            )}

            {/* Ya se ve el aviso de arriba si Drive está desconectado; esto es
                solo para el caso raro de que el permiso se cayera A MITAD de
                una sesión que arrancó conectada. */}
            {faltaDriveDocs && (estadoDriveDocs.cargando || estadoDriveDocs.conectado) && (
              <ConectarDrive volverA="contratos" motivo="Por eso los PDFs no se pudieron subir a Drive." />
            )}

            {/* Regenerar solo cuando hay algo desactualizado — nada de botón eterno */}
            {!readOnlyContract && !sinMontos && docDraft && hayQueRegenerar && (
              <>
                <button
                  disabled={regeneratingDoc}
                  onClick={() => void regenerateContractDoc(c, docDraft)}
                  style={{
                    width: "100%", marginTop: 10, padding: "10px 0", borderRadius: 8,
                    border: "1px solid rgba(255,120,0,0.4)", background: "rgba(255,120,0,0.14)",
                    color: "var(--accent, #ff7800)", fontWeight: 600, fontSize: "0.86em",
                    cursor: regeneratingDoc ? "not-allowed" : "pointer",
                  }}
                >{regeneratingDoc ? "⏳ Regenerando con el diseño WebMaker…" : "🔄 Regenerar documentos"}</button>
                <p style={{ fontSize: "0.72em", color: "var(--muted)", marginTop: 5 }}>
                  Rehace la cotización del cliente y el brief técnico con la plantilla WebMaker y los sube a Drive.
                </p>
              </>
            )}
            {!readOnlyContract && !sinMontos && docDraft && mods.length > 0 && !hayQueRegenerar && (
              <p style={{ fontSize: "0.72em", color: "var(--muted)", marginTop: 8 }}>Los PDFs reflejan el contenido actual — no hay nada que regenerar.</p>
            )}

            {/* Contratos sin documento estructurado: crearlo desde la ficha */}
            {!docDraft && !readOnlyContract && (
              <>
                <p style={{ fontSize: "0.78em", color: "var(--muted)", margin: "10px 0" }}>
                  Este contrato no tiene un documento estructurado (se creó a mano o el PDF se subió desde fuera),
                  así que la IA sólo puede editar la ficha. Crea uno para que el chat pueda modificar la cotización.
                </p>
                <button
                  onClick={() => { setDocDraft(docFromContract(c)); onToast("Documento creado desde la ficha — ajústalo con el chat y regenera los PDFs"); }}
                  style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--fg)", fontWeight: 600, fontSize: "0.86em", cursor: "pointer" }}
                >📄 Crear documento desde la ficha</button>
              </>
            )}

            {/* Texto completo, plegado: módulos al detalle + brief íntegro */}
            {(mods.length > 0 || c.brief) && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: "0.78em", color: "var(--muted)" }}>Ver texto completo (módulos y versión técnica)</summary>
                {mods.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {mods.map(m => (
                      <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 11px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "0.83em", fontWeight: 600 }}>{m.name}</div>
                          {m.desc && <div style={{ fontSize: "0.72em", color: "var(--muted)", marginTop: 2 }}>{m.desc}</div>}
                        </div>
                        {!sinMontos && <div style={{ fontSize: "0.8em", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtCLP(m.price)}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {c.brief && (
                  <BriefView
                    brief={c.brief}
                    briefUrl={c.briefUrl}
                    doc={c.doc}
                    estadoContrato={c.status}
                    onGenerate={readOnlyContract ? undefined : () => void generateBriefFor(c)}
                    generating={generatingBrief}
                  />
                )}
              </details>
            )}
          </>);
        })()}
      </div>

      <Adjuntos tipo="contract" id={c.id} titulo="Adjuntos del contrato" />

      {/* ---- Proyectos vinculados ---- */}
      {(() => {
        const linked = state.projects.filter(p => p.contractId === c.id);
        if (linked.length === 0) return null;
        const statusColor: Record<string, string> = { lead: "#6aa0c0", disc: "#c9a44a", dev: "#e0795a", rev: "#b07bce", done: "#1db87b" };
        return (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: "1em" }}>🗃️</span>
              <strong style={{ fontSize: "0.92em" }}>Proyectos vinculados</strong>
              <span style={{ fontSize: "0.75em", color: "var(--muted)", fontWeight: 400 }}>{linked.length} proyecto{linked.length > 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {linked.map(proj => (
                <div key={proj.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.84em", fontWeight: 600, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{proj.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <span style={{ fontSize: "0.68em", fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: `${statusColor[proj.status] || "#888"}22`, color: statusColor[proj.status] || "#888" }}>{statusOf(proj.status).label}</span>
                      <span style={{ fontSize: "0.68em", color: "var(--muted)" }}>{projProg(proj.id, apiTasks).pct}%</span>
                    </div>
                  </div>
                  <button onClick={() => onOpenSheet({ kind: "proj", id: proj.id })} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--fg)", fontSize: "0.78em", cursor: "pointer", whiteSpace: "nowrap" }}>Ver →</button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ---- Crear Proyecto desde contrato ---- */}
      <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: "1em" }}>🗂️</span>
          <strong style={{ fontSize: "0.9em" }}>Crear Proyecto desde este contrato</strong>
        </div>
        <p style={{ fontSize: "0.78em", color: "var(--muted)", margin: "0 0 10px" }}>La IA lee los requerimientos y alcance del contrato y pre-rellena el formulario de nuevo proyecto.</p>

        {/* Duplicate warning */}
        {duplicateProjectWarning && (
          <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.35)", fontSize: "0.8em" }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--fg)" }}>
              ⚠️ Ya existe un proyecto similar
            </div>
            <div style={{ color: "var(--muted)", marginBottom: 10 }}>
              <strong style={{ color: "var(--fg)" }}>"{duplicateProjectWarning.name}"</strong> del cliente <strong style={{ color: "var(--fg)" }}>{duplicateProjectWarning.client}</strong> ya tiene un proyecto creado. ¿Quieres crear uno de todas formas?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => {
                  projPreFillRef.current = { ...duplicateProjectWarning.pendingPrefill, fromContractId: c.id };
                  setDuplicateProjectWarning(null);
                  onOpenSheet({ kind: "new-proj" });
                }}
                style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "1px solid rgba(255,180,0,0.5)", background: "rgba(255,180,0,0.12)", color: "var(--fg)", fontWeight: 600, fontSize: "0.9em", cursor: "pointer" }}
              >Crear de todas formas</button>
              <button
                onClick={() => setDuplicateProjectWarning(null)}
                style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontWeight: 500, fontSize: "0.9em", cursor: "pointer" }}
              >Cancelar</button>
            </div>
          </div>
        )}

        <button
          disabled={extractingProject || projectCreatedContractIds.has(c.id)}
          onClick={async () => {
            setExtractingProject(true);
            setDuplicateProjectWarning(null);
            try {
              const res = await fetch(`${DRIVE_API_BASE}/hub/contracts/ai-extract-project`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contract: { title: V("ti") || c.title, client: V("cl") || c.client, value: V("va") || c.value, notes: V("no") || c.notes } }),
              });
              if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; onToast(e.error || "Error al extraer datos"); return; }
              const data = await res.json() as { name?: string; client?: string; type?: string; prio?: string; due?: string; notes?: string };
              const prefill: Record<string, string> = {
                name: data.name || c.title || "",
                client: data.client || c.client || "",
                type: data.type || "",
                prio: (["alta","media","baja"].includes(data.prio || "") ? data.prio : "media") || "media",
                due: data.due || "",
                notes: data.notes || c.notes || "",
              };
              // Check for duplicate: same client + similar name
              const extractedClient = prefill.client.trim().toLowerCase();
              const extractedName = prefill.name.trim().toLowerCase();
              const duplicate = state.projects.find(p => {
                const sameClient = p.client.trim().toLowerCase() === extractedClient;
                if (!sameClient) return false;
                const pName = p.name.trim().toLowerCase();
                return pName.includes(extractedName.slice(0, Math.max(6, extractedName.length - 4))) ||
                  extractedName.includes(pName.slice(0, Math.max(6, pName.length - 4)));
              });
              if (duplicate) {
                setDuplicateProjectWarning({ name: duplicate.name, client: duplicate.client, pendingPrefill: prefill });
                return;
              }
              // No duplicate — open the new-proj sheet directly
              projPreFillRef.current = { ...prefill, fromContractId: c.id };
              onOpenSheet({ kind: "new-proj" });
            } catch { onToast("Error de conexión"); }
            finally { setExtractingProject(false); }
          }}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)",
            background: projectCreatedContractIds.has(c.id) ? "rgba(0,200,120,0.08)" : extractingProject ? "var(--card-bg)" : "rgba(255,120,0,0.1)",
            color: projectCreatedContractIds.has(c.id) ? "#1db87b" : "var(--accent, #ff7800)",
            fontWeight: 600, fontSize: "0.88em",
            cursor: (extractingProject || projectCreatedContractIds.has(c.id)) ? "not-allowed" : "pointer",
            transition: "background .2s",
          }}
        >
          {projectCreatedContractIds.has(c.id) ? "✓ Proyecto creado" : extractingProject ? "⏳ Analizando contrato con IA…" : "✨ Crear Proyecto desde contrato"}
        </button>
      </div>

      {/* ---- Chat IA para modificar el contrato ---- */}
      <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: "1.1em" }}>✨</span>
          <strong style={{ fontSize: "0.92em" }}>Modificar con IA</strong>
          <span style={{ fontSize: "0.75em", color: "var(--muted)", fontWeight: 400 }}>
            {docDraft ? "Cambia la ficha y el documento (módulos, precios, alcance, pago)" : "Dile a la IA qué cambiar y aplicará los cambios al formulario"}
          </span>
        </div>

        {chatHistory.length > 0 && (
          <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {chatHistory.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                background: msg.role === "user" ? "var(--accent-bg, rgba(255,120,0,0.12))" : "var(--card-bg, rgba(255,255,255,0.06))",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "7px 12px",
                fontSize: "0.82em",
                maxWidth: "88%",
                lineHeight: 1.45,
                color: msg.role === "user" ? "var(--accent, #ff7800)" : "var(--fg)",
              }}>{msg.text}</div>
            ))}
            {chatLoading && (
              <div style={{ alignSelf: "flex-start", background: "var(--card-bg, rgba(255,255,255,0.06))", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 12px", fontSize: "0.82em" }}>
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
            style={{ flex: 1, resize: "none", fontFamily: "inherit", fontSize: "0.85em", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--input-bg, rgba(255,255,255,0.05))", color: "var(--fg)" }}
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
                  client: V("cl") || c.client,
                  value: V("va") || c.value,
                  status: V("st") || c.status,
                  signedAt: V("si") || c.signedAt,
                  expiresAt: V("ex") || c.expiresAt,
                  notes: V("no") || c.notes,
                };
                const res = await fetch(`${DRIVE_API_BASE}/hub/contracts/ai-chat`, {
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ contract: currentContract, doc: docDraft, instruction }),
                });
                if (!res.ok) { const e = await res.json().catch(() => ({} as Record<string,string>)); setChatHistory(h => [...h, { role: "ai", text: (e as {error?:string}).error || "Error al procesar" }]); return; }
                const payload = await res.json() as { contract?: Record<string, string>; doc?: Partial<WizData> | null; summary?: string };
                const data = payload.contract || {};
                if (r.current["ti"] && data.title) r.current["ti"].value = data.title;
                if (r.current["cl"] && data.client) r.current["cl"].value = data.client;
                if (r.current["va"] && data.value) r.current["va"].value = data.value;
                if (r.current["st"] && isContractStatus(data.status)) (r.current["st"] as HTMLSelectElement).value = data.status;
                if (r.current["si"] && data.signedAt) r.current["si"].value = data.signedAt;
                if (r.current["ex"] && data.expiresAt) r.current["ex"].value = data.expiresAt;
                if (r.current["no"] && data.notes) (r.current["no"] as HTMLTextAreaElement).value = data.notes;

                // Documento: aplicamos los cambios y recalculamos ficha desde el
                // documento (valor, fechas) para que PDF y ficha no se separen.
                let docUpdated = false;
                if (payload.doc && docDraft) {
                  const nd = normalizeDoc(docDraft, payload.doc);
                  setDocDraft(nd); docUpdated = true;
                  const totals = docTotals(nd);
                  if (r.current["ti"] && nd.project) r.current["ti"].value = nd.project;
                  if (r.current["cl"] && nd.client) r.current["cl"].value = nd.client;
                  if (r.current["va"] && totals.total > 0) r.current["va"].value = fmtCLP(totals.total);
                  if (r.current["si"] && nd.date) r.current["si"].value = nd.date;
                  const exp = docExpiry(nd);
                  if (r.current["ex"] && exp) r.current["ex"].value = exp;
                }

                const summary = payload.summary ? `✓ ${payload.summary}` : "✓ Cambios aplicados.";
                setChatHistory(h => [...h, { role: "ai", text: docUpdated
                  ? `${summary} Si el documento quedó desactualizado, la sección Documentos lo marca y ahí puedes regenerarlo.`
                  : `${summary} Revisa los campos arriba y guarda cuando estés listo.` }]);
              } catch { setChatHistory(h => [...h, { role: "ai", text: "Error de conexión" }]); }
              finally { setChatLoading(false); }
            }}
            style={{ padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--accent-bg, rgba(255,120,0,0.15))", color: "var(--accent, #ff7800)", cursor: "pointer", fontWeight: 600, fontSize: "1em", flexShrink: 0 }}
          >→</button>
        </div>
        <p style={{ fontSize: "0.72em", color: "var(--muted)", marginTop: 5 }}>Los cambios se aplican al formulario — haz clic en "Guardar cambios" para confirmar.</p>
      </div>

      {!readOnlyContract && <button className="del-link" style={{ marginTop: 16 }} onClick={() => {
        const snap = [...state.contracts];
        onSave({ ...state, contracts: state.contracts.filter(x => x.id !== c.id) });
        onClose(); onToast("Contrato eliminado", () => onSave({ ...state, contracts: snap }));
      }}>Eliminar contrato</button>}
    </>);
  }

  /* ---- Wizard: nuevo contrato desde cero ---- */
  if (sheet.kind === "new-contract-wizard") {
    const WIZ_STEPS = ["Contexto", "Vista previa"];
    const tNeto = wiz.modules.reduce((a, m) => a + m.price, 0);
    const tIva = Math.round(tNeto * 0.19);
    const tTotal = tNeto + tIva;
    const newModId = () => Math.random().toString(36).slice(2);

    return (<>
      <SheetHeader title="Nuevo contrato" subtitle="Asistente guiado" icon={<FileCheck2 className="w-5 h-5" />} onClose={onClose} />

      {/* Stepper */}
      <div className="wiz-stepper">
        {WIZ_STEPS.map((label, i) => (
          <button key={i} className={`wiz-step-btn${wizStep === i + 1 ? " active" : ""}${wizStep > i + 1 ? " done" : ""}`} onClick={() => { if (wizStep > i + 1) setWizStep(i + 1); }}>
            <span className="wiz-dot">{wizStep > i + 1 ? "✓" : i + 1}</span>
            <span className="wiz-step-lbl">{label}</span>
          </button>
        ))}
      </div>

      {/* STEP 1: Contexto — la IA planifica módulos, alcance y precios automáticamente */}
      {wizStep === 1 && (
        <div className="wiz-body">
          <div className="field"><label>Cliente *</label>
            <input type="text" value={wiz.client} onChange={e => setWiz(w => ({ ...w, client: e.target.value }))} placeholder="Nombre del cliente o empresa" />
          </div>
          <div className="field"><label>Descripción del proyecto *</label>
            <textarea rows={4} value={wiz.scope} onChange={e => setWiz(w => ({ ...w, scope: e.target.value }))} placeholder="¿Qué necesita el cliente? Descríbelo en 2-3 líneas — la IA planifica los módulos, el alcance y los precios automáticamente." />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Headphones className="w-3.5 h-3.5" /> Notas de reunión <span style={{ fontSize: "0.7em", fontWeight: 400, color: "var(--muted)" }}>(opcional — la IA las usa como contexto)</span>
            </label>
            {state.meetings.length > 0 && (
              <select style={{ marginBottom: 6 }} defaultValue="" onChange={e => {
                const m = state.meetings.find(x => x.id === e.target.value);
                if (m) setMeetingNotes([m.client && `Cliente: ${m.client}`, m.date && `Fecha: ${m.date}`, m.summary && `Resumen: ${m.summary}`, m.notes].filter(Boolean).join("\n\n"));
              }}>
                <option value="">— Cargar reunión guardada —</option>
                {[...state.meetings].sort((a,b) => b.createdAt - a.createdAt).slice(0,10).map(m => (
                  <option key={m.id} value={m.id}>{m.date ? `${m.date} — ` : ""}{m.client || m.summary || "Sin título"}</option>
                ))}
              </select>
            )}
            <textarea rows={4} value={meetingNotes} onChange={e => setMeetingNotes(e.target.value)} placeholder="Pega las notas de tu reunión aquí — la IA las leerá para armar la cotización completa." style={{ fontFamily: "inherit" }} />
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
              {meetingExtracting ? <><Clock3 className="w-4 h-4" /> Analizando reunión con IA…</> : <><Sun className="w-4 h-4" /> Completar campos con IA</>}
            </button>
          )}

          <button className="save" style={{ marginTop: 4, marginBottom: 8 }} onClick={() => setWizAdvanced(v => !v)}>
            {wizAdvanced ? "▾ Ocultar opciones avanzadas" : "▸ Opciones avanzadas — módulos y pago (opcional)"}
          </button>

          {wizAdvanced && (<>
            <div className="field"><label>Nombre del servicio / proyecto</label>
              <input type="text" value={wiz.project} onChange={e => setWiz(w => ({ ...w, project: e.target.value }))} placeholder="Opcional — la IA lo propone si lo dejas vacío" />
            </div>
            <div className="two field">
              <div><label>Fecha de emisión</label>
                <input type="date" value={wiz.date} onChange={e => setWiz(w => ({ ...w, date: e.target.value }))} />
              </div>
              <div><label>Asesor / Responsable</label>
                <input type="text" value={wiz.advisor} onChange={e => setWiz(w => ({ ...w, advisor: e.target.value }))} placeholder="Ej: Equipo WebMaker Latam" />
              </div>
            </div>

            <div className="wiz-mod-header-row">
              <span className="wiz-mod-title">Módulos (opcional — si no los defines, la IA los propone con precios estimados)</span>
              <span style={{ display: "inline-flex", gap: 6 }}>
                {/* El catálogo ya tiene los precios cargados: sin este botón
                    había que copiarlos a mano o dejar que la IA los estimara. */}
                <ElegirDelCatalogo onElegir={m => setWiz(w => {
                  const primero = w.modules[0];
                  const vacio = w.modules.length === 1 && !primero.name.trim() && !primero.desc.trim() && !primero.price;
                  const nuevo = { id: newModId(), ...m };
                  return { ...w, modules: vacio ? [nuevo] : [...w.modules, nuevo] };
                })} />
                <button className="wiz-add-mod-btn" onClick={() => setWiz(w => ({ ...w, modules: [...w.modules, { id: newModId(), name: "", desc: "", price: 0 }] }))}>+ Módulo</button>
              </span>
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
                    <input type="number" value={m.price || ""} min={0} onChange={e => setWiz(w => ({ ...w, modules: w.modules.map(x => x.id === m.id ? { ...x, price: Number(e.target.value) || 0 } : x) }))} placeholder="Vacío = la IA lo estima" />
                    {m.price > 0 && <div className="wiz-price-hint"><span>+IVA: {fmtCLP(mIva)}</span><span className="wiz-total-mod">= {fmtCLP(mTotal)}</span></div>}
                  </div>
                </div>
              );
            })}
            {tNeto > 0 && (
              <div className="wiz-grand-total">
                <div className="wiz-grand-total-row net">
                  <span>Subtotal Neto</span>
                  <strong>{fmtCLP(tNeto)}</strong>
                </div>
                <div className="wiz-grand-total-row iva">
                  <span>IVA (19%)</span>
                  <strong>{fmtCLP(tIva)}</strong>
                </div>
                <div className="wiz-grand-total-divider" />
                <div className="wiz-grand-total-row total">
                  <span>Total a pagar</span>
                  <span className="wiz-grand-v">{fmtCLP(tTotal)}</span>
                </div>
              </div>
            )}

            <div className="field" style={{ marginTop: 12 }}><label>% de pago al iniciar</label>
              <input type="number" value={wiz.downPct} min={0} max={100} onChange={e => { const raw = e.target.value; const n = raw === "" ? 50 : Number(raw); setWiz(w => ({ ...w, downPct: Math.min(100, Math.max(0, Number.isNaN(n) ? 50 : n)) })); }} />
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
          </>)}

          <button className="add-btn wiz-gen-btn" style={{ marginTop: 12, width: "100%" }} disabled={cotLoading} onClick={async () => {
            if (!wiz.client.trim()) { onToast("Ingresa el nombre del cliente"); return; }
            if (wiz.scope.trim().length < 10 && meetingNotes.trim().length < 10) { onToast("Describe el proyecto o pega las notas de la reunión — la IA necesita contexto"); return; }
            setCotLoading(true); setCotError(null);
            try {
              const validMods = wiz.modules.filter(m => m.name.trim() !== "");
              const contexto = [
                `Cliente: ${wiz.client}`,
                wiz.project.trim() && `Proyecto: ${wiz.project}`,
                wiz.scope && `Alcance: ${wiz.scope}`,
                wiz.advisor && `Asesor responsable: ${wiz.advisor}`,
                wiz.monthly && `Mensualidad: ${wiz.monthly}`,
                wiz.notes && `Notas: ${wiz.notes}`,
                meetingNotes.trim() && `Notas de reunión:\n${meetingNotes.trim()}`,
              ].filter(Boolean).join("\n");
              const body: Record<string, unknown> = { contexto_cliente: contexto };
              if (validMods.length > 0) body.modulos_sugeridos = validMods.map(m => m.desc ? `${m.name}: ${m.desc}` : m.name).join("; ");
              // Un precio por módulo, en orden; null = "estímalo tú". Antes se
              // exigía que TODOS lo tuvieran: quien sabía el precio de tres de
              // cuatro veía cómo la IA se inventaba también esos tres.
              const cabenPrecios = validMods.length > 0 && validMods.length <= 4;
              if (cabenPrecios && validMods.some(m => m.price > 0)) {
                body.precios_netos = validMods.map(m => (m.price > 0 ? Math.round(m.price) : null));
              }
              // "Estimado" si la IA puso aunque sea un precio: basta uno inventado
              // para que el total no sea el que la agencia cobra.
              const algoEstimado = !cabenPrecios || validMods.some(m => !(m.price > 0));
              const mensualidadNeto = Math.round(Number(wiz.monthlyPrice) || 0);
              if (mensualidadNeto > 0) body.mensualidad_neto = mensualidadNeto;
              const pct = Math.round(wiz.downPct);
              if (pct !== 50) {
                body.esquema_pago = pct >= 100 ? [{ porcentaje: 100, momento: "AL INICIAR" }]
                  : pct <= 0 ? [{ porcentaje: 100, momento: "CONTRA ENTREGA" }]
                  : [{ porcentaje: pct, momento: "AL INICIAR" }, { porcentaje: 100 - pct, momento: "CONTRA ENTREGA" }];
              }
              const res = await fetch(`${DRIVE_API_BASE}/cotizaciones/generar`, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              const data = await res.json().catch(() => ({})) as { cotizacion?: unknown; html?: string | null; htmlError?: string | null; error?: string };
              if (!res.ok || !data.cotizacion) {
                onToast(data.error || `Error generando la cotización (${res.status})`);
                return;
              }
              setCotEstimated(algoEstimado);
              setCotJson(JSON.stringify(data.cotizacion, null, 2));
              setCotEdited(false);
              setCotHtml(data.html || null);
              setCotError(data.htmlError || null);
              setCotShowJson(!!data.htmlError);
              setWizStep(2);
            } catch (e: unknown) {
              onToast("Error generando la cotización: " + (e instanceof Error ? e.message : "desconocido"));
            } finally { setCotLoading(false); }
          }}>{cotLoading ? <span className="flex items-center gap-2 justify-center"><Clock3 className="w-4 h-4"/> Generando cotización con IA…</span> : <span className="flex items-center gap-2 justify-center"><Sun className="w-4 h-4"/> Generar cotización con IA</span>}</button>
        </div>
      )}

      {/* STEP 2: Vista previa (HTML del servidor) + PDF */}
      {wizStep === 2 && (
        <div className="wiz-body">
          {cotHtml ? (
            <iframe title="Vista previa de la cotización" srcDoc={cotHtml} sandbox="" style={{ width: "100%", height: "60vh", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />
          ) : (
            <div className="wiz-price-hint" style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 8 }}>
              <span>Sin vista previa aún. {cotError ? "Corrige el JSON y actualiza la vista." : ""}</span>
            </div>
          )}
          {cotEstimated && cotHtml && (
            <div className="wiz-price-hint" style={{ marginTop: 8 }}>
              <span><AlertTriangle className="w-3 h-3 inline mr-1" /> Los precios fueron estimados por la IA — puedes ajustarlos en "Editar contenido (JSON)" y actualizar la vista.</span>
            </div>
          )}
          {cotError && <div style={{ color: "#dc2626", fontSize: "0.8em", marginTop: 8, whiteSpace: "pre-wrap" }}>{cotError}</div>}

          <button className="save" style={{ marginTop: 10 }} onClick={() => setCotShowJson(v => !v)}>
            {cotShowJson ? "Ocultar contenido editable" : <span className="flex items-center gap-2 justify-center"><FileText className="w-4 h-4"/> Editar contenido (JSON)</span>}
          </button>
          {cotShowJson && (
            <div className="field" style={{ marginTop: 8 }}>
              <textarea rows={14} value={cotJson} onChange={e => { setCotJson(e.target.value); setCotEdited(true); setCotHtml(null); setCotError("Contenido editado — actualiza la vista previa para continuar"); }} style={{ fontFamily: "monospace", fontSize: "0.75em" }} spellCheck={false} />
              <button className="save" style={{ marginTop: 6 }} disabled={cotLoading} onClick={async () => {
                setCotLoading(true); setCotError(null);
                try {
                  let parsed: unknown;
                  try { parsed = JSON.parse(cotJson); } catch { setCotError("El JSON no es válido (error de sintaxis)"); return; }
                  const res = await fetch(`${DRIVE_API_BASE}/cotizaciones/preview`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ cotizacion: parsed }),
                  });
                  const data = await res.json().catch(() => ({})) as { html?: string; error?: string; detalles?: string[] };
                  if (!res.ok || !data.html) {
                    setCotError([data.error, ...(data.detalles || [])].filter(Boolean).join("\n") || "No se pudo renderizar la vista previa");
                    return;
                  }
                  setCotHtml(data.html); setCotError(null);
                } catch (e: unknown) {
                  setCotError("Error actualizando la vista: " + (e instanceof Error ? e.message : "desconocido"));
                } finally { setCotLoading(false); }
              }}>{cotLoading ? "⏳ Actualizando…" : "🔄 Actualizar vista previa"}</button>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="save" onClick={() => setWizStep(1)}>← Atrás</button>
            <button className="add-btn wiz-gen-btn" style={{ flex: 1 }} disabled={generatingPdf || !cotHtml} onClick={async () => {
              setGeneratingPdf(true);
              try {
                let parsed: { modulos?: Array<{ neto?: number }>; portada?: { alcance_titulo?: string } };
                try { parsed = JSON.parse(cotJson) as { modulos?: Array<{ neto?: number }>; portada?: { alcance_titulo?: string } }; } catch { onToast("El JSON no es válido — corrígelo antes de generar el PDF"); return; }
                const res = await fetch(`${DRIVE_API_BASE}/cotizaciones/pdf`, {
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ cotizacion: parsed }),
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({})) as { error?: string; detalles?: string[] };
                  onToast([err.error, ...(err.detalles || [])].filter(Boolean).join(" · ") || `No se pudo generar el PDF (${res.status})`);
                  return;
                }
                const blob = await res.blob();
                const fname = `Cotizacion-${wiz.client.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
                const fd = new FormData();
                fd.append("file", new File([blob], fname, { type: "application/pdf" }));
                fd.append("parentId", HUB_DRIVE_ROOT);
                let pdfUrl = "", pdfTitleOut = fname, pdfUploadedAt = Date.now();
                const upRes = await fetch(`${DRIVE_API_BASE}/drive/upload-pdf`, { method: "POST", credentials: "include", body: fd });
                if (upRes.ok) {
                  const up = await upRes.json() as { webViewLink: string; name: string; uploadedAt: number };
                  pdfUrl = up.webViewLink; pdfTitleOut = up.name; pdfUploadedAt = up.uploadedAt;
                } else {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob); a.download = fname; a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
                  onToast("PDF descargado localmente (Drive no disponible)");
                }
                const sumNetos = (parsed.modulos || []).map(m => m.neto || 0).filter(n => n > 0).reduce((a, n) => a + n, 0);
                const totalConIva = sumNetos + Math.round(sumNetos * 0.19);
                const now = Date.now();
                const issuedAt = wiz.date || new Date().toISOString().slice(0, 10);
                let expiresAt = "";
                if (wiz.validityDays > 0) {
                  const exp = new Date(issuedAt + "T12:00:00");
                  exp.setDate(exp.getDate() + wiz.validityDays);
                  expiresAt = exp.toISOString().slice(0, 10);
                }
                const contractTitle = wiz.project.trim() || parsed.portada?.alcance_titulo || `Cotización ${wiz.client}`;
                // Versión técnica: se genera sola, en la misma pasada. Quien
                // programa no debería esperar a que alguien le escriba el brief.
                // El PDF lo dibuja el servidor con la plantilla WebMaker.
                const brief = await fetchContractBrief(wiz, { title: contractTitle, client: wiz.client, notes: wiz.scope });
                let briefSubido: { url: string; title: string; uploadedAt: number } | undefined;
                let briefHashNuevo: string | undefined;
                if (brief) {
                  const rTec = await regenerarDocsServidor({ brief, meta: { client: wiz.client, project: contractTitle, date: issuedAt } });
                  if (rTec.brief) { briefSubido = rTec.brief; briefHashNuevo = rTec.briefHash; }
                }
                onSave({ ...state, contracts: [...state.contracts, {
                  id: uid(), title: contractTitle, client: wiz.client,
                  value: totalConIva > 0 ? fmtCLP(totalConIva) : (tTotal > 0 ? fmtCLP(tTotal) : ""),
                  status: "borrador" as ContractStatus, signedAt: issuedAt, expiresAt, notes: wiz.scope,
                  doc: wiz,
                  pdfUrl, pdfTitle: pdfTitleOut, pdfUploadedAt,
                  // La huella solo cuenta si el PDF de verdad quedó en Drive Y
                  // refleja el documento estructurado: si el JSON fue editado a
                  // mano o sus montos difieren de la ficha, no hay huella y el
                  // panel dirá "desactualizado" hasta regenerar. Honesto.
                  ...(pdfUrl && !cotEdited && sumNetos === docTotals(wiz).neto ? { docHash: hashDocContrato(wiz) } : {}),
                  brief: brief ?? undefined,
                  briefUrl: briefSubido?.url, briefTitle: briefSubido?.title, briefUploadedAt: briefSubido?.uploadedAt,
                  ...(briefSubido ? { briefHash: briefHashNuevo } : {}),
                  createdAt: now, updatedAt: now }] });
                onClose(); onNavigate("contracts");
                // El brief que falta se dice con todas las letras: sin él,
                // al cerrar la venta el equipo recibe tareas genéricas.
                onToast(
                  brief
                    ? (briefSubido ? "Contrato creado: cotización y brief técnico en Drive ✓" : "Contrato creado ✓ El brief no se pudo subir a Drive: descárgalo desde la ficha del contrato.")
                    : `⚠️ Contrato creado SIN brief técnico${ultimoErrorBrief ? ` (${ultimoErrorBrief})` : ""}. Genéralo desde la ficha antes de cerrar la venta.`,
                );
              } catch (e: unknown) {
                onToast("Error generando el PDF: " + (e instanceof Error ? e.message : "desconocido"));
              } finally { setGeneratingPdf(false); }
            }}>{generatingPdf ? "⏳ Generando PDF…" : "📄 Generar PDF y guardar contrato"}</button>
          </div>
        </div>
      )}
    </>);
  }

  return null;
}

