import { ALL_HUB_SCOPES, type HubScope } from "@workspace/roles";

export type Prio = "crítica" | "alta" | "media" | "baja";
export type ProjStatus = "lead" | "disc" | "dev" | "rev" | "done";
export type TaskStage = "backlog" | "sprint" | "doing" | "qa_sent" | "qa_rev" | "done";
export type TaskStatus = "pendiente" | "en_progreso" | "hecha";
export interface ChecklistItem { id: string; text: string; done: boolean }
export interface TaskComment { id: number; body: string; createdAt: string; userId: number; authorName: string | null; authorPicture: string | null }
export interface TaskHistoryItem { id: number; action: string; oldStage: string | null; newStage: string | null; createdAt: string; actorName: string | null; actorPicture: string | null }
export interface HubTask {
  id: number;
  title: string;
  notes: string | null;
  priority: Prio;
  /** Scrumban stage — primary field for the Scrum board */
  stage: TaskStage;
  stageSince: string;
  stageTime: Record<string, number>;
  /** Legacy status field kept for backward compat */
  status?: TaskStatus;
  dueDate: string | null;
  completedAt: string | null;
  orderIndex: number;
  projectRef: string | null;
  createdById: number;
  assigneeId: number | null;
  createdAt: string;
  updatedAt: string;
  checklist?: ChecklistItem[];
  /** "arranque_ia" | "arranque_brief" si la generó el sistema al activarse el contrato. */
  origin?: string | null;
  sprintWeek?: string | null;
  pareja?: { id: number; title: string; stage: string; assigneeName: string | null } | null;
  assignee: { id: number; name: string | null; picture: string | null; email?: string | null } | null;
}
export interface TeamMember {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  teamRole: string | null;
  approvalStatus: string | null;
}
export type NoteCat = "proyecto" | "cliente" | "vision" | "equipo" | "otro";
export type Tab = "dash" | "torre" | "proj" | "clients" | "meet" | "notes" | "contracts" | "ventas" | "cobros" | "svc" | "drive" | "team" | "att";
export type ProjView = "board" | "list" | "scrum";

export interface Project {
  id: string; name: string; client: string; type: string; prio: Prio; status: ProjStatus;
  owner: string; prog: number; notes: string; link: string; due?: string; contractId?: string;
  createdAt: number; updatedAt: number; stageSince?: number; stageTime?: Record<string, number>;
  /**
   * Id de la carpeta de Drive, ya extraído del enlace.
   *
   * `link` es texto libre dentro de un blob sin esquema: a veces guarda la URL
   * de la carpeta, a veces una compartida ajena y a veces cualquier cosa. Este
   * campo es el que se puede usar sin volver a adivinar.
   */
  driveFolderId?: string;
  /**
   * Motivo del último intento fallido de crear la carpeta automática, o
   * vacío si nunca falló (o ya se resolvió). Se persiste porque un toast
   * desaparece en segundos y nadie más volvía a enterarse de que el
   * proyecto se quedó sin carpeta hasta ir a buscar los archivos.
   */
  driveFolderError?: string;
  /** A quién le toca, por id real de usuario. Vacío = de todo el equipo. */
  assigneeIds?: number[];
  /**
   * true = el área de marketing trabaja en este proyecto.
   *
   * Opt-in explícito: a diferencia de Programación, que recibe todos los
   * proyectos automáticamente, no todos los clientes contratan publicidad. Sin
   * esta marca, Marketing se llenaba de trabajo que no le toca.
   */
  marketing?: boolean;
}
export interface Client {
  id: string; name: string; contact: string; segment: string; notes: string; createdAt: number;
  /**
   * Datos de contacto explícitos. Antes solo existía `contact`, un texto libre
   * donde el ejecutivo escribía el WhatsApp y se perdía entre lo demás: no se
   * podía buscar, ni abrir el chat, ni verlo desde el contrato.
   */
  whatsapp?: string; email?: string;
}

/** Normaliza un WhatsApp a solo dígitos para poder armar el enlace wa.me. */
export function soloDigitos(v: string): string { return (v || "").replace(/[^\d]/g, ""); }

