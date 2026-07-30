import { JornadaChip } from "@/components/jornada-card";
import { ConectarDrive, useEstadoDrive } from "@/components/conectar-drive";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useListDriveFiles, useListDriveFolders } from "@workspace/api-client-react";
import { useAuth } from "@/App";
import { ALL_HUB_SCOPES, type HubScope } from "@workspace/roles";
import { ThemeToggle } from "@/components/theme-toggle";
import { PushEnableBanner } from "@/components/push-enable-banner";
import { ViewAsBar } from "@/components/view-as-bar";
import { ActivityFeed } from "@/components/activity-feed";
import {
  LogOut, Plus, Menu, X, ChevronLeft,
  LayoutDashboard, Briefcase, Users2, CalendarClock, FileText, FileCheck2, FolderTree, Package,
  AlertTriangle, Clock3, Send, ChevronDown, ChevronUp, ChevronRight, Pin, Headphones, TrendingUp, Gauge,
} from "lucide-react";
import VentasPanel from "@/components/ventas-panel";
import TorrePanel from "@/components/torre-panel";
import "./ejecutivo.css";

/* ============================================================
   TIPOS
   ============================================================ */
type Prio = "crítica" | "alta" | "media" | "baja";
type ProjStatus = "lead" | "disc" | "dev" | "rev" | "done";
type TaskStage = "backlog" | "sprint" | "doing" | "qa_sent" | "qa_rev" | "done";
type TaskStatus = "pendiente" | "en_progreso" | "hecha";
interface ChecklistItem { id: string; text: string; done: boolean }
interface TaskComment { id: number; body: string; createdAt: string; userId: number; authorName: string | null; authorPicture: string | null }
interface TaskHistoryItem { id: number; action: string; oldStage: string | null; newStage: string | null; createdAt: string; actorName: string | null; actorPicture: string | null }
interface HubTask {
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
  assignee: { id: number; name: string | null; picture: string | null; email?: string | null } | null;
}
interface TeamMember {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  teamRole: string | null;
  approvalStatus: string | null;
}
type NoteCat = "proyecto" | "cliente" | "vision" | "equipo" | "otro";
type Tab = "dash" | "torre" | "proj" | "clients" | "meet" | "notes" | "contracts" | "ventas" | "svc" | "drive" | "team" | "att";
type ProjView = "board" | "list" | "scrum";

interface Project {
  id: string; name: string; client: string; type: string; prio: Prio; status: ProjStatus;
  owner: string; prog: number; notes: string; link: string; due?: string; contractId?: string;
  createdAt: number; updatedAt: number; stageSince?: number; stageTime?: Record<string, number>;
  /**
   * true = el área de marketing trabaja en este proyecto.
   *
   * Opt-in explícito: a diferencia de Programación, que recibe todos los
   * proyectos automáticamente, no todos los clientes contratan publicidad. Sin
   * esta marca, Marketing se llenaba de trabajo que no le toca.
   */
  marketing?: boolean;
}
interface Client {
  id: string; name: string; contact: string; segment: string; notes: string; createdAt: number;
  /**
   * Datos de contacto explícitos. Antes solo existía `contact`, un texto libre
   * donde el ejecutivo escribía el WhatsApp y se perdía entre lo demás: no se
   * podía buscar, ni abrir el chat, ni verlo desde el contrato.
   */
  whatsapp?: string; email?: string;
}

/** Normaliza un WhatsApp a solo dígitos para poder armar el enlace wa.me. */
function soloDigitos(v: string): string { return (v || "").replace(/[^\d]/g, ""); }

/** Enlace directo al chat, o null si el número no es utilizable. */
function linkWhatsapp(v: string | undefined): string | null {
  const d = soloDigitos(v || "");
  return d.length >= 8 ? `https://wa.me/${d}` : null;
}
interface Meeting { id: string; client: string; date: string; summary: string; notes: string; createdAt: number; }
interface Note { id: string; cat: NoteCat; title: string; body: string; pinned?: boolean; createdAt: number; updatedAt: number; }
interface Task { id: string; title: string; projectId: string; crit: Prio; stage: TaskStage; stageSince: number; stageTime: Record<string, number>; notes: string; createdAt: number; updatedAt: number; }
type ContractStatus = "borrador" | "activo" | "vencido" | "cancelado";
// `doc` guarda los datos estructurados con los que se generó el PDF (módulos,
// precios, alcance, forma de pago). Es la fuente del documento: si cambia, el
// PDF se puede regenerar. Los contratos antiguos o subidos a mano no lo tienen.
interface Contract { id: string; title: string; client: string; value: string; status: ContractStatus; signedAt: string; expiresAt: string; notes: string; createdAt: number; updatedAt: number; pdfUrl?: string; pdfTitle?: string; pdfUploadedAt?: number; doc?: WizData;
  /** Versión técnica del contrato: los requerimientos sin un solo monto. */
  brief?: ContractBrief; briefUrl?: string; briefTitle?: string; briefUploadedAt?: number;
  /** Lo marca el servidor cuando censuró los montos para este rol. */
  moneyRedacted?: boolean;
  /** Pipeline de ventas (solo borradores = oportunidades). Ver torre de Ventas. */
  pipelineStage?: string; probability?: number; nextFollowUp?: string; expectedClose?: string;
  salesOwnerId?: number | null; renewalOfId?: string; }

interface BriefModule { modulo: string; descripcion: string; entregables: string[]; requisitos: string[] }
interface ContractBrief {
  objetivo: string; contexto: string;
  alcance: BriefModule[];
  criteriosAceptacion: string[]; fueraDeAlcance: string[]; stackSugerido: string[];
  hitos: { nombre: string; detalle: string }[];
  generatedAt?: number;
}
interface HubState { projects: Project[]; clients: Client[]; meetings: Meeting[]; notes: Note[]; tasks: Task[]; contracts: Contract[]; }
interface WizModule { id: string; name: string; desc: string; price: number; }
interface WizData { client: string; project: string; scope: string; date: string; advisor: string; modules: WizModule[]; downPct: number; notes: string; monthly: string; monthlyPrice: string; validityDays: number; }
const emptyWiz = (): WizData => ({ client: "", project: "", scope: "", date: new Date().toISOString().slice(0, 10), advisor: "", modules: [{ id: Math.random().toString(36).slice(2), name: "", desc: "", price: 0 }], downPct: 50, notes: "", monthly: "", monthlyPrice: "", validityDays: 15 });
type SheetKind =
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
const LS_KEY = "wm_hub_v3";
const LS_TAB = "wm_hub_ui_tab";
const STATUS = [
  { id: "lead", label: "Lead", color: "var(--lead)" },
  { id: "disc", label: "Discovery", color: "var(--disc)" },
  { id: "dev", label: "Desarrollo", color: "var(--dev)" },
  { id: "rev", label: "Revisión", color: "var(--rev)" },
  { id: "done", label: "Entregado", color: "var(--done)" },
];
const TASK_STAGES = [
  { id: "backlog",  label: "Backlog",      color: "var(--faint)" },
  { id: "sprint",   label: "Sprint",       color: "#6aa0c0" },
  { id: "doing",    label: "En Progreso",  color: "var(--dev)" },
  { id: "qa_sent",  label: "QA Enviado",   color: "#9b6ec0" },
  { id: "qa_rev",   label: "QA Revisión",  color: "#7b5ec0" },
  { id: "done",     label: "Hecho",        color: "var(--done)" },
];
const NOTE_CATS: Record<NoteCat, string> = { proyecto: "Proyecto", cliente: "Cliente", vision: "Visión", equipo: "Equipo", otro: "Otra" };
const NOTE_CAT_COLORS: Record<NoteCat, string> = { proyecto: "#6aa0c0", cliente: "#4faf6a", vision: "#b06ad0", equipo: "#c9a44a", otro: "#8a8f98" };
const CRIT_COLOR: Record<string, string> = { crítica: "#cc2222", alta: "#e0795a", media: "#c9a44a", baja: "#6aa0c0" };
const PRIO_W: Record<string, number> = { crítica: -1, alta: 0, media: 1, baja: 2 };
const TAB_TITLES: Record<Tab, [string, string]> = {
  team: ["Equipo hoy", "Centro de comando · cargas · semáforo · actividad"],
  att: ["Asistencia", "Pase de lista · horas trabajadas · registro diario"],
  dash: ["Dashboard", "Resumen ejecutivo en vivo"],
  proj: ["Proyectos", "Kanban · Lista · Scrumban"],
  clients: ["Clientes", "Cartera y contactos"],
  meet: ["Reuniones", "Notas, resúmenes y seguimiento"],
  notes: ["Notas", "Ideas, acuerdos y estrategia"],
  contracts: ["Contratos", "Acuerdos, términos y vencimientos"],
  ventas: ["Ventas", "Pipeline · renovaciones · comisiones"],
  torre: ["Torre CEO", "Semáforo por área · metas de empresa · rentabilidad"],
  svc: ["Servicios", "Catálogo de referencia"],
  drive: ["Drive", "Explorador de archivos del proyecto"],
};
/** Catálogo de servicios: ahora vive en la base de datos (tabla hub_services, API /api/hub/services). */
type HubServiceTier = { plan: string; price: string; detail: string };
interface HubService {
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
function uid() { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function prioW(x: string) { return PRIO_W[x] !== undefined ? PRIO_W[x] : 1; }
function projProg(projectId: string, tasks: HubTask[]): { done: number; total: number; pct: number } {
  const pt = tasks.filter(t => t.projectRef === projectId);
  if (!pt.length) return { done: 0, total: 0, pct: 0 };
  const done = pt.filter(t => t.stage === "done").length;
  return { done, total: pt.length, pct: Math.round((done / pt.length) * 100) };
}
function fmtDur(ms: number) {
  if (!ms || ms < 0) ms = 0;
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  const p: string[] = []; if (d) p.push(d + "d"); if (d || h) p.push(h + "h"); p.push(mm + "m"); return p.join(" ");
}
function timerClass(ms: number) { return ms >= 5 * 86400000 ? "stale" : ms >= 2 * 86400000 ? "warn" : ""; }
function fmtDate(ts: number) { if (!ts) return ""; return new Date(ts).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }); }
function statusOf(id: string) { return STATUS.find(s => s.id === id) || STATUS[0]; }
function taskStatusOf(id: string) { return TASK_STAGES.find(s => s.id === id) || TASK_STAGES[0]; }
function advanceStageObj(o: Record<string, unknown>, newVal: string, field: string) {
  const now = Date.now();
  if (!o.stageTime) o.stageTime = {};
  const cur = String(o[field]);
  (o.stageTime as Record<string, number>)[cur] = ((o.stageTime as Record<string, number>)[cur] || 0) + (now - ((o.stageSince as number) || now));
  o[field] = newVal; o.stageSince = now; o.updatedAt = now;
}
function dueInfo(p: Project) {
  if (!p.due) return null;
  const ms = new Date(p.due + "T23:59:59").getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  return { days, label: fmtDate(new Date(p.due + "T12:00:00").getTime()), cls: days < 0 ? "overdue" : days <= 7 ? "soon" : "" };
}
function blankState(): HubState { return { projects: [], clients: [], notes: [], meetings: [], tasks: [], contracts: [] }; }
const CONTRACT_STATUS_IDS: readonly ContractStatus[] = ["borrador", "activo", "vencido", "cancelado"];
function isContractStatus(v: unknown): v is ContractStatus { return typeof v === "string" && (CONTRACT_STATUS_IDS as readonly string[]).includes(v); }
function contractExpired(c: Contract) { return !!c.expiresAt && new Date(c.expiresAt + "T23:59:59").getTime() < Date.now(); }

