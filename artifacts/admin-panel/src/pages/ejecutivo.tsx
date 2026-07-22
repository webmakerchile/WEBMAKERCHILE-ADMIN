import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useListDriveFiles, useListDriveFolders } from "@workspace/api-client-react";
import { useAuth } from "@/App";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LogOut, Plus, Menu, X, ChevronLeft,
  LayoutDashboard, Briefcase, Users2, CalendarClock, FileText, FileCheck2, FolderTree, Package,
} from "lucide-react";
import "./ejecutivo.css";

/* ============================================================
   TIPOS
   ============================================================ */
type Prio = "crítica" | "alta" | "media" | "baja";
type ProjStatus = "lead" | "disc" | "dev" | "rev" | "done";
type TaskStage = "backlog" | "sprint" | "doing" | "qa_sent" | "qa_rev" | "done";
type NoteCat = "proyecto" | "cliente" | "vision" | "equipo" | "otro";
type Tab = "dash" | "proj" | "clients" | "meet" | "notes" | "contracts" | "svc" | "drive";
type ProjView = "board" | "list" | "scrum";

interface Project { id: string; name: string; client: string; type: string; prio: Prio; status: ProjStatus; owner: string; prog: number; notes: string; link: string; due?: string; contractId?: string; createdAt: number; updatedAt: number; stageSince?: number; stageTime?: Record<string, number>; }
interface Client { id: string; name: string; contact: string; segment: string; notes: string; createdAt: number; }
interface Meeting { id: string; client: string; date: string; summary: string; notes: string; createdAt: number; }
interface Note { id: string; cat: NoteCat; title: string; body: string; createdAt: number; updatedAt: number; }
interface Task { id: string; title: string; projectId: string; crit: Prio; stage: TaskStage; stageSince: number; stageTime: Record<string, number>; notes: string; createdAt: number; updatedAt: number; }
type ContractStatus = "borrador" | "activo" | "vencido" | "cancelado";
interface Contract { id: string; title: string; client: string; value: string; status: ContractStatus; signedAt: string; expiresAt: string; notes: string; createdAt: number; updatedAt: number; pdfUrl?: string; pdfTitle?: string; pdfUploadedAt?: number; }
interface HubState { projects: Project[]; clients: Client[]; meetings: Meeting[]; notes: Note[]; tasks: Task[]; contracts: Contract[]; }
interface WizModule { id: string; name: string; desc: string; price: number; }
interface WizData { client: string; project: string; scope: string; date: string; advisor: string; modules: WizModule[]; downPct: number; notes: string; monthly: string; monthlyPrice: string; validityDays: number; }
const emptyWiz = (): WizData => ({ client: "", project: "", scope: "", date: new Date().toISOString().slice(0, 10), advisor: "", modules: [{ id: Math.random().toString(36).slice(2), name: "", desc: "", price: 0 }], downPct: 50, notes: "", monthly: "", monthlyPrice: "", validityDays: 15 });
type SheetKind =
  | null
  | { kind: "new-proj" } | { kind: "proj"; id: string }
  | { kind: "new-task" } | { kind: "task"; id: string }
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
  { id: "backlog", label: "Backlog", color: "var(--faint)" },
  { id: "sprint", label: "Sprint Backlog", color: "var(--lead)" },
  { id: "doing", label: "En desarrollo", color: "var(--dev)" },
  { id: "qa_sent", label: "QA", color: "var(--disc)" },
  { id: "qa_rev", label: "Revisión", color: "var(--rev)" },
  { id: "done", label: "Lista", color: "var(--done)" },
];
const NOTE_CATS: Record<NoteCat, string> = { proyecto: "Proyecto", cliente: "Cliente", vision: "Visión", equipo: "Equipo", otro: "Otra" };
const CRIT_COLOR: Record<string, string> = { crítica: "#cc2222", alta: "#e0795a", media: "#c9a44a", baja: "#6aa0c0" };
const PRIO_W: Record<string, number> = { crítica: -1, alta: 0, media: 1, baja: 2 };
const TAB_TITLES: Record<Tab, [string, string]> = {
  dash: ["Dashboard", "Resumen ejecutivo en vivo"],
  proj: ["Proyectos", "Kanban · Lista · Scrumban"],
  clients: ["Clientes", "Cartera y contactos"],
  meet: ["Reuniones", "Notas, resúmenes y seguimiento"],
  notes: ["Notas", "Ideas, acuerdos y estrategia"],
  contracts: ["Contratos", "Acuerdos, términos y vencimientos"],
  svc: ["Servicios", "Catálogo de referencia"],
  drive: ["Drive", "Explorador de archivos del proyecto"],
};
const SERVICES: Array<{ cat: string; items: Array<{ n: string; d: string; incl?: string; note?: string; t: string[][] }> }> = [
  { cat: "🌐 Sitios Web", items: [
    { n: "Landing Page", d: "Landing pages que convierten visitantes en pipeline.", incl: "UI/UX en Figma, frontend React + Next.js, hosting Vercel/Cloudflare, SEO técnico on-page, GA4 + Meta Pixel, formularios con notificación al CRM, Lighthouse 95+ mobile.", t: [["Inicia","$100.000","o $25.000/mes · one-page brandeada, formulario + WhatsApp, hosting+dominio, entrega 5 días."],["Escala","$290.000","Diseño 100% custom, copy persuasivo, Lighthouse 95+, píxel Meta/TikTok, entrega 7 días."],["Domina","$490.000","Animaciones cinemáticas, A/B testing, multi-idioma, integración CRM."]] },
    { n: "Sitio Web Corporativo", d: "Presencia digital multipágina para empresas.", incl: "Arquitectura multipágina, CMS headless opcional, diseño responsive, SEO técnico avanzado, blog integrado, multidioma, Core Web Vitals.", t: [["Inicia","$290.000","5 secciones, formulario + blog básico, CMS simple."],["Escala","$690.000","8+ secciones a medida, CMS autoadministrable, blog con SEO."],["Domina","$1.290.000","Diseño 100% custom, multi-idioma, integración CRM/ERP, soporte premium 90 días."]] },
    { n: "E-Commerce", d: "Tiendas online que procesan pedidos sin fricción.", incl: "Catálogo con variantes, checkout optimizado, pasarelas LATAM (Webpay, Mercado Pago, Khipu, Stripe), envíos, panel admin, cupones, SEO de productos.", t: [["Inicia","$390.000","Hasta 50 productos, MercadoPago+transferencia, panel básico."],["Escala","$990.000","Catálogo ilimitado, stock en vivo, cupones/promos, PWA."],["Domina","$1.990.000","Multi-bodega y multi-moneda, integración ERP, app móvil opcional."]] },
    { n: "Rediseño Web", d: "Recupera credibilidad y rendimiento migrando a stack moderno.", incl: "Auditoría inicial, preservación SEO, diseño UI nuevo, migración a Next.js, performance mobile-first.", t: [["Inicia","$190.000","Refresh visual, hosting moderno."],["Escala","$590.000","Rediseño completo UI/UX, Core Web Vitals."],["Domina","$990.000","Diseño premium 100% nuevo, Lighthouse 100."]] },
  ]},
  { cat: "💻 Software", items: [
    { n: "Software a Medida", d: "Apps web internas, automatizaciones y plataformas custom.", incl: "Arquitectura limpia, API REST/GraphQL, PostgreSQL, autenticación y permisos, tests automatizados, CI/CD.", note: "Se cotiza según alcance. Stack: Node.js, TypeScript, React, Next.js, PostgreSQL, Railway/Render/AWS.", t: [] },
    { n: "Sistema ERP", d: "ERP a medida que refleja tus procesos reales.", incl: "Inventario multi-bodega, facturación electrónica, finanzas, RRHH, compras, reportes en tiempo real.", t: [["Inicia","—","No aplica en este nivel."],["Escala","$2.490.000","Inventario + ventas + compras, hasta 10 usuarios."],["Domina","$4.990.000","Módulos completos a medida, multi-empresa, usuarios ilimitados."]] },
    { n: "Sistema CRM", d: "CRM a medida con el pipeline real de tu equipo comercial.", incl: "Pipeline kanban, captación multicanal, automatizaciones, email integrado, click-to-call y WhatsApp.", t: [["Inicia","$390.000","Hasta 500 contactos, pipeline visual básico."],["Escala","$1.490.000","Contactos ilimitados, automatizaciones, integraciones."],["Domina","—","Nivel premium superior, a cotizar según alcance."]] },
  ]},
  { cat: "🎨 Diseño", items: [
    { n: "Diseño de Logo", d: "Logos diseñados para durar y funcionar en todos los tamaños.", incl: "3 propuestas únicas, exploración tipográfica, formatos vectoriales, paleta HEX/RGB/CMYK/Pantone, mini-manual.", t: [["Inicia","$90.000","1 logo en 3 versiones, paleta básica."],["Escala","$290.000","Logo + isotipo + variantes, manual corto."],["Domina","$590.000","Investigación + naming, manual completo + animación."]] },
    { n: "Branding & Marca", d: "Sistemas de branding que todo tu equipo puede aplicar correctamente.", incl: "Brand strategy, sistema de logo extendido, paleta extendida, tono y voz, aplicaciones, manual PDF.", t: [["Inicia","$390.000","Logo + paleta + tipografía, manual básico."],["Escala","$890.000","Estrategia de marca completa, manual extendido."],["Domina","$1.890.000","Naming + storytelling, manual premium, lanzamiento y rollout."]] },
    { n: "Redes Sociales", d: "Diseño de RRSS con sistema visual coherente.", incl: "Sistema visual, plantillas de posts/stories/reels, calendario visual 30 días.", t: [["Inicia","$90.000","o $19.000/mes · 10 plantillas Canva."],["Escala","$290.000","30+ plantillas custom, sistema visual coherente."],["Domina","$590.000","Sistema visual completo, animaciones para reels, soporte mensual."]] },
  ]},
];