/** Enlace directo al chat, o null si el número no es utilizable. */
export function linkWhatsapp(v: string | undefined): string | null {
  const d = soloDigitos(v || "");
  return d.length >= 8 ? `https://wa.me/${d}` : null;
}
/** Reuniones del flujo de ventas: el tipo ordena el embudo y el desenlace
 *  registra cómo terminó. Los escribe el servidor (ficha del contrato). */
export type TipoReunionVenta = "discovery" | "propuesta" | "seguimiento";
export type DesenlaceReunionVenta = "siguiente_reunion" | "acepta_inmediato" | "acepta_futuro" | "perdido";
export const TIPO_REUNION_LABEL: Record<string, string> = { discovery: "Discovery", propuesta: "Propuesta", seguimiento: "Seguimiento" };
export const DESENLACE_REUNION_LABEL: Record<string, string> = { siguiente_reunion: "→ siguiente reunión", acepta_inmediato: "Aceptó ✓", acepta_futuro: "A futuro", perdido: "Perdido" };
export interface Meeting {
  id: string; client: string; date: string; summary: string; notes: string; createdAt: number;
  tipo?: TipoReunionVenta; contractId?: string; desenlace?: DesenlaceReunionVenta; desenlaceAt?: number; updatedAt?: number;
}
export interface Note { id: string; cat: NoteCat; title: string; body: string; pinned?: boolean; createdAt: number; updatedAt: number; }
export interface Task { id: string; title: string; projectId: string; crit: Prio; stage: TaskStage; stageSince: number; stageTime: Record<string, number>; notes: string; createdAt: number; updatedAt: number; }
/**
 * "cancelado" servía para dos cosas distintas: la cotización que no ganamos y
 * el contrato firmado que el cliente cortó después. Con las dos en el mismo
 * cajón, la venta que sí ocurrió desaparecía de su mes en la serie histórica y
 * la tasa de conversión no se podía calcular. De ahí "perdido".
 */
export type ContractStatus = "borrador" | "activo" | "vencido" | "cancelado" | "perdido";

/** Por qué se perdió. Sin esto, "perdido" es solo un color. */
export const MOTIVOS_PERDIDA = ["precio", "plazo", "competencia", "sin_respuesta", "no_era_el_momento", "otro"] as const;
export const MOTIVO_LABEL: Record<string, string> = {
  precio: "Precio", plazo: "Plazo", competencia: "Se fue con otro",
  sin_respuesta: "Dejó de responder", no_era_el_momento: "No era el momento", otro: "Otro",
};
// `doc` guarda los datos estructurados con los que se generó el PDF (módulos,
// precios, alcance, forma de pago). Es la fuente del documento: si cambia, el
// PDF se puede regenerar. Los contratos antiguos o subidos a mano no lo tienen.
export interface Contract { id: string; title: string; client: string; value: string; status: ContractStatus; signedAt: string; expiresAt: string; notes: string; createdAt: number; updatedAt: number; pdfUrl?: string; pdfTitle?: string; pdfUploadedAt?: number; doc?: WizData;
  /** Por qué se perdió, cuando el estado es "perdido". */
  motivoPerdida?: string;
  /** Versión técnica del contrato: los requerimientos sin un solo monto. */
  brief?: ContractBrief; briefUrl?: string; briefTitle?: string; briefUploadedAt?: number;
  /** Huella del contenido con que se generó cada PDF. "Desactualizado" es
   *  comparar esto contra el contenido actual — no una bandera pegajosa. */
  docHash?: string; briefHash?: string;
  /** Lo marca el servidor cuando censuró los montos para este rol. */
  moneyRedacted?: boolean;
  /** Pipeline de ventas (solo borradores = oportunidades). Ver torre de Ventas. */
  pipelineStage?: string; probability?: number; nextFollowUp?: string; expectedClose?: string;
  /** Caso "a futuro": el cliente aceptó pero pospone el arranque. */
  futuroMotivo?: string; futuroFecha?: string; futuroNota?: string;
  salesOwnerId?: number | null; renewalOfId?: string; }

