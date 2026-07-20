import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import "./ejecutivo.css";

/* ============================================================
   TIPOS
   ============================================================ */
type Prio = "alta" | "media" | "baja";
type ProjStatus = "lead" | "disc" | "dev" | "rev" | "done";
type TaskStage = "backlog" | "sprint" | "doing" | "qa_sent" | "qa_rev" | "done";
type NoteCat = "proyecto" | "cliente" | "vision" | "equipo" | "otro";
type Tab = "dash" | "proj" | "clients" | "meet" | "notes" | "svc";
type ProjView = "board" | "list" | "scrum";

interface Project { id: string; name: string; client: string; type: string; prio: Prio; status: ProjStatus; owner: string; prog: number; notes: string; link: string; due?: string; createdAt: number; updatedAt: number; stageSince?: number; stageTime?: Record<string, number>; }
interface Client { id: string; name: string; contact: string; segment: string; notes: string; createdAt: number; }
interface Meeting { id: string; client: string; date: string; summary: string; notes: string; createdAt: number; }
interface Note { id: string; cat: NoteCat; title: string; body: string; createdAt: number; }
interface Task { id: string; title: string; projectId: string; crit: Prio; stage: TaskStage; stageSince: number; stageTime: Record<string, number>; notes: string; createdAt: number; updatedAt: number; }
interface HubState { projects: Project[]; clients: Client[]; meetings: Meeting[]; notes: Note[]; tasks: Task[]; }
type SheetKind =
  | null
  | { kind: "new-proj" } | { kind: "proj"; id: string }
  | { kind: "new-task" } | { kind: "task"; id: string }
  | { kind: "new-client" } | { kind: "client"; id: string }
  | { kind: "new-meet" } | { kind: "meet"; id: string }
  | { kind: "new-note" } | { kind: "note"; id: string };

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
  { id: "qa_sent", label: "QA (Enviada)", color: "var(--disc)" },
  { id: "qa_rev", label: "QA (Revisada)", color: "var(--rev)" },
  { id: "done", label: "Lista", color: "var(--done)" },
];
const NOTE_CATS: Record<NoteCat, string> = { proyecto: "Proyecto", cliente: "Cliente", vision: "Visión", equipo: "Equipo", otro: "Otra" };
const CRIT_COLOR: Record<string, string> = { alta: "#e0795a", media: "#c9a44a", baja: "#6aa0c0" };
const PRIO_W: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const TAB_TITLES: Record<Tab, [string, string]> = {
  dash: ["Dashboard", "Resumen ejecutivo en vivo"],
  proj: ["Proyectos", "Kanban · Lista · Scrumban"],
  clients: ["Clientes", "Cartera y contactos"],
  meet: ["Reuniones", "Notas, resúmenes y seguimiento"],
  notes: ["Notas", "Ideas, acuerdos y estrategia"],
  svc: ["Servicios", "Catálogo de referencia"],
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
function blankState(): HubState { return { projects: [], clients: [], notes: [], meetings: [], tasks: [] }; }

/* ============================================================
   SEED DATA
   ============================================================ */
function maybeSeeded(st: HubState): HubState {
  if (localStorage.getItem("wm_hub_seeded") || st.projects.length) { localStorage.setItem("wm_hub_seeded", "1"); return st; }
  const now = Date.now();
  const mkP = (name: string, client: string, type: string, prio: Prio, status: ProjStatus, owner: string, prog: number, notes: string): Project =>
    ({ id: uid(), name, client, type, prio, status, owner, prog, notes, link: "", createdAt: now, updatedAt: now });
  st.projects = [
    mkP("TEKSHIELD Ecommerce","TEKSHIELD SYSTEMS","E-commerce","alta","dev","Josué",55,"Rediseño con paleta roja/negra. Gestión de catálogo de productos."),
    mkP("Cierre 3 plataformas","CCCS · Acorazado · Electrotransporte","Sitio Web (x3)","alta","rev","Josué",85,"Cierre del proyecto de tres plataformas."),
    mkP("Capazquesi","IG Inmobiliaria (Ivens González)","Plataforma Software","alta","dev","Juan",40,"Plataforma de subsidio habitacional, co-fundada con Carlos."),
    mkP("Cotizador Inmobiliario","IG Inmobiliaria (Ivens González)","Herramienta Software","media","done","Juan",100,"Herramienta de cotización para la inmobiliaria, ya entregada."),
    mkP("Bot WhatsApp SaaS","MyTurno (Iván Bustos)","SaaS Multi-tenant","alta","disc"," — ",15,"Bot de WhatsApp multi-tenant para condominios y PyMEs."),
    mkP("Actualización de sitio","Chopez Solutions","Sitio Web Corporativo","media","dev","Montse / Juan",45,"Actualización del sitio de accesorios automotrices."),
    mkP("E-commerce Skincare AI","Kori & Glow (Damián)","E-commerce","alta","dev","Juan",20,"Skincare con evaluación dermocosmética potenciada por IA."),
    mkP("Plataforma Fundación","Fundación ProAcogida (Cote De Luca)","Plataforma Software","media","disc"," — ",10,"Matriz de permisos y scope assessment entregados al cliente."),
    mkP("App Delivery de Agua","Sixto Moreno","App Móvil","media","lead"," — ",5,"Delivery de agua en Ecuador."),
    mkP("E-commerce Mobiliario","Ofix Chile","E-commerce","media","rev","Juan",90,"Mobiliario corporativo B2B, en revisión final."),
    mkP("WebMaker Hub Interno","WebMaker Latam","PWA Interna","baja","done","Beto",100,"Kanban interno con notificaciones push y sync entre dispositivos."),
  ];
  const mkC = (name: string, contact: string, segment: string, notes: string): Client =>
    ({ id: uid(), name, contact, segment, notes, createdAt: now });
  st.clients = [
    mkC("TEKSHIELD SYSTEMS","—","Seguridad / E-commerce","Cliente activo, foco en catálogo de productos."),
    mkC("CCCS · Acorazado · Electrotransporte","Henry (supervisor)","Industrial","Cierre de tres plataformas en curso."),
    mkC("IG Inmobiliaria","Ivens González","Inmobiliario","Dos proyectos: Capazquesi y cotizador."),
    mkC("MyTurno","Iván Bustos","PropTech / SaaS","Bot WhatsApp para condominios y PyMEs."),
    mkC("Chopez Solutions","—","Automotriz","Accesorios automotrices, actualización de sitio."),
    mkC("Kori & Glow","Damián","Skincare / E-commerce","Ecommerce con IA para diagnóstico de piel."),
    mkC("Fundación ProAcogida","Cote De Luca","ONG · Foster Care","Plataforma para cuidado adoptivo."),
    mkC("Sixto Moreno","Sixto Moreno","Logística / Delivery (Ecuador)","App de delivery de agua."),
    mkC("Ofix Chile","—","Mobiliario Corporativo","E-commerce B2B, developer Juan."),
    mkC("Freddy Ramos","Freddy Ramos","Logística (Ecuador, camarón)","Prospecto: sistema de gestión de flota."),
    mkC("JMFSN","José Miguel Guarín","Transporte de pasajeros (Colombia)","Prospecto: app de transporte de pasajeros."),
  ];
  st.notes = [
    { id: uid(), cat: "equipo", title: "Regla de oro del equipo", createdAt: now, body: "Los márgenes y precios internos de WebMaker nunca se incluyen en documentos para clientes ni para developers." },
    { id: uid(), cat: "vision", title: "Framework de 3 reuniones", createdAt: now - 1000, body: "1) Discovery y levantamiento de alcance.\n2) Presentación de propuesta y ajustes.\n3) Cierre, firma y kickoff con el equipo de desarrollo." },
  ];
  localStorage.setItem("wm_hub_seeded", "1");
  return st;
}

function maybeSeededTasks(st: HubState): HubState {
  if (localStorage.getItem("wm_hub_tasks_seeded_v1") || st.tasks.length || !st.projects.length) {
    localStorage.setItem("wm_hub_tasks_seeded_v1", "1");
    return st;
  }
  const now = Date.now(), DAY = 86400000;
  const P = st.projects;
  const mkT = (title: string, proj: Project | undefined, crit: Prio, stage: TaskStage, daysAgo: number, notes: string): Task =>
    ({ id: uid(), title, projectId: proj ? proj.id : "", crit, stage, stageSince: now - Math.round(daysAgo * DAY), stageTime: {}, notes, createdAt: now, updatedAt: now });
  st.tasks = [
    mkT("Maquetar checkout", P[0], "alta", "doing", 2.3, "Integrar pasarela y validaciones del carrito."),
    mkT("Revisar copy de landing", P[1], "media", "qa_sent", 0.8, "Enviado a QA para revisión de textos."),
    mkT("Definir alcance MVP", P[2], "baja", "sprint", 1.1, "Aterrizar historias del primer sprint."),
  ];
  localStorage.setItem("wm_hub_tasks_seeded_v1", "1");
  return st;
}

function loadState(): HubState {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return Object.assign(blankState(), JSON.parse(raw)); } catch { /* ignore */ }
  return blankState();
}
function saveState(st: HubState) { try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch { /* ignore */ } }
function migrate(st: HubState): HubState {
  const now = Date.now();
  st.projects.forEach(p => { if (p.stageSince == null) p.stageSince = p.updatedAt || p.createdAt || now; });
  if (!Array.isArray(st.tasks)) st.tasks = [];
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
    const rad = o.p.prio === "alta" ? 10 : o.p.prio === "media" ? 8 : 6.5;
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

function StageTimer({ since }: { since: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  void tick;
  const ms = Date.now() - since;
  return <div className={`stage-timer ${timerClass(ms)}`}><span className="clk">⏱</span> {fmtDur(ms)}</div>;
}

function ProjCard({ p, onClick, onDragStart, onDragEnd }: { p: Project; onClick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  return (
    <div className="pcard" draggable onClick={onClick} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="pt">{p.name}</div>
      <div className="cl">{p.client}</div>
      <div className="meta">
        <span className={`chip prio-${p.prio}`}>{p.prio}</span>
        <span className="chip">{p.type}</span>
        {p.owner && p.owner.trim() !== "—" && <span className="chip">{p.owner}</span>}
        <DueChip p={p} />
      </div>
      <div className="bar-prog"><i style={{ width: p.prog + "%" }} /></div>
      <StageTimer since={p.stageSince || p.updatedAt || p.createdAt || Date.now()} />
    </div>
  );
}

function TaskCard({ t, projects, onClick, onDragStart, onDragEnd }: { t: Task; projects: Project[]; onClick: () => void; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }) {
  const proj = projects.find(p => p.id === t.projectId);
  return (
    <div className="pcard tcard" draggable onClick={onClick} onDragStart={onDragStart} onDragEnd={onDragEnd}
      style={{ borderLeft: `3px solid ${CRIT_COLOR[t.crit] || "var(--line)"}` }}>
      <div className="pt">{t.title}</div>
      <div className="cl">{proj ? proj.name : "— sin proyecto"}</div>
      <div className="meta"><span className={`chip prio-${t.crit}`}>{t.crit}</span></div>
      <StageTimer since={t.stageSince || t.createdAt || Date.now()} />
    </div>
  );
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
   SHEET CONTENT
   ============================================================ */
interface SheetProps { sheet: SheetKind; state: HubState; onClose: () => void; onSave: (next: HubState) => void; onToast: (msg: string, undo?: () => void) => void; onNavigate: (tab: Tab) => void; }

function SheetContent({ sheet, state, onClose, onSave, onToast, onNavigate }: SheetProps) {
  const r = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>({});
  const R = (k: string) => (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) => { r.current[k] = el; };
  const V = (k: string) => (r.current[k] as HTMLInputElement | null)?.value ?? "";
  const [progVal, setProgVal] = useState(0);

  useEffect(() => {
    if (sheet?.kind === "proj") {
      const p = state.projects.find(x => x.id === (sheet as { id: string }).id);
      if (p) setProgVal(p.prog);
    }
  }, [sheet, state.projects]);

  if (!sheet) return null;

  /* ---- Nueva tarea ---- */
  if (sheet.kind === "new-task") {
    return (<>
      <div className="sheet-head"><h2>Nueva tarea</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Título</label><input type="text" ref={R("t")} placeholder="Ej: Maquetar checkout" /></div>
      <div className="two field">
        <div><label>Proyecto</label><select ref={R("proj")}><option value="">— sin proyecto —</option>{state.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label>Criticidad</label><select ref={R("crit")}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
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
        <div><label>Criticidad</label><select ref={R("crit")} defaultValue={t.crit}>{["alta","media","baja"].map(x => <option key={x} value={x}>{x}</option>)}</select></div>
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
    return (<>
      <div className="sheet-head"><h2>Nuevo proyecto</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="field"><label>Nombre</label><input type="text" ref={R("n")} placeholder="Ej: Landing Page Corporativa" /></div>
      <div className="two field"><div><label>Cliente</label><input type="text" ref={R("cli")} /></div><div><label>Tipo</label><input type="text" ref={R("ty")} placeholder="E-commerce, Landing…" /></div></div>
      <div className="three field">
        <div><label>Prioridad</label><select ref={R("prio")}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
        <div><label>Estado</label><select ref={R("st")}>{STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Dueño</label><input type="text" ref={R("ow")} /></div>
      </div>
      <div className="field"><label>Fecha límite (opcional)</label><input type="date" ref={R("due")} /></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={4} /></div>
      <button className="add-btn" onClick={() => {
        const name = V("n").trim(); if (!name) { onToast("Ponle un nombre al proyecto"); return; }
        const now = Date.now();
        onSave({ ...state, projects: [...state.projects, { id: uid(), name, client: V("cli").trim(), type: V("ty").trim(), prio: V("prio") as Prio, status: V("st") as ProjStatus, owner: V("ow").trim(), due: V("due"), prog: 0, notes: V("no"), link: "", createdAt: now, updatedAt: now }] });
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
      <div className="field"><label>Nombre</label><input type="text" ref={R("n")} defaultValue={p.name} /></div>
      <div className="two field"><div><label>Cliente</label><input type="text" ref={R("cli")} defaultValue={p.client} /></div><div><label>Tipo</label><input type="text" ref={R("ty")} defaultValue={p.type} /></div></div>
      <div className="three field">
        <div><label>Prioridad</label><select ref={R("prio")} defaultValue={p.prio}>{["alta","media","baja"].map(x => <option key={x} value={x}>{x}</option>)}</select></div>
        <div><label>Estado</label><select ref={R("st")} defaultValue={p.status}>{STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label>Dueño</label><input type="text" ref={R("ow")} defaultValue={p.owner || ""} /></div>
      </div>
      <div className="field"><label>Fecha límite</label><input type="date" ref={R("due")} defaultValue={p.due || ""} /></div>
      <div className="field"><label>Avance <b>{progVal}%</b></label><div className="rangewrap"><input type="range" min={0} max={100} value={progVal} onChange={e => setProgVal(Number(e.target.value))} /></div></div>
      <div className="field"><label>Notas</label><textarea ref={R("no") as React.Ref<HTMLTextAreaElement>} rows={6} defaultValue={p.notes || ""} /></div>
      <div className="field"><label>Link (Replit / repo / sitio)</label><input type="url" ref={R("lk")} defaultValue={p.link || ""} placeholder="https://…" /></div>
      <button className="save" onClick={() => {
        const newStatus = V("st") as ProjStatus;
        const projects = state.projects.map(x => {
          if (x.id !== p.id) return x;
          const u: Record<string, unknown> = { ...x, name: V("n").trim() || x.name, client: V("cli").trim(), type: V("ty").trim(), prio: V("prio"), owner: V("ow").trim(), due: V("due"), prog: progVal, notes: V("no"), link: V("lk").trim(), updatedAt: Date.now() };
          if (newStatus !== x.status) advanceStageObj(u, newStatus, "status");
          return u as unknown as Project;
        });
        onSave({ ...state, projects }); onClose(); onToast("Proyecto actualizado");
      }}>Guardar cambios</button>
      <button className="del-link" onClick={() => {
        const snap = [...state.projects];
        onSave({ ...state, projects: state.projects.filter(x => x.id !== p.id) });
        onClose(); onToast("Proyecto eliminado", () => onSave({ ...state, projects: snap }));
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
        onSave({ ...state, clients: state.clients.filter(x => x.id !== c.id) });
        onClose(); onToast("Cliente eliminado", () => onSave({ ...state, clients: snap }));
      }}>Eliminar cliente</button>
      {projs.length > 0 && <div className="detail-block" style={{ marginTop: 20 }}><h4>Proyectos vinculados</h4><p>{projs.map(p => p.name + " — " + statusOf(p.status).label).join("\n")}</p></div>}
    </>);
  }

  /* ---- Nueva reunión ---- */
  if (sheet.kind === "new-meet") {
    return (<>
      <div className="sheet-head"><h2>Nueva reunión</h2><button className="close-btn" onClick={onClose}>✕</button></div>
      <div className="two field"><div><label>Cliente</label><input type="text" ref={R("cl")} /></div><div><label>Fecha</label><input type="date" ref={R("dt")} /></div></div>
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
      <div className="two field"><div><label>Cliente</label><input type="text" ref={R("cl")} defaultValue={m.client || ""} /></div><div><label>Fecha</label><input type="date" ref={R("dt")} defaultValue={m.date || ""} /></div></div>
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
        onSave({ ...state, notes: [...state.notes, { id: uid(), title, cat: V("ca") as NoteCat, body: V("bo"), createdAt: Date.now() }] });
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
        onSave({ ...state, notes: state.notes.map(x => x.id !== n.id ? x : { ...x, title: V("ti").trim() || x.title, cat: V("ca") as NoteCat, body: V("bo") }) });
        onClose(); onToast("Nota actualizada");
      }}>Guardar cambios</button>
      <button className="del-link" onClick={() => {
        const snap = [...state.notes];
        onSave({ ...state, notes: state.notes.filter(x => x.id !== n.id) });
        onClose(); onToast("Nota eliminada", () => onSave({ ...state, notes: snap }));
      }}>Eliminar nota</button>
    </>);
  }

  return null;
}

/* ============================================================
   VISTAS
   ============================================================ */
function DashView({ state, onOpenProject, onNavigate }: { state: HubState; onOpenProject: (id: string) => void; onNavigate: (tab: Tab) => void }) {
  const active = state.projects.filter(p => p.status !== "done");
  const avg = state.projects.length ? Math.round(state.projects.reduce((a, p) => a + Number(p.prog || 0), 0) / state.projects.length) : 0;
  const urgent = state.projects.filter(p => p.prio === "alta" && p.status !== "done").length;
  const due7 = state.projects.filter(p => { if (!p.due || p.status === "done") return false; const d = dueInfo(p); return d != null && d.days <= 7; }).length;
  const prog = [...state.projects].sort((a, b) => Number(b.prog) - Number(a.prog)).slice(0, 8);
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
              <div className="pbarwrap"><div className="pbar"><i style={{ width: p.prog + "%" }} /></div></div>
              <div className="ppct">{p.prog}%</div>
            </div>
          )) : <div className="col-empty">Sin proyectos aún</div>}
        </div>
        <div className="panel activity">
          <h2>Actividad Reciente</h2>
          {acts.length ? acts.map(p => <div key={p.id} className="aitem"><span className="tag">{statusOf(p.status).label}</span><span>{p.name} · {p.client} → {p.prog}%</span></div>) : <div className="col-empty">Sin actividad reciente</div>}
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
          <option value="">Prioridad</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
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
                {items.length ? items.map(p => <ProjCard key={p.id} p={p} onClick={() => onOpenProject(p.id)} onDragStart={e => { setDragId(p.id); e.dataTransfer.setData("text/plain", p.id); }} onDragEnd={() => { setDragId(null); setDragOver(null); }} />) : <div className="col-empty">—</div>}
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
              <div className="gfoot"><span className={`chip prio-${p.prio}`}>{p.prio}</span><span className="badge">{statusOf(p.status).label}</span><DueChip p={p} /><span className="gdate">{p.prog}%</span></div>
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

function MeetView({ state, onOpen }: { state: HubState; onOpen: (id: string) => void }) {
  const list = [...state.meetings].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="wrap">
      {state.meetings.length === 0 && <div className="empty-all">Sin reuniones aún. <strong>+ Nuevo</strong> para comenzar.</div>}
      <div className="cardlist">
        {list.map(m => (
          <div key={m.id} className="gcard" onClick={() => onOpen(m.id)}>
            <div className="gt">{m.client || "Reunión"}</div>
            <div className="gsub">{m.date ? fmtDate(new Date(m.date).getTime()) : fmtDate(m.createdAt)}</div>
            <div className="gbody">{m.summary || ""}</div>
            <div className="gfoot"><span className="gdate">{fmtDate(m.createdAt)}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesView({ state, onOpen, filterCat, setFilterCat }: { state: HubState; onOpen: (id: string) => void; filterCat: string; setFilterCat: (v: string) => void }) {
  const list = state.notes.filter(n => !filterCat || n.cat === filterCat).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="wrap">
      <div className="toolbar">
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
            <div className="gfoot"><span className="gdate">{fmtDate(n.createdAt)}</span></div>
          </div>
        ))}
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
   TAB ICONS
   ============================================================ */
const TabIcons: Record<Tab, React.ReactNode> = {
  dash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  proj: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 6h18M3 12h18M3 18h12"/></svg>,
  clients: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 3.13a4 4 0 010 7.75"/><path d="M21 21v-2a4 4 0 00-3-3.87"/></svg>,
  meet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  notes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  svc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
};

/* ============================================================
   COMPONENTE PRINCIPAL
   ============================================================ */
export default function EjecutivoPage() {
  const [, setLocation] = useLocation();

  const [state, setStateRaw] = useState<HubState>(() => {
    const loaded = loadState();
    return maybeSeededTasks(maybeSeeded(migrate(loaded)));
  });
  const setState = useCallback((next: HubState) => { setStateRaw(next); saveState(next); }, []);

  const [tab, setTabRaw] = useState<Tab>(() => {
    try { const s = localStorage.getItem(LS_TAB); if (s && ["dash","proj","clients","meet","notes","svc"].includes(s)) return s as Tab; } catch { /* ignore */ }
    return "dash";
  });
  const setTab = useCallback((t: Tab) => { setTabRaw(t); try { localStorage.setItem(LS_TAB, t); } catch { /* ignore */ } }, []);
  const navigate = useCallback((t: Tab) => { setTab(t); window.scrollTo(0, 0); }, [setTab]);

  const [projView, setProjView] = useState<ProjView>("board");
  const [projSearch, setProjSearch] = useState("");
  const [projPrio, setProjPrio] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [noteCat, setNoteCat] = useState("");
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
        setConfirm({ msg: "Esto reemplazará TODOS los datos actuales por los del respaldo. ¿Continuar?", onYes: () => { setState(Object.assign(blankState(), data)); showToast("Respaldo importado"); } });
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
    { id: "svc" },
  ];
  const TAB_LABELS: Record<Tab, string> = { dash: "Dashboard", proj: "Proyectos", clients: "Clientes", meet: "Reuniones", notes: "Notas", svc: "Servicios" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "hidden" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans:wght@300;400;500&family=Oswald:wght@500;600&display=swap" rel="stylesheet" />

      <div className="hub-root">
        <div className="layout">
          {/* ---- MAIN ---- */}
          <div className="main">
            <div className="topbar">
              <div className="ptitle"><span>{tt}</span><small>{tsub}</small></div>
              <GlobalSearch state={state} onOpen={openSheet} onNavigate={navigate} />
            </div>
            {tab === "dash" && <DashView state={state} onOpenProject={id => openSheet({ kind: "proj", id })} onNavigate={navigate} />}
            {tab === "proj" && <ProjView state={state} onSave={setState} onOpenProject={id => openSheet({ kind: "proj", id })} onOpenTask={id => openSheet({ kind: "task", id })} onToast={showToast} projView={projView} setProjView={setProjView} searchQ={projSearch} setSearchQ={setProjSearch} filterPrio={projPrio} setFilterPrio={setProjPrio} />}
            {tab === "clients" && <ClientsView state={state} onOpen={id => openSheet({ kind: "client", id })} searchQ={clientSearch} setSearchQ={setClientSearch} />}
            {tab === "meet" && <MeetView state={state} onOpen={id => openSheet({ kind: "meet", id })} />}
            {tab === "notes" && <NotesView state={state} onOpen={id => openSheet({ kind: "note", id })} filterCat={noteCat} setFilterCat={setNoteCat} />}
            {tab === "svc" && <SvcView />}
          </div>

          {/* ---- SIDENAV ---- */}
          <aside className="sidenav">
            <div className="side-brand">
              <div className="logo"><img src="/icon-192.png" alt="WebMaker" onError={e => { (e.target as HTMLImageElement).style.display="none"; }} /></div>
              <div className="brand">WebMaker<small>Hub Ejecutivo · Latam</small></div>
            </div>
            <button className="side-new" onClick={handleNew}>+ Nuevo</button>
            <nav className="tabs">
              {TABS.map(({ id, cnt }) => (
                <button key={id} className={tab === id ? "on" : ""} onClick={() => navigate(id)}>
                  {TabIcons[id]}<span className="tl">{TAB_LABELS[id]}</span>
                  {cnt !== undefined && <span className="cnt">{cnt}</span>}
                </button>
              ))}
            </nav>
            <div className="side-foot">
              <button className="side-act" onClick={handleExport}>↓ Exportar</button>
              <button className="side-act" onClick={() => importRef.current?.click()}>↑ Importar</button>
              <input ref={importRef} type="file" accept=".json" style={{ display:"none" }} onChange={handleImportFile} />
            </div>
          </aside>
        </div>

        {/* ---- SHEET ---- */}
        {sheet && <>
          <div className="overlay" onClick={() => setSheet(null)} />
          <div className="sheet">
            <SheetContent sheet={sheet} state={state} onClose={() => setSheet(null)} onSave={setState} onToast={showToast} onNavigate={navigate} />
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

      {/* ---- BACK BUTTON ---- */}
      <button onClick={() => setLocation("/")} title="Volver al panel" className="back-btn">
        <img src="/icon-192.png" alt="" style={{ width:20, height:20, borderRadius:5, flexShrink:0 }} />
        <ChevronRight style={{ width:14, height:14, transform:"rotate(180deg)", opacity:0.5, flexShrink:0 }} />
        <span>Panel Admin</span>
      </button>
    </div>
  );
}
