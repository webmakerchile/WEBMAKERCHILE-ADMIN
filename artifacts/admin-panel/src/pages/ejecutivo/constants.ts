import type { ContractStatus, QuoteStatus, Tab, TaskStage, TaskStatus } from "./types";

/* ============================================================
   CONSTANTES DEL HUB
   ============================================================ */

/** localStorage: solo preferencia de UI (tab activa). El estado vive en el servidor. */
export const LS_TAB = "wm_hub_ui_tab_v2";

export const HUB_DRIVE_ROOT = "15cBDWdrC2IIN6OlD4rP0fBCImGOh39--";

export const STATUS = [
  { id: "lead", label: "Lead", color: "var(--lead)" },
  { id: "disc", label: "Discovery", color: "var(--disc)" },
  { id: "dev", label: "Desarrollo", color: "var(--dev)" },
  { id: "rev", label: "Revisión", color: "var(--rev)" },
  { id: "done", label: "Entregado", color: "var(--done)" },
];

export const TASK_STAGES = [
  { id: "backlog", label: "Backlog", color: "var(--faint)" },
  { id: "sprint", label: "Sprint Backlog", color: "var(--lead)" },
  { id: "doing", label: "En desarrollo", color: "var(--dev)" },
  { id: "qa_sent", label: "QA (Enviada)", color: "var(--disc)" },
  { id: "qa_rev", label: "QA (Revisada)", color: "var(--rev)" },
  { id: "done", label: "Lista", color: "var(--done)" },
];

/** Etapa fina del scrumban → estado canónico del servidor. */
export const TASK_STAGE_TO_STATUS: Record<TaskStage, TaskStatus> = {
  backlog: "por_hacer",
  sprint: "por_hacer",
  doing: "en_progreso",
  qa_sent: "en_revision",
  qa_rev: "en_revision",
  done: "hecho",
};

/** Estado canónico → etapa fina por defecto (cuando extra.stage no existe). */
export const TASK_STATUS_TO_STAGE: Record<TaskStatus, TaskStage> = {
  por_hacer: "backlog",
  en_progreso: "doing",
  en_revision: "qa_sent",
  hecho: "done",
};

export const CRIT_COLOR: Record<string, string> = { alta: "#e0795a", media: "#c9a44a", baja: "#6aa0c0" };
export const PRIO_W: Record<string, number> = { alta: 0, media: 1, baja: 2 };

export const TAB_TITLES: Record<Tab, [string, string]> = {
  dashboard: ["Dashboard", "Resumen ejecutivo en vivo"],
  proyectos: ["Proyectos", "Kanban · Lista"],
  tareas: ["Tareas", "Scrumban del equipo"],
  clientes: ["Clientes", "Cartera y contactos"],
  reuniones: ["Reuniones", "Notas, resúmenes y seguimiento"],
  notas: ["Notas", "Ideas, acuerdos y estrategia"],
  contratos: ["Contratos", "Acuerdos, términos y vencimientos"],
  presupuestos: ["Presupuestos", "Cotizaciones y su estado"],
  servicios: ["Servicios", "Catálogo de referencia"],
  drive: ["Drive", "Explorador de archivos del proyecto"],
};

export const TAB_LABELS: Record<Tab, string> = {
  dashboard: "Dashboard", proyectos: "Proyectos", tareas: "Tareas", clientes: "Clientes",
  reuniones: "Reuniones", notas: "Notas", contratos: "Contratos", presupuestos: "Presupuestos",
  servicios: "Servicios", drive: "Drive",
};

export const CONTRACT_STATUSES: Record<ContractStatus, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "var(--faint)" },
  activo: { label: "Activo", color: "var(--done)" },
  vencido: { label: "Vencido", color: "#e0795a" },
  cancelado: { label: "Cancelado", color: "var(--disc)" },
};

export const QUOTE_STATUSES: Record<QuoteStatus, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "var(--faint)" },
  enviado: { label: "Enviado", color: "var(--lead)" },
  aceptado: { label: "Aceptado", color: "var(--done)" },
  rechazado: { label: "Rechazado", color: "#e0795a" },
};

export const CONTRACT_STATUS_IDS: readonly ContractStatus[] = ["borrador", "activo", "vencido", "cancelado"];
export function isContractStatus(v: unknown): v is ContractStatus {
  return typeof v === "string" && (CONTRACT_STATUS_IDS as readonly string[]).includes(v);
}
export const QUOTE_STATUS_IDS: readonly QuoteStatus[] = ["borrador", "enviado", "aceptado", "rechazado"];
export function isQuoteStatus(v: unknown): v is QuoteStatus {
  return typeof v === "string" && (QUOTE_STATUS_IDS as readonly string[]).includes(v);
}

export const SERVICES: Array<{ cat: string; items: Array<{ n: string; d: string; incl?: string; note?: string; t: string[][] }> }> = [
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