export interface BriefModule { modulo: string; descripcion: string; entregables: string[]; requisitos: string[] }
export interface ContractBrief {
  objetivo: string; contexto: string;
  alcance: BriefModule[];
  criteriosAceptacion: string[]; fueraDeAlcance: string[]; stackSugerido: string[];
  hitos: { nombre: string; detalle: string }[];
  generatedAt?: number;
}
export interface HubState { projects: Project[]; clients: Client[]; meetings: Meeting[]; notes: Note[]; tasks: Task[]; contracts: Contract[]; }
/**
 * `onSave` acepta el estado nuevo directo, o una función `(prev) => next`.
 * La forma función es obligatoria en cualquier continuación async (fetch,
 * setTimeout) que vaya a fusionar sobre el estado "actual": el componente
 * que la disparó puede desmontarse antes de que resuelva (p. ej. el modal de
 * "crear proyecto" se cierra solo, en el mismo tick, tras guardar), y una
 * `state`/`stateRef` capturada por closure queda congelada en lo que había
 * ANTES de esa creación. La forma función se resuelve dentro del setState de
 * React, que siempre ve el estado más reciente sin importar qué se desmontó.
 */
export type StateUpdater = HubState | ((prev: HubState) => HubState);
export interface WizModule { id: string; name: string; desc: string; price: number; }
export interface WizData { client: string; project: string; scope: string; date: string; advisor: string; modules: WizModule[]; downPct: number; notes: string; monthly: string; monthlyPrice: string; validityDays: number; }
export const emptyWiz = (): WizData => ({ client: "", project: "", scope: "", date: new Date().toISOString().slice(0, 10), advisor: "", modules: [{ id: Math.random().toString(36).slice(2), name: "", desc: "", price: 0 }], downPct: 50, notes: "", monthly: "", monthlyPrice: "", validityDays: 15 });
export type SheetKind =
  | null
  | { kind: "new-proj" } | { kind: "proj"; id: string }
  | { kind: "new-task" } | { kind: "task"; id: number }
  | { kind: "new-client" } | { kind: "client"; id: string }
  | { kind: "new-meet" } | { kind: "meet"; id: string }
  | { kind: "new-note" } | { kind: "note"; id: string }
  | { kind: "new-contract-mode" } | { kind: "new-contract" } | { kind: "new-contract-meeting" } | { kind: "contract"; id: string }
  | { kind: "new-contract-wizard" };

/* ============================================================
   CONSTANTES
   ============================================================ */
export const HUB_API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");
export const HUB_DRIVE_ROOT = "hub";

export const LS_KEY = "wm_hub_v3";
export const STATUS = [
  { id: "lead", label: "Lead", color: "var(--lead)" },
  { id: "disc", label: "Discovery", color: "var(--disc)" },
  { id: "dev", label: "Desarrollo", color: "var(--dev)" },
  { id: "rev", label: "Revisión", color: "var(--rev)" },
  { id: "done", label: "Entregado", color: "var(--done)" },
];
export const TASK_STAGES = [
  { id: "backlog",  label: "Backlog",      color: "var(--faint)" },
  { id: "sprint",   label: "Sprint",       color: "#6aa0c0" },
  { id: "doing",    label: "En Progreso",  color: "var(--dev)" },
  { id: "qa_sent",  label: "QA Enviado",   color: "#9b6ec0" },
  { id: "qa_rev",   label: "QA Revisión",  color: "#7b5ec0" },
  { id: "done",     label: "Hecho",        color: "var(--done)" },
];
export const NOTE_CATS: Record<NoteCat, string> = { proyecto: "Proyecto", cliente: "Cliente", vision: "Visión", equipo: "Equipo", otro: "Otra" };
export const NOTE_CAT_COLORS: Record<NoteCat, string> = { proyecto: "#6aa0c0", cliente: "#4faf6a", vision: "#b06ad0", equipo: "#c9a44a", otro: "#8a8f98" };
export const CRIT_COLOR: Record<string, string> = { crítica: "#cc2222", alta: "#e0795a", media: "#c9a44a", baja: "#6aa0c0" };
export const PRIO_W: Record<string, number> = { crítica: -1, alta: 0, media: 1, baja: 2 };
export const TAB_TITLES: Record<Tab, [string, string]> = {
  team: ["Equipo hoy", "Centro de comando · cargas · semáforo · actividad"],
  att: ["Asistencia", "Pase de lista · horas trabajadas · registro diario"],
  dash: ["Dashboard", "Resumen ejecutivo en vivo"],
  proj: ["Proyectos", "Kanban · Lista · Scrumban"],
  clients: ["Clientes", "Cartera y contactos"],
  meet: ["Reuniones", "Notas, resúmenes y seguimiento"],
  notes: ["Notas", "Ideas, acuerdos y estrategia"],
  contracts: ["Contratos", "Acuerdos, términos y vencimientos"],
  ventas: ["Ventas", "Pipeline · renovaciones · comisiones"],
  cobros: ["Cobros", "Proyectos activos · pagos recibidos · cuenta y documentos"],
  torre: ["Torre CEO", "Semáforo por área · metas de empresa · rentabilidad"],
  svc: ["Servicios", "Catálogo de referencia"],
  drive: ["Drive", "Explorador de archivos del proyecto"],
};
/** Catálogo de servicios: ahora vive en la base de datos (tabla hub_services, API /api/hub/services). */
export type HubServiceTier = { plan: string; price: string; detail: string };
export interface HubService {
  id: number;
  category: string;
  name: string;
  description: string;
  includes: string;
  note: string;
  tiers: HubServiceTier[];
  sortOrder: number;
  archived: boolean;
}

