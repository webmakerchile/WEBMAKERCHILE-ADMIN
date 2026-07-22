import { PRIO_W, STATUS, TASK_STAGES, TASK_STATUS_TO_STAGE } from "./constants";
import type { ClientRow, Extra, TaskRow, TaskStage, TaskStatus } from "./types";

/* ============================================================
   HELPERS GENERALES
   ============================================================ */

export function prioW(x: string | null | undefined) {
  return x && PRIO_W[x] !== undefined ? PRIO_W[x] : 1;
}

export function fmtDur(ms: number) {
  if (!ms || ms < 0) ms = 0;
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  const p: string[] = []; if (d) p.push(d + "d"); if (d || h) p.push(h + "h"); p.push(mm + "m"); return p.join(" ");
}

export function timerClass(ms: number) {
  return ms >= 5 * 86400000 ? "stale" : ms >= 2 * 86400000 ? "warn" : "";
}

export function isoToMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function fmtDate(input: string | number | null | undefined): string {
  const ts = typeof input === "number" ? input : isoToMs(input);
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  const ts = isoToMs(iso);
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** ISO (timestamptz) → valor para <input type="date"> en hora local. */
export function toDateInput(iso: string | null | undefined): string {
  const ts = isoToMs(iso);
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Valor de <input type="date"> → ISO (mediodía local para evitar corrimientos de día). */
export function fromDateInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → valor para <input type="datetime-local"> en hora local. */
export function toDatetimeInput(iso: string | null | undefined): string {
  const ts = isoToMs(iso);
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function fromDatetimeInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function statusOf(id: string | null | undefined) {
  return STATUS.find(s => s.id === id) || STATUS[0];
}

export function taskStageOf(id: string | null | undefined) {
  return TASK_STAGES.find(s => s.id === id) || TASK_STAGES[0];
}

export const fmtCLP = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

/** Extrae un monto entero CLP desde texto libre ("$290.000 / mes" → 290000). */
export function parseCLPAmount(text: string | null | undefined): number | null {
  if (!text) return null;
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 && n < 1e12 ? n : null;
}

/* ============================================================
   EXTRA (jsonb) — accesores tipados
   ============================================================ */

export function ex(extra: Extra | null | undefined): Extra {
  return extra && typeof extra === "object" ? extra : {};
}

export function exStr(extra: Extra | null | undefined, k: string): string {
  const v = ex(extra)[k];
  return typeof v === "string" ? v : "";
}

export function exNum(extra: Extra | null | undefined, k: string): number | null {
  const v = ex(extra)[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function exRec(extra: Extra | null | undefined, k: string): Record<string, number> {
  const v = ex(extra)[k];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out: Record<string, number> = {};
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "number" && Number.isFinite(val)) out[key] = val;
    }
    return out;
  }
  return {};
}

/* ============================================================
   TIMERS DE ETAPA (viven en extra.stageSince / extra.stageTime)
   ============================================================ */

export function stageSinceMs(extra: Extra | null | undefined, fallbackIso?: string | null): number {
  const n = exNum(extra, "stageSince");
  if (n != null) return n;
  const t = isoToMs(fallbackIso);
  return t || Date.now();
}

/** Cierra el contador de la etapa actual y arranca el de la nueva. Devuelve el extra actualizado. */
export function advanceStageExtra(extra: Extra | null | undefined, currentStage: string): Extra {
  const now = Date.now();
  const base = ex(extra);
  const time = { ...exRec(base, "stageTime") };
  const since = exNum(base, "stageSince") ?? now;
  time[currentStage] = (time[currentStage] || 0) + Math.max(0, now - since);
  return { ...base, stageTime: time, stageSince: now };
}

/* ============================================================
   TAREAS — etapa fina vs estado canónico
   ============================================================ */

const TASK_STAGE_IDS: readonly string[] = TASK_STAGES.map(s => s.id);

export function taskStageFromRow(t: TaskRow): TaskStage {
  const fine = exStr(t.extra, "stage");
  if (TASK_STAGE_IDS.includes(fine)) return fine as TaskStage;
  const st = (t.status || "por_hacer") as TaskStatus;
  return TASK_STATUS_TO_STAGE[st] ?? "backlog";
}

/* ============================================================
   FECHAS LÍMITE
   ============================================================ */

export interface DueInfo { days: number; label: string; cls: string; }

export function dueInfoIso(iso: string | null | undefined): DueInfo | null {
  const ts = isoToMs(iso);
  if (!ts) return null;
  const end = new Date(ts); end.setHours(23, 59, 59, 999);
  const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
  return { days, label: fmtDate(ts), cls: days < 0 ? "overdue" : days <= 7 ? "soon" : "" };
}

export function isExpired(iso: string | null | undefined): boolean {
  const ts = isoToMs(iso);
  if (!ts) return false;
  const end = new Date(ts); end.setHours(23, 59, 59, 999);
  return end.getTime() < Date.now();
}

/* ============================================================
   CLIENTES
   ============================================================ */

export function clientNameOf(clients: ClientRow[], id: number | null | undefined): string {
  if (id == null) return "";
  return clients.find(c => c.id === id)?.name ?? "";
}

/** Resuelve clientId por nombre exacto (case-insensitive) — para textos libres/IA. */
export function resolveClientId(clients: ClientRow[], name: string): number | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  return clients.find(c => c.name.trim().toLowerCase() === q)?.id ?? null;
}

/* ============================================================
   DRIVE
   ============================================================ */

export function extractDriveFolderId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** Limpia todas las claves del Hub en localStorage (preferencias) al cerrar sesión. */
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
