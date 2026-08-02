/** Formato chileno y glosario de estados del panel (siempre en español). */

export function fmtCLP(v: unknown): string {
  const n = typeof v === "string" && v !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export function fmtFecha(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function haceCuanto(v: unknown): string {
  if (!v) return "nunca";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  return `hace ${dias} día${dias === 1 ? "" : "s"}`;
}

const ESTADOS: Record<string, { label: string; color: string }> = {
  // Presupuestos
  DRAFT: { label: "Borrador", color: "#94a3b8" },
  SENT: { label: "Enviada", color: "#3b82f6" },
  VIEWED: { label: "Vista", color: "#8b5cf6" },
  APPROVED: { label: "Aprobada", color: "#22c55e" },
  REJECTED: { label: "Rechazada", color: "#ef4444" },
  EXPIRED: { label: "Vencida", color: "#f59e0b" },
  // Contratos
  PENDING_SIGNATURE: { label: "Por firmar", color: "#f59e0b" },
  SIGNED: { label: "Firmado", color: "#22c55e" },
  // Mantenimiento
  ACTIVE: { label: "Activo", color: "#22c55e" },
  PAUSED: { label: "Pausado", color: "#f59e0b" },
  CANCELLED: { label: "Cancelado", color: "#ef4444" },
  // Cuotas
  PENDING: { label: "Pendiente", color: "#f59e0b" },
  PAID: { label: "Pagada", color: "#22c55e" },
  OVERDUE: { label: "Vencida", color: "#ef4444" },
  // Proyectos / tareas
  MOCKUP: { label: "Maqueta", color: "#8b5cf6" },
  DEVELOPMENT: { label: "Desarrollo", color: "#3b82f6" },
  QA: { label: "Pruebas", color: "#f59e0b" },
  DELIVERY: { label: "Entrega", color: "#06b6d4" },
  COMPLETED: { label: "Completado", color: "#22c55e" },
  IN_PROGRESS: { label: "En curso", color: "#3b82f6" },
  DONE: { label: "Hecha", color: "#22c55e" },
  // Leads
  NEW: { label: "Nuevo", color: "#3b82f6" },
  CONTACTED: { label: "Contactado", color: "#8b5cf6" },
  CLOSED: { label: "Cerrado", color: "#94a3b8" },
};

export function estadoDe(s: unknown): { label: string; color: string } {
  const clave = String(s ?? "");
  return ESTADOS[clave] ?? { label: clave || "—", color: "#94a3b8" };
}

const TIPOS_MANT: Record<string, string> = {
  HOSTING_MANTENIMIENTO: "Hosting + mantención",
  HOSTING: "Hosting",
  MANTENIMIENTO: "Mantención",
  BUNDLE: "Bundle",
};

export function tipoMant(s: unknown): string {
  const clave = String(s ?? "");
  return TIPOS_MANT[clave] ?? clave ?? "—";
}

export const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