/* ============================================================
   HELPERS
   ============================================================ */
export function uid() { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function prioW(x: string) { return PRIO_W[x] !== undefined ? PRIO_W[x] : 1; }
export function projProg(projectId: string, tasks: HubTask[]): { done: number; total: number; pct: number } {
  const pt = tasks.filter(t => t.projectRef === projectId);
  if (!pt.length) return { done: 0, total: 0, pct: 0 };
  const done = pt.filter(t => t.stage === "done").length;
  return { done, total: pt.length, pct: Math.round((done / pt.length) * 100) };
}
export function fmtDur(ms: number) {
  if (!ms || ms < 0) ms = 0;
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  const p: string[] = []; if (d) p.push(d + "d"); if (d || h) p.push(h + "h"); p.push(mm + "m"); return p.join(" ");
}
export function timerClass(ms: number) { return ms >= 5 * 86400000 ? "stale" : ms >= 2 * 86400000 ? "warn" : ""; }
export function fmtDate(ts: number) { if (!ts) return ""; return new Date(ts).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }); }
export function statusOf(id: string) { return STATUS.find(s => s.id === id) || STATUS[0]; }
export function taskStatusOf(id: string) { return TASK_STAGES.find(s => s.id === id) || TASK_STAGES[0]; }
export function advanceStageObj(o: Record<string, unknown>, newVal: string, field: string) {
  const now = Date.now();
  if (!o.stageTime) o.stageTime = {};
  const cur = String(o[field]);
  (o.stageTime as Record<string, number>)[cur] = ((o.stageTime as Record<string, number>)[cur] || 0) + (now - ((o.stageSince as number) || now));
  o[field] = newVal; o.stageSince = now; o.updatedAt = now;
}
export function dueInfo(p: Project) {
  if (!p.due) return null;
  const ms = new Date(p.due + "T23:59:59").getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  return { days, label: fmtDate(new Date(p.due + "T12:00:00").getTime()), cls: days < 0 ? "overdue" : days <= 7 ? "soon" : "" };
}
export function blankState(): HubState { return { projects: [], clients: [], notes: [], meetings: [], tasks: [], contracts: [] }; }
export const CONTRACT_STATUS_IDS: readonly ContractStatus[] = ["borrador", "activo", "vencido", "cancelado", "perdido"];
export function isContractStatus(v: unknown): v is ContractStatus { return typeof v === "string" && (CONTRACT_STATUS_IDS as readonly string[]).includes(v); }
export function contractExpired(c: Contract) { return !!c.expiresAt && new Date(c.expiresAt + "T23:59:59").getTime() < Date.now(); }