/* ============================================================
   HELPERS
   ============================================================ */
function uid() { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function prioW(x: string) { return PRIO_W[x] !== undefined ? PRIO_W[x] : 1; }
function projProg(projectId: string, tasks: Task[]): { done: number; total: number; pct: number } {
  const pt = tasks.filter(t => t.projectId === projectId);
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
function taskStageOf(id: string) { return TASK_STAGES.find(s => s.id === id) || TASK_STAGES[0]; }
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

async function fetchHubFromServer(): Promise<HubState | null> {
  try {
    const res = await fetch(`${HUB_API_BASE}/hub`, { credentials: "include" });
    if (!res.ok) return null;
    const json = await res.json() as { data: unknown };
    if (!json.data || typeof json.data !== "object" || Array.isArray(json.data)) return null;
    return Object.assign(blankState(), json.data) as HubState;
  } catch { return null; }
}

async function patchHubToServer(st: HubState): Promise<void> {
  try {
    await fetch(`${HUB_API_BASE}/hub`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: st }),
    });
  } catch { /* ignore — localStorage already saved */ }
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

function ProjCard({ p, tasks, onClick, onDragStart, onDragEnd }: { p: Project; tasks: Task[]; onClick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
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

function TaskCard({ t, projects, onClick, onDragStart, onDragEnd }: { t: Task; projects: Project[]; onClick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  const proj = projects.find(p => p.id === t.projectId);
  return (
    <div className="pcard tcard tcard--compact" draggable onClick={onClick} onDragStart={onDragStart} onDragEnd={onDragEnd}
      style={{ borderLeft: `3px solid ${CRIT_COLOR[t.crit] || "var(--line)"}` }}>
      <div className="tcard-title">{t.title}</div>
      <div className="tcard-meta">
        <span className={`chip prio-${t.crit}`}>{t.crit}</span>
        <span className="tcard-proj">{proj ? proj.name : "—"}</span>
        <StageTimerInline since={t.stageSince || t.createdAt || Date.now()} />
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
      {folderId ? (
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
          {pickerOpen ? "Cerrar selector" : folderId ? "Cambiar carpeta" : "Seleccionar carpeta"}
        </button>
        {!folderId && (
          <button style={btnPrimary} onClick={handleCreate} disabled={creating}>
            {creating ? "Creando…" : `+ Crear carpeta${shortName ? ` "${shortName}"` : ""}`}
          </button>
        )}
      </div>
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
      if (!res.ok) { const e = await res.json().catch(() => ({})); onToast((e as any).error || "Error al subir PDF"); return; }
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
    </div>
  );
}

/* ============================================================
   SHEET CONTENT
   ============================================================ */
interface SheetProps { sheet: SheetKind; state: HubState; onClose: () => void; onSave: (next: HubState) => void; onToast: (msg: string, undo?: () => void) => void; onNavigate: (tab: Tab) => void; onOpenSheet: (s: SheetKind) => void; onConfirm: (msg: string, onYes: () => void) => void; }

function SheetContent({ sheet, state, onClose, onSave, onToast, onNavigate, onOpenSheet, onConfirm }: SheetProps) {
  const r = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>({});
  const R = (k: string) => (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => { r.current[k] = el; };
  const V = (k: string) => (r.current[k] as HTMLInputElement | null)?.value ?? "";
  const [driveFolderLink, setDriveFolderLink] = useState("");
  const [projNameDraft, setProjNameDraft] = useState("");
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
  const [extractingProject, setExtractingProject] = useState(false);
  const [scrumLoading, setScrumLoading] = useState(false);
  const [scrumProposed, setScrumProposed] = useState<Array<{ title: string; crit: string; notes: string; selected: boolean }>>([]);
  const [projPrefilledByAI, setProjPrefilledByAI] = useState(false);
  const projPreFillRef = useRef<Record<string, string>>({});
  const [projectCreatedContractIds, setProjectCreatedContractIds] = useState<Set<string>>(new Set());
  const [duplicateProjectWarning, setDuplicateProjectWarning] = useState<{ name: string; client: string; pendingPrefill: Record<string, string> } | null>(null);
  const newProjFromContractIdRef = useRef<string | null>(null);
  const lastScrumProjIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (sheet?.kind === "proj") {
      const p = state.projects.find(x => x.id === (sheet as { id: string }).id);
      if (p) { setDriveFolderLink(p.link || ""); setProjNameDraft(p.name || ""); }
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
      setProjNameDraft(hasPrefill ? (pf.name || "") : "");
      setProjPrefilledByAI(hasPrefill);
      newProjFromContractIdRef.current = pf.fromContractId || null;
      projPreFillRef.current = {}; // clear after reading so next fresh open starts blank
    }
    if (sheet?.kind === "contract") {
      const c = state.contracts.find(x => x.id === (sheet as { id: string }).id);
      if (c && c.pdfUrl) setPdfData({ url: c.pdfUrl, title: c.pdfTitle || "", uploadedAt: c.pdfUploadedAt || 0 });
      else setPdfData(null);
      setChatHistory([]); setChatInput(""); setExtractingProject(false);
      setDuplicateProjectWarning(null);
    }
    if (sheet?.kind === "new-contract") { setPdfData(null); setAiExtracting(false); }
    if (sheet?.kind === "new-contract-meeting") { setMeetingNotes(""); setMeetingExtracting(false); }
  }, [sheet, state.projects, state.contracts]);

  useEffect(() => {
    if (sheet?.kind === "new-contract-wizard") { setWizStep(1); setWiz(emptyWiz()); setGeneratingPdf(false); setMeetingNotes(""); setMeetingExtracting(false); }
  }, [sheet?.kind]);

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

  if (!sheet) return null;

  /* ---- Nueva tarea ---- */
  if (sheet.kind === "new-task") {
    return (<>
      <div className="sheet-head"><h2>Nueva tarea</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("t")} placeholder="Ej: Maquetar checkout" /></div>
      <div className="two field">
        <div><label>Proyecto</label><select ref={R("proj")}><option value="">— sin proyecto —</option>{state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label>Criticidad</label><select ref={R("crit")}><option value="crítica">Crítica</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
      </div>
      <div className="field"><label>Etapa</label><select ref={R("stage")}>{TASK_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      <div className="field"><label>Notas</label><textarea ref={R("notes") as React.Ref<HTMLTextAreaElement>} rows={4} /></div>
      <button className="add-btn" onClick={() => {
        const title = V("t").trim(); if (!title) { onToast("Ponle un título a la tarea"); return; }
        const now = Date.now();
        onSave({ ...state, tasks: [...state.tasks, { id: uid(), title, projectId: V("proj"), crit: V("crit") as Prio, stage: V("stage") as TaskStage, stageSince: now, stageTime: {}, notes: V("notes"), createdAt: now, updatedAt: now }] });
        onClose(); onNavigate("proj"); onToast("Tarea creada");
      }}>Crear tarea</button>
    </>);
  }

  /* ---- Detalle tarea ---- */
  if (sheet.kind === "task") {
    const t = state.tasks.find(x => x.id === sheet.id); if (!t) return null;
    return (<>
      <div className="sheet-head"><h2>Tarea</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="detail-meta"><span className={`chip prio-${t.crit}`}>{t.crit}</span><span className="badge">{taskStageOf(t.stage).label}</span></div>
      <div className="field"><label>Título</label><input type="text" ref={R("t")} defaultValue={t.title} /></div>
      <div className="two field">
        <div><label>Proyecto</label><select ref={R("proj")} defaultValue={t.projectId}><option value="">— sin proyecto —</option>{state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label>Criticidad</label><select ref={R("crit")} defaultValue={t.crit}>{["crítica","alta","media","baja"].map(x => <option key={x} value={x}>{x}</option>)}</select></div>
      </div>
      <div className="field"><label>Etapa</label><select ref={R("stage")} defaultValue={t.stage}>{TASK_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      <div className="field"><label>Notas</label><textarea ref={R("notes") as React.Ref<HTMLTextAreaElement>} rows={5} defaultValue={t.notes || ""} /></div>
      <div className="detail-block"><h4>Tiempo por etapa</h4><StageBreakdown t={t} /></div>
      <button className="save" onClick={() => {
        const newStage = V("stage") as TaskStage;
        const tasks = state.tasks.map(x => {
          if (x.id !== t.id) return x;
          const u: Record<string, unknown> = { ...x, title: V("t").trim() || x.title, projectId: V("proj"), crit: V("crit"), notes: V("notes"), updatedAt: Date.now() };
          if (newStage !== x.stage) advanceStageObj(u, newStage, "stage");
          return u as unknown as Task;
        });
        onSave({ ...state, tasks }); onClose(); onToast("Tarea actualizada");
      }}>Guardar cambios</button>
      <button className="del-link" onClick={() => {
        const snap = [...state.tasks];
        onSave({ ...state, tasks: state.tasks.filter(x => x.id !== t.id) });
        onClose(); onToast("Tarea eliminada", () => onSave({ ...state, tasks: snap }));
      }}>Eliminar tarea</button>
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
      <button className="add-btn" onClick={() => {
        const name = projNameDraft.trim(); if (!name) { onToast("Ponle un nombre al proyecto"); return; }
        const now = Date.now();
        const fromCid = newProjFromContractIdRef.current || undefined;
        onSave({ ...state, projects: [...state.projects, { id: uid(), name, client: V("cli").trim(), type: V("ty").trim(), prio: V("prio") as Prio, status: V("st") as ProjStatus, owner: V("ow").trim(), due: V("due"), prog: 0, notes: V("no"), link: driveFolderLink, contractId: fromCid, createdAt: now, updatedAt: now }] });
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
        const { done, total, pct } = projProg(p.id, state.tasks);
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
        <label>Carpeta de Drive</label>
        <DriveFolderSelector value={driveFolderLink} onChange={setDriveFolderLink} projectName={p.name} onToast={onToast} />
      </div>
      <button className="save" onClick={() => {
        const newStatus = V("st") as ProjStatus;
        const projects = state.projects.map(x => {
          if (x.id !== p.id) return x;
          const computedProg = projProg(x.id, state.tasks).pct;
          const u: Record<string, unknown> = { ...x, name: V("n").trim() || x.name, client: V("cli").trim(), type: V("ty").trim(), prio: V("prio"), owner: V("ow").trim(), due: V("due"), prog: computedProg, notes: V("no"), link: driveFolderLink, updatedAt: Date.now() };
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
              onClick={() => {
                const now = Date.now();
                const newTasks: Task[] = scrumProposed
                  .filter(t => t.selected)
                  .map(t => ({
                    id: uid(),
                    title: t.title,
                    projectId: p.id,
                    crit: (["crítica","alta","media","baja"].includes(t.crit) ? t.crit : "media") as Prio,
                    stage: "backlog" as TaskStage,
                    stageSince: now,
                    stageTime: {},
                    notes: t.notes || "",
                    createdAt: now,
                    updatedAt: now,
                  }));
                onSave({ ...state, tasks: [...state.tasks, ...newTasks] });
                setScrumProposed([]);
                onToast(`${newTasks.length} tarea${newTasks.length !== 1 ? "s" : ""} agregada${newTasks.length !== 1 ? "s" : ""} al Backlog ✓`);
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
        const nTasks = state.tasks.filter(t => t.projectId === p.id).length;
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
      <div className="two field"><div><label>Contacto</label><input type="text" ref={R("ct")} /></div><div><label>Segmento</label><input type="text" ref={R("sg")} /></div></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} /></div>
      <button className="add-btn" onClick={() => {
        const name = V("n").trim(); if (!name) { onToast("Ponle un nombre al cliente"); return; }
        onSave({ ...state, clients: [...state.clients, { id: uid(), name, contact: V("ct").trim(), segment: V("sg").trim(), notes: V("no"), createdAt: Date.now() }] });
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
      <div className="two field"><div><label>Contacto</label><input type="text" ref={R("ct")} defaultValue={c.contact || ""} /></div><div><label>Segmento</label><input type="text" ref={R("sg")} defaultValue={c.segment || ""} /></div></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={5} defaultValue={c.notes || ""} /></div>
      <button className="save" onClick={() => {
        onSave({ ...state, clients: state.clients.map(x => x.id !== c.id ? x : { ...x, name: V("n").trim() || x.name, contact: V("ct").trim(), segment: V("sg").trim(), notes: V("no") }) });
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

  /* ---- Nueva nota ---- */
  if (sheet.kind === "new-note") {
    return (<>
      <div className="sheet-head"><h2>Nueva nota</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("ti")} /></div>
      <div className="field"><label>Categoría</label><select ref={R("ca")}>{(Object.entries(NOTE_CATS) as [NoteCat,string][]).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label>Contenido</label><textarea ref={R("bo") as React.Ref<HTMLTextAreaElement>} rows={6} /></div>
      <button className="add-btn" onClick={() => {
        const title = V("ti").trim(); if (!title) { onToast("Ponle un título a la nota"); return; }
        const now = Date.now();
        onSave({ ...state, notes: [...state.notes, { id: uid(), title, cat: V("ca") as NoteCat, body: V("bo"), createdAt: now, updatedAt: now }] });
        onClose(); onNavigate("notes"); onToast("Nota creada");
      }}>Crear nota</button>
    </>);
  }

  /* ---- Detalle nota ---- */
  if (sheet.kind === "note") {
    const n = state.notes.find(x => x.id === sheet.id); if (!n) return null;
    return (<>
      <div className="sheet-head"><h2>Nota</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("ti")} defaultValue={n.title} /></div>
      <div className="field"><label>Categoría</label><select ref={R("ca")} defaultValue={n.cat}>{(Object.entries(NOTE_CATS) as [NoteCat,string][]).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field"><label>Contenido</label><textarea ref={R("bo") as React.Ref<HTMLTextAreaElement>} rows={8} defaultValue={n.body || ""} /></div>
      <button className="save" onClick={() => {
        onSave({ ...state, notes: state.notes.map(x => x.id !== n.id ? x : { ...x, title: V("ti").trim() || x.title, cat: V("ca") as NoteCat, body: V("bo"), updatedAt: Date.now() }) });
        onClose(); onToast("Nota actualizada");
      }}>Guardar cambios</button>
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
    return (<>
      <div className="sheet-head"><h2>Contrato</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título / Descripción</label><input type="text" ref={R("ti")} defaultValue={c.title} /></div>
      <div className="field"><label>Cliente</label><input type="text" ref={R("cl")} defaultValue={c.client} /></div>
      <div className="field"><label>Valor</label><input type="text" ref={R("va")} defaultValue={c.value} /></div>
      <div className="field"><label>Estado</label>
        <select ref={R("st")} defaultValue={c.status}>
          <option value="borrador">Borrador</option>
          <option value="activo">Activo</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
      <div className="field"><label>Fecha de firma</label><input type="date" ref={R("si")} defaultValue={c.signedAt} /></div>
      <div className="field"><label>Fecha de vencimiento</label><input type="date" ref={R("ex")} defaultValue={c.expiresAt} /></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} defaultValue={c.notes || ""} /></div>
      <div className="field"><label>Documento PDF</label>
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
      <button className="save" onClick={() => {
        onSave({ ...state, contracts: state.contracts.map(x => x.id !== c.id ? x : { ...x, title: V("ti").trim() || x.title, client: V("cl"), value: V("va"), status: V("st") as ContractStatus, signedAt: V("si"), expiresAt: V("ex"), notes: V("no"), pdfUrl: pdfData?.url, pdfTitle: pdfData?.title, pdfUploadedAt: pdfData?.uploadedAt, updatedAt: Date.now() }) });
        onClose(); onToast("Contrato actualizado");
      }}>Guardar cambios</button>

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
                      <span style={{ fontSize: "0.68em", color: "var(--muted)" }}>{projProg(proj.id, state.tasks).pct}%</span>
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
          <span style={{ fontSize: "0.75em", color: "var(--muted)", fontWeight: 400 }}>Dile a la IA qué cambiar y aplicará los cambios al formulario</span>
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
                  body: JSON.stringify({ contract: currentContract, instruction }),
                });
                if (!res.ok) { const e = await res.json().catch(() => ({} as Record<string,string>)); setChatHistory(h => [...h, { role: "ai", text: (e as {error?:string}).error || "Error al procesar" }]); return; }
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
            style={{ padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--accent-bg, rgba(255,120,0,0.15))", color: "var(--accent, #ff7800)", cursor: "pointer", fontWeight: 600, fontSize: "1em", flexShrink: 0 }}
          >→</button>
        </div>
        <p style={{ fontSize: "0.72em", color: "var(--muted)", marginTop: 5 }}>Los cambios se aplican al formulario — haz clic en "Guardar cambios" para confirmar.</p>
      </div>

      <button className="del-link" style={{ marginTop: 16 }} onClick={() => {
        const snap = [...state.contracts];
        onSave({ ...state, contracts: state.contracts.filter(x => x.id !== c.id) });
        onClose(); onToast("Contrato eliminado", () => onSave({ ...state, contracts: snap }));
      }}>Eliminar contrato</button>
    </>);
  }

  /* ---- Wizard: nuevo contrato desde cero ---- */
  if (sheet.kind === "new-contract-wizard") {
    const WIZ_STEPS = ["Datos", "Módulos", "Pago"];
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

      {/* STEP 1: Datos generales */}
      {wizStep === 1 && (
        <div className="wiz-body">
          <div className="field"><label>Cliente *</label>
            <input type="text" value={wiz.client} onChange={e => setWiz(w => ({ ...w, client: e.target.value }))} placeholder="Nombre del cliente o empresa" />
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
              <span>🎙️</span> Notas de reunión <span style={{ fontSize: "0.7em", fontWeight: 400, color: "var(--muted)" }}>(opcional — la IA completa los campos)</span>
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
                const now = Date.now();
                const issuedAt = wiz.date || new Date().toISOString().slice(0, 10);
                let expiresAt = "";
                if (wiz.validityDays > 0) {
                  const exp = new Date(issuedAt + "T12:00:00");
                  exp.setDate(exp.getDate() + wiz.validityDays);
                  expiresAt = exp.toISOString().slice(0, 10);
                }
                onSave({ ...state, contracts: [...state.contracts, { id: uid(), title: wiz.project, client: wiz.client, value: tTotal > 0 ? fmtCLP(tTotal) : "", status: "borrador" as ContractStatus, signedAt: issuedAt, expiresAt, notes: wiz.scope, pdfUrl, pdfTitle: pdfTitleOut, pdfUploadedAt, createdAt: now, updatedAt: now }] });
                onClose(); onNavigate("contracts");
                onToast(pdfUrl ? "Contrato creado y PDF subido a Drive ✓" : "Contrato creado");
              } catch (e: unknown) {
                onToast("Error generando el PDF: " + (e instanceof Error ? e.message : "desconocido"));
              } finally { setGeneratingPdf(false); }
            }}>{generatingPdf ? "⏳ Generando PDF…" : "✨ Generar contrato PDF"}</button>
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
function DashView({ state, onOpenProject, onNavigate }: { state: HubState; onOpenProject: (id: string) => void; onNavigate: (tab: Tab) => void }) {
  const active = state.projects.filter(p => p.status !== "done");
  const avg = state.projects.length ? Math.round(state.projects.reduce((a, p) => a + projProg(p.id, state.tasks).pct, 0) / state.projects.length) : 0;
  const urgent = state.projects.filter(p => p.prio === "alta" && p.status !== "done").length;
  const due7 = state.projects.filter(p => { if (!p.due || p.status === "done") return false; const d = dueInfo(p); return d != null && d.days <= 7; }).length;
  const prog = [...state.projects].sort((a, b) => projProg(b.id, state.tasks).pct - projProg(a.id, state.tasks).pct).slice(0, 8);
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
      <div style={{ marginTop: 8, fontFamily: "IBM Plex Mono,monospace", fontSize: 9, color: "var(--faint)", letterSpacing: 1.2, textTransform: "uppercase" }}>
        {STATUS.map((s, i) => <span key={s.id}>{i > 0 && " · "}{s.label} · {state.projects.filter(p => p.status === s.id).length}</span>)}
      </div>
      <div className="dash-grid">
        <div className="panel">
          <h2>Avance por Proyecto</h2>
          {prog.length ? prog.map(p => (
            <div key={p.id} className="prow clickable" onClick={() => { onNavigate("proj"); setTimeout(() => onOpenProject(p.id), 80); }}>
              <div className="pn"><b>{p.name}</b><small>{p.client}</small></div>
              <div className="pbarwrap"><div className="pbar"><i style={{ width: projProg(p.id, state.tasks).pct + "%" }} /></div></div>
              <div className="ppct">{projProg(p.id, state.tasks).pct}%</div>
            </div>
          )) : <div className="col-empty">Sin proyectos aún</div>}
        </div>
        <div className="panel activity">
          <h2>Actividad Reciente</h2>
          {acts.length ? acts.map(p => <div key={p.id} className="aitem"><span className="tag">{statusOf(p.status).label}</span><span>{p.name} · {p.client} → {projProg(p.id, state.tasks).pct}%</span></div>) : <div className="col-empty">Sin actividad reciente</div>}
        </div>
      </div>
    </div>
  );
}

function ProjView({ state, onSave, onOpenProject, onOpenTask, onToast, projView, setProjView, searchQ, setSearchQ, filterPrio, setFilterPrio }: {
  state: HubState; onSave: (n: HubState) => void; onOpenProject: (id: string) => void; onOpenTask: (id: string) => void;
  onToast: (m: string) => void; projView: ProjView; setProjView: (v: ProjView) => void;
  searchQ: string; setSearchQ: (v: string) => void; filterPrio: string; setFilterPrio: (v: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const fp = state.projects.filter(p => (!filterPrio || p.prio === filterPrio) && (!searchQ || (p.name + p.client + p.type).toLowerCase().includes(searchQ)));
  const ft = state.tasks.filter(t => {
    if (filterPrio && t.crit !== filterPrio) return false;
    if (searchQ) { const pj = state.projects.find(p => p.id === t.projectId); if (!((t.title + " " + (pj ? pj.name : "")).toLowerCase().includes(searchQ))) return false; }
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
  const dropTask = (stage: string) => {
    if (!dragId) return;
    const t = state.tasks.find(x => x.id === dragId);
    if (t && t.stage !== stage) {
      const u: Record<string, unknown> = { ...t }; advanceStageObj(u, stage, "stage");
      onSave({ ...state, tasks: state.tasks.map(x => x.id === dragId ? u as unknown as Task : x) });
      onToast("Tarea → " + taskStageOf(stage).label);
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
                {items.length ? items.map(p => <ProjCard key={p.id} p={p} tasks={state.tasks} onClick={() => onOpenProject(p.id)} onDragStart={e => { setDragId(p.id); e.dataTransfer.setData("text/plain", p.id); }} onDragEnd={() => { setDragId(null); setDragOver(null); }} />) : <div className="col-empty">—</div>}
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
              <div className="gfoot"><span className={`chip prio-${p.prio}`}>{p.prio}</span><span className="badge">{statusOf(p.status).label}</span><DueChip p={p} /><span className="gdate">{projProg(p.id, state.tasks).pct}%</span></div>
            </div>
          ))}
        </div>
      )}
      {projView === "scrum" && (
        <div className="board scrum6">
          {!state.projects.length && !state.tasks.length && <div className="col-empty" style={{ gridColumn: "1/-1" }}>Crea un proyecto primero, luego añade tareas con <strong>+ Nuevo</strong>.</div>}
          {TASK_STAGES.map(s => {
            const items = ft.filter(t => t.stage === s.id).sort((a, b) => (prioW(a.crit) - prioW(b.crit)) || ((a.stageSince||0) - (b.stageSince||0)));
            return (
              <div key={s.id} className={`col ${dragOver === s.id ? "dragover" : ""}`}
                onDragOver={e => { e.preventDefault(); setDragOver(s.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => dropTask(s.id)}>
                <h3><span className="top"><span className="dot" style={{ background: s.color }} />{s.label}</span><span className="n">{items.length}</span></h3>
                {items.length ? items.map(t => <TaskCard key={t.id} t={t} projects={state.projects} onClick={() => onOpenTask(t.id)} onDragStart={e => { setDragId(t.id); e.dataTransfer.setData("text/plain", t.id); }} onDragEnd={() => { setDragId(null); setDragOver(null); }} />) : <div className="col-empty">—</div>}
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

function GoogleCalendarSection() {
  const [status, setStatus] = useState<"loading" | "connected" | "no_scope" | "disabled" | "error">("loading");
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch(`${HUB_API_BASE}/calendar/status`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.connected) {
          setStatus("connected");
          setEventsLoading(true);
          fetch(`${HUB_API_BASE}/calendar/events`, { credentials: "include" })
            .then(r => r.json())
            .then(ev => { setEvents(ev.events || []); setEventsLoading(false); })
            .catch(() => setEventsLoading(false));
        } else {
          setStatus(d.reason === "disabled" ? "disabled" : d.reason === "no_scope" ? "no_scope" : "error");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await fetch(`${HUB_API_BASE}/calendar/disconnect`, { method: "POST", credentials: "include" });
    setStatus("disabled");
    setDisconnecting(false);
  };

  const fmtEvDate = (iso: string, allDay: boolean) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (allDay) return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
    return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--orange)", flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span style={{ fontFamily: "var(--font-mono,monospace)", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--orange)" }}>Google Calendar</span>
        {status === "connected" && (
          <button onClick={handleDisconnect} disabled={disconnecting}
            style={{ marginLeft: "auto", fontSize: "11px", background: "none", border: "1px solid var(--line)", borderRadius: "6px", color: "var(--faint)", padding: "2px 8px", cursor: "pointer" }}>
            {disconnecting ? "…" : "Desconectar"}
          </button>
        )}
      </div>

      {status === "loading" && (
        <div style={{ padding: "12px", color: "var(--faint)", fontSize: "12px" }}>Cargando…</div>
      )}

      {(status === "no_scope" || status === "disabled" || status === "error") && (
        <div style={{ background: "var(--card2)", border: "1px solid var(--line)", borderRadius: "11px", padding: "16px", display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)", marginBottom: "4px" }}>
              {status === "disabled" ? "Google Calendar desconectado" : "Conecta tu Google Calendar"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--faint)", lineHeight: 1.5 }}>
              {status === "disabled"
                ? "Vuelve a iniciar sesión con Google para sincronizar tus eventos."
                : "Ve tus próximas reuniones directamente desde el hub. Se necesita re-autenticar con Google para autorizar el acceso al calendario."}
            </div>
          </div>
          <a href={`${HUB_API_BASE}/auth/google`} style={{ background: "var(--orange)", color: "#fff", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
            Conectar Calendar
          </a>
        </div>
      )}

      {status === "connected" && (
        <>
          {eventsLoading && <div style={{ padding: "8px 0", color: "var(--faint)", fontSize: "12px" }}>Cargando eventos…</div>}
          {!eventsLoading && events.length === 0 && (
            <div style={{ padding: "8px 0", color: "var(--faint)", fontSize: "12px" }}>Sin eventos en los próximos 30 días.</div>
          )}
          {!eventsLoading && events.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
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
  const list = [...state.meetings].sort((a, b) => meetTs(b) - meetTs(a));
  return (
    <div className="wrap">
      <GoogleCalendarSection />
      <div style={{ fontFamily: "var(--font-mono,monospace)", fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--dim)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Reuniones manuales
      </div>
      {state.meetings.length === 0 && <div className="empty-all">Sin reuniones aún. <strong>+ Nuevo</strong> para comenzar.</div>}
      <div className="cardlist">
        {list.map(m => (
          <div key={m.id} className="gcard" onClick={() => onOpen(m.id)}>
            <div className="gt">{m.client || "Reunión"}</div>
            <div className="gsub">{m.date ? fmtDate(new Date(m.date + "T12:00:00").getTime()) : fmtDate(m.createdAt)}</div>
            <div className="gbody">{m.summary || ""}</div>
            <div className="gfoot"><span className="gdate">{fmtDate(m.createdAt)}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesView({ state, onOpen, filterCat, setFilterCat, searchQ, setSearchQ }: { state: HubState; onOpen: (id: string) => void; filterCat: string; setFilterCat: (v: string) => void; searchQ: string; setSearchQ: (v: string) => void }) {
  const list = state.notes
    .filter(n => (!filterCat || n.cat === filterCat) && (!searchQ || (n.title + " " + (n.body || "")).toLowerCase().includes(searchQ)))
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  return (
    <div className="wrap">
      <div className="toolbar">
        <div className="tsearch"><span>🔍</span><input value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} placeholder="Buscar nota…" /></div>
        <select className="filter" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {(Object.entries(NOTE_CATS) as [NoteCat,string][]).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {state.notes.length === 0 && <div className="empty-all">Sin notas aún. <strong>+ Nuevo</strong> para comenzar.</div>}
      <div className="cardlist">
        {list.map(n => (
          <div key={n.id} className="gcard" onClick={() => onOpen(n.id)}>
            <div className="gt">{n.title}</div><div className="gsub">{NOTE_CATS[n.cat] || "Otra"}</div>
            <div className="gbody">{n.body || ""}</div>
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
const CONTRACT_STATUSES: Record<ContractStatus, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "var(--faint)" },
  activo:   { label: "Activo",   color: "var(--done)" },
  vencido:  { label: "Vencido",  color: "#e0795a" },
  cancelado:{ label: "Cancelado",color: "var(--disc)" },
};

function ContractsView({ state, onOpen }: { state: HubState; onOpen: (id: string) => void }) {
  const list = [...state.contracts].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="wrap">
      {state.contracts.length === 0 && <div className="empty-all">Sin contratos aún. <strong>+ Nuevo</strong> para agregar uno.</div>}
      <div className="cardlist">
        {list.map(c => {
          // Badge "vencido" derivado de la fecha real de vencimiento (salvo cancelados)
          const expired = c.status !== "cancelado" && contractExpired(c);
          const s = expired ? CONTRACT_STATUSES.vencido : (CONTRACT_STATUSES[c.status] || CONTRACT_STATUSES.borrador);
          return (
            <div key={c.id} className="gcard" onClick={() => onOpen(c.id)}>
              <div className="gt">{c.title}</div>
              <div className="gsub">{c.client || "—"}</div>
              <div className="meta" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                <span className="chip" style={{ color: s.color, borderColor: s.color + "55", background: s.color + "18" }}>{s.label}</span>
                {c.value && <span className="chip">{c.value}</span>}
                {c.expiresAt && <span className="chip" style={expired ? { color: "#e0795a", borderColor: "rgba(224,121,90,.4)" } : undefined}>Vence: {c.expiresAt}</span>}
                {c.pdfUrl && (
                  <a className="chip pdf-badge" href={c.pdfUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    📄 {c.pdfTitle || "PDF"}{c.pdfUploadedAt ? ` · ${new Date(c.pdfUploadedAt).toLocaleDateString("es-CL")}` : ""}
                  </a>
                )}
              </div>
              <div className="gbody" style={{ marginTop: "6px" }}>{c.notes || ""}</div>
              <div className="gfoot"><span className="gdate">{fmtDate(c.createdAt)}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SvcView() {
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
                <div className="tiers">{s.t.map((t, i) => <div key={t[0]} className={`tier ${i===1?"t2":""}`}><div className="tn">{t[0]}</div><div className="tp">{t[1]}</div><div className="tx">{t[2]}</div></div>)}</div>
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
    state.tasks.forEach(t => { const pj = state.projects.find(p => p.id === t.projectId); if ((t.title+" "+(pj?.name||"")).toLowerCase().includes(q2)) out.push({ t:"Tarea", n:t.title, s:pj?.name||"", go:()=>go("proj",{kind:"task",id:t.id}) }); });
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
const HUB_DRIVE_ROOT = "15cBDWdrC2IIN6OlD4rP0fBCImGOh39--";

function HubDriveView() {
  const [currentFolderId, setCurrentFolderId] = useState<string>(HUB_DRIVE_ROOT);
  const [folderHistory, setFolderHistory] = useState<{ id: string; name: string }[]>([{ id: HUB_DRIVE_ROOT, name: "Raíz" }]);

  const { data: filesData, isLoading: filesLoading } = useListDriveFiles({ folderId: currentFolderId });
  const { data: foldersData, isLoading: foldersLoading } = useListDriveFolders({ parentId: currentFolderId });

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

  return (
    <div className="wrap">
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", overflow: "hidden", marginTop: 20 }}>
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
                <div style={{ gridColumn: "1/-1", padding: "60px 0", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>Esta carpeta está vacía.</div>
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
const HubTabIcons: Record<Tab, React.ComponentType<{ className?: string }>> = {
  dash: LayoutDashboard,
  proj: Briefcase,
  clients: Users2,
  meet: CalendarClock,
  notes: FileText,
  contracts: FileCheck2,
  drive: FolderTree,
  svc: Package,
};

const HUB_API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const TabIcons: Record<Tab, React.ReactNode> = {
  dash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  proj: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 6h18M3 12h18M3 18h12"/></svg>,
  clients: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.87"/></svg>,
  meet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  notes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  contracts: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  svc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  drive: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
};

/* ============================================================
   COMPONENTE PRINCIPAL
   ============================================================ */
export default function EjecutivoPage() {
  const authUser = useAuth();
  const isAdmin = authUser?.role === "superadmin" || authUser?.role === "admin";
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const storageKey = hubStorageKey(authUser?.id);

  const handleLogout = async () => {
    try {
      await fetch(`${HUB_API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    clearHubStorage();
    queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    window.location.reload();
  };

  const [state, setStateRaw] = useState<HubState>(() => migrate(loadState(storageKey)));

  const serverSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const setState = useCallback((next: HubState) => {
    dirtyRef.current = true;
    setStateRaw(next);
    saveState(storageKey, next);
    if (serverSaveTimer.current) clearTimeout(serverSaveTimer.current);
    serverSaveTimer.current = setTimeout(() => { void patchHubToServer(next); }, 1500);
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;
    void fetchHubFromServer().then(serverState => {
      if (cancelled || !serverState || dirtyRef.current) return;
      const merged = migrate(serverState);
      setStateRaw(merged);
      saveState(storageKey, merged);
    });
    return () => { cancelled = true; };
  }, [storageKey]);

  const [tab, setTabRaw] = useState<Tab>(() => {
    try { const s = localStorage.getItem(LS_TAB); if (s && ["dash","proj","clients","meet","notes","contracts","svc","drive"].includes(s)) return s as Tab; } catch { /* ignore */ }
    return "dash";
  });

  useEffect(() => {
    if (tab === "svc" && !isAdmin) {
      setTabRaw("dash");
      try { localStorage.setItem(LS_TAB, "dash"); } catch { /* ignore */ }
    }
  }, [tab, isAdmin]);
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

  const openSheet = useCallback((s: SheetKind) => setSheet(s), []);

  const handleNew = () => {
    if (tab === "clients") openSheet({ kind: "new-client" });
    else if (tab === "meet") openSheet({ kind: "new-meet" });
    else if (tab === "notes") openSheet({ kind: "new-note" });
    else if (tab === "contracts") openSheet({ kind: "new-contract-mode" });
    else if (tab === "proj" && projView === "scrum") openSheet({ kind: "new-task" });
    else openSheet({ kind: "new-proj" });
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
  const TABS: { id: Tab; cnt?: number }[] = [
    { id: "dash" },
    { id: "proj", cnt: state.projects.length },
    { id: "clients", cnt: state.clients.length },
    { id: "meet", cnt: state.meetings.length },
    { id: "notes", cnt: state.notes.length },
    { id: "contracts", cnt: state.contracts.length },
    { id: "drive" },
    ...(isAdmin ? [{ id: "svc" as Tab }] : []),
  ];
  const TAB_LABELS: Record<Tab, string> = { dash: "Dashboard", proj: "Proyectos", clients: "Clientes", meet: "Reuniones", notes: "Notas", contracts: "Contratos", svc: "Servicios", drive: "Drive" };

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans:wght@300;400;500&family=Oswald:wght@500;600&display=swap" rel="stylesheet" />

      <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden">

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
              <div className="ptitle"><span>{tt}</span><small>{tsub}</small></div>
              <GlobalSearch state={state} onOpen={openSheet} onNavigate={navigate} />
            </div>
            {tab === "dash" && <DashView state={state} onOpenProject={id => openSheet({ kind: "proj", id })} onNavigate={navigate} />}
            {tab === "proj" && <ProjView state={state} onSave={setState} onOpenProject={id => openSheet({ kind: "proj", id })} onOpenTask={id => openSheet({ kind: "task", id })} onToast={showToast} projView={projView} setProjView={setProjView} searchQ={projSearch} setSearchQ={setProjSearch} filterPrio={projPrio} setFilterPrio={setProjPrio} />}
            {tab === "clients" && <ClientsView state={state} onOpen={id => openSheet({ kind: "client", id })} searchQ={clientSearch} setSearchQ={setClientSearch} />}
            {tab === "meet" && <MeetView state={state} onOpen={id => openSheet({ kind: "meet", id })} />}
            {tab === "notes" && <NotesView state={state} onOpen={id => openSheet({ kind: "note", id })} filterCat={noteCat} setFilterCat={setNoteCat} searchQ={noteSearch} setSearchQ={setNoteSearch} />}
            {tab === "contracts" && <ContractsView state={state} onOpen={id => openSheet({ kind: "contract", id })} />}
            {tab === "drive" && <HubDriveView />}
            {tab === "svc" && isAdmin && <SvcView />}
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
              <SheetContent sheet={sheet} state={state} onClose={() => setSheet(null)} onSave={setState} onToast={showToast} onNavigate={navigate} onOpenSheet={openSheet} onConfirm={(msg, onYes) => setConfirm({ msg, onYes })} />
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
    </>
  );
}