/* ---- Notas: resaltado de búsqueda y formato ligero ---- */
/** Resalta las coincidencias de `q` (ya en minúsculas) dentro de `text` con <mark>. */
function hlText(text: string, q: string | undefined, keyBase: string): React.ReactNode {
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
const NOTE_CHECK_RE = /^\s*(?:[-*]\s*)?\[([ xX])\]\s?(.*)$/;
/** Render de formato ligero: `# título`, `- viñeta`, `[ ] checklist`. Si se pasa onToggleLine, los checks son clicables. */
function renderNoteFmt(body: string, q?: string, onToggleLine?: (lineIdx: number) => void): React.ReactNode {
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
function noteChecklist(body: string): { done: number; total: number } {
  let done = 0, total = 0;
  if (!body) return { done, total };
  for (const ln of body.split("\n")) {
    const c = NOTE_CHECK_RE.exec(ln);
    if (c) { total++; if (c[1].toLowerCase() === "x") done++; }
  }
  return { done, total };
}
/** Alterna `[ ]` ↔ `[x]` en la línea idx del cuerpo. */
function toggleChecklistLine(body: string, idx: number): string {
  const lines = body.split("\n");
  const ln = lines[idx];
  if (ln == null || !NOTE_CHECK_RE.test(ln)) return body;
  lines[idx] = /\[ \]/.test(ln) ? ln.replace("[ ]", "[x]") : ln.replace(/\[[xX]\]/, "[ ]");
  return lines.join("\n");
}
/** Inserta un snippet de formato al inicio de línea, en la posición del cursor. */
function insertNoteSnippet(el: HTMLTextAreaElement | null, snippet: string) {
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
function hubStorageKey(userId: number | null | undefined): string | null {
  return userId != null ? `${LS_KEY}:${userId}` : null;
}
/** Migración única de la clave legacy compartida: el primer usuario que abre el Hub la hereda y se elimina para el resto. */
function migrateLegacyStorage(key: string) {
  try {
    const legacy = localStorage.getItem(LS_KEY);
    if (legacy) {
      if (!localStorage.getItem(key)) localStorage.setItem(key, legacy);
      localStorage.removeItem(LS_KEY);
    }
  } catch { /* ignore */ }
}
/** Limpia todas las claves del Hub (estado, tab, flags legacy) al cerrar sesión. */
function clearHubStorage() {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("wm_hub")) doomed.push(k);
    }
    doomed.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
function loadState(key: string | null): HubState {
  if (!key) return blankState();
  migrateLegacyStorage(key);
  try { const raw = localStorage.getItem(key); if (raw) return Object.assign(blankState(), JSON.parse(raw)); } catch { /* ignore */ }
  return blankState();
}
function saveState(key: string | null, st: HubState) { if (!key) return; try { localStorage.setItem(key, JSON.stringify(st)); } catch { /* ignore */ } }

/* ============================================================
   TABLERO COMPARTIDO

   El tablero es uno solo para toda la agencia (el de la dirección). El
   servidor recorta lo que cada rol puede leer (`scopes`) y escribir
   (`writeScopes`), y fusiona los cambios entidad por entidad usando la
   versión que teníamos al cargar. Por eso guardamos `version`: sin ella el
   servidor no puede distinguir "esto lo borré yo" de "esto lo creó otro".
   ============================================================ */
interface HubSnapshot {
  data: Partial<HubState> | null;
  version: number;
  scopes: HubScope[];
  writeScopes: HubScope[];
  owner: { name: string | null; email: string } | null;
}

async function fetchHubFromServer(): Promise<HubSnapshot | null> {
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

type ResultadoPatch =
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
async function patchHubToServer(st: HubState, baseVersion: number): Promise<ResultadoPatch> {
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
function migrate(st: HubState): HubState {
  const now = Date.now();
  st.projects.forEach(p => { if (p.stageSince == null) p.stageSince = p.updatedAt || p.createdAt || now; });
  if (!Array.isArray(st.tasks)) st.tasks = [];
  if (!Array.isArray(st.contracts)) st.contracts = [];
  if (!Array.isArray(st.notes)) st.notes = [];
  st.notes.forEach(n => { if (!n.updatedAt) n.updatedAt = n.createdAt || now; });
  return st;
}

/* ============================================================
   ORBIT SVG
   ============================================================ */
function buildOrbitSvg(projects: Project[]): string {
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
function DueChip({ p }: { p: Project }) {
  const d = dueInfo(p);
  if (!d) return null;
  return <span className={`chip due ${d.cls}`}>{d.days < 0 ? "venció " : "vence "}{d.label}</span>;
}

/** Datalist con los clientes existentes: permite elegir uno o escribir uno nuevo. */
function ClientOptions({ clients }: { clients: Client[] }) {
  return <datalist id="hub-client-options">{clients.map(c => <option key={c.id} value={c.name} />)}</datalist>;
}

function StageTimer({ since }: { since: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  void tick;
  const ms = Date.now() - since;
  return <div className={`stage-timer ${timerClass(ms)}`}><span className="clk">⏱</span> {fmtDur(ms)}</div>;
}

function DriveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={12} height={12} style={{ flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

/** Extract a Google Drive folder ID from a Drive URL, or null if not a folder link. */
function extractDriveFolderId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Compact, browsable Drive folder panel rendered inside the project detail sheet. */
function ProjectDriveInline({ folderId, rootName = "Carpeta del proyecto" }: { folderId: string; rootName?: string }) {
  const [currentId, setCurrentId] = useState<string>(folderId);
  const [history, setHistory] = useState<{ id: string; name: string }[]>([{ id: folderId, name: rootName }]);
  const [expanded, setExpanded] = useState(false);

  const { data: filesData, isLoading: filesLoading } = useListDriveFiles({ folderId: currentId });
  const { data: foldersData, isLoading: foldersLoading } = useListDriveFolders({ parentId: currentId });

  const isLoading = filesLoading || foldersLoading;
  const folders = foldersData || [];
  const files = filesData?.files || [];
  const empty = !isLoading && folders.length === 0 && files.length === 0;

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
        <div style={{ background: "var(--card)" }}>
          {/* Breadcrumb */}
          {history.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--line)", background: "var(--card2)" }}>
              <button onClick={goBack} style={{ padding: "3px 8px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 11, color: "var(--dim)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
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

function ProjCard({ p, tasks, onClick, onDragStart, onDragEnd }: { p: Project; tasks: HubTask[]; onClick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
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
      </div>
      <div className="bar-prog"><i style={{ width: prog.pct + "%" }} /></div>
      {prog.total > 0 && <div style={{ fontSize: "0.68em", color: "var(--muted)", marginTop: 2, textAlign: "right" }}>{prog.done}/{prog.total} tareas</div>}
      <StageTimer since={p.stageSince || p.updatedAt || p.createdAt || Date.now()} />
    </div>
  );
}

function TaskCard({ t, projects, onClick, onDragStart, onDragEnd, onDelete }: { t: HubTask; projects: Project[]; onClick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onDelete?: () => void }) {
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
        <span className="tcard-proj">{proj ? proj.name : "—"}</span>
        {t.assignee && <span className="tcard-timer" title={`Asignada a ${t.assignee.name || ""}`}>👤 {(t.assignee.name || "").split(" ")[0]}</span>}
        {cl.length > 0 && <span className="tcard-timer" title="Checklist" style={clDone === cl.length ? { color: "#1db87b" } : undefined}>☑ {clDone}/{cl.length}</span>}
        {t.dueDate && <span className="tcard-timer">{t.dueDate}</span>}
      </div>
    </div>
  );
}

function StageTimerInline({ since }: { since: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(t); }, []);
  void tick;
  const ms = Date.now() - since;
  return <span className={`tcard-timer ${timerClass(ms)}`}>⏱{fmtDur(ms)}</span>;
}

function StageBreakdown({ t }: { t: Task }) {
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

/* ============================================================
   CONTRACT HELPERS
   ============================================================ */
const fmtCLP = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

function extractDriveFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

const DOC_IVA = 0.19;

/** Suma los módulos con nombre del documento (neto) y calcula IVA + total. */
function docTotals(d: WizData) {
  const neto = (d.modules || []).filter(m => (m.name || "").trim() !== "").reduce((a, m) => a + (Number(m.price) || 0), 0);
  const iva = Math.round(neto * DOC_IVA);
  return { neto, iva, total: neto + iva };
}

/** "$1.234.567" → 1234567 */
function parseCLP(v: string): number {
  const n = Number(String(v || "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Fecha de vencimiento derivada de emisión + vigencia. */
function docExpiry(d: WizData): string {
  if (!d.validityDays || d.validityDays <= 0) return "";
  const base = d.date || new Date().toISOString().slice(0, 10);
  const exp = new Date(base + "T12:00:00");
  if (isNaN(exp.getTime())) return "";
  exp.setDate(exp.getDate() + d.validityDays);
  return exp.toISOString().slice(0, 10);
}

/** Documento base para contratos sin `doc` (creados antes o subidos como PDF externo). */
function docFromContract(c: Contract): WizData {
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
function normalizeDoc(base: WizData, incoming?: Partial<WizData> | null): WizData {
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
let ultimoErrorBrief: string | null = null;

/**
 * Pide el brief técnico al servidor.
 *
 * Devolvía `null` ante cualquier fallo y nadie preguntaba por qué: el contrato
 * se guardaba sin versión técnica y el único indicio era una variación del
 * texto de un toast que nadie lee. Y un contrato activo sin brief hace que el
 * handoff entregue a desarrollo tres tareas genéricas como si fueran el
 * alcance real. Ahora el motivo queda registrado para poder decirlo.
 */
async function fetchContractBrief(doc: WizData, contract?: Partial<Contract>): Promise<ContractBrief | null> {
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

async function buildBriefPdf(brief: ContractBrief, doc: WizData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, ml = 14, mr = W - 14;
  let y = 0;

  const dark = () => pdf.setTextColor(13, 23, 46);
  const orange = () => pdf.setTextColor(234, 88, 12);
  const dim = () => pdf.setTextColor(110, 110, 110);

  const pageBreak = (need: number) => {
    if (y + need < H - 20) return;
    pdf.addPage();
    y = 20;
  };

  const heading = (text: string) => {
    pageBreak(16);
    y += 6;
    orange();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(text.toUpperCase(), ml, y);
    y += 2;
    pdf.setDrawColor(234, 88, 12);
    pdf.setLineWidth(0.3);
    pdf.line(ml, y, mr, y);
    y += 5;
  };

  const paragraph = (text: string, size = 9) => {
    if (!text) return;
    dark();
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, mr - ml);
    for (const line of lines) {
      pageBreak(6);
      pdf.text(line, ml, y);
      y += size * 0.52;
    }
    y += 2;
  };

  const bullets = (items: string[]) => {
    dark();
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    for (const item of items.filter(Boolean)) {
      const lines = pdf.splitTextToSize(item, mr - ml - 6);
      lines.forEach((line: string, i: number) => {
        pageBreak(6);
        if (i === 0) { orange(); pdf.text("•", ml + 1, y); dark(); }
        pdf.text(line, ml + 6, y);
        y += 4.6;
      });
    }
    y += 2;
  };

  // Portada compacta
  pdf.setFillColor(13, 23, 46);
  pdf.rect(0, 0, W, 46, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text("WEBMAKER LATAM · DOCUMENTO INTERNO", ml, 12);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text(pdf.splitTextToSize((doc.project || "Proyecto").toUpperCase(), mr - ml).slice(0, 2), ml, 24);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(`Cliente: ${doc.client || "—"}${doc.date ? `  ·  Emisión: ${doc.date}` : ""}`, ml, 38);
  y = 56;

  dim();
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(7.5);
  pdf.text("Brief técnico — describe qué se debe construir. No contiene información comercial ni montos.", ml, y);
  y += 6;

  if (brief.objetivo) { heading("Objetivo"); paragraph(brief.objetivo); }
  if (brief.contexto) { heading("Contexto"); paragraph(brief.contexto); }

  if (brief.alcance.length) {
    heading("Alcance por módulo");
    for (const mod of brief.alcance) {
      pageBreak(20);
      dark();
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.text(mod.modulo || "Módulo", ml, y);
      y += 5;
      paragraph(mod.descripcion, 8.5);
      if (mod.entregables.length) {
        dim(); pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5);
        pageBreak(6); pdf.text("Entregables", ml, y); y += 4;
        bullets(mod.entregables);
      }
      if (mod.requisitos.length) {
        dim(); pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5);
        pageBreak(6); pdf.text("Requisitos", ml, y); y += 4;
        bullets(mod.requisitos);
      }
      y += 2;
    }
  }

  if (brief.criteriosAceptacion.length) { heading("Criterios de aceptación"); bullets(brief.criteriosAceptacion); }
  if (brief.fueraDeAlcance.length) { heading("Fuera de alcance"); bullets(brief.fueraDeAlcance); }
  if (brief.stackSugerido.length) { heading("Stack sugerido"); bullets(brief.stackSugerido); }
  if (brief.hitos.length) {
    heading("Hitos");
    bullets(brief.hitos.map(h => `${h.nombre}${h.detalle ? ` — ${h.detalle}` : ""}`));
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(6.5);
    dim();
    pdf.setFont("helvetica", "normal");
    pdf.text(`WEBMAKER LATAM · BRIEF TÉCNICO · ${(doc.client || "CLIENTE").toUpperCase()}`, ml, H - 8);
    pdf.text(`${i} / ${pages}`, mr, H - 8, { align: "right" });
  }

  return pdf.output("blob");
}

/** Sube un PDF a la carpeta del Hub en Drive. Devuelve null si Drive no responde. */
async function uploadPdfToDrive(blob: Blob, filename: string): Promise<{ url: string; title: string; uploadedAt: number } | null> {
  try {
    const fd = new FormData();
    fd.append("file", new File([blob], filename, { type: "application/pdf" }));
    fd.append("parentId", HUB_DRIVE_ROOT);
    const res = await fetch(`${DRIVE_API_BASE}/drive/upload-pdf`, { method: "POST", credentials: "include", body: fd });
    if (!res.ok) return null;
    const up = await res.json() as { webViewLink: string; name: string; uploadedAt: number };
    return { url: up.webViewLink, title: up.name, uploadedAt: up.uploadedAt };
  } catch { return null; }
}

/**
 * Genera la versión técnica completa (brief + PDF en Drive) para un documento.
 * Es best-effort: si la IA o Drive fallan, el contrato se guarda igual sin brief.
 */
async function buildTechnicalVersion(doc: WizData, contract?: Partial<Contract>) {
  const brief = await fetchContractBrief(doc, contract);
  if (!brief) return null;
  try {
    const blob = await buildBriefPdf(brief, doc);
    const name = `Brief-Tecnico-${(doc.client || "cliente").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const uploaded = await uploadPdfToDrive(blob, name);
    return { brief, briefUrl: uploaded?.url, briefTitle: uploaded?.title, briefUploadedAt: uploaded?.uploadedAt };
  } catch {
    return { brief, briefUrl: undefined, briefTitle: undefined, briefUploadedAt: undefined };
  }
}

async function buildContractPdf(wiz: WizData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, ml = 14, mr = W - 14;
  const IVA = 0.19;

  const clrDark = () => doc.setTextColor(13, 23, 46);
  const clrOrange = () => doc.setTextColor(234, 88, 12);
  const clrWhite = () => doc.setTextColor(255, 255, 255);
  const clrDim = () => doc.setTextColor(120, 120, 120);
  const clrFaint = () => doc.setTextColor(200, 200, 200);

  const validMods = wiz.modules.filter(m => m.name.trim() !== "");

  function pageFooter(n: number, total: number) {
    doc.setFillColor(13, 23, 46);
    doc.rect(0, H - 18, W, 18, "F");
    clrWhite();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(`WEBMAKER LATAM · COTIZACIÓN · ${(wiz.client || "CLIENTE").toUpperCase()}`, ml, H - 9);
    clrFaint();
    doc.setFont("helvetica", "normal");
    doc.text(`${n} / ${total}`, mr, H - 9, { align: "right" });
  }

  // ===== COVER =====
  doc.setFillColor(13, 23, 46);
  doc.rect(0, 0, W, 78, "F");
  clrWhite();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Diseño y desarrollo de plataformas", ml, 11);
  doc.setFont("helvetica", "bold");
  doc.text("COTIZACIÓN COMERCIAL", mr, 11, { align: "right" });
  doc.setFont("helvetica", "normal");
  const monthYear = wiz.date
    ? new Date(wiz.date + "T12:00:00").toLocaleDateString("es-CL", { month: "long", year: "numeric" }).toUpperCase()
    : new Date().toLocaleDateString("es-CL", { month: "long", year: "numeric" }).toUpperCase();
  doc.text(monthYear, mr, 19, { align: "right" });
  doc.setDrawColor(234, 88, 12);
  doc.setLineWidth(0.4);
  doc.line(ml, 27, mr, 27);
  clrOrange();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`COTIZACIÓN · ${(wiz.client || "CLIENTE").toUpperCase()}`, ml, 37);
  clrWhite();
  doc.setFontSize(17);
  const titleLines = doc.splitTextToSize((wiz.project || "Sin título").toUpperCase(), mr - ml - 5);
  doc.text(titleLines.slice(0, 3), ml, 49);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const scopeShort = doc.splitTextToSize(wiz.scope || "", mr - ml - 5);
  const titleBottom = 49 + Math.min(titleLines.length, 3) * 7;
  if (titleBottom < 74 && wiz.scope) doc.text(scopeShort.slice(0, 2), ml, Math.min(titleBottom + 3, 70));

  // Grid cards
  const gridY = 90;
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(ml, gridY, (mr - ml) / 2 - 4, 48, 2, 2, "F");
  doc.roundedRect(ml + (mr - ml) / 2 + 4, gridY, (mr - ml) / 2 - 4, 48, 2, 2, "F");
  clrOrange();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("PREPARADO PARA", ml + 5, gridY + 8);
  doc.text("ALCANCE DE LA COTIZACIÓN", ml + (mr - ml) / 2 + 9, gridY + 8);
  clrDark();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(wiz.client || "—", ml + 5, gridY + 18);
  clrDim();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(wiz.advisor || "WebMaker Latam", ml + 5, gridY + 27);
  clrDark();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`${validMods.length} módulo${validMods.length !== 1 ? "s" : ""}`, ml + (mr - ml) / 2 + 9, gridY + 18);
  clrDim();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const alcLines = doc.splitTextToSize(validMods.map(m => m.name).join(", ") || wiz.scope.slice(0, 80) || "—", (mr - ml) / 2 - 18);
  doc.text(alcLines.slice(0, 3), ml + (mr - ml) / 2 + 9, gridY + 27);

  doc.setFillColor(13, 23, 46);
  doc.rect(0, H - 18, W, 18, "F");
  clrWhite();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("WEBMAKER LATAM · WEBMAKERLATAM.COM", ml, H - 9);
  clrFaint();
  doc.setFont("helvetica", "normal");
  doc.text("1 / 4", mr, H - 9, { align: "right" });
  clrDim();
  doc.text("agencia@webmakerlatam.com", mr, H - 15, { align: "right" });

  // ===== PAGE 2: QUÉ SE COTIZA =====
  doc.addPage();
  doc.setFillColor(13, 23, 46);
  doc.rect(0, 0, W, 14, "F");
  clrOrange();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("01 · QUÉ SE COTIZA", ml, 10);
  clrFaint();
  doc.setFontSize(72);
  doc.text("01", mr + 2, 72, { align: "right" });
  clrDark();
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(wiz.project || "Proyecto", ml, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const scopeLines2 = doc.splitTextToSize(wiz.scope || "Descripción del servicio.", mr - ml - 5);
  doc.text(scopeLines2.slice(0, 7), ml, 37);
  let y2 = 37 + Math.min(scopeLines2.length, 7) * 4.5 + 10;
  validMods.forEach((m, i) => {
    if (y2 > H - 30) { doc.addPage(); y2 = 22; }
    doc.setFillColor(234, 88, 12);
    doc.circle(ml + 1.5, y2 - 1, 1.5, "F");
    clrDark();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${i + 1} · ${m.name}`, ml + 6, y2);
    y2 += 6;
    if (m.desc) {
      clrDim();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const dl = doc.splitTextToSize(m.desc, mr - ml - 10);
      doc.text(dl.slice(0, 2), ml + 6, y2);
      y2 += Math.min(dl.length, 2) * 4.5 + 3;
    } else { y2 += 2; }
  });
  pageFooter(2, 4);

  // ===== PAGE 3: INVERSIÓN =====
  doc.addPage();
  doc.setFillColor(13, 23, 46);
  doc.rect(0, 0, W, 14, "F");
  clrOrange();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("02 · INVERSIÓN", ml, 10);
  clrFaint();
  doc.setFontSize(72);
  doc.text("02", mr + 2, 72, { align: "right" });
  clrDark();
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Inversión por módulo.", ml, 26);
  clrDim();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Valores en pesos chilenos (CLP), IVA incluido y desglosado:", ml, 33);

  let iy = 40;
  const priceMods = validMods.filter(m => m.price > 0);
  if (priceMods.length === 0) {
    clrDim(); doc.setFontSize(8.5);
    doc.text("Los valores se coordinarán según el alcance definido.", ml, iy + 8);
    iy += 20;
  } else {
    priceMods.forEach((m, i) => {
      if (iy > H - 60) { doc.addPage(); iy = 22; }
      const neto = m.price, iva = Math.round(neto * IVA), total = neto + iva;
      doc.setFillColor(255, 247, 237);
      doc.roundedRect(ml, iy, mr - ml, 30, 2, 2, "F");
      clrDark(); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(`${i + 1} · ${m.name}`, ml + 4, iy + 7);
      if (m.desc) {
        clrDim(); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
        doc.text(m.desc.slice(0, 90), ml + 4, iy + 13);
      }
      const c1 = ml + 4, c2 = ml + (mr - ml) / 3, c3 = ml + (mr - ml) * 2 / 3;
      clrOrange(); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
      doc.text("NETO", c1, iy + 20); doc.text("IVA 19%", c2, iy + 20); doc.text("TOTAL", c3, iy + 20);
      clrDark(); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(fmtCLP(neto), c1, iy + 27); doc.text(fmtCLP(iva), c2, iy + 27); doc.text(fmtCLP(total), c3, iy + 27);
      iy += 36;
    });
    if (iy > H - 50) { doc.addPage(); iy = 22; }
    const tNeto = priceMods.reduce((a, m) => a + m.price, 0), tIva = Math.round(tNeto * IVA), tTotal = tNeto + tIva;
    doc.setFillColor(13, 23, 46);
    doc.roundedRect(ml, iy, mr - ml, 30, 2, 2, "F");
    clrWhite(); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("TOTAL PROYECTO (IVA INCLUIDO)", ml + 4, iy + 7);
    const c1 = ml + 4, c2 = ml + (mr - ml) / 3, c3 = ml + (mr - ml) * 2 / 3;
    doc.setFontSize(6.5);
    doc.text("NETO", c1, iy + 16); doc.text("IVA 19%", c2, iy + 16); doc.text("TOTAL", c3, iy + 16);
    doc.setFontSize(10);
    doc.text(fmtCLP(tNeto), c1, iy + 25); doc.text(fmtCLP(tIva), c2, iy + 25); doc.text(fmtCLP(tTotal), c3, iy + 25);
  }
  pageFooter(3, 4);

  // ===== PAGE 4: PAGO =====
  doc.addPage();
  doc.setFillColor(13, 23, 46);
  doc.rect(0, 0, W, 14, "F");
  clrOrange();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("03 · FORMA DE PAGO Y MENSUALIDAD", ml, 10);
  clrFaint();
  doc.setFontSize(72);
  doc.text("03", mr + 2, 72, { align: "right" });
  clrDark();
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Pago ${wiz.downPct}% / ${100 - wiz.downPct}%.`, ml, 26);
  clrDim();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Simple y directo, sin sorpresas:", ml, 33);

  const priceMods2 = validMods.filter(m => m.price > 0);
  const tNeto2 = priceMods2.reduce((a, m) => a + m.price, 0);
  const tTotal2 = tNeto2 + Math.round(tNeto2 * IVA);
  const initAmt = Math.round(tTotal2 * wiz.downPct / 100);
  const delivAmt = tTotal2 - initAmt;
  const bxY = 40, bxW = (mr - ml) / 2 - 5;

  doc.setFillColor(234, 88, 12);
  doc.roundedRect(ml, bxY, bxW, 44, 3, 3, "F");
  clrWhite(); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(`${wiz.downPct}%`, ml + bxW / 2, bxY + 18, { align: "center" });
  doc.setFontSize(8); doc.text("AL INICIAR", ml + bxW / 2, bxY + 27, { align: "center" });
  if (tTotal2 > 0) { doc.setFontSize(10); doc.text(fmtCLP(initAmt), ml + bxW / 2, bxY + 37, { align: "center" }); }

  doc.setFillColor(13, 23, 46);
  doc.roundedRect(mr - bxW, bxY, bxW, 44, 3, 3, "F");
  clrWhite(); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(`${100 - wiz.downPct}%`, mr - bxW / 2, bxY + 18, { align: "center" });
  doc.setFontSize(8); doc.text("A LA ENTREGA", mr - bxW / 2, bxY + 27, { align: "center" });
  if (tTotal2 > 0) { doc.setFontSize(10); doc.text(fmtCLP(delivAmt), mr - bxW / 2, bxY + 37, { align: "center" }); }

  let py4 = bxY + 54;
  if (wiz.monthly) {
    clrOrange(); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("MENSUALIDAD (OPCIONAL)", ml, py4 + 6); py4 += 12;
    if (wiz.monthlyPrice) {
      clrDark(); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text(fmtCLP(Number(wiz.monthlyPrice)), ml, py4 + 6); py4 += 10;
    }
    clrDim(); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const ml2 = doc.splitTextToSize(wiz.monthly, mr - ml - 10);
    doc.text(ml2.slice(0, 3), ml, py4 + 6); py4 += Math.min(ml2.length, 3) * 4.5 + 8;
  }
  if (wiz.notes) {
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(ml, py4, mr - ml, 20, 2, 2, "F");
    clrDim(); doc.setFont("helvetica", "italic"); doc.setFontSize(7.5);
    const nl = doc.splitTextToSize(wiz.notes, mr - ml - 10);
    doc.text(nl.slice(0, 3), ml + 5, py4 + 8);
  }
  clrDim(); doc.setFont("helvetica", "italic"); doc.setFontSize(9);
  doc.text("Esta cotización queda abierta a los ajustes que definamos juntos.", W / 2, H - 38, { align: "center" });
  doc.text("Quedamos atentos para cuando quieras ponerla en marcha.", W / 2, H - 31, { align: "center" });
  pageFooter(4, 4);

  return doc.output("blob");
}

/* ============================================================
   DRIVE FOLDER PICKER (for project sheets)
   ============================================================ */
const DRIVE_API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

function FolderPickerPanel({ onSelect }: { onSelect: (id: string, name: string, url: string) => void }) {
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
  const miniBtn: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--line)", color: "var(--dim)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" };
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

function DriveFolderSelector({ value, onChange, projectName, onToast }: {
  value: string; onChange: (link: string) => void; projectName: string; onToast: (msg: string) => void;
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
    const name = projectName.trim() || "Proyecto";
    setCreating(true);
    try {
      const res = await fetch(`${DRIVE_API_BASE}/drive/mkdir`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ name }),
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
  const btnSec: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--line)", color: "var(--dim)", borderRadius: 8, padding: "8px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" };
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
            style={{ flex: 1, minWidth: 220, background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5 }}
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
interface PdfData { url: string; title: string; uploadedAt: number; }
function PdfUploadField({ value, onChange, onToast }: { value: PdfData | null; onChange: (d: PdfData | null) => void; onToast: (m: string) => void }) {
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
          <ConectarDrive volverA="ejecutivo" motivo="Por eso no se pudo subir el PDF." />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TAREAS: CHECKLIST, COMENTARIOS E HISTORIAL
   ============================================================ */
function ChecklistEditor({ items, onChange }: { items: ChecklistItem[]; onChange: (next: ChecklistItem[]) => void }) {
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

function fmtCommentDate(x: string): string {
  try { return new Date(x).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return x; }
}

function TaskComments({ taskId, onToast }: { taskId: number; onToast: (msg: string) => void }) {
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

function historyLabel(a: TaskHistoryItem): string {
  const stageLabel = (id: string | null) => TASK_STAGES.find(s => s.id === id)?.label ?? id ?? "";
  if (a.action === "created") return "creó la tarea";
  if (a.action === "assigned") return "reasignó la tarea";
  if (a.action === "commented") return "comentó";
  if (a.action === "stage_change") return `movió a ${stageLabel(a.newStage)}`;
  return a.action;
}

function TaskHistory({ taskId }: { taskId: number }) {
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
function BriefView({ brief, briefUrl, doc, onGenerate, generating, estadoContrato }: {
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

interface SheetProps { sheet: SheetKind; state: HubState; onClose: () => void; onSave: (next: HubState) => void; onToast: (msg: string, undo?: () => void) => void; onNavigate: (tab: Tab) => void; onOpenSheet: (s: SheetKind) => void; onConfirm: (msg: string, onYes: () => void) => void; canWrite: (scope: HubScope) => boolean; apiTasks: HubTask[]; teamMembers: TeamMember[]; onRefreshTasks: () => void; }

function SheetContent({ sheet, state, onClose, onSave, onToast, onNavigate, onOpenSheet, onConfirm, canWrite, apiTasks, teamMembers, onRefreshTasks }: SheetProps) {
  const authUser = useAuth();
  const canDeleteTasks = authUser?.role === "superadmin" || authUser?.teamRole === "ceo";
  const r = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>({});
  const R = (k: string) => (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => { r.current[k] = el; };
  const V = (k: string) => (r.current[k] as HTMLInputElement | null)?.value ?? "";
  const [taskChecklist, setTaskChecklist] = useState<ChecklistItem[]>([]);
  const [driveFolderLink, setDriveFolderLink] = useState("");
  /** Si el área de marketing trabaja en el proyecto abierto (opt-in explícito). */
  const [marketingOn, setMarketingOn] = useState(false);
  const [projNameDraft, setProjNameDraft] = useState("");
  const [pdfData, setPdfData] = useState<PdfData | null>(null);
  const [wizStep, setWizStep] = useState(1);
  const [wiz, setWiz] = useState<WizData>(emptyWiz);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [cotJson, setCotJson] = useState("");
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
  const [docDirty, setDocDirty] = useState(false);
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
      if (p) { setDriveFolderLink(p.link || ""); setProjNameDraft(p.name || ""); setMarketingOn(p.marketing === true); }
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
        setDocDirty(false); setRegeneratingDoc(false);
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
    if (sheet?.kind === "new-contract-wizard") { setWizStep(1); setWiz(emptyWiz()); setGeneratingPdf(false); setMeetingNotes(""); setMeetingExtracting(false); setCotJson(""); setCotHtml(null); setCotError(null); setCotLoading(false); setCotShowJson(false); }
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
      const blob = await buildContractPdf(d);
      const stamp = new Date();
      const cliente = (d.client || c.client || "cliente").replace(/\s+/g, "-");
      const fname = `Cotizacion-${cliente}-${stamp.toISOString().slice(0, 10)}-${stamp.getTime().toString().slice(-5)}.pdf`;
      const fd = new FormData();
      fd.append("file", new File([blob], fname, { type: "application/pdf" }));
      fd.append("parentId", HUB_DRIVE_ROOT);

      let nextPdf: PdfData | null = pdfData;
      const upRes = await fetch(`${DRIVE_API_BASE}/drive/upload-pdf`, { method: "POST", credentials: "include", body: fd });
      if (upRes.ok) {
        const up = await upRes.json() as { webViewLink: string; name: string; uploadedAt: number };
        nextPdf = { url: up.webViewLink, title: up.name, uploadedAt: up.uploadedAt };
        setPdfData(nextPdf);
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = fname; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        onToast("PDF regenerado y descargado (Drive no disponible)");
      }

      // Si cambia el documento, el brief técnico deja de ser válido: se rehace
      // en la misma operación para que ambas versiones digan lo mismo.
      const tech = await buildTechnicalVersion(d, { title: c.title, client: c.client, notes: c.notes });

      const totals = docTotals(d);
      const exp = docExpiry(d);
      onSave({
        ...state,
        contracts: state.contracts.map(x => x.id !== c.id ? x : {
          ...x,
          brief: tech?.brief ?? x.brief,
          briefUrl: tech?.briefUrl ?? x.briefUrl,
          briefTitle: tech?.briefTitle ?? x.briefTitle,
          briefUploadedAt: tech?.briefUploadedAt ?? x.briefUploadedAt,
          title: (V("ti").trim() || d.project || x.title),
          client: d.client || V("cl"),
          value: totals.total > 0 ? fmtCLP(totals.total) : V("va"),
          status: (V("st") || x.status) as ContractStatus,
          signedAt: d.date || V("si"),
          expiresAt: exp || V("ex"),
          notes: V("no") || d.scope,
          doc: d,
          pdfUrl: nextPdf?.url, pdfTitle: nextPdf?.title, pdfUploadedAt: nextPdf?.uploadedAt,
          updatedAt: Date.now(),
        }),
      });
      setDocDirty(false);
      if (upRes.ok) onToast(tech?.brief ? "Cotización y brief técnico regenerados ✓" : "Documento regenerado con los cambios ✓");
    } catch (e: unknown) {
      onToast("Error regenerando el PDF: " + (e instanceof Error ? e.message : "desconocido"));
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
      const tech = await buildTechnicalVersion(source, { title: c.title, client: c.client, notes: c.notes });
      if (!tech) { onToast("No se pudo generar el brief técnico"); return; }
      onSave({
        ...state,
        contracts: state.contracts.map(x => x.id !== c.id ? x : {
          ...x,
          doc: x.doc ?? source,
          brief: tech.brief,
          briefUrl: tech.briefUrl ?? x.briefUrl,
          briefTitle: tech.briefTitle ?? x.briefTitle,
          briefUploadedAt: tech.briefUploadedAt ?? x.briefUploadedAt,
          updatedAt: Date.now(),
        }),
      });
      onToast(tech.briefUrl ? "Brief técnico generado y subido a Drive ✓" : "Brief técnico generado");
    } catch (e: unknown) {
      onToast("Error generando el brief: " + (e instanceof Error ? e.message : "desconocido"));
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
            onRefreshTasks(); onClose(); onToast("Tarea eliminada");
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
        <DriveFolderSelector value={driveFolderLink} onChange={setDriveFolderLink} projectName={projNameDraft} onToast={onToast} />
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
        onSave({ ...state, projects: [...state.projects, { id: newProjId, name, client: V("cli").trim(), type: V("ty").trim(), prio: V("prio") as Prio, status: V("st") as ProjStatus, owner: V("ow").trim(), due: V("due"), prog: 0, notes: V("no"), link: driveFolderLink, contractId: fromCid, createdAt: now, updatedAt: now }] });
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
    return (<>
      <div className="sheet-head"><h2>Proyecto</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="detail-meta"><span className={`chip prio-${p.prio}`}>{p.prio}</span><span className="badge">{statusOf(p.status).label}</span></div>
      <div className="field"><label>Nombre</label><input type="text" ref={R("n")} value={projNameDraft} onChange={e => setProjNameDraft(e.target.value)} /></div>
      <div className="two field"><div><label>Cliente</label><input type="text" ref={R("cli")} defaultValue={p.client} list="hub-client-options" /><ClientOptions clients={state.clients} /></div><div><label>Tipo</label><input type="text" ref={R("ty")} defaultValue={p.type} /></div></div>
      <div className="three field">
        <div><label>Prioridad</label><select ref={R("prio")} defaultValue={p.prio}>{["crítica","alta","media","baja"].map(x => <option key={x} value={x}>{x}</option>)}</select></div>
        <div><label>Estado</label><select ref={R("st")} defaultValue={p.status}>{STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Dueño</label><input type="text" ref={R("ow")} defaultValue={p.owner || ""} /></div>
      </div>
      <div className="field"><label>Fecha límite</label><input type="date" ref={R("due")} defaultValue={p.due || ""} /></div>
      {p.contractId && (() => {
        const c = state.contracts.find(x => x.id === p.contractId);
        if (!c) return null;
        const statusColor: Record<ContractStatus, string> = { borrador: "#6aa0c0", activo: "#1db87b", vencido: "#e0795a", cancelado: "#888" };
        return (
          <div style={{ margin: "0 0 12px", padding: "10px 12px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1em" }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.7em", color: "var(--muted)", marginBottom: 2 }}>Contrato origen</div>
              <div style={{ fontSize: "0.85em", fontWeight: 600, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <span style={{ fontSize: "0.68em", fontWeight: 700, padding: "1px 7px", borderRadius: 10, background: `${statusColor[c.status]}22`, color: statusColor[c.status] }}>{c.status}</span>
                {c.value && <span style={{ fontSize: "0.72em", color: "var(--muted)" }}>{c.value}</span>}
              </div>
            </div>
            <button onClick={() => onOpenSheet({ kind: "contract", id: c.id })} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--fg)", fontSize: "0.78em", cursor: "pointer", whiteSpace: "nowrap" }}>Ver →</button>
          </div>
        );
      })()}
      {(() => {
        const { done, total, pct } = projProg(p.id, apiTasks);
        return (
          <div className="field">
            <label>Avance {total > 0 ? <b>{done}/{total} tareas completadas ({pct}%)</b> : <span style={{ color: "var(--muted)", fontWeight: 400 }}>Sin tareas asignadas</span>}</label>
            <div className="rangewrap" style={{ pointerEvents: "none", opacity: 0.7 }}>
              <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: pct + "%", background: pct === 100 ? "#1db87b" : "var(--accent, #ff7800)", borderRadius: 3, transition: "width .3s" }} />
              </div>
            </div>
          </div>
        );
      })()}
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={6} defaultValue={p.notes || ""} /></div>
      <div className="field">
        <label>Áreas involucradas</label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85em", cursor: "pointer" }}>
          <input type="checkbox" checked={marketingOn} onChange={(e) => setMarketingOn(e.target.checked)} />
          <span>Marketing trabaja en este proyecto</span>
        </label>
        <p style={{ fontSize: "0.75em", color: "var(--muted)", margin: "4px 0 0" }}>
          Programación recibe todos los proyectos. Marketing solo los que marques aquí, porque no todos los clientes contratan publicidad.
        </p>
      </div>
      <div className="field">
        <label>Carpeta de Drive</label>
        <DriveFolderSelector value={driveFolderLink} onChange={setDriveFolderLink} projectName={p.name} onToast={onToast} />
      </div>
      <button className="save" onClick={() => {
        const newStatus = V("st") as ProjStatus;
        const projects = state.projects.map(x => {
          if (x.id !== p.id) return x;
          const computedProg = projProg(x.id, apiTasks).pct;
          const u: Record<string, unknown> = { ...x, name: V("n").trim() || x.name, client: V("cli").trim(), type: V("ty").trim(), prio: V("prio"), owner: V("ow").trim(), due: V("due"), prog: computedProg, notes: V("no"), link: driveFolderLink, marketing: marketingOn, updatedAt: Date.now() };
          if (newStatus !== x.status) advanceStageObj(u, newStatus, "status");
          return u as unknown as Project;
        });
        onSave({ ...state, projects }); onClose(); onToast("Proyecto actualizado");
      }}>Guardar cambios</button>

      {/* ---- Generar tareas Scrum con IA ---- */}
      <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: "1em" }}>🤖</span>
          <strong style={{ fontSize: "0.9em" }}>Generar tareas Scrum con IA</strong>
        </div>
        <p style={{ fontSize: "0.78em", color: "var(--muted)", margin: "0 0 10px" }}>La IA analiza los requerimientos del proyecto y propone tareas listas para agregar al Backlog.</p>

        {scrumProposed.length === 0 && (
          <button
            disabled={scrumLoading}
            onClick={async () => {
              setScrumLoading(true);
              try {
                const res = await fetch(`${DRIVE_API_BASE}/hub/projects/ai-extract-tasks`, {
                  method: "POST", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ project: { name: V("n") || p.name, client: V("cli") || p.client, type: V("ty") || p.type, notes: V("no") || p.notes } }),
                });
                if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; onToast(e.error || "Error al generar tareas"); return; }
                const data = await res.json() as { tasks?: Array<{ title: string; crit: string; notes: string }> };
                const tasks = (data.tasks || []).slice(0, 15).map(t => ({ ...t, selected: true }));
                if (tasks.length === 0) { onToast("La IA no pudo generar tareas — agrega más notas al proyecto"); return; }
                setScrumProposed(tasks);
              } catch { onToast("Error de conexión"); }
              finally { setScrumLoading(false); }
            }}
            style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: scrumLoading ? "var(--card-bg)" : "rgba(0,200,120,0.09)", color: scrumLoading ? "var(--muted)" : "#1db87b", fontWeight: 600, fontSize: "0.88em", cursor: scrumLoading ? "not-allowed" : "pointer" }}
          >
            {scrumLoading ? "⏳ Generando tareas Scrum…" : "✨ Generar tareas Scrum"}
          </button>
        )}

        {scrumProposed.length > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: "0.8em", color: "var(--muted)" }}>{scrumProposed.filter(t => t.selected).length} de {scrumProposed.length} tareas seleccionadas</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setScrumProposed(ts => ts.map(t => ({ ...t, selected: true })))} style={{ fontSize: "0.72em", padding: "2px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "none", color: "var(--muted)", cursor: "pointer" }}>Todas</button>
                <button onClick={() => setScrumProposed(ts => ts.map(t => ({ ...t, selected: false })))} style={{ fontSize: "0.72em", padding: "2px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "none", color: "var(--muted)", cursor: "pointer" }}>Ninguna</button>
                <button onClick={() => setScrumProposed([])} style={{ fontSize: "0.72em", padding: "2px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "none", color: "var(--muted)", cursor: "pointer" }}>✕</button>
              </div>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {scrumProposed.map((t, i) => (
                <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", borderRadius: 8, border: `1px solid ${t.selected ? "var(--accent, #ff7800)" : "var(--border)"}`, background: t.selected ? "rgba(255,120,0,0.05)" : "var(--card-bg, rgba(255,255,255,0.03))", cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={t.selected} onChange={() => setScrumProposed(ts => ts.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.85em", fontWeight: 600, color: "var(--fg)" }}>{t.title}</span>
                      <span style={{ fontSize: "0.68em", fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: t.crit === "crítica" ? "rgba(204,34,34,0.15)" : t.crit === "alta" ? "rgba(224,121,90,0.18)" : t.crit === "media" ? "rgba(201,164,74,0.18)" : "rgba(106,160,192,0.18)", color: CRIT_COLOR[t.crit] || "var(--muted)" }}>{t.crit}</span>
                    </div>
                    {t.notes && <p style={{ margin: "3px 0 0", fontSize: "0.75em", color: "var(--muted)", lineHeight: 1.4 }}>{t.notes}</p>}
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
              style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "1px solid #1db87b", background: "rgba(0,200,120,0.1)", color: "#1db87b", fontWeight: 700, fontSize: "0.9em", cursor: scrumProposed.filter(t => t.selected).length === 0 ? "not-allowed" : "pointer", opacity: scrumProposed.filter(t => t.selected).length === 0 ? 0.5 : 1 }}
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
                  body: JSON.stringify({ project: { name: V("n") || p.name, client: V("cli") || p.client, type: V("ty") || p.type, notes: V("no") || p.notes } }),
                });
                if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; onToast(e.error || "Error al regenerar tareas"); return; }
                const data = await res.json() as { tasks?: Array<{ title: string; crit: string; notes: string }> };
                setScrumProposed((data.tasks || []).slice(0, 15).map(t => ({ ...t, selected: true })));
              } catch { onToast("Error de conexión"); }
              finally { setScrumLoading(false); }
            }} style={{ marginTop: 6, width: "100%", padding: "7px 0", borderRadius: 8, border: "1px solid var(--border)", background: "none", color: "var(--muted)", fontSize: "0.8em", cursor: "pointer" }}>
              🔄 Regenerar tareas
            </button>
          </>
        )}
      </div>

      <button className="del-link" style={{ marginTop: 16 }} onClick={() => {
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
      <div className="sheet-head"><h2>Nuevo cliente</h2><button className="close-btn" onClick={onClose}>✕</button></div>
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
      <div className="sheet-head"><h2>Cliente</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Nombre / Empresa</label><input type="text" ref={R("n")} defaultValue={c.name} /></div>
      <div className="two field"><div><label>Contacto</label><input type="text" ref={R("ct")} defaultValue={c.contact || ""} placeholder="Nombre de quien decide" /></div><div><label>Segmento</label><input type="text" ref={R("sg")} defaultValue={c.segment || ""} /></div></div>
      <div className="two field">
        <div>
          <label>WhatsApp</label>
          <input type="tel" ref={R("wa")} defaultValue={c.whatsapp || ""} placeholder="+56 9 1234 5678" />
          {linkWhatsapp(c.whatsapp) && (
            <a href={linkWhatsapp(c.whatsapp)!} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: "0.75em", color: "var(--orange2)", textDecoration: "none" }}>
              ↗ Abrir chat
            </a>
          )}
        </div>
        <div><label>Correo</label><input type="email" ref={R("em")} defaultValue={c.email || ""} /></div>
      </div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={5} defaultValue={c.notes || ""} /></div>
      <button className="save" onClick={() => {
        onSave({ ...state, clients: state.clients.map(x => x.id !== c.id ? x : { ...x, name: V("n").trim() || x.name, contact: V("ct").trim(), segment: V("sg").trim(), whatsapp: V("wa").trim(), email: V("em").trim(), notes: V("no") }) });
        onClose(); onToast("Cliente actualizado");
      }}>Guardar cambios</button>
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
      {projs.length > 0 && <div className="detail-block" style={{ marginTop: 20 }}><h4>Proyectos vinculados</h4><p>{projs.map(p => p.name + " — " + statusOf(p.status).label).join("\n")}</p></div>}
    </>);
  }

  /* ---- Nueva reunión ---- */
  if (sheet.kind === "new-meet") {
    return (<>
      <div className="sheet-head"><h2>Nueva reunión</h2><button className="close-btn" onClick={onClose}>✕</button></div>
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
      <div className="sheet-head"><h2>Reunión</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="two field"><div><label>Cliente</label><input type="text" ref={R("cl")} defaultValue={m.client || ""} list="hub-client-options" /><ClientOptions clients={state.clients} /></div><div><label>Fecha</label><input type="date" ref={R("dt")} defaultValue={m.date || ""} /></div></div>
      <div className="field"><label>Resumen</label><textarea ref={R("sm") as React.Ref<HTMLTextAreaElement>} rows={3} defaultValue={m.summary || ""} /></div>
      <div className="field"><label>Notas completas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={7} defaultValue={m.notes || ""} /></div>
      <button className="save" onClick={() => {
        onSave({ ...state, meetings: state.meetings.map(x => x.id !== m.id ? x : { ...x, client: V("cl").trim(), date: V("dt"), summary: V("sm"), notes: V("no") }) });
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
      <div className="sheet-head"><h2>Nuevo contrato</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="cms-selector">
        <p className="cms-hint">¿Qué tipo de contrato quieres agregar?</p>
        <button className="cms-opt" onClick={() => onOpenSheet({ kind: "new-contract-wizard" })}>
          <span className="cms-icon">✨</span>
          <div className="cms-text">
            <strong>Contrato nuevo</strong>
            <small>Crea la cotización desde cero y genera el PDF con el diseño de WebMaker Latam</small>
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
    const existingMeetings = [...state.meetings].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
    return (<>
      <div className="sheet-head"><h2>Contrato desde reunión</h2><button className="close-btn" onClick={onClose}>✕</button></div>

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
        {meetingExtracting ? "⏳ Analizando reunión con IA…" : "✨ Completar formulario con IA"}
      </button>

      <div className="field"><label>Título / Descripción</label><input type="text" ref={R("ti")} placeholder="Ej: Servicio de Marketing Digital" /></div>
      <div className="field"><label>Cliente</label><input type="text" ref={R("cl")} placeholder="Nombre del cliente" /></div>
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
            </select>
          </div>
        </div>
      </div>
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
      {!readOnlyContract && <button className="save" disabled={regeneratingDoc} onClick={async () => {
        // Si el documento tiene cambios pendientes (chat IA / edición), guardar
        // implica regenerar el PDF para que el documento refleje la ficha.
        if (docDirty && docDraft) { await regenerateContractDoc(c, docDraft); onClose(); return; }
        onSave({ ...state, contracts: state.contracts.map(x => x.id !== c.id ? x : { ...x, title: V("ti").trim() || x.title, client: V("cl"), value: V("va"), status: V("st") as ContractStatus, signedAt: V("si"), expiresAt: V("ex"), notes: V("no"), doc: docDraft ?? x.doc, pdfUrl: pdfData?.url, pdfTitle: pdfData?.title, pdfUploadedAt: pdfData?.uploadedAt, updatedAt: Date.now() }) });
        onClose(); onToast("Contrato actualizado");
      }}>{docDirty ? (regeneratingDoc ? "⏳ Regenerando documento…" : "Guardar y regenerar documento") : "Guardar cambios"}</button>}

      {/* ---- Documento de la cotización (fuente del PDF) ---- */}
      <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "1em" }}>📄</span>
          <strong style={{ fontSize: "0.92em" }}>Documento</strong>
          {docDirty && (
            <span style={{ fontSize: "0.68em", fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "rgba(255,180,0,0.15)", color: "#e0a52a" }}>
              cambios sin aplicar al PDF
            </span>
          )}
        </div>

        {docDraft ? (() => {
          const totals = docTotals(docDraft);
          const mods = docDraft.modules.filter(m => (m.name || "").trim() !== "");
          const abono = Math.round(totals.total * docDraft.downPct / 100);
          return (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {mods.length === 0 && <div style={{ fontSize: "0.78em", color: "var(--muted)" }}>Sin módulos definidos.</div>}
                {mods.map(m => (
                  <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 11px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.83em", fontWeight: 600 }}>{m.name}</div>
                      {m.desc && <div style={{ fontSize: "0.72em", color: "var(--muted)", marginTop: 2 }}>{m.desc}</div>}
                    </div>
                    <div style={{ fontSize: "0.8em", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtCLP(m.price)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "0.76em", color: "var(--muted)", display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
                <span>Neto {fmtCLP(totals.neto)} · IVA {fmtCLP(totals.iva)} · <strong style={{ color: "var(--fg)" }}>Total {fmtCLP(totals.total)}</strong></span>
                <span>Pago: {docDraft.downPct}% al iniciar ({fmtCLP(abono)}) · {100 - docDraft.downPct}% a la entrega</span>
                {docDraft.monthly && <span>Mensualidad: {docDraft.monthly} {docDraft.monthlyPrice ? `· ${fmtCLP(Number(docDraft.monthlyPrice) || 0)} neto/mes` : ""}</span>}
                {docDraft.validityDays > 0 && <span>Vigencia: {docDraft.validityDays} días{docExpiry(docDraft) ? ` (hasta ${docExpiry(docDraft)})` : ""}</span>}
              </div>
              <button
                disabled={regeneratingDoc}
                onClick={() => regenerateContractDoc(c, docDraft)}
                style={{
                  width: "100%", padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)",
                  background: docDirty ? "rgba(255,120,0,0.14)" : "var(--card-bg)",
                  color: docDirty ? "var(--accent, #ff7800)" : "var(--fg)",
                  fontWeight: 600, fontSize: "0.86em", cursor: regeneratingDoc ? "not-allowed" : "pointer",
                }}
              >{regeneratingDoc ? "⏳ Generando cotización y brief…" : "🔄 Regenerar documentos (cliente + técnico)"}</button>
              <p style={{ fontSize: "0.72em", color: "var(--muted)", marginTop: 5 }}>
                Genera las dos versiones: la cotización para el cliente y el brief técnico para el equipo,
                y ambas se suben a Drive.
              </p>
            </>
          );
        })() : (
          <>
            <p style={{ fontSize: "0.78em", color: "var(--muted)", margin: "0 0 10px" }}>
              Este contrato no tiene un documento estructurado (se creó a mano o el PDF se subió desde fuera),
              así que la IA sólo puede editar la ficha. Crea uno para que el chat pueda modificar el PDF.
            </p>
            <button
              onClick={() => { setDocDraft(docFromContract(c)); setDocDirty(true); onToast("Documento creado desde la ficha — ajústalo con el chat"); }}
              style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--fg)", fontWeight: 600, fontSize: "0.86em", cursor: "pointer" }}
            >📄 Crear documento desde la ficha</button>
          </>
        )}
      </div>

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

      {/* ---- Versión técnica (brief) ---- */}
      <BriefView
        brief={c.brief}
        briefUrl={c.briefUrl}
        doc={c.doc}
        estadoContrato={c.status}
        onGenerate={readOnlyContract ? undefined : () => void generateBriefFor(c)}
        generating={generatingBrief}
      />

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
                  setDocDraft(nd); setDocDirty(true); docUpdated = true;
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
                  ? `${summary} Revisa el documento más arriba y pulsa "Regenerar PDF" para actualizarlo en Drive.`
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
      <div className="sheet-head"><h2>Nuevo contrato</h2><button className="close-btn" onClick={onClose}>✕</button></div>

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
              <span>🎙️</span> Notas de reunión <span style={{ fontSize: "0.7em", fontWeight: 400, color: "var(--muted)" }}>(opcional — la IA las usa como contexto)</span>
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
              {meetingExtracting ? "⏳ Analizando reunión con IA…" : "✨ Completar campos con IA"}
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
                    <input type="number" value={m.price || ""} min={0} onChange={e => setWiz(w => ({ ...w, modules: w.modules.map(x => x.id === m.id ? { ...x, price: Number(e.target.value) || 0 } : x) }))} placeholder="Vacío = la IA lo estima" />
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
              const conPrecios = validMods.length > 0 && validMods.length <= 4 && validMods.every(m => m.price > 0);
              if (conPrecios) body.precios_netos = validMods.map(m => Math.round(m.price));
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
              setCotEstimated(!conPrecios);
              setCotJson(JSON.stringify(data.cotizacion, null, 2));
              setCotHtml(data.html || null);
              setCotError(data.htmlError || null);
              setCotShowJson(!!data.htmlError);
              setWizStep(2);
            } catch (e: unknown) {
              onToast("Error generando la cotización: " + (e instanceof Error ? e.message : "desconocido"));
            } finally { setCotLoading(false); }
          }}>{cotLoading ? "⏳ Generando cotización con IA…" : "✨ Generar cotización con IA"}</button>
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
              <span>💡 Los precios fueron estimados por la IA — puedes ajustarlos en "Editar contenido (JSON)" y actualizar la vista.</span>
            </div>
          )}
          {cotError && <div style={{ color: "#dc2626", fontSize: "0.8em", marginTop: 8, whiteSpace: "pre-wrap" }}>{cotError}</div>}

          <button className="save" style={{ marginTop: 10 }} onClick={() => setCotShowJson(v => !v)}>
            {cotShowJson ? "Ocultar contenido editable" : "✏️ Editar contenido (JSON)"}
          </button>
          {cotShowJson && (
            <div className="field" style={{ marginTop: 8 }}>
              <textarea rows={14} value={cotJson} onChange={e => { setCotJson(e.target.value); setCotHtml(null); setCotError("Contenido editado — actualiza la vista previa para continuar"); }} style={{ fontFamily: "monospace", fontSize: "0.75em" }} spellCheck={false} />
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
                const tech = await buildTechnicalVersion(wiz, { title: contractTitle, client: wiz.client, notes: wiz.scope });
                onSave({ ...state, contracts: [...state.contracts, { id: uid(), title: contractTitle, client: wiz.client, value: totalConIva > 0 ? fmtCLP(totalConIva) : (tTotal > 0 ? fmtCLP(tTotal) : ""), status: "borrador" as ContractStatus, signedAt: issuedAt, expiresAt, notes: wiz.scope, doc: wiz, pdfUrl, pdfTitle: pdfTitleOut, pdfUploadedAt, brief: tech?.brief, briefUrl: tech?.briefUrl, briefTitle: tech?.briefTitle, briefUploadedAt: tech?.briefUploadedAt, createdAt: now, updatedAt: now }] });
                onClose(); onNavigate("contracts");
                // El brief que falta se dice con todas las letras: sin él,
                // al cerrar la venta el equipo recibe tareas genéricas.
                onToast(
                  tech?.brief
                    ? (tech.briefUrl ? "Contrato creado: cotización y brief técnico en Drive ✓" : "Contrato creado con brief técnico ✓")
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

/* ============================================================
   VISTAS
   ============================================================ */
function DashView({ state, onOpenProject, onNavigate, apiTasks }: { state: HubState; onOpenProject: (id: string) => void; onNavigate: (tab: Tab) => void; apiTasks: HubTask[] }) {
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
            <div key={p.id} className="prow clickable" onClick={() => { onNavigate("proj"); setTimeout(() => onOpenProject(p.id), 80); }}>
              <div className="pn"><b>{p.name}</b><small>{p.client}</small></div>
              <div className="pbarwrap"><div className="pbar"><i style={{ width: projProg(p.id, apiTasks).pct + "%" }} /></div></div>
              <div className="ppct">{projProg(p.id, apiTasks).pct}%</div>
            </div>
          )) : <div className="col-empty">Sin proyectos aún</div>}
        </div>
        <div className="panel activity">
          <h2>Actividad Reciente</h2>
          {acts.length ? acts.map(p => <div key={p.id} className="aitem"><span className="tag">{statusOf(p.status).label}</span><span>{p.name} · {p.client} → {projProg(p.id, apiTasks).pct}%</span></div>) : <div className="col-empty">Sin actividad reciente</div>}
        </div>
      </div>
    </div>
  );
}

function ProjView({ state, onSave, onOpenProject, onOpenTask, onToast, projView, setProjView, searchQ, setSearchQ, filterPrio, setFilterPrio, apiTasks, onRefreshTasks, canManage, onDeleteTask, onClearCompleted }: {
  state: HubState; onSave: (n: HubState) => void; onOpenProject: (id: string) => void; onOpenTask: (id: number) => void;
  onToast: (m: string) => void; projView: ProjView; setProjView: (v: ProjView) => void;
  searchQ: string; setSearchQ: (v: string) => void; filterPrio: string; setFilterPrio: (v: string) => void;
  apiTasks: HubTask[]; onRefreshTasks: () => void;
  canManage: boolean; onDeleteTask: (id: number) => void; onClearCompleted: () => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const fp = state.projects.filter(p => (!filterPrio || p.prio === filterPrio) && (!searchQ || (p.name + p.client + p.type).toLowerCase().includes(searchQ)));
  const ft = apiTasks.filter(t => {
    if (filterPrio && t.priority !== filterPrio) return false;
    if (searchQ) { const pj = state.projects.find(p => p.id === t.projectRef); if (!((t.title + " " + (pj ? pj.name : "")).toLowerCase().includes(searchQ))) return false; }
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
  return (
    <div className="wrap">
      <div className="toolbar">
        <div className="tsearch"><span>🔍</span><input value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} placeholder="Buscar proyecto o tarea…" /></div>
        <div className="seg">
          {(["board","list","scrum"] as ProjView[]).map(v => <button key={v} className={projView === v ? "on" : ""} onClick={() => setProjView(v)}>{v === "board" ? "Kanban" : v === "list" ? "Lista" : "Scrum"}</button>)}
        </div>
        <select className="filter" value={filterPrio} onChange={e => setFilterPrio(e.target.value)}>
          <option value="">Prioridad</option><option value="crítica">Crítica</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
        </select>
        {projView === "scrum" && canManage && (() => {
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
      </div>
      {projView === "board" && (
        <div className="board">
          {state.projects.length === 0 && <div className="empty-all" style={{ gridColumn: "1/-1" }}>Sin proyectos aún. <strong>+ Nuevo</strong> para comenzar.</div>}
          {STATUS.map(s => {
            const items = fp.filter(p => p.status === s.id).sort((a, b) => (prioW(a.prio) - prioW(b.prio)) || ((a.stageSince||0) - (b.stageSince||0)));
            return (
              <div key={s.id} className={`col ${dragOver === s.id ? "dragover" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(s.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => dropProj(s.id)}>
                <h3><span className="top"><span className="dot" style={{ background: s.color }} />{s.label}</span><span className="n">{items.length}</span></h3>
                {items.length ? items.map(p => <ProjCard key={p.id} p={p} tasks={apiTasks} onClick={() => onOpenProject(p.id)} onDragStart={e => { setDragId(p.id); e.dataTransfer.setData("text/plain", p.id); }} onDragEnd={() => { setDragId(null); setDragOver(null); }} />) : <div className="col-empty">—</div>}
              </div>
            );
          })}
        </div>
      )}
      {projView === "list" && (
        <div className="cardlist">
          {fp.map(p => (
            <div key={p.id} className="gcard" onClick={() => onOpenProject(p.id)}>
              <div className="gt">{p.name}</div><div className="gsub">{p.client} · {p.type}</div>
              <div className="gbody">{p.notes || ""}</div>
              <div className="gfoot"><span className={`chip prio-${p.prio}`}>{p.prio}</span><span className="badge">{statusOf(p.status).label}</span><DueChip p={p} /><span className="gdate">{projProg(p.id, apiTasks).pct}%</span></div>
            </div>
          ))}
        </div>
      )}
      {projView === "scrum" && (
        <div className="board scrum3">
          {!state.projects.length && !apiTasks.length && <div className="col-empty" style={{ gridColumn: "1/-1" }}>Crea un proyecto primero, luego añade tareas con <strong>+ Nuevo</strong>.</div>}
          {TASK_STAGES.map(s => {
            const items = ft.filter(t => t.stage === s.id).sort((a, b) => (prioW(a.priority) - prioW(b.priority)) || (a.orderIndex - b.orderIndex));
            return (
              <div key={s.id} className={`col ${dragOver === s.id ? "dragover" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(s.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => void dropTask(s.id)}>
                <h3><span className="top"><span className="dot" style={{ background: s.color }} />{s.label}</span><span className="n">{items.length}</span></h3>
                {items.length ? items.map(t => <TaskCard key={t.id} t={t} projects={state.projects} onClick={() => onOpenTask(t.id)} onDragStart={e => { setDragId(String(t.id)); e.dataTransfer.setData("text/plain", String(t.id)); }} onDragEnd={() => { setDragId(null); setDragOver(null); }} onDelete={canManage ? () => onDeleteTask(t.id) : undefined} />) : <div className="col-empty">—</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClientsView({ state, onOpen, searchQ, setSearchQ }: { state: HubState; onOpen: (id: string) => void; searchQ: string; setSearchQ: (v: string) => void }) {
  const list = state.clients.filter(c => !searchQ || (c.name + c.contact + c.segment).toLowerCase().includes(searchQ));
  return (
    <div className="wrap">
      <div className="toolbar"><div className="tsearch"><span>🔍</span><input value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} placeholder="Buscar cliente…" /></div></div>
      {state.clients.length === 0 && <div className="empty-all">Sin clientes aún. <strong>+ Nuevo</strong> para comenzar.</div>}
      <div className="cardlist">
        {list.map(c => { const np = state.projects.filter(p => p.client === c.name).length; return (
          <div key={c.id} className="gcard" onClick={() => onOpen(c.id)}>
            <div className="gt">{c.name}</div><div className="gsub">{c.contact || "—"} · {c.segment || ""}</div>
            <div className="gbody">{c.notes || ""}</div>
            <div className="gfoot"><span className="badge">{np} proyecto{np !== 1 ? "s" : ""}</span></div>
          </div>
        ); })}
      </div>
    </div>
  );
}

/* ---- Google Calendar integration ---- */
interface GCalEvent { id: string; title: string; start: string; end: string; allDay: boolean; meetLink: string | null; location: string | null; }

/** Mensajes claros por causa para los errores que vuelven del callback OAuth. */
const CAL_ERR_LABELS: Record<string, string> = {
  access_denied: "Google denegó el acceso: cancelaste el permiso o la cuenta no está autorizada.",
  oauth_error: "Google rechazó la conexión.",
  csrf_mismatch: "La sesión de autorización expiró. Intenta conectar de nuevo.",
  no_code: "Google no devolvió el código de autorización.",
  token_failed: "No se pudo canjear el código por un token de acceso.",
  server_error: "Error interno al conectar. Intenta de nuevo en unos minutos.",
  not_configured: "Faltan las credenciales de Google (CLIENT_ID / CLIENT_SECRET) en el servidor.",
};

function GoogleCalendarSection() {
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading");
  const [reason, setReason] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState<string>("");
  const [configured, setConfigured] = useState(true);
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadStatus = useCallback(() => {
    setStatus("loading");
    fetch(`${HUB_API_BASE}/calendar/status`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setCallbackUrl(d.callbackUrl || "");
        setConfigured(d.configured !== false);
        if (d.connected) {
          setStatus("connected");
          setReason(null);
          setEventsLoading(true);
          fetch(`${HUB_API_BASE}/calendar/events`, { credentials: "include" })
            .then(r => r.json())
            .then(ev => { setEvents(ev.events || []); setEventsLoading(false); })
            .catch(() => setEventsLoading(false));
        } else {
          setStatus("disconnected");
          setReason(d.reason || "error");
          if (d.reason === "not_configured") setSetupOpen(true);
        }
      })
      .catch(() => { setStatus("disconnected"); setReason("error"); });
  }, []);

  useEffect(() => {
    // Resultado del callback OAuth: llega como ?calendar=connected|error&msg=...&detail=...
    try {
      const params = new URLSearchParams(window.location.search);
      const cal = params.get("calendar");
      if (cal) {
        const msg = params.get("msg") || "";
        const detail = (params.get("detail") || "").slice(0, 140);
        window.history.replaceState({}, "", window.location.pathname);
        if (cal === "connected") {
          setJustConnected(true);
        } else {
          const base = CAL_ERR_LABELS[msg] || `Error al conectar (${msg || "desconocido"}).`;
          setErrorMsg(detail ? `${base} Detalle técnico: ${detail}` : base);
          if (["token_failed", "oauth_error", "not_configured"].includes(msg) || detail.includes("redirect_uri")) {
            setSetupOpen(true);
          }
        }
      }
    } catch { /* ignore */ }
    loadStatus();
  }, [loadStatus]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch(`${HUB_API_BASE}/calendar/disconnect`, { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    setDisconnecting(false);
    setJustConnected(false);
    loadStatus();
  };

  const copyUri = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard no disponible */ }
  };

  const fmtEvDate = (iso: string, allDay: boolean) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (allDay) return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
    return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div className="subhead" style={{ marginTop: 18 }}>
        <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Google Calendar
        {status === "connected" && !eventsLoading && events.length > 0 && <span className="n">{events.length} evento{events.length !== 1 ? "s" : ""} · 30 días</span>}
        <span className="grow" />
        {status === "connected" && (
          <button onClick={handleDisconnect} disabled={disconnecting}
            style={{ fontSize: "11px", background: "none", border: "1px solid var(--line)", borderRadius: "6px", color: "var(--faint)", padding: "2px 8px", cursor: "pointer", textTransform: "none", letterSpacing: 0 }}>
            {disconnecting ? "…" : "Desconectar"}
          </button>
        )}
      </div>

      {justConnected && (
        <div style={{ marginBottom: "10px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "9px", padding: "10px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "#34d399", flex: 1 }}>✓ Google Calendar conectado. Tus próximos eventos aparecen abajo.</span>
          <button onClick={() => setJustConnected(false)} style={{ background: "none", border: "none", color: "#34d399", cursor: "pointer", fontSize: "13px", padding: 0 }}>✕</button>
        </div>
      )}

      {errorMsg && (
        <div style={{ marginBottom: "10px", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: "9px", padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "#fda4af", flex: 1, lineHeight: 1.5, wordBreak: "break-word" }}>⚠ {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} style={{ background: "none", border: "none", color: "#fda4af", cursor: "pointer", fontSize: "13px", padding: 0, flexShrink: 0 }}>✕</button>
        </div>
      )}

      {status === "loading" && (
        <div style={{ padding: "12px", color: "var(--faint)", fontSize: "12px" }}>Cargando…</div>
      )}

      {status === "disconnected" && (
        <>
          <div style={{ background: "var(--card2)", border: "1px solid var(--line)", borderRadius: "11px", padding: "16px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "220px" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)", marginBottom: "4px" }}>
                {reason === "expired" ? "La conexión con Google expiró" : reason === "no_scope" ? "Falta el permiso de Calendar" : "Conecta tu Google Calendar"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--faint)", lineHeight: 1.5 }}>
                {reason === "expired"
                  ? "Google revocó o venció el acceso. Vuelve a conectar para seguir viendo tus eventos."
                  : reason === "no_scope"
                    ? "Tu cuenta está conectada pero sin el permiso de lectura del calendario. Conecta de nuevo para autorizarlo."
                    : reason === "not_configured"
                      ? "El servidor no tiene credenciales de Google configuradas. Revisa la guía de configuración."
                      : "Ve tus próximas reuniones directamente desde el hub. Solo lectura: no modifica tu calendario."}
              </div>
            </div>
            {configured ? (
              <a href={`${HUB_API_BASE}/auth/google-calendar`} style={{ background: "var(--orange)", color: "#fff", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
                Conectar Calendar
              </a>
            ) : (
              <span style={{ border: "1px solid var(--line)", color: "var(--faint)", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", whiteSpace: "nowrap", flexShrink: 0 }}>
                No configurado
              </span>
            )}
          </div>

          <button onClick={() => setSetupOpen(o => !o)}
            style={{ marginTop: "8px", background: "none", border: "none", color: "var(--dim)", fontSize: "11.5px", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: "3px" }}>
            {setupOpen ? "Ocultar configuración de Google Cloud" : "¿Google rechaza la conexión? Ver configuración requerida"}
          </button>

          {setupOpen && (
            <div style={{ marginTop: "8px", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: "11px", padding: "14px 16px", fontSize: "12px", color: "var(--dim)", lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>Configuración en Google Cloud Console</div>
              <p style={{ margin: "0 0 8px" }}>
                Si Google muestra <em>“Error 400: redirect_uri_mismatch”</em> al intentar conectar, falta registrar esta URI de redirección en el cliente OAuth:
              </p>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
                <code style={{ flex: 1, minWidth: "200px", background: "rgba(0,0,0,0.25)", border: "1px solid var(--line)", borderRadius: "7px", padding: "7px 10px", fontSize: "11px", color: "var(--text)", wordBreak: "break-all", userSelect: "all" }}>
                  {callbackUrl || "(no disponible)"}
                </code>
                <button onClick={copyUri} disabled={!callbackUrl}
                  style={{ background: copied ? "rgba(16,185,129,0.15)" : "var(--orange)", color: copied ? "#34d399" : "#fff", border: "none", borderRadius: "7px", padding: "7px 12px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {copied ? "✓ Copiada" : "Copiar URI"}
                </button>
              </div>
              <ol style={{ margin: "0 0 8px", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "3px" }}>
                <li>Abre <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: "var(--orange2)" }}>console.cloud.google.com/apis/credentials</a> con la cuenta dueña del proyecto.</li>
                <li>En <strong>IDs de cliente de OAuth 2.0</strong>, abre el cliente que usa este panel (el mismo del inicio de sesión).</li>
                <li>En <strong>URIs de redirección autorizadas</strong> agrega la URI copiada y guarda.</li>
                <li>Espera unos minutos (Google tarda en propagar el cambio) y vuelve a intentar.</li>
              </ol>
              <p style={{ margin: 0, color: "var(--faint)", fontSize: "11px" }}>
                Además, verifica que <strong>Google Calendar API</strong> esté habilitada en <em>APIs y servicios → Biblioteca</em>. Si usas el panel en producción y en desarrollo, registra la URI de cada entorno (esta tarjeta muestra la del entorno actual).
              </p>
            </div>
          )}
        </>
      )}

      {status === "connected" && (
        <>
          {eventsLoading && <div style={{ padding: "8px 0", color: "var(--faint)", fontSize: "12px" }}>Cargando eventos…</div>}
          {!eventsLoading && events.length === 0 && (
            <div style={{ padding: "8px 0", color: "var(--faint)", fontSize: "12px" }}>Sin eventos en los próximos 30 días.</div>
          )}
          {!eventsLoading && events.length > 0 && (
            <div className="gcal-list">
              {events.map(ev => (
                <div key={ev.id} style={{ background: "var(--card2)", border: "1px solid var(--line)", borderRadius: "9px", padding: "10px 12px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                    <div style={{ fontSize: "11px", color: "var(--dim)" }}>{fmtEvDate(ev.start, ev.allDay)}</div>
                    {ev.location && <div style={{ fontSize: "11px", color: "var(--faint)", marginTop: "2px" }}>📍 {ev.location}</div>}
                  </div>
                  {ev.meetLink && (
                    <a href={ev.meetLink} target="_blank" rel="noopener noreferrer"
                      style={{ flexShrink: 0, background: "var(--orange-soft)", border: "1px solid var(--orange-line)", color: "var(--orange2)", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 600, textDecoration: "none" }}>
                      Meet
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MeetView({ state, onOpen }: { state: HubState; onOpen: (id: string) => void }) {
  // Mediodía local para evitar que la medianoche UTC retroceda un día en Chile
  const meetTs = (m: Meeting) => m.date ? new Date(m.date + "T12:00:00").getTime() : m.createdAt;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const upcoming = state.meetings.filter(m => !!m.date && meetTs(m) >= todayStart.getTime()).sort((a, b) => meetTs(a) - meetTs(b));
  const past = state.meetings.filter(m => !m.date || meetTs(m) < todayStart.getTime()).sort((a, b) => meetTs(b) - meetTs(a));
  const card = (m: Meeting, isUpcoming: boolean) => (
    <div key={m.id} className="gcard" onClick={() => onOpen(m.id)}>
      <div className="gt">{m.client || "Reunión"}</div>
      <div className="gsub">{m.date ? fmtDate(new Date(m.date + "T12:00:00").getTime()) : fmtDate(m.createdAt)}</div>
      {(m.summary || "").trim() !== "" && <div className="gbody">{m.summary}</div>}
      <div className="gfoot">
        {isUpcoming && <span className="badge">Próxima</span>}
        <span className="gdate">{fmtDate(m.createdAt)}</span>
      </div>
    </div>
  );
  return (
    <div className="wrap">
      <GoogleCalendarSection />
      <div className="subhead"><FileText className="w-3.5 h-3.5" />Reuniones manuales <span className="n">{state.meetings.length || ""}</span></div>
      {state.meetings.length === 0 && (
        <div className="empty-all"><span className="eicon">🗓️</span><span className="etitle">Sin reuniones aún</span><span>Registra resúmenes y acuerdos con <strong>+ Nuevo</strong>, o conecta Google Calendar arriba.</span></div>
      )}
      {upcoming.length > 0 && (<>
        <div className="subhead"><CalendarClock className="w-3 h-3" />Próximas <span className="n">{upcoming.length}</span></div>
        <div className="cardlist">{upcoming.map(m => card(m, true))}</div>
      </>)}
      {past.length > 0 && (<>
        {upcoming.length > 0 && <div className="subhead">Anteriores <span className="n">{past.length}</span></div>}
        <div className="cardlist">{past.map(m => card(m, false))}</div>
      </>)}
    </div>
  );
}

function NotesView({ state, onSave, onOpen, onToast, filterCat, setFilterCat, searchQ, setSearchQ }: { state: HubState; onSave: (n: HubState) => void; onOpen: (id: string) => void; onToast: (m: string) => void; filterCat: string; setFilterCat: (v: string) => void; searchQ: string; setSearchQ: (v: string) => void }) {
  const q = searchQ.trim();
  const list = state.notes
    .filter(n => (!filterCat || n.cat === filterCat) && (!q || (n.title + " " + (n.body || "")).toLowerCase().includes(q)))
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const pinned = list.filter(n => n.pinned);
  const rest = list.filter(n => !n.pinned);
  const togglePin = (e: React.MouseEvent, n: Note) => {
    e.stopPropagation();
    onSave({ ...state, notes: state.notes.map(x => x.id === n.id ? { ...x, pinned: !x.pinned || undefined } : x) });
    onToast(n.pinned ? "Nota desfijada" : "Nota fijada arriba");
  };
  const noteCard = (n: Note) => {
    const cl = noteChecklist(n.body || "");
    const color = NOTE_CAT_COLORS[n.cat] || "#8a8f98";
    return (
      <div key={n.id} className="gcard ncard" style={{ "--nc": color } as React.CSSProperties} onClick={() => onOpen(n.id)}>
        <button className={`npin${n.pinned ? " on" : ""}`} title={n.pinned ? "Desfijar" : "Fijar arriba"} aria-label={n.pinned ? "Desfijar nota" : "Fijar nota arriba"} aria-pressed={!!n.pinned} onClick={e => togglePin(e, n)}>
          <Pin className="w-3.5 h-3.5" style={n.pinned ? { fill: "currentColor" } : undefined} />
        </button>
        <div className="gt">{hlText(n.title, q || undefined, "t")}</div>
        <div className="gsub ncat"><span className="fdot" style={{ background: color }} />{NOTE_CATS[n.cat] || "Otra"}</div>
        {(n.body || "").trim() !== "" && <div className="gbody note-fmt">{renderNoteFmt(n.body, q || undefined)}</div>}
        <div className="gfoot">
          {cl.total > 0 && <span className={`chip${cl.done === cl.total ? " chip-done" : ""}`}>☑ {cl.done}/{cl.total}</span>}
          <span className="gdate">{fmtDate(n.updatedAt || n.createdAt)}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="wrap">
      <div className="toolbar">
        <div className="tsearch"><span>🔍</span><input value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} placeholder="Buscar nota…" aria-label="Buscar nota" /></div>
        <div className="fchips" role="group" aria-label="Filtrar por categoría">
          <button className={`fchip${!filterCat ? " on" : ""}`} aria-pressed={!filterCat} onClick={() => setFilterCat("")}>Todas <span className="fn">{state.notes.length}</span></button>
          {(Object.entries(NOTE_CATS) as [NoteCat, string][]).map(([k, v]) => {
            const cnt = state.notes.filter(n => n.cat === k).length;
            if (cnt === 0 && filterCat !== k) return null;
            return (
              <button key={k} className={`fchip${filterCat === k ? " on" : ""}`} aria-pressed={filterCat === k} onClick={() => setFilterCat(filterCat === k ? "" : k)}>
                <span className="fdot" style={{ background: NOTE_CAT_COLORS[k] }} />{v} <span className="fn">{cnt}</span>
              </button>
            );
          })}
        </div>
      </div>
      {state.notes.length === 0 ? (
        <div className="empty-all">
          <span className="eicon">🗒️</span><span className="etitle">Sin notas aún</span>
          <span>Captura ideas, acuerdos y visión con <strong>+ Nuevo</strong>.</span>
          <span>Tip: usa <code>#</code> para títulos, <code>-</code> para viñetas y <code>[ ]</code> para checklists.</span>
        </div>
      ) : list.length === 0 ? (
        <div className="empty-all"><span className="eicon">🔍</span><span className="etitle">Sin resultados</span><span>Nada coincide con tu búsqueda o filtro actual.</span></div>
      ) : (
        <>
          {pinned.length > 0 && (<>
            <div className="subhead"><Pin className="w-3 h-3" style={{ fill: "currentColor" }} />Fijadas <span className="n">{pinned.length}</span></div>
            <div className="cardlist">{pinned.map(noteCard)}</div>
          </>)}
          {rest.length > 0 && (<>
            {pinned.length > 0 && <div className="subhead"><FileText className="w-3 h-3" />Recientes <span className="n">{rest.length}</span></div>}
            <div className="cardlist">{rest.map(noteCard)}</div>
          </>)}
        </>
      )}
    </div>
  );
}

/* ============================================================
   CONTRATOS
   ============================================================ */
const CONTRACT_STATUSES: Record<ContractStatus, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "var(--faint)" },
  activo:   { label: "Activo",   color: "var(--done)" },
  vencido:  { label: "Vencido",  color: "#e0795a" },
  cancelado:{ label: "Cancelado",color: "var(--disc)" },
};

function ContractsView({ state, onOpen }: { state: HubState; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  // Estado efectivo: "vencido" derivado de la fecha real de vencimiento (salvo cancelados)
  const effStatus = (c: Contract): ContractStatus => (c.status !== "cancelado" && contractExpired(c)) ? "vencido" : c.status;
  const all = state.contracts;
  const counts: Record<string, number> = {};
  all.forEach(c => { const s = effStatus(c); counts[s] = (counts[s] || 0) + 1; });
  const list = all
    .filter(c => (!fStatus || effStatus(c) === fStatus) && (!q || (c.title + " " + (c.client || "") + " " + (c.value || "") + " " + (c.notes || "")).toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="wrap">
      {all.length > 0 && (
        <div className="toolbar">
          <div className="tsearch"><span>🔍</span><input value={q} onChange={e => setQ(e.target.value.toLowerCase())} placeholder="Buscar contrato…" aria-label="Buscar contrato" /></div>
          <div className="fchips" role="group" aria-label="Filtrar por estado">
            <button className={`fchip${!fStatus ? " on" : ""}`} aria-pressed={!fStatus} onClick={() => setFStatus("")}>Todos <span className="fn">{all.length}</span></button>
            {(Object.entries(CONTRACT_STATUSES) as [ContractStatus, { label: string; color: string }][]).map(([k, v]) => {
              if (!counts[k]) return null;
              return (
                <button key={k} className={`fchip${fStatus === k ? " on" : ""}`} aria-pressed={fStatus === k} onClick={() => setFStatus(fStatus === k ? "" : k)}>
                  <span className="fdot" style={{ background: v.color }} />{v.label} <span className="fn">{counts[k]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {all.length === 0 ? (
        <div className="empty-all">
          <span className="eicon">📑</span><span className="etitle">Sin contratos aún</span>
          <span>Con <strong>+ Nuevo</strong> puedes generar una cotización, extraer desde una reunión o subir un PDF existente.</span>
        </div>
      ) : list.length === 0 ? (
        <div className="empty-all"><span className="eicon">🔍</span><span className="etitle">Sin resultados</span><span>Nada coincide con tu búsqueda o filtro actual.</span></div>
      ) : (
        <div className="cardlist">
          {list.map(c => {
            const st = effStatus(c);
            const expired = c.status !== "cancelado" && contractExpired(c);
            const s = CONTRACT_STATUSES[st] || CONTRACT_STATUSES.borrador;
            const nproj = state.projects.filter(p => p.contractId === c.id).length;
            const dleft = c.expiresAt ? Math.ceil((new Date(c.expiresAt + "T23:59:59").getTime() - Date.now()) / 86400000) : null;
            return (
              <div key={c.id} className="gcard ccard" style={{ "--cc": s.color } as React.CSSProperties} onClick={() => onOpen(c.id)}>
                <div className="gt">{hlText(c.title, q || undefined, "ct")}</div>
                <div className="gsub">{c.client ? hlText(c.client, q || undefined, "cl") : "—"}</div>
                <div className="meta" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                  <span className="chip" style={{ color: s.color, borderColor: s.color + "55", background: s.color + "18" }}>{s.label}</span>
                  {c.value && <span className="chip">{c.value}</span>}
                  {c.expiresAt && (
                    <span className="chip" style={expired ? { color: "#e0795a", borderColor: "rgba(224,121,90,.4)" } : dleft != null && dleft <= 30 ? { color: "var(--gold)", borderColor: "rgba(201,164,74,.45)" } : undefined}>
                      {expired ? `Venció ${c.expiresAt}` : dleft != null && dleft <= 30 ? `Vence en ${dleft} día${dleft !== 1 ? "s" : ""}` : `Vence: ${c.expiresAt}`}
                    </span>
                  )}
                  {nproj > 0 && <span className="chip">🗂 {nproj} proyecto{nproj !== 1 ? "s" : ""}</span>}
                  {c.pdfUrl && (
                    <a className="chip pdf-badge" href={c.pdfUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                      📄 {c.pdfTitle || "PDF"}{c.pdfUploadedAt ? ` · ${new Date(c.pdfUploadedAt).toLocaleDateString("es-CL")}` : ""}
                    </a>
                  )}
                </div>
                {(c.notes || "").trim() !== "" && <div className="gbody" style={{ marginTop: "8px" }}>{hlText(c.notes, q || undefined, "cn")}</div>}
                <div className="gfoot"><span className="gdate">{fmtDate(c.createdAt)}</span></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SvcDraft { name: string; category: string; description: string; includes: string; note: string; tiers: HubServiceTier[]; }
const emptySvcDraft = (category: string): SvcDraft => ({
  name: "", category, description: "", includes: "", note: "",
  tiers: [
    { plan: "Inicia", price: "", detail: "" },
    { plan: "Escala", price: "", detail: "" },
    { plan: "Domina", price: "", detail: "" },
  ],
});

/** Playbooks: plantillas de proceso por tipo de trabajo. Se administran junto al catálogo. */
type PlaybookRow = { id: number; name: string; workType: string; description: string; archived: boolean; tasks: Array<{ title: string; notes?: string; priority?: string }> };

type SlaPolicyRow = { id: number; entityType: string; stage: string; maxHours: number };

const SLA_TYPE_LABELS: Record<string, string> = { task: "Tareas", ticket: "Tickets", video: "Videos", project: "Proyectos", contract: "Contratos" };
const SLA_STAGE_LABELS: Record<string, string> = {
  backlog: "Backlog", sprint: "Sprint", doing: "En curso", qa_sent: "QA enviado", qa_rev: "QA revisión",
  abierto: "Abierto", en_progreso: "En progreso", en_revision: "En revisión",
  borrador: "Borrador", aprobado: "Aprobado (sin programar)",
  lead: "Lead", disc: "Descubrimiento", dev: "Desarrollo", rev: "Revisión",
};

/** SLA por etapa: horas máximas antes de avisar al responsable y a la dirección. */
function SlaManager({ canManage, showToast }: { canManage: boolean; showToast: (msg: string) => void }) {
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
      {rows === null && <div className="empty-all">Cargando SLAs…</div>}
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

function PlaybooksManager({ canManage, showToast }: { canManage: boolean; showToast: (msg: string) => void }) {
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
      {rows === null && <div className="empty-all">Cargando playbooks…</div>}
      {rows !== null && active.length === 0 && <div className="empty-all">No hay playbooks activos.</div>}
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

function SvcView({ canManage, showToast }: { canManage: boolean; showToast: (msg: string) => void }) {
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

      {services === null && !loadError && <div className="empty-all">Cargando catálogo…</div>}
      {loadError && services === null && (
        <div className="empty-all">
          No se pudo cargar el catálogo de servicios.{" "}
          <button className="svc-retry" onClick={load}>Reintentar</button>
        </div>
      )}
      {services !== null && active.length === 0 && (
        <div className="empty-all">
          El catálogo está vacío.{canManage && <> Crea el primero con <strong>+ Nuevo servicio</strong>.</>}
        </div>
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
    </div>
  );
}

/* ============================================================
   GLOBAL SEARCH
   ============================================================ */
interface SResult { t: string; n: string; s: string; go: () => void; }
function GlobalSearch({ state, onOpen, onNavigate }: { state: HubState; onOpen: (s: SheetKind) => void; onNavigate: (t: Tab) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SResult[]>([]);
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const go = useCallback((tab: Tab, sk: SheetKind) => { onNavigate(tab); setTimeout(() => onOpen(sk), 80); setQ(""); setShow(false); }, [onNavigate, onOpen]);

  useEffect(() => {
    const q2 = q.toLowerCase().trim();
    if (!q2 || q2.length < 2) { setResults([]); setShow(false); return; }
    const out: SResult[] = [];
    state.projects.forEach(p => { if ((p.name+" "+p.client).toLowerCase().includes(q2)) out.push({ t:"Proyecto", n:p.name, s:p.client||"", go:()=>go("proj",{kind:"proj",id:p.id}) }); });
    state.clients.forEach(c => { if ((c.name+" "+(c.contact||"")+" "+(c.segment||"")).toLowerCase().includes(q2)) out.push({ t:"Cliente", n:c.name, s:c.segment||c.contact||"", go:()=>go("clients",{kind:"client",id:c.id}) }); });
    state.notes.forEach(n => { if ((n.title+" "+(n.body||"")).toLowerCase().includes(q2)) out.push({ t:"Nota", n:n.title, s:"", go:()=>go("notes",{kind:"note",id:n.id}) }); });
    state.meetings.forEach(m => { if (((m.client||"")+" "+(m.summary||"")).toLowerCase().includes(q2)) out.push({ t:"Reunión", n:m.client||"Reunión", s:m.summary||"", go:()=>go("meet",{kind:"meet",id:m.id}) }); });
    /* hub_tasks now live in the API — task search omitted from global search */
    state.contracts.forEach(c => { if ((c.title+" "+(c.client||"")).toLowerCase().includes(q2)) out.push({ t:"Contrato", n:c.title, s:c.client||"", go:()=>go("contracts",{kind:"contract",id:c.id}) }); });
    setResults(out.slice(0, 8)); setShow(true);
  }, [q, state, go]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key==="/" && document.activeElement?.tagName!=="INPUT" && document.activeElement?.tagName!=="TEXTAREA") { e.preventDefault(); inputRef.current?.focus(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="search">
      <span>🔍</span>
      <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente, proyecto, nota…"
        onFocus={()=>results.length>0&&setShow(true)} onBlur={()=>setTimeout(()=>setShow(false),150)} />
      <kbd>/</kbd>
      {show && (
        <div className="sresults">
          {results.length ? results.map((r,i) => (
            <button key={i} className="sr" onMouseDown={e=>{e.preventDefault();r.go();}}>
              <span className="srt">{r.t}</span><span className="srn">{r.n}</span><span className="srs">{r.s.slice(0,44)}</span>
            </button>
          )) : <div className="sr-empty">Sin resultados</div>}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   HUB DRIVE VIEW
   ============================================================ */
/**
 * Carpeta raíz del Drive del Hub.
 *
 * Configurable: había DOS ids escritos a fuego y distintos —uno aquí y otro en
 * /drive—, así que los dos exploradores miraban carpetas diferentes y quien no
 * tuviera acceso a ese id concreto lo veía todo vacío sin ninguna pista.
 */
const HUB_DRIVE_ROOT =
  import.meta.env.VITE_HUB_DRIVE_ROOT_ID || "15cBDWdrC2IIN6OlD4rP0fBCImGOh39--";

function HubDriveView() {
  const [currentFolderId, setCurrentFolderId] = useState<string>(HUB_DRIVE_ROOT);
  const [folderHistory, setFolderHistory] = useState<{ id: string; name: string }[]>([{ id: HUB_DRIVE_ROOT, name: "Raíz" }]);

  const { data: filesData, isLoading: filesLoading, error: filesError } = useListDriveFiles({ folderId: currentFolderId });
  const { data: foldersData, isLoading: foldersLoading, error: foldersError } = useListDriveFolders({ parentId: currentFolderId });
  const drive = useEstadoDrive();
  // Un error NO es una carpeta vacía. Pintarlos igual es lo que ocultó durante
  // meses que al ejecutivo comercial le faltaba el permiso de Drive.
  const fallo = filesError || foldersError;

  const navigateToFolder = (id: string, name: string) => {
    setFolderHistory(prev => [...prev, { id, name }]);
    setCurrentFolderId(id);
  };

  const navigateBack = () => {
    if (folderHistory.length > 1) {
      const newHistory = [...folderHistory];
      newHistory.pop();
      const prev = newHistory[newHistory.length - 1];
      setFolderHistory(newHistory);
      setCurrentFolderId(prev.id);
    }
  };

  const isLoading = filesLoading || foldersLoading;

  const itemCount = (foldersData?.length || 0) + (filesData?.files?.length || 0);

  return (
    <div className="wrap">
      <div className="subhead"><FolderTree className="w-3.5 h-3.5" />Drive del Hub {!isLoading && <span className="n">{itemCount} elemento{itemCount !== 1 ? "s" : ""}</span>}</div>
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
        {/* Breadcrumbs & back */}
        <div style={{ padding: "12px 16px", background: "var(--card2)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={navigateBack} disabled={folderHistory.length <= 1}
            style={{ padding: "6px 10px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--dim)", cursor: folderHistory.length <= 1 ? "not-allowed" : "pointer", opacity: folderHistory.length <= 1 ? 0.35 : 1, display: "flex", alignItems: "center" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={16} height={16}><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, overflowX: "auto", whiteSpace: "nowrap" }}>
            {folderHistory.map((f, i) => (
              <span key={f.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: i === folderHistory.length - 1 ? "var(--orange2)" : "var(--dim)", fontWeight: i === folderHistory.length - 1 ? 600 : 400 }}>{f.name}</span>
                {i < folderHistory.length - 1 && <span style={{ color: "var(--faint)" }}>/</span>}
              </span>
            ))}
          </div>
        </div>

        {/* File grid */}
        <div style={{ padding: 20, minHeight: 300 }}>
          {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", color: "var(--faint)", fontSize: 13 }}>Cargando…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {foldersData?.map(folder => (
                <button key={folder.id} onClick={() => navigateToFolder(folder.id, folder.name)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, cursor: "pointer", textAlign: "left", transition: "border-color .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--orange-line)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--line)")}>
                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width={20} height={20} style={{ color: "var(--orange2)", flexShrink: 0 }}><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</span>
                </button>
              ))}
              {filesData?.files.map(file => (
                <div key={file.id} style={{ display: "flex", flexDirection: "column", padding: "14px 16px", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={18} height={18} style={{ color: "#6aa0c0", flexShrink: 0, marginTop: 1 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file.name}>{file.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}>{file.mimeType.split("/").pop()}</div>
                    </div>
                  </div>
                  {file.webViewLink && (
                    <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0", background: "var(--card)", borderRadius: 7, fontSize: 11, fontWeight: 600, color: "var(--dim)", textDecoration: "none", border: "1px solid var(--line)", transition: "color .15s" }}>
                      Abrir en Drive ↗
                    </a>
                  )}
                </div>
              ))}
              {!foldersData?.length && !filesData?.files?.length && (
                <div style={{ gridColumn: "1/-1", padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
                  {!drive.cargando && !drive.conectado ? (
                    <div style={{ maxWidth: 460, margin: "0 auto", textAlign: "left" }}>
                      <ConectarDrive volverA="ejecutivo" motivo="Por eso esta carpeta se ve vacía." />
                    </div>
                  ) : fallo ? (
                    <>
                      <div style={{ color: "#f87171", fontWeight: 600 }}>No se pudo leer esta carpeta.</div>
                      <div style={{ marginTop: 6, fontSize: 11.5 }}>
                        {(fallo as Error).message || "El servidor devolvió un error."} Si la carpeta es de
                        otra persona, pídele que la comparta con tu cuenta.
                      </div>
                    </>
                  ) : (
                    "Esta carpeta está vacía."
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   TAB ICONS
   ============================================================ */
/* ============================================================
   TEAM VIEW — Equipo hoy (CEO/ejecutivo)
   ============================================================ */

interface TeamTask {
  id: number; title: string; stage: string; priority: string;
  dueDate: string | null; stageSinceMs: number; stagnant: boolean; overdue: boolean; dueToday: boolean;
}
interface TeamMemberCard {
  id: number; name: string | null; picture: string | null; email: string | null; teamRole: string | null;
  semaphore: "green" | "yellow" | "red"; activeTasks: TeamTask[]; activeCount: number;
}
interface TeamActivityItem {
  id: number; taskId: number; taskTitle: string; action: string;
  oldStage: string | null; newStage: string | null; createdAt: string; actorName: string | null;
}

const TV_STAGE: Record<string, string> = { backlog: "Backlog", sprint: "Sprint", doing: "Progreso", qa_sent: "QA→", qa_rev: "QA✓", done: "Listo" };
const TV_STAGE_CLS: Record<string, string> = { backlog: "bg-foreground/10 text-foreground/50", sprint: "bg-sky-400/10 text-sky-400", doing: "bg-primary/15 text-primary", qa_sent: "bg-purple-400/10 text-purple-400", qa_rev: "bg-purple-400/10 text-purple-300", done: "bg-emerald-500/10 text-emerald-400" };
const TV_PRIO: Record<string, string> = { "crítica": "text-red-400", "alta": "text-orange-400", "media": "text-blue-400", "baja": "text-foreground/40" };
const SEM_DOT: Record<string, string> = { green: "bg-emerald-500", yellow: "bg-yellow-400", red: "bg-red-500" };
const SEM_RING: Record<string, string> = { green: "ring-emerald-500/30", yellow: "ring-yellow-400/30", red: "ring-red-500/30" };
const SEM_BORDER: Record<string, string> = { green: "border-foreground/10", yellow: "border-yellow-400/25", red: "border-red-500/25" };
const SEM_LABEL: Record<string, string> = { green: "Al día", yellow: "Con carga", red: "Atención" };
const SEM_PILL: Record<string, string> = { green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", yellow: "bg-yellow-400/10 text-yellow-400 border-yellow-400/25", red: "bg-red-500/10 text-red-400 border-red-500/25" };

function fmtMs(ms: number): string {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `${Math.floor(ms / 60000)}m`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function TeamView({ teamMembers, showToast, onRefreshTasks, onConfirm }: {
  teamMembers: TeamMember[];
  showToast: (msg: string, undo?: () => void) => void;
  onRefreshTasks: () => void;
  onConfirm: (msg: string, onYes: () => void) => void;
}) {
  const authUser = useAuth();
  const canDelete = authUser?.role === "superadmin" || authUser?.teamRole === "ceo";
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [priority, setPriority] = useState<"crítica" | "alta" | "media" | "baja">("media");
  const [dueDate, setDueDate] = useState("");
  const [clItems, setClItems] = useState<ChecklistItem[]>([]);
  const [clDraft, setClDraft] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [composing, setComposing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  const { data: tvData, isLoading: tvLoading, refetch: tvRefetch } = useQuery<{ members: TeamMemberCard[] }>({
    queryKey: ["hub-team-view"],
    queryFn: async () => {
      const r = await fetch(`${HUB_API_BASE}/hub/tasks/team-view`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: actData } = useQuery<{ items: TeamActivityItem[] }>({
    queryKey: ["hub-activity", expandedId, today],
    queryFn: async () => {
      const r = await fetch(`${HUB_API_BASE}/hub/tasks/activity?userId=${expandedId}&date=${today}`, { credentials: "include" });
      if (!r.ok) return { items: [] };
      return r.json();
    },
    enabled: expandedId !== null,
    staleTime: 30_000,
  });

  const members = tvData?.members ?? [];
  // Selector de asignación: cards del team-view (traen carga actual) filtradas
  // por la lista team-members, que el servidor ya limita según la regla del
  // dueño (solo el dueño puede asignarse tareas a sí mismo).
  const allowedIds = new Set(teamMembers.map(m => m.id));
  const selectable: Array<{ id: number; name: string | null; email: string | null; picture: string | null; teamRole: string | null; activeCount: number | null }> =
    members.length > 0
      ? members.filter(m => allowedIds.has(m.id)).map(m => ({ id: m.id, name: m.name, email: m.email, picture: m.picture, teamRole: m.teamRole, activeCount: m.activeCount }))
      : teamMembers.map(m => ({ id: m.id, name: m.name, email: m.email, picture: m.picture, teamRole: m.teamRole, activeCount: null }));

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || composing) return;
    setComposing(true);
    try {
      const body: Record<string, unknown> = { title: title.trim(), priority };
      if (assigneeId) body["assigneeId"] = assigneeId;
      if (dueDate) body["dueDate"] = dueDate;
      if (desc.trim()) body["notes"] = desc.trim();
      if (clItems.length) body["checklist"] = clItems;
      const r = await fetch(`${HUB_API_BASE}/hub/tasks`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e2 = await r.json().catch(() => ({} as Record<string, unknown>));
        throw new Error((e2 as { error?: string }).error || "Error al crear tarea");
      }
      const assigned = selectable.find(m => m.id === assigneeId);
      setTitle(""); setDesc(""); setDueDate(""); setClItems([]); setClDraft(""); setPriority("media"); setShowDetails(false);
      showToast(assigned ? `Tarea asignada a ${(assigned.name ?? assigned.email ?? "").split(" ")[0]} ✓` : "Tarea creada");
      tvRefetch(); onRefreshTasks();
      setTimeout(() => titleRef.current?.focus(), 80);
    } catch (err: any) { showToast(err.message || "Error al crear tarea"); }
    finally { setComposing(false); }
  };

  const deleteTask = async (id: number) => {
    try {
      const r = await fetch(`${HUB_API_BASE}/hub/tasks/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e2 = await r.json().catch(() => ({} as Record<string, unknown>)); showToast((e2 as { error?: string }).error || "Error al eliminar"); return; }
      showToast("Tarea eliminada");
      tvRefetch(); onRefreshTasks();
    } catch { showToast("Error de conexión"); }
  };

  const PRIOS: ("crítica" | "alta" | "media" | "baja")[] = ["crítica", "alta", "media", "baja"];
  const PRIO_ON: Record<string, string> = { "crítica": "bg-red-500/15 text-red-400", "alta": "bg-orange-400/15 text-orange-400", "media": "bg-blue-400/15 text-blue-400", "baja": "bg-foreground/10 text-foreground/70" };

  return (
    <div className="main-scroll p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Panel de asignación */}
      <form onSubmit={handleAssign} className="bg-card border border-foreground/10 rounded-2xl p-4 space-y-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Asignar tarea</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {selectable.length === 0 && <p className="text-xs text-muted-foreground py-1">Cargando equipo…</p>}
          {selectable.map(m => {
            const on = assigneeId === m.id;
            return (
              <button key={m.id} type="button" onClick={() => setAssigneeId(on ? null : m.id)}
                className={`flex items-center gap-2 flex-shrink-0 rounded-xl border px-3 py-2 transition-colors ${on ? "border-primary bg-primary/10" : "border-foreground/10 bg-background hover:border-foreground/30"}`}>
                {m.picture
                  ? <img src={m.picture} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full" />
                  : <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold">{(m.name ?? m.email ?? "?")[0]?.toUpperCase()}</div>}
                <span className="text-left">
                  <span className="block text-xs font-semibold leading-tight">{(m.name ?? m.email ?? "—").split(" ")[0]}</span>
                  <span className="block text-[10px] text-muted-foreground leading-tight capitalize">{m.teamRole ?? "—"}{m.activeCount != null ? ` · ${m.activeCount} activa${m.activeCount !== 1 ? "s" : ""}` : ""}</span>
                </span>
              </button>
            );
          })}
        </div>
        <input ref={titleRef} type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="¿Qué hay que hacer?" className="w-full bg-background border border-foreground/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-foreground/15 overflow-hidden">
            {PRIOS.map(p => (
              <button type="button" key={p} onClick={() => setPriority(p)}
                className={`px-2.5 py-1.5 text-xs capitalize transition-colors ${priority === p ? PRIO_ON[p] : "text-muted-foreground hover:text-foreground"}`}>{p}</button>
            ))}
          </div>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            className="bg-background border border-foreground/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          <button type="button" onClick={() => setShowDetails(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1">
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Detalles{(desc.trim() || clItems.length > 0) ? " ●" : ""}
          </button>
          <button type="submit" disabled={composing || !title.trim()}
            className="ml-auto flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity">
            <Send className="w-3.5 h-3.5" />{composing ? "Enviando…" : assigneeId ? "Asignar tarea" : "Crear tarea"}
          </button>
        </div>
        {showDetails && (
          <div className="space-y-2 pt-1">
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Descripción / contexto (opcional)"
              className="w-full bg-background border border-foreground/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-y" />
            <div className="space-y-1">
              {clItems.map(it => (
                <div key={it.id} className="flex items-center gap-2 text-xs bg-foreground/4 rounded-lg px-2.5 py-1.5">
                  <span className="text-muted-foreground">☐</span>
                  <span className="flex-1 text-foreground/80">{it.text}</span>
                  <button type="button" onClick={() => setClItems(clItems.filter(x => x.id !== it.id))} className="text-muted-foreground/60 hover:text-red-400 transition-colors" title="Quitar"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <input type="text" value={clDraft} onChange={e => setClDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const t2 = clDraft.trim(); if (t2) { setClItems([...clItems, { id: uid(), text: t2, done: false }]); setClDraft(""); } } }}
                placeholder="Paso del checklist + Enter" className="w-full bg-background border border-foreground/15 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>
        )}
      </form>

      {/* Member cards */}
      {tvLoading && <p className="text-center text-sm text-muted-foreground py-8">Cargando equipo…</p>}
      {!tvLoading && members.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground border border-dashed border-foreground/15 rounded-2xl">
          Sin integrantes visibles todavía — cuando el equipo inicie sesión aparecerá aquí.
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2 items-start">
        {members.map(member => {
          const sem = member.semaphore;
          const isExp = expandedId === member.id;
          return (
            <div key={member.id} className={`bg-card border rounded-2xl overflow-hidden ${SEM_BORDER[sem]}`}>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="relative flex-shrink-0">
                  {member.picture
                    ? <img src={member.picture} alt="" className={`w-9 h-9 rounded-full ring-2 ${SEM_RING[sem]}`} />
                    : <div className={`w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center text-sm font-bold ring-2 ${SEM_RING[sem]}`}>{(member.name ?? "?")[0]?.toUpperCase()}</div>}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${SEM_DOT[sem]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{member.name ?? member.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">{member.teamRole ?? "—"} · {member.activeCount} tarea{member.activeCount !== 1 ? "s" : ""} activa{member.activeCount !== 1 ? "s" : ""}</p>
                </div>
                <span className={`flex-shrink-0 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${SEM_PILL[sem]}`}>{SEM_LABEL[sem]}</span>
                <button onClick={() => setExpandedId(isExp ? null : member.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors" title={isExp ? "Colapsar" : "Ver actividad del día"}>
                  {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* Active tasks */}
              {member.activeTasks.length > 0 && (
                <div className="px-4 pb-3 space-y-1">
                  {member.activeTasks.map(t => (
                    <div key={t.id} className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 ${t.stagnant || t.overdue ? "bg-red-500/8" : t.dueToday ? "bg-yellow-400/8" : "bg-foreground/4"}`}>
                      <span className={`flex-shrink-0 text-[8px] ${TV_PRIO[t.priority] ?? "text-foreground/40"}`}>●</span>
                      <span className="flex-1 text-foreground/80 truncate">{t.title}</span>
                      <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TV_STAGE_CLS[t.stage] ?? "text-muted-foreground"}`}>{TV_STAGE[t.stage] ?? t.stage}</span>
                      {t.stageSinceMs > 0 && (
                        <span className={`flex-shrink-0 flex items-center gap-0.5 ${t.stagnant ? "text-red-400" : "text-muted-foreground"}`}>
                          <Clock3 className="w-2.5 h-2.5" />{fmtMs(t.stageSinceMs)}
                          {t.stagnant && <AlertTriangle className="w-2.5 h-2.5" />}
                        </span>
                      )}
                      {t.overdue && <span className="flex-shrink-0 text-red-400 font-medium">Vencida</span>}
                      {t.dueToday && !t.overdue && <span className="flex-shrink-0 text-yellow-400">Hoy</span>}
                      {canDelete && (
                        <button onClick={() => onConfirm(`¿Eliminar "${t.title}"? No se puede deshacer.`, () => { void deleteTask(t.id); })}
                          className="flex-shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-red-400 transition-colors" title="Eliminar tarea">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {member.activeTasks.length === 0 && (
                <p className="px-4 pb-3 text-xs text-muted-foreground">Sin tareas activas — disponible para asignar</p>
              )}

              {/* Activity log */}
              <AnimatePresence initial={false}>
                {isExp && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                    <div className="border-t border-foreground/8 mx-4 pt-3 pb-4 space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Actividad de hoy</p>
                      {(actData?.items ?? []).length === 0
                        ? <p className="text-xs text-muted-foreground">Sin actividad registrada hoy.</p>
                        : (actData?.items ?? []).map(a => {
                            const time = new Date(a.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
                            const desc = a.action === "stage_change"
                              ? `movió "${a.taskTitle}" a ${TV_STAGE[a.newStage ?? ""] ?? a.newStage}`
                              : a.action === "created" ? `creó "${a.taskTitle}"`
                              : a.action === "commented" ? `comentó en "${a.taskTitle}"`
                              : `reasignó "${a.taskTitle}"`;
                            return (
                              <div key={a.id} className="flex gap-2 text-xs text-muted-foreground">
                                <span className="flex-shrink-0 font-mono text-[10px]">{time}</span>
                                <span className="text-foreground/60">{desc}</span>
                              </div>
                            );
                          })
                      }
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Bitácora global del equipo (filtrable por persona) */}
      <ActivityFeed global people={selectable.map(m => ({ id: m.id, name: m.name, email: m.email }))} />
    </div>
  );
}

/* ═══════════════════ ASISTENCIA (jornada + registro diario) ═══════════════════ */

function attToday(): string { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }); }
function attAddDays(dateStr: string, n: number): string { const d = new Date(dateStr + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function attFmtMin(min: number): string { const h = Math.floor(min / 60); const m = Math.round(min % 60); return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`; }
function attHHMM(iso: string | null): string { return iso ? new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }) : "—"; }
function attFmtLong(dateStr: string): string { const s = new Date(dateStr + "T12:00:00Z").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); return s.charAt(0).toUpperCase() + s.slice(1); }
const ATT_DAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

/** Un tramo del día: trabajo, pausa, o tiempo sin marcar entre sesiones. */
interface AttTramo {
  tipo: "trabajo" | "pausa" | "fuera";
  desde: string;
  hasta: string | null;
  minutos: number;
  motivo?: string;
}
interface AttDesgloseData {
  tramos: AttTramo[];
  trabajado: number;
  pausado: number;
  fuera: number;
  abarcado: number;
  entrada: string | null;
  salida: string | null;
  abierta: boolean;
}

const ATT_TRAMO: Record<AttTramo["tipo"], string> = {
  trabajo: "Trabajando",
  pausa: "En pausa",
  fuera: "Sin marcar",
};

/**
 * En qué se fue el día entre la entrada y la salida.
 *
 * La franja mostraba "08:12 → 22:34" con "6h 37m" al lado y no había forma de
 * saber dónde estaban las otras ocho horas: parte eran pausas y parte huecos
 * entre sesiones, que no aparecían en ninguna cifra. Aquí los tramos suman
 * exactamente lo que abarca la franja, así que la resta siempre cuadra.
 */
function AttDesglose({ d }: { d: AttDesgloseData }) {
  if (d.tramos.length === 0) return null;
  const total = Math.max(1, d.abarcado);
  return (
    <div className="att-desg">
      <div className="att-desg-bar">
        {d.tramos.map((t, i) => (
          <span
            key={i}
            className={cn("att-desg-seg", t.tipo)}
            style={{ width: `${(t.minutos / total) * 100}%` }}
            title={`${ATT_TRAMO[t.tipo]} · ${attFmtMin(t.minutos)}`}
          />
        ))}
      </div>
      <div className="att-desg-tot">
        <span className="trabajo">{attFmtMin(d.trabajado)} trabajados</span>
        {d.pausado > 0 && <span className="pausa">{attFmtMin(d.pausado)} en pausa</span>}
        {d.fuera > 0 && (
          <span className="fuera" title="Entre una salida y la siguiente entrada">
            {attFmtMin(d.fuera)} sin marcar
          </span>
        )}
        <span className="span">{attFmtMin(d.abarcado)} de punta a punta</span>
      </div>
      <div className="att-desg-list">
        {d.tramos.map((t, i) => (
          <div key={i} className="att-desg-row">
            <span className={cn("att-desg-dot", t.tipo)} />
            <span className="hora">{attHHMM(t.desde)} → {t.hasta ? attHHMM(t.hasta) : "ahora"}</span>
            <span className={cn("tipo", t.tipo)}>{ATT_TRAMO[t.tipo]}</span>
            <span className="dur">{attFmtMin(t.minutos)}</span>
            {t.motivo && <span className="motivo">· {t.motivo}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

interface AttMember {
  id: number; name: string | null; email: string; picture: string | null; teamRole: string | null;
  discordUserId: string | null; discordTag: string | null;
  today: {
    checkIn: string; checkOut: string | null; onDiscord: boolean; minutes: number; open: boolean;
    /** Minutos en pausa del día: ya descontados de `minutes`. */
    pausedMinutes: number;
    /** Pausa en curso, o null si el reloj está corriendo. */
    pausa: { id: number; startedAt: string; motivo: string } | null;
    /** Id de quien cerró la jornada, si no fue la propia persona. */
    cerradaPor?: number | null;
    desglose?: AttDesgloseData;
  } | null;
  discord: {
    linked: boolean; tag: string | null; checkin: boolean | null;
    pct: number | null; lastSeenMin: number | null; inVoiceNow: boolean | null;
  } | null;
  weekByDay: { date: string; minutes: number; pausedMinutes: number }[];
  weekTotal: number;
  logs: { id: number; text: string; done: boolean }[];
}
interface AttDiscordStatus {
  configured: boolean;
  app: { id: string; name: string } | null;
  guild: { id: string; name: string | null } | null;
  inviteUrl: string | null;
  membersAccess: "ok" | "unconfigured" | "noguild" | "intent" | "error";
  linked: number;
  total: number;
}
interface AttDiscordMember { id: string; name: string; username: string; avatarUrl: string | null }
interface AttOverview {
  date: string; today: string; weekStart: string; days: string[];
  members: AttMember[];
  summary: { working: number; finished: number; absent: number; totalMinutes: number };
}
interface AttHistDay {
  date: string; minutes: number;
  sessions: { id: number; checkIn: string; checkOut: string | null; onDiscord: boolean; discordPct: number | null; minutes: number }[];
  logs: { id: number; text: string; done: boolean }[];
}

function AttendanceView() {
  const [selDate, setSelDate] = useState<string>(attToday());
  const [histUser, setHistUser] = useState<{ id: number; name: string | null; email: string } | null>(null);
  const [desgloseAbierto, setDesgloseAbierto] = useState<number | null>(null);
  const [histDays, setHistDays] = useState<7 | 30 | 92>(7);
  const [showDc, setShowDc] = useState(false);
  const [mapErr, setMapErr] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const qc = useQueryClient();
  const isToday = selDate === attToday();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["jornada-overview", selDate],
    queryFn: async () => {
      const res = await fetch(`${HUB_API_BASE}/jornada/overview?date=${selDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo cargar la asistencia");
      return res.json() as Promise<AttOverview>;
    },
    refetchInterval: isToday ? 60000 : false,
    staleTime: 30000,
  });

  const { data: hist, isFetching: histLoading } = useQuery({
    queryKey: ["jornada-history", histUser?.id, histDays],
    enabled: !!histUser,
    queryFn: async () => {
      const to = attToday();
      const from = attAddDays(to, -(histDays - 1));
      const res = await fetch(`${HUB_API_BASE}/jornada/history?userId=${histUser!.id}&from=${from}&to=${to}`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo cargar el historial");
      return res.json() as Promise<{ days: AttHistDay[]; totalMinutes: number }>;
    },
    staleTime: 30000,
  });

  const { data: dc } = useQuery({
    queryKey: ["jornada-discord-status"],
    queryFn: async () => {
      const res = await fetch(`${HUB_API_BASE}/jornada/discord/status`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo consultar Discord");
      return res.json() as Promise<AttDiscordStatus>;
    },
    staleTime: 60000,
  });

  const { data: dcMembers, isLoading: dcMembersLoading } = useQuery({
    queryKey: ["jornada-discord-members"],
    enabled: dc?.membersAccess === "ok",
    queryFn: async () => {
      const res = await fetch(`${HUB_API_BASE}/jornada/discord/members`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudieron cargar los miembros");
      return res.json() as Promise<{ ok: boolean; members: AttDiscordMember[] }>;
    },
    staleTime: 60000,
  });

  const renameMut = useMutation({
    mutationFn: async ({ userId, name }: { userId: number; name: string }) => {
      const res = await fetch(`${HUB_API_BASE}/jornada/user/${userId}/name`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo renombrar");
      }
    },
    onSuccess: () => {
      setEditingName(null);
      setNameDraft("");
      qc.invalidateQueries({ queryKey: ["jornada-overview"] });
    },
  });

  // Pausar/reanudar la jornada de OTRA persona. El servidor solo lo permite a
  // dirección, ventas y RRHH; aquí el control simplemente no se pinta para el
  // resto porque esta vista ya está gateada por rol.
  const pausaMut = useMutation({
    mutationFn: async (p: { userId: number; pausar: boolean; motivo?: string }) => {
      const res = await fetch(`${HUB_API_BASE}/jornada/${p.pausar ? "pausa" : "reanudar"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: p.userId, motivo: p.motivo ?? "" }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo cambiar la pausa");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jornada-overview"] }),
    onError: (e) => setMapErr(e instanceof Error ? e.message : "Error al pausar"),
  });

  // Cerrar la jornada de otra persona: una pausa no es una salida, y sin esto
  // una jornada que quedó encendida no había forma de apagarla desde aquí.
  const cerrarMut = useMutation({
    mutationFn: async (p: { userId: number }) => {
      const res = await fetch(`${HUB_API_BASE}/jornada/check-out`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: p.userId }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo cerrar la jornada");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jornada-overview"] }),
    onError: (e) => setMapErr(e instanceof Error ? e.message : "Error al cerrar la jornada"),
  });

  const mapMut = useMutation({
    mutationFn: async (p: { userId: number; discordUserId: string | null; discordTag: string | null }) => {
      const res = await fetch(`${HUB_API_BASE}/jornada/discord/map`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo emparejar");
      }
      return res.json();
    },
    onSuccess: () => {
      setMapErr(null);
      qc.invalidateQueries({ queryKey: ["jornada-overview"] });
      qc.invalidateQueries({ queryKey: ["jornada-discord-status"] });
    },
    onError: (e) => setMapErr(e instanceof Error ? e.message : "Error al emparejar"),
  });

  const members = data?.members ?? [];
  const sum = data?.summary;

  return (
    <div className="wrap">
      {/* Navegación por día */}
      <div className="att-bar">
        <button className="att-nav" onClick={() => setSelDate(attAddDays(selDate, -1))} aria-label="Día anterior"><ChevronLeft className="w-4 h-4" /></button>
        <button className={cn("att-nav att-hoy", isToday && "on")} onClick={() => setSelDate(attToday())}>Hoy</button>
        <button className="att-nav" onClick={() => setSelDate(attAddDays(selDate, 1))} disabled={isToday} aria-label="Día siguiente"><ChevronRight className="w-4 h-4" /></button>
        <button className={cn("att-nav att-dcbtn", showDc && "on")} onClick={() => setShowDc((v) => !v)}>
          <Headphones className="w-3.5 h-3.5" /> Discord
          <span className={cn("att-dot", dc?.configured && dc?.guild ? "ok" : dc?.configured ? "warn" : "off")} />
        </button>
        <span className="att-date">{attFmtLong(selDate)}</span>
      </div>

      {/* Panel de configuración de Discord (verificación por canal de voz) */}
      {showDc && (
        <div className="gcard att-dc">
          <div className="att-dc-head">Verificación automática · canal de voz</div>
          {!dc && <div className="att-empty">Cargando estado…</div>}
          {dc && !dc.configured && (
            <p className="att-dc-txt warn">Falta el token del bot. Pídemelo por el chat del agente y te guío paso a paso.</p>
          )}
          {dc?.configured && !dc.app && (
            <p className="att-dc-txt warn">
              El token guardado no es válido. En el portal de Discord (pestaña Bot) usa "Reset Token" y entrégame el nuevo.
            </p>
          )}
          {dc?.app && !dc.guild && dc.inviteUrl && (
            <p className="att-dc-txt">
              El bot <b>{dc.app.name}</b> aún no está en tu servidor.{" "}
              <a className="att-dc-link" href={dc.inviteUrl} target="_blank" rel="noreferrer">Invitar al servidor →</a>
              {" "}Luego vuelve y recarga.
            </p>
          )}
          {dc?.guild && (
            <>
              <p className="att-dc-txt">
                Bot <b>{dc.app?.name ?? "—"}</b> conectado a <b>{dc.guild.name ?? `servidor ${dc.guild.id}`}</b> · {dc.linked}/{dc.total} integrantes emparejados
              </p>
              {dc.membersAccess === "intent" && (
                <p className="att-dc-txt warn">
                  Falta activar "Server Members Intent" en el portal de Discord (pestaña Bot → Privileged Gateway Intents) para elegir miembros de la lista.
                </p>
              )}
              {dc.membersAccess === "ok" && (
                <div className="att-dc-map">
                  {members.map((m) => (
                    <div key={m.id} className="att-dc-row">
                      {editingName === m.id ? (
                        <form
                          className="att-dc-rename"
                          onSubmit={(e) => { e.preventDefault(); if (nameDraft.trim()) renameMut.mutate({ userId: m.id, name: nameDraft.trim() }); }}
                        >
                          <input
                            className="att-dc-rename-input"
                            value={nameDraft}
                            autoFocus
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Escape") { setEditingName(null); setNameDraft(""); } }}
                            disabled={renameMut.isPending}
                          />
                          <button type="submit" className="att-dc-rename-ok" disabled={renameMut.isPending || !nameDraft.trim()}>✓</button>
                          <button type="button" className="att-dc-rename-cancel" onClick={() => { setEditingName(null); setNameDraft(""); }}>✕</button>
                        </form>
                      ) : (
                        <span className="att-dc-name">
                          {m.name || m.email}
                          <button
                            className="att-dc-edit"
                            title="Cambiar nombre"
                            onClick={() => { setEditingName(m.id); setNameDraft(m.name || ""); }}
                          >✏️</button>
                        </span>
                      )}
                      <select
                        className="att-dc-sel"
                        value={m.discordUserId ?? ""}
                        disabled={mapMut.isPending || editingName === m.id}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          const gm = dcMembers?.members.find((x) => x.id === v);
                          mapMut.mutate({ userId: m.id, discordUserId: v, discordTag: gm ? gm.name : null });
                        }}
                      >
                        <option value="">— Sin emparejar —</option>
                        {dcMembersLoading
                          ? <option disabled>Cargando miembros…</option>
                          : (dcMembers?.members ?? []).map((gm) => (
                            <option key={gm.id} value={gm.id}>{gm.name} (@{gm.username})</option>
                          ))
                        }
                      </select>
                      {m.discordUserId ? <span className="att-dc-ok">✓</span> : <span className="att-dc-ok off">·</span>}
                    </div>
                  ))}
                  {mapErr && <p className="att-dc-txt warn">{mapErr}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Resumen del día */}
      {sum && (
        <div className="att-sum">
          <div className="att-as work"><b>{sum.working}</b><span>Trabajando</span></div>
          <div className="att-as done"><b>{sum.finished}</b><span>Terminaron</span></div>
          <div className="att-as abs"><b>{sum.absent}</b><span>Sin marcar</span></div>
          <div className="att-as tot"><b>{attFmtMin(sum.totalMinutes)}</b><span>Horas del día</span></div>
        </div>
      )}

      {isLoading && <div className="att-empty">Cargando asistencia…</div>}
      {isError && <div className="att-empty">No se pudo cargar la asistencia. Reintenta en unos segundos.</div>}

      {/* Pase de lista */}
      {!isLoading && !isError && (
        <div className="att-list">
          {members.map((m) => {
            const enPausa = !!m.today?.pausa;
            const st = m.today ? (m.today.open ? (enPausa ? "pause" : "work") : "done") : "abs";
            return (
              <div key={m.id} className="gcard att-card" onClick={() => setHistUser(m)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") setHistUser(m); }}>
                <div className="att-row">
                  {m.picture
                    ? <img src={m.picture} alt="" className="att-ava" referrerPolicy="no-referrer" />
                    : <div className="att-ava att-ava-f">{(m.name || m.email)[0].toUpperCase()}</div>}
                  <div className="att-who">
                    <strong>
                      {m.name || m.email}
                      <button
                        className="att-dc-edit"
                        title="Cambiar nombre"
                        onClick={(e) => { e.stopPropagation(); setEditingName(m.id); setNameDraft(m.name || ""); setShowDc(true); }}
                      >✏️</button>
                    </strong>
                    <small>{m.teamRole || "—"}</small>
                  </div>
                  {/* La franja sola no explica nada: entre la entrada y la
                      salida hay pausas y huecos sin marcar, y por eso el total
                      de al lado siempre parecía estar mal. Se abre y se ve. */}
                  <button
                    className={cn("att-times", m.today?.desglose && "clickable", desgloseAbierto === m.id && "on")}
                    title={m.today?.desglose ? "Ver en qué se fue el día" : "Llegada → salida"}
                    aria-expanded={desgloseAbierto === m.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (m.today?.desglose) setDesgloseAbierto(desgloseAbierto === m.id ? null : m.id);
                    }}
                  >
                    <span>{m.today ? attHHMM(m.today.checkIn) : "—"}</span>
                    <span className="att-arw">→</span>
                    <span>{m.today ? (m.today.open ? "…" : attHHMM(m.today.checkOut)) : "—"}</span>
                  </button>
                  <span className="att-min">{m.today ? attFmtMin(m.today.minutes) : "0m"}</span>
                  {(() => {
                    const d = m.discord;
                    if (d?.inVoiceNow)
                      return <Headphones className="w-3.5 h-3.5 att-disc" aria-label="En canal de voz ahora" />;
                    if (d?.linked && m.today && d.pct !== null)
                      return (
                        <span
                          className={cn("att-dpct", d.pct >= 70 ? "hi" : d.pct >= 30 ? "mid" : "lo")}
                          title={`${d.pct}% de la jornada en canal de voz${d.lastSeenMin !== null ? ` · visto hace ${d.lastSeenMin} min` : ""}`}
                        >
                          🎧{d.pct}%
                        </span>
                      );
                    if (!d?.linked && m.today?.onDiscord)
                      return <Headphones className="w-3.5 h-3.5 att-disc dim" aria-label="Autodeclarado en Discord" />;
                    return null;
                  })()}
                  {isToday && m.today?.open && (
                    <button
                      className="att-pause"
                      title={enPausa ? "Reanudar su jornada" : "Pausar su jornada"}
                      disabled={pausaMut.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        pausaMut.mutate({ userId: m.id, pausar: !enPausa });
                      }}
                    >
                      {enPausa ? "▶" : "⏸"}
                    </button>
                  )}
                  {/* Apagar el reloj. Pausar deja a la persona figurando en su
                      turno: una jornada olvidada seguía sin poder cerrarse. */}
                  {isToday && m.today?.open && (
                    <button
                      className="att-pause off"
                      title="Terminar su jornada"
                      disabled={pausaMut.isPending || cerrarMut.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        const quien = m.name || m.email;
                        if (!window.confirm(`¿Cerrar la jornada de ${quien}? Dejará de contar horas desde ahora.`)) return;
                        cerrarMut.mutate({ userId: m.id });
                      }}
                    >
                      ⏹
                    </button>
                  )}
                  <span
                    className={cn("att-st", st)}
                    title={m.today && m.today.pausedMinutes > 0 ? `${attFmtMin(m.today.pausedMinutes)} en pausas (ya descontados)` : undefined}
                  >
                    {st === "work" ? "Trabajando" : st === "pause" ? "En pausa" : st === "done" ? "Terminó" : "Sin marcar"}
                  </span>
                </div>
                {desgloseAbierto === m.id && m.today?.desglose && (
                  <AttDesglose d={m.today.desglose} />
                )}
                {m.logs.length > 0 && (
                  <div className="att-logs">
                    {m.logs.slice(0, 3).map((l) => (
                      <span key={l.id} className={cn("att-log", l.done && "ok")}>{l.done ? "✓" : "○"} {l.text}</span>
                    ))}
                    {m.logs.length > 3 && <span className="att-log more">+{m.logs.length - 3} más</span>}
                  </div>
                )}
              </div>
            );
          })}
          {members.length === 0 && <div className="att-empty">No hay integrantes aprobados.</div>}
        </div>
      )}

      {/* Matriz semanal */}
      {data && members.length > 0 && (
        <>
          <div className="subhead" style={{ marginTop: 40 }}><Clock3 className="w-3.5 h-3.5" /> Horas de la semana <span className="n">(lun → dom)</span></div>
          <div className="att-mx-wrap">
            <table className="att-mx">
              <thead>
                <tr>
                  <th>Integrante</th>
                  {data.days.map((d, i) => (
                    <th key={d} className={cn(d === data.today && "today")}>{ATT_DAY_LETTERS[i]}<small>{d.slice(8)}</small></th>
                  ))}
                  <th className="tot">Total</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="who">{m.name || m.email}</td>
                    {m.weekByDay.map((d) => (
                      <td key={d.date} className={cn(d.date === data.today && "today", d.minutes === 0 && "z")}>
                        {d.minutes > 0 ? attFmtMin(d.minutes) : "—"}
                      </td>
                    ))}
                    <td className="tot">{attFmtMin(m.weekTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Historial por integrante */}
      {histUser && (
        <>
          <div className="subhead" style={{ marginTop: 24 }}>
            Historial · <span className="n">{histUser.name || histUser.email}</span>
            <span className="grow" />
            {([7, 30, 92] as const).map((n) => (
              <button key={n} className={cn("att-nav sm", histDays === n && "on")} onClick={() => setHistDays(n)}>
                {n === 7 ? "7 días" : n === 30 ? "30 días" : "3 meses"}
              </button>
            ))}
            <button className="att-nav sm" onClick={() => setHistUser(null)} aria-label="Cerrar historial"><X className="w-3 h-3" /></button>
          </div>
          {histLoading && <div className="att-empty">Cargando historial…</div>}
          {hist && !histLoading && (
            hist.days.length === 0
              ? <div className="att-empty">Sin registros en este rango.</div>
              : (
                <>
                  <div className="att-htot">Total del rango: <b>{attFmtMin(hist.totalMinutes)}</b></div>
                  <div className="att-hlist">
                    {hist.days.map((d) => (
                      <div key={d.date} className="gcard att-hday">
                        <div className="att-hhead">
                          <strong>{attFmtLong(d.date)}</strong>
                          <span className="att-min">{attFmtMin(d.minutes)}</span>
                        </div>
                        <div className="att-hsess">
                          {d.sessions.map((s) => (
                            <span key={s.id} className="att-sess">
                              {attHHMM(s.checkIn)} → {s.checkOut ? attHHMM(s.checkOut) : "…"}
                              {s.discordPct !== null ? ` · 🎧${s.discordPct}%` : s.onDiscord ? " 🎧" : ""}
                            </span>
                          ))}
                          {d.sessions.length === 0 && <span className="att-sess none">Sin jornada marcada</span>}
                        </div>
                        {d.logs.length > 0 && (
                          <ul className="att-hlogs">
                            {d.logs.map((l) => (
                              <li key={l.id} className={cn(l.done && "ok")}>{l.done ? "✓" : "○"} {l.text}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )
          )}
        </>
      )}
    </div>
  );
}

const HubTabIcons: Record<Tab, React.ComponentType<{ className?: string }>> = {
  team: Users2,
  att: Clock3,
  dash: LayoutDashboard,
  proj: Briefcase,
  clients: Users2,
  meet: CalendarClock,
  notes: FileText,
  contracts: FileCheck2,
  ventas: TrendingUp,
  torre: Gauge,
  drive: FolderTree,
  svc: Package,
};

const HUB_API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const TabIcons: Record<Tab, React.ReactNode> = {
  team: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.87"/></svg>,
  att: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  dash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  proj: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 6h18M3 12h18M3 18h12"/></svg>,
  clients: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.87"/></svg>,
  meet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  notes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  contracts: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  ventas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  torre: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1117.32 0z"/></svg>,
  svc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  drive: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
};

/* ============================================================
   COMPONENTE PRINCIPAL
   ============================================================ */
export default function EjecutivoPage() {
  const authUser = useAuth();
  const isAdmin = authUser?.role === "superadmin" || authUser?.role === "admin";
  // "ejecutivo" es alias legacy de "ventas" (mismo criterio que normalizeRole en el backend).
  const canManageSvc = authUser?.role === "superadmin" || authUser?.teamRole === "ceo" || authUser?.teamRole === "ventas" || (authUser?.teamRole as string) === "ejecutivo";
  // Torre de control CEO: solo dirección (mismo criterio que el backend: rol ceo).
  const isCeo = authUser?.role === "superadmin" || authUser?.teamRole === "ceo";
  // La pestaña Servicios/Playbooks la ven admins y quienes pueden gestionarla (ceo/ventas).
  const canSeeSvc = isAdmin || canManageSvc;
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const storageKey = hubStorageKey(authUser?.id);

  const { data: tasksData, refetch: refetchTasks } = useQuery({
    queryKey: ["hub-tasks"],
    queryFn: async () => {
      const res = await fetch(`${HUB_API_BASE}/hub/tasks`, { credentials: "include" });
      if (!res.ok) return { tasks: [] as HubTask[] };
      return res.json() as Promise<{ tasks: HubTask[] }>;
    },
    staleTime: 30000,
  });
  const apiTasks: HubTask[] = tasksData?.tasks ?? [];
  const onRefreshTasks = useCallback(() => { void refetchTasks(); }, [refetchTasks]);

  const { data: teamMembersData } = useQuery({
    queryKey: ["hub-team-members"],
    queryFn: async () => {
      const res = await fetch(`${HUB_API_BASE}/hub/tasks/team-members`, { credentials: "include" });
      if (!res.ok) return { users: [] as TeamMember[] };
      return res.json() as Promise<{ users: TeamMember[] }>;
    },
    staleTime: 120000,
  });
  const teamMembers: TeamMember[] = teamMembersData?.users ?? [];

  const handleLogout = async () => {
    try {
      await fetch(`${HUB_API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    clearHubStorage();
    try { localStorage.removeItem("wm_auth_hint"); } catch {}
    queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    window.location.reload();
  };

  const [state, setStateRaw] = useState<HubState>(() => migrate(loadState(storageKey)));
  const [scopes, setScopes] = useState<HubScope[]>(() => [...ALL_HUB_SCOPES]);
  const [writeScopes, setWriteScopes] = useState<HubScope[]>(() => [...ALL_HUB_SCOPES]);
  const [boardOwner, setBoardOwner] = useState<{ name: string | null; email: string } | null>(null);

  const serverSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  // Motivo del último fallo de guardado, o null. Se muestra fijo en pantalla:
  // un toast se lo pierde quien está mirando otra cosa, y aquí lo que está en
  // juego es un contrato que solo existe en este navegador.
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  /** Última versión del tablero que conocemos: la base para fusionar en el servidor. */
  const versionRef = useRef(0);
  /** Contador de guardados: si sube mientras viaja un PATCH, no pisamos lo que el usuario acaba de escribir. */
  const saveSeqRef = useRef(0);

  /** Adopta el tablero del servidor conservando las colecciones fuera de nuestro alcance. */
  const adoptServerData = useCallback((data: Partial<HubState> | null, version: number) => {
    versionRef.current = version;
    if (!data) return;
    setStateRaw(prev => {
      const merged = migrate(Object.assign(blankState(), prev, data));
      saveState(storageKey, merged);
      return merged;
    });
  }, [storageKey]);

  const setState = useCallback((next: HubState) => {
    dirtyRef.current = true;
    const seq = ++saveSeqRef.current;
    setStateRaw(next);
    saveState(storageKey, next);
    if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);

    // Reintento con espera creciente. Un corte de red de unos segundos no
    // puede dejar el tablero guardado solo en el navegador de una persona.
    const enviar = (intento: number) => {
      void patchHubToServer(next, versionRef.current).then(result => {
        // Si el usuario siguió editando, ese cambio más nuevo manda: se
        // descarta este envío y su reintento.
        if (saveSeqRef.current !== seq) return;

        if (result.ok) {
          versionRef.current = result.version;
          dirtyRef.current = false;
          setErrorGuardado(null);
          adoptServerData(result.data, result.version);
          return;
        }

        if (!result.permanente && intento < 4) {
          const espera = 2000 * 2 ** intento;
          serverSaveTimer.current = setTimeout(() => enviar(intento + 1), espera);
          return;
        }
        // Agotados los reintentos (o fallo que no se arregla reintentando):
        // se dice. `dirtyRef` sigue en true a propósito — hay trabajo local
        // sin enviar y traer del servidor lo borraría.
        setErrorGuardado(result.error);
      });
    };

    serverSaveTimer.current = setTimeout(() => enviar(0), 1500);
  }, [storageKey, adoptServerData]);

  useEffect(() => {
    let cancelled = false;
    const pull = () => {
      // Nunca traemos del servidor con cambios locales sin enviar: se perderían.
      if (dirtyRef.current) return;
      void fetchHubFromServer().then(snap => {
        if (cancelled || !snap || dirtyRef.current) return;
        setScopes(snap.scopes);
        setWriteScopes(snap.writeScopes);
        setBoardOwner(snap.owner);
        adoptServerData(snap.data, snap.version);
      });
    };
    pull();
    // El tablero es compartido: refrescamos para ver lo que hace el resto.
    const timer = setInterval(pull, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [storageKey, adoptServerData]);

  const canWrite = useCallback((scope: HubScope) => writeScopes.includes(scope), [writeScopes]);

  const [tab, setTabRaw] = useState<Tab>(() => {
    // Si volvemos del OAuth de Calendar (?calendar=...), aterrizar en Reuniones.
    try { if (new URLSearchParams(window.location.search).has("calendar")) return "meet"; } catch { /* ignore */ }
    try { const s = localStorage.getItem(LS_TAB); if (s && ["dash","proj","clients","meet","notes","contracts","svc","drive","team"].includes(s)) return s as Tab; } catch { /* ignore */ }
    return "dash";
  });

  useEffect(() => {
    const tabScope: Partial<Record<Tab, HubScope>> = {
      proj: "projects", clients: "clients", meet: "meetings", notes: "notes", contracts: "contracts",
    };
    const scope = tabScope[tab];
    // La pestaña guardada puede no corresponder al rol (o al alcance del tablero).
    if ((tab === "svc" && !canSeeSvc) || (tab === "ventas" && !canManageSvc) || (tab === "torre" && !isCeo) || (scope && !scopes.includes(scope))) {
      setTabRaw("dash");
      try { localStorage.setItem(LS_TAB, "dash"); } catch { /* ignore */ }
    }
  }, [tab, canSeeSvc, scopes]);
  const setTab = useCallback((t: Tab) => { setTabRaw(t); try { localStorage.setItem(LS_TAB, t); } catch { /* ignore */ } }, []);
  const navigate = useCallback((t: Tab) => { setTab(t); window.scrollTo(0, 0); }, [setTab]);

  const [projView, setProjView] = useState<ProjView>("board");
  const [projSearch, setProjSearch] = useState("");
  const [projPrio, setProjPrio] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [noteCat, setNoteCat] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; onYes: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 2200);
  }, []);

  const canManageTasks = authUser?.role === "superadmin" || authUser?.teamRole === "ceo";

  const handleDeleteTask = useCallback((id: number) => {
    setConfirm({
      msg: "¿Eliminar esta tarea? No se puede deshacer.",
      onYes: async () => {
        try {
          const r = await fetch(`${HUB_API_BASE}/hub/tasks/${id}`, { method: "DELETE", credentials: "include" });
          if (!r.ok) { const e = await r.json().catch(() => ({} as Record<string, unknown>)); showToast((e as { error?: string }).error || "Error al eliminar"); return; }
          showToast("Tarea eliminada");
          onRefreshTasks();
        } catch { showToast("Error de conexión"); }
      },
    });
  }, [showToast, onRefreshTasks]);

  const handleClearCompleted = useCallback(() => {
    setConfirm({
      msg: "¿Eliminar todas las tareas completadas del tablero? No se puede deshacer.",
      onYes: async () => {
        try {
          const r = await fetch(`${HUB_API_BASE}/hub/tasks/clear-completed`, { method: "POST", credentials: "include" });
          if (!r.ok) { const e = await r.json().catch(() => ({} as Record<string, unknown>)); showToast((e as { error?: string }).error || "Error al limpiar"); return; }
          const d = await r.json().catch(() => ({ deleted: 0 }));
          const n = (d as { deleted?: number }).deleted ?? 0;
          showToast(`${n} tarea${n !== 1 ? "s" : ""} completada${n !== 1 ? "s" : ""} eliminada${n !== 1 ? "s" : ""}`);
          onRefreshTasks();
        } catch { showToast("Error de conexión"); }
      },
    });
  }, [showToast, onRefreshTasks]);

  const openSheet = useCallback((s: SheetKind) => setSheet(s), []);

  const handleNew = () => {
    const denied = () => showToast("Tu rol no puede crear elementos en esta sección");
    if (tab === "clients") { canWrite("clients") ? openSheet({ kind: "new-client" }) : denied(); return; }
    if (tab === "meet") { canWrite("meetings") ? openSheet({ kind: "new-meet" }) : denied(); return; }
    if (tab === "notes") { canWrite("notes") ? openSheet({ kind: "new-note" }) : denied(); return; }
    if (tab === "contracts") { canWrite("contracts") ? openSheet({ kind: "new-contract-mode" }) : denied(); return; }
    if (tab === "proj" && projView === "scrum") { canWrite("tasks") ? openSheet({ kind: "new-task" }) : denied(); return; }
    canWrite("projects") ? openSheet({ kind: "new-proj" }) : denied();
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "webmaker-hub-respaldo-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast("Respaldo descargado");
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data || typeof data !== "object" || !Array.isArray(data.projects)) { showToast("Archivo de respaldo no válido"); return; }
        setConfirm({ msg: "Esto reemplazará TODOS los datos actuales por los del respaldo. ¿Continuar?", onYes: () => { setState(migrate(Object.assign(blankState(), data))); showToast("Respaldo importado"); } });
      } catch { showToast("No se pudo leer el respaldo"); }
      finally { if (importRef.current) importRef.current.value = ""; }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const [tt, tsub] = TAB_TITLES[tab] || TAB_TITLES.dash;
  // Cada pestaña vive de una colección del tablero: si el rol no la puede leer,
  // la pestaña no existe para esa persona.
  const TAB_SCOPE: Partial<Record<Tab, HubScope>> = {
    proj: "projects", clients: "clients", meet: "meetings", notes: "notes", contracts: "contracts",
  };
  const TABS: { id: Tab; cnt?: number }[] = ([
    { id: "team" as Tab },
    { id: "att" as Tab },
    { id: "dash" as Tab },
    // Torre de control: solo dirección.
    ...(isCeo ? [{ id: "torre" as Tab }] : []),
    { id: "proj" as Tab, cnt: state.projects.length },
    { id: "clients" as Tab, cnt: state.clients.length },
    { id: "meet" as Tab, cnt: state.meetings.length },
    { id: "notes" as Tab, cnt: state.notes.length },
    { id: "contracts" as Tab, cnt: state.contracts.length },
    // Torre de Ventas: misma gente que gestiona el catálogo (dirección/ventas).
    ...(canManageSvc ? [{ id: "ventas" as Tab, cnt: state.contracts.filter(c => c.status === "borrador").length }] : []),
    { id: "drive" as Tab },
    ...(canSeeSvc ? [{ id: "svc" as Tab }] : []),
  ] as { id: Tab; cnt?: number }[]).filter(t => {
    const scope = TAB_SCOPE[t.id];
    return !scope || scopes.includes(scope);
  });
  const TAB_LABELS: Record<Tab, string> = { team: "Equipo", att: "Asistencia", dash: "Dashboard", torre: "Torre CEO", proj: "Proyectos", clients: "Clientes", meet: "Reuniones", notes: "Notas", contracts: "Contratos", ventas: "Ventas", svc: "Servicios", drive: "Drive" };

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans:wght@300;400;500&family=Oswald:wght@500;600&display=swap" rel="stylesheet" />

      <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">
      <ViewAsBar />

      {/* El tablero no llegó al servidor. Va fijo arriba, no como toast: lo que
          está en juego es un contrato que solo existe en este navegador, y un
          aviso que se desvanece en 3 s no sirve para eso. */}
      {errorGuardado && (
        <div className="flex items-start gap-2 px-4 py-2 bg-red-500/15 border-b border-red-500/30 text-red-300 text-xs flex-shrink-0">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Tus cambios NO se guardaron en el servidor</p>
            <p className="opacity-90">{errorGuardado} · Siguen en este navegador; no cierres la pestaña sin volver a intentarlo.</p>
          </div>
          <button
            onClick={() => { setErrorGuardado(null); setState({ ...state }); }}
            className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-red-400/40 hover:bg-red-500/20 font-semibold"
          >
            Reintentar
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ======= MAIN CONTENT AREA ======= */}
        <div className="hub-root flex-1 min-w-0 flex flex-col overflow-hidden relative">

          {/* ---- MOBILE HEADER ---- */}
          <header className="lg:hidden flex items-center justify-between h-14 px-4 border-b border-foreground/10 bg-card/80 backdrop-blur-xl relative z-30 flex-shrink-0">
            <div className="flex items-center gap-2">
              <img src="/icon-192.png" alt="Hub" className="w-7 h-7 rounded-lg" />
              <span className="font-bold text-lg">WebMaker<span className="text-primary"> Hub</span></span>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg hover:bg-foreground/10 transition-colors" aria-label="Menú">
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </header>

          {/* ---- MOBILE SLIDE-IN MENU ---- */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                  onClick={() => setMobileMenuOpen(false)}
                />
                <motion.div
                  initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                  transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                  className="lg:hidden fixed top-0 right-0 bottom-0 w-72 bg-card border-l border-foreground/10 z-50 flex flex-col"
                >
                  <div className="h-14 flex items-center justify-between px-4 border-b border-foreground/10">
                    <span className="font-bold text-lg">Hub Ejecutivo</span>
                    <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-foreground/10 transition-colors"><X className="w-5 h-5" /></button>
                  </div>
                  <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    {TABS.map(({ id, cnt }) => {
                      const isActive = tab === id;
                      const Icon = HubTabIcons[id];
                      return (
                        <button
                          key={id}
                          onClick={() => { navigate(id); setMobileMenuOpen(false); }}
                          className={cn(
                            "flex items-center w-full px-4 py-3.5 rounded-xl transition-colors",
                            isActive
                              ? "bg-gradient-to-r from-primary/90 to-orange-500/80 text-white font-medium shadow-lg shadow-primary/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                          )}
                        >
                          <Icon className={cn("w-5 h-5 mr-3", isActive ? "text-white" : "")} />
                          <span className="flex-1 text-left">{TAB_LABELS[id]}</span>
                          {cnt !== undefined && cnt > 0 && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", isActive ? "bg-white/20 text-white" : "bg-foreground/10 text-muted-foreground")}>{cnt}</span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                  <div className="p-4 border-t border-foreground/10 space-y-2">
                    {authUser && (
                      <div className="flex items-center gap-3 px-1 mb-3">
                        {authUser.picture ? (
                          <img src={authUser.picture} alt={authUser.name || ""} className="w-9 h-9 rounded-full border border-foreground/15" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">{(authUser.name || authUser.email || "?")[0].toUpperCase()}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{authUser.name || "Admin"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{authUser.email}</p>
                        </div>
                      </div>
                    )}
                    {/* Jornada: el equipo trabaja desde aquí y no tenía forma
                        de marcar entrada, pausa ni salida sin salirse del panel. */}
                    <JornadaChip />
                    <ThemeToggle variant="full" />
                    <button onClick={handleLogout} className="flex items-center w-full px-3 py-3 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors">
                      <LogOut className="w-4 h-4 mr-3" />Cerrar sesión
                    </button>
                    <Link href="/" className="flex items-center px-3 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors">
                      <ChevronLeft className="w-4 h-4 mr-2" />Volver al panel
                    </Link>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* ---- MAIN SCROLLABLE CONTENT ---- */}
          <div className="main">
            <div className="topbar">
              <div className="ptitle">
                <span>{tt}</span>
                <small>
                  {tsub}
                  {/* El tablero es compartido: que se vea de quién es y si soy de solo lectura. */}
                  {boardOwner && <> · tablero de {boardOwner.name || boardOwner.email}</>}
                  {writeScopes.length === 0 && <> · solo lectura</>}
                </small>
              </div>
              <GlobalSearch state={state} onOpen={openSheet} onNavigate={navigate} />
            </div>
            <div style={{ padding: "10px 18px 0" }}><PushEnableBanner /></div>
            {tab === "dash" && <DashView state={state} onOpenProject={id => openSheet({ kind: "proj", id })} onNavigate={navigate} apiTasks={apiTasks} />}
            {tab === "proj" && <ProjView state={state} onSave={setState} onOpenProject={id => openSheet({ kind: "proj", id })} onOpenTask={id => openSheet({ kind: "task", id })} onToast={showToast} projView={projView} setProjView={setProjView} searchQ={projSearch} setSearchQ={setProjSearch} filterPrio={projPrio} setFilterPrio={setProjPrio} apiTasks={apiTasks} onRefreshTasks={onRefreshTasks} canManage={canManageTasks} onDeleteTask={handleDeleteTask} onClearCompleted={handleClearCompleted} />}
            {tab === "clients" && <ClientsView state={state} onOpen={id => openSheet({ kind: "client", id })} searchQ={clientSearch} setSearchQ={setClientSearch} />}
            {tab === "meet" && <MeetView state={state} onOpen={id => openSheet({ kind: "meet", id })} />}
            {tab === "notes" && <NotesView state={state} onSave={setState} onOpen={id => openSheet({ kind: "note", id })} onToast={showToast} filterCat={noteCat} setFilterCat={setNoteCat} searchQ={noteSearch} setSearchQ={setNoteSearch} />}
            {tab === "contracts" && <ContractsView state={state} onOpen={id => openSheet({ kind: "contract", id })} />}
            {tab === "drive" && <HubDriveView />}
            {tab === "team" && <TeamView teamMembers={teamMembers} showToast={showToast} onRefreshTasks={onRefreshTasks} onConfirm={(msg, onYes) => setConfirm({ msg, onYes })} />}
            {tab === "att" && <AttendanceView />}
            {tab === "svc" && canSeeSvc && <SvcView canManage={canManageSvc} showToast={showToast} />}
            {tab === "ventas" && canManageSvc && <VentasPanel showToast={showToast} />}
            {tab === "torre" && isCeo && <TorrePanel showToast={showToast} />}
          </div>

          {/* ---- MOBILE FAB: crear según el tab activo ---- */}
          {["proj", "clients", "meet", "notes", "contracts"].includes(tab) && !sheet && (
            <button className="hub-fab" onClick={handleNew} aria-label="Crear nuevo">
              <Plus className="w-6 h-6" />
            </button>
          )}

          {/* ---- MOBILE BOTTOM NAV ---- */}
          <nav className="lg:hidden flex-shrink-0 border-t border-foreground/10 bg-card/80 backdrop-blur-xl safe-bottom">
            <div className="flex items-center justify-around h-16 px-1">
              {TABS.slice(0, 5).map(({ id }) => {
                const isActive = tab === id;
                const Icon = HubTabIcons[id];
                return (
                  <button
                    key={id}
                    onClick={() => navigate(id)}
                    className={cn("flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition-colors min-w-0 flex-1", isActive ? "text-primary" : "text-muted-foreground")}
                  >
                    <Icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]")} />
                    <span className={cn("text-[10px] leading-tight truncate max-w-full", isActive && "font-semibold")}>{TAB_LABELS[id].split(" ")[0]}</span>
                  </button>
                );
              })}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg text-muted-foreground min-w-0 flex-1 transition-colors"
              >
                <Menu className="w-5 h-5" />
                <span className="text-[10px] leading-tight">Más</span>
              </button>
            </div>
          </nav>

          {/* ---- SHEET ---- */}
          {sheet && <>
            <div className="overlay" onClick={() => setSheet(null)} />
            <div className="sheet">
              <SheetContent sheet={sheet} state={state} onClose={() => setSheet(null)} onSave={setState} onToast={showToast} onNavigate={navigate} onOpenSheet={openSheet} onConfirm={(msg, onYes) => setConfirm({ msg, onYes })} apiTasks={apiTasks} teamMembers={teamMembers} onRefreshTasks={onRefreshTasks} canWrite={canWrite} />
            </div>
          </>}

          {/* ---- TOAST ---- */}
          {toast && (
            <div className={`toast ${toast.undo ? "action" : ""}`}>
              {toast.msg}
              {toast.undo && <button className="undo" onClick={() => { toast.undo!(); setToast(null); setTimeout(() => showToast("Elemento restaurado"), 200); }}>Deshacer</button>}
            </div>
          )}

          {/* ---- CONFIRM MODAL ---- */}
          {confirm && (
            <div className="cmodal" onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
              <div className="cbox">
                <p>{confirm.msg}</p>
                <div className="crow">
                  <button onClick={() => setConfirm(null)}>Cancelar</button>
                  <button className="yes" onClick={() => { confirm.onYes(); setConfirm(null); }}>Confirmar</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ======= RIGHT SIDEBAR (same aesthetics as main Layout) ======= */}
        <aside className="hidden lg:flex w-64 flex-shrink-0 border-l border-foreground/10 bg-card/60 backdrop-blur-xl flex-col relative z-20">

          {/* Logo + Brand */}
          <div className="h-16 flex items-center px-5 border-b border-foreground/10">
            <img src="/icon-192.png" alt="Logo" className="w-7 h-7 rounded-lg mr-3 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="font-display font-bold text-[17px] tracking-tight leading-none text-gradient">
                WebMaker<span className="text-primary">Hub</span>
              </h1>
              <p className="text-[8.5px] text-muted-foreground tracking-[0.15em] uppercase leading-none mt-1">Ejecutivo · Latam</p>
            </div>
          </div>

          {/* + Nuevo button */}
          <div className="px-3 pt-4 pb-1">
            <button
              onClick={handleNew}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-primary/90 to-orange-500/80 text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Nuevo
            </button>
          </div>

          {/* Nav items */}
          <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
            {TABS.map(({ id, cnt }) => {
              const isActive = tab === id;
              const Icon = HubTabIcons[id];
              return (
                <button
                  key={id}
                  onClick={() => navigate(id)}
                  className={cn(
                    "flex items-center w-full px-3 py-3 rounded-xl transition-colors group relative",
                    isActive
                      ? "text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="hub-active-nav"
                      className="absolute inset-0 bg-gradient-to-r from-primary/90 to-orange-500/80 rounded-xl shadow-lg shadow-primary/20"
                      initial={false}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <Icon className={cn("w-5 h-5 mr-3 relative z-10 flex-shrink-0", isActive ? "text-white" : "group-hover:text-primary transition-colors")} />
                  <span className="relative z-10 flex-1 text-left text-sm">{TAB_LABELS[id]}</span>
                  {cnt !== undefined && cnt > 0 && (
                    <span className={cn("relative z-10 text-[10px] px-1.5 py-0.5 rounded-full font-mono", isActive ? "bg-white/20 text-white" : "bg-foreground/10 text-muted-foreground")}>
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Footer: user + export/import + logout + back */}
          <div className="p-4 border-t border-foreground/10 space-y-3">
            {authUser && (
              <div className="flex items-center gap-3 px-1">
                {authUser.picture ? (
                  <img src={authUser.picture} alt={authUser.name || ""} className="w-8 h-8 rounded-full border border-foreground/15 flex-shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {(authUser.name || authUser.email || "?")[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{authUser.name || "Admin"}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{authUser.email}</p>
                </div>
                <ThemeToggle />
              </div>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={handleExport}
                className="flex-1 flex items-center justify-center px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/10 rounded-lg transition-colors"
              >
                ↓ Exportar
              </button>
              <button
                onClick={() => importRef.current?.click()}
                className="flex-1 flex items-center justify-center px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/10 rounded-lg transition-colors"
              >
                ↑ Importar
              </button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleLogout}
                className="flex items-center flex-1 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4 mr-2.5" />
                Cerrar sesión
              </button>
              <Link
                href="/"
                title="Volver al panel"
                className="flex items-center justify-center px-2.5 py-2.5 text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </aside>

      </div>
      </div>
    </>
  );
}