/* ---- Notas: resaltado de búsqueda y formato ligero ---- */
/** Resalta las coincidencias de `q` (ya en minúsculas) dentro de `text` con <mark>. */
export function hlText(text: string, q: string | undefined, keyBase: string): React.ReactNode {
  if (!q || !text) return text;
  const lower = text.toLowerCase();
  if (!lower.includes(q)) return text;
  const out: React.ReactNode[] = [];
  let pos = 0, k = 0;
  for (;;) {
    const i = lower.indexOf(q, pos);
    if (i < 0) { if (pos < text.length) out.push(text.slice(pos)); break; }
    if (i > pos) out.push(text.slice(pos, i));
    out.push(<mark key={`${keyBase}-${k++}`}>{text.slice(i, i + q.length)}</mark>);
    pos = i + q.length;
  }
  return out;
}
export const NOTE_CHECK_RE = /^\s*(?:[-*]\s*)?\[([ xX])\]\s?(.*)$/;
/** Render de formato ligero: `# título`, `- viñeta`, `[ ] checklist`. Si se pasa onToggleLine, los checks son clicables. */
export function renderNoteFmt(body: string, q?: string, onToggleLine?: (lineIdx: number) => void): React.ReactNode {
  if (!body) return null;
  return body.split("\n").map((ln, i) => {
    const h = /^#{1,3}\s+(.+)$/.exec(ln);
    if (h) return <span key={i} className="nf-h">{hlText(h[1], q, `h${i}`)}</span>;
    const c = NOTE_CHECK_RE.exec(ln);
    if (c) {
      const done = c[1].toLowerCase() === "x";
      return (
        <span key={i} className={`nf-c${done ? " done" : ""}`} role={onToggleLine ? "checkbox" : undefined} aria-checked={onToggleLine ? done : undefined}
          onClick={onToggleLine ? e => { e.stopPropagation(); onToggleLine(i); } : undefined}>
          <span className="cbx">{done ? "✓" : ""}</span><span className="ctx">{hlText(c[2], q, `c${i}`)}</span>
        </span>
      );
    }
    const b = /^\s*[-*•]\s+(.+)$/.exec(ln);
    if (b) return <span key={i} className="nf-b"><span className="bdot">▪</span><span>{hlText(b[1], q, `b${i}`)}</span></span>;
    if (!ln.trim()) return <span key={i} className="nf-sp" aria-hidden="true" />;
    return <span key={i}>{hlText(ln, q, `p${i}`)}</span>;
  });
}
/** Progreso de checklist dentro del cuerpo de una nota. */
export function noteChecklist(body: string): { done: number; total: number } {
  let done = 0, total = 0;
  if (!body) return { done, total };
  for (const ln of body.split("\n")) {
    const c = NOTE_CHECK_RE.exec(ln);
    if (c) { total++; if (c[1].toLowerCase() === "x") done++; }
  }
  return { done, total };
}
/** Alterna `[ ]` ↔ `[x]` en la línea idx del cuerpo. */
export function toggleChecklistLine(body: string, idx: number): string {
  const lines = body.split("\n");
  const ln = lines[idx];
  if (ln == null || !NOTE_CHECK_RE.test(ln)) return body;
  lines[idx] = /\[ \]/.test(ln) ? ln.replace("[ ]", "[x]") : ln.replace(/\[[xX]\]/, "[ ]");
  return lines.join("\n");
}
/** Inserta un snippet de formato al inicio de línea, en la posición del cursor. */
export function insertNoteSnippet(el: HTMLTextAreaElement | null, snippet: string) {
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const ins = (before && !before.endsWith("\n") ? "\n" : "") + snippet;
  el.value = before + ins + after;
  const pos = (before + ins).length;
  el.focus();
  el.setSelectionRange(pos, pos);
}

/* ============================================================
   PERSISTENCIA LOCAL (clave por usuario)
   ============================================================ */
export function hubStorageKey(userId: number | null | undefined): string | null {
  return userId != null ? `${LS_KEY}:${userId}` : null;
}
/** Migración única de la clave legacy compartida: el primer usuario que abre el Hub la hereda y se elimina para el resto. */
export function migrateLegacyStorage(key: string) {
  try {
    const legacy = localStorage.getItem(LS_KEY);
    if (legacy) {
      if (!localStorage.getItem(key)) localStorage.setItem(key, legacy);
      localStorage.removeItem(LS_KEY);
    }
  } catch { /* ignore */ }
}
/** Limpia todas las claves del Hub (estado, tab, flags legacy) al cerrar sesión. */
export function clearHubStorage() {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("wm_hub")) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
export function loadState(key: string | null): HubState {
  if (!key) return blankState();
  migrateLegacyStorage(key);
  try { const raw = localStorage.getItem(key); if (raw) return Object.assign(blankState(), JSON.parse(raw)); } catch { /* ignore */ }
  return blankState();
}
export function saveState(key: string | null, st: HubState) { if (!key) return; try { localStorage.setItem(key, JSON.stringify(st)); } catch { /* ignore */ } }

/* ============================================================
   TABLERO COMPARTIDO

   El tablero es uno solo para toda la agencia (el de la dirección). El
   servidor recorta lo que cada rol puede leer (`scopes`) y escribir
   (`writeScopes`), y fusiona los cambios entidad por entidad usando la
   versión que teníamos al cargar. Por eso guardamos `version`: sin ella el
   servidor no puede distinguir "esto lo borré yo" de "esto lo creó otro".
   ============================================================ */
export interface HubSnapshot {
  data: Partial<HubState> | null;
  version: number;
  scopes: HubScope[];
  writeScopes: HubScope[];
  owner: { name: string | null; email: string } | null;
}

export async function fetchHubFromServer(): Promise<HubSnapshot | null> {
  try {
    const res = await fetch(`${HUB_API_BASE}/hub`, { credentials: "include" });
    if (!res.ok) return null;
    const json = await res.json() as Partial<HubSnapshot> & { data?: unknown };
    const data = json.data && typeof json.data === "object" && !Array.isArray(json.data)
      ? json.data as Partial<HubState>
      : null;
    return {
      data,
      version: Number(json.version) || 0,
      scopes: Array.isArray(json.scopes) ? json.scopes : [...ALL_HUB_SCOPES],
      writeScopes: Array.isArray(json.writeScopes) ? json.writeScopes : [...ALL_HUB_SCOPES],
      owner: json.owner ?? null,
    };
  } catch { return null; }
}

export type ResultadoPatch =
  | { ok: true; data: Partial<HubState>; version: number }
  | { ok: false; error: string; permanente: boolean };

/**
 * Guarda el tablero en el servidor.
 *
 * Antes devolvía `null` ante CUALQUIER fallo y el llamador hacía
 * `if (!result) return`. Eso encadenaba tres desastres silenciosos:
 *
 *  · Nadie se enteraba. El toast de "Contrato creado" ya se había mostrado
 *    1,5 s antes, así que el ejecutivo daba por hecho que estaba guardado.
 *  · `dirtyRef` se quedaba en `true` PARA SIEMPRE, y el pull de 30 s se
 *    salta si está sucio: la sesión dejaba de ver lo que hacía el resto del
 *    equipo hasta recargar la página.
 *  · El 409 "todavía no hay tablero de dirección" era invisible: se podían
 *    crear contratos y proyectos que solo existían en el localStorage.
 *
 * Ahora el fallo se devuelve con su motivo y se distingue lo que se arregla
 * reintentando de lo que no.
 */
export async function patchHubToServer(st: HubState, baseVersion: number): Promise<ResultadoPatch> {
  try {
    const res = await fetch(`${HUB_API_BASE}/hub`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: st, baseVersion }),
    });
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
      // 400 y 403 no cambian por reintentar: el dato o el permiso están mal.
      const permanente = res.status === 400 || res.status === 403;
      return {
        ok: false,
        permanente,
        error: cuerpo?.error || `El servidor rechazó el guardado (${res.status})`,
      };
    }
    const json = await res.json() as { data?: unknown; version?: unknown };
    const data = json.data && typeof json.data === "object" && !Array.isArray(json.data)
      ? json.data as Partial<HubState>
      : {};
    return { ok: true, data, version: Number(json.version) || 0 };
  } catch (e) {
    return {
      ok: false,
      permanente: false,
      error: e instanceof Error && e.message ? `No se pudo contactar al servidor: ${e.message}` : "No se pudo contactar al servidor",
    };
  }
}
export function migrate(st: HubState): HubState {
  const now = Date.now();
  st.projects.forEach(p => { if (p.stageSince == null) p.stageSince = p.updatedAt || p.createdAt || now; });
  if (!Array.isArray(st.tasks)) st.tasks = [];
  if (!Array.isArray(st.contracts)) st.contracts = [];
  if (!Array.isArray(st.notes)) st.notes = [];
  st.notes.forEach(n => { if (!n.updatedAt) n.updatedAt = n.createdAt || now; });
  return st;
}

