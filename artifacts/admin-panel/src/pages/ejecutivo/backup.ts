import { apiPost } from "./api";
import { STATUS, TASK_STAGE_TO_STATUS } from "./constants";
import { fromDateInput, parseCLPAmount } from "./lib";
import type {
  ClientRow, ContractRow, MeetingRow, NoteRow, ProjectRow, QuoteRow, TaskRow, TaskStage,
} from "./types";

/* ============================================================
   RESPALDO — export JSON del servidor e import vía POST
   ============================================================ */

export interface HubExport {
  version: 2;
  exportedAt: string;
  clients: ClientRow[];
  projects: ProjectRow[];
  tasks: TaskRow[];
  meetings: MeetingRow[];
  notes: NoteRow[];
  contracts: ContractRow[];
  quotes: QuoteRow[];
}

export function buildExport(data: Omit<HubExport, "version" | "exportedAt">): HubExport {
  return { version: 2, exportedAt: new Date().toISOString(), ...data };
}

/* ---- helpers de normalización (acepta shape nuevo y respaldos legacy) ---- */

type Row = Record<string, unknown>;

function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function num(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function rec(v: unknown): Record<string, unknown> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; }

/** "YYYY-MM-DD" (legacy) o ISO → ISO; cualquier otra cosa → null. */
function toIso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return fromDateInput(s);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const TASK_STAGE_IDS = Object.keys(TASK_STAGE_TO_STATUS);
const PROJ_STATUS_IDS = STATUS.map(s => s.id);

export interface ImportSummary {
  created: Record<string, number>;
  failed: number;
}

/**
 * Importa un respaldo JSON creando entidades vía POST secuenciales.
 * Remapea clientId/projectId antiguos a los nuevos ids del servidor
 * (por id exportado en respaldos nuevos, por nombre en respaldos legacy).
 */
export async function importHubJson(raw: unknown, existingClients: ClientRow[]): Promise<ImportSummary> {
  const obj = rec(raw);
  const arr = (k: string): Row[] => Array.isArray(obj[k]) ? (obj[k] as unknown[]).filter((x): x is Row => !!x && typeof x === "object") : [];

  const created: Record<string, number> = { clientes: 0, proyectos: 0, tareas: 0, reuniones: 0, notas: 0, contratos: 0, presupuestos: 0 };
  let failed = 0;

  const clientIdMap = new Map<number, number>();
  const clientNameMap = new Map<string, number>();
  existingClients.forEach(c => { clientNameMap.set(c.name.trim().toLowerCase(), c.id); });

  const resolveClient = (row: Row): number | null => {
    const oldId = num(row.clientId);
    if (oldId != null && clientIdMap.has(oldId)) return clientIdMap.get(oldId)!;
    const byName = str(row.client) || str(row.clientName);
    if (byName) return clientNameMap.get(byName.trim().toLowerCase()) ?? null;
    return null;
  };

  /* clientes primero (los demás referencian) */
  for (const c of arr("clients")) {
    const name = str(c.name).trim();
    if (!name) { failed++; continue; }
    const legacyExtra: Record<string, unknown> = {};
    if (str(c.contact)) legacyExtra.contact = str(c.contact);
    if (str(c.segment)) legacyExtra.segment = str(c.segment);
    try {
      const row = await apiPost<ClientRow>("/hub/clients", {
        name,
        company: str(c.company) || null,
        email: str(c.email) || null,
        phone: str(c.phone) || null,
        notes: str(c.notes) || null,
        extra: { ...rec(c.extra), ...legacyExtra },
      });
      created.clientes++;
      const oldId = num(c.id);
      if (oldId != null) clientIdMap.set(oldId, row.id);
      if (!clientNameMap.has(name.toLowerCase())) clientNameMap.set(name.toLowerCase(), row.id);
    } catch { failed++; }
  }

  /* proyectos (guardando el mapa de ids para tareas) */
  const projectIdMap = new Map<number, number>();
  for (const p of arr("projects")) {
    const name = str(p.name).trim();
    if (!name) { failed++; continue; }
    const status = PROJ_STATUS_IDS.includes(str(p.status)) ? str(p.status) : "lead";
    const legacyExtra: Record<string, unknown> = {};
    if (str(p.type)) legacyExtra.type = str(p.type);
    if (str(p.owner)) legacyExtra.owner = str(p.owner);
    if (str(p.link)) legacyExtra.link = str(p.link);
    if (num(p.stageSince) != null) legacyExtra.stageSince = num(p.stageSince);
    if (p.stageTime && typeof p.stageTime === "object") legacyExtra.stageTime = p.stageTime;
    try {
      const row = await apiPost<ProjectRow>("/hub/projects", {
        name,
        clientId: resolveClient(p),
        status,
        priority: str(p.prio) || str(p.priority) || "media",
        progress: num(p.prog) ?? num(p.progress) ?? 0,
        dueDate: toIso(p.dueDate) ?? toIso(p.due),
        description: str(p.description) || str(p.notes) || null,
        extra: { ...rec(p.extra), ...legacyExtra },
      });
      created.proyectos++;
      const oldId = num(p.id);
      if (oldId != null) projectIdMap.set(oldId, row.id);
    } catch { failed++; }
  }

  /* tareas */
  for (const t of arr("tasks")) {
    const title = str(t.title).trim();
    if (!title) { failed++; continue; }
    const legacyStage = TASK_STAGE_IDS.includes(str(t.stage)) ? str(t.stage) as TaskStage : null;
    const status = legacyStage
      ? TASK_STAGE_TO_STATUS[legacyStage]
      : (["por_hacer", "en_progreso", "en_revision", "hecho"].includes(str(t.status)) ? str(t.status) : "por_hacer");
    const oldProjId = num(t.projectId);
    const legacyExtra: Record<string, unknown> = {};
    if (legacyStage) legacyExtra.stage = legacyStage;
    if (num(t.stageSince) != null) legacyExtra.stageSince = num(t.stageSince);
    if (t.stageTime && typeof t.stageTime === "object") legacyExtra.stageTime = t.stageTime;
    try {
      await apiPost<TaskRow>("/hub/tasks", {
        title,
        description: str(t.description) || str(t.notes) || null,
        projectId: oldProjId != null ? (projectIdMap.get(oldProjId) ?? null) : null,
        status,
        priority: str(t.crit) || str(t.priority) || "media",
        dueDate: toIso(t.dueDate),
        assigneeIds: Array.isArray(t.assigneeIds) ? (t.assigneeIds as unknown[]).filter((x): x is number => typeof x === "number") : [],
        extra: { ...rec(t.extra), ...legacyExtra },
      });
      created.tareas++;
    } catch { failed++; }
  }

  /* reuniones */
  for (const m of arr("meetings")) {
    const legacyClient = str(m.client).trim();
    const title = str(m.title).trim() || (legacyClient ? `Reunión — ${legacyClient}` : "Reunión");
    try {
      await apiPost<MeetingRow>("/hub/meetings", {
        title,
        clientId: resolveClient(m),
        date: toIso(m.date),
        summary: str(m.summary) || null,
        notes: str(m.notes) || null,
        followUp: str(m.followUp) || null,
        extra: rec(m.extra),
      });
      created.reuniones++;
    } catch { failed++; }
  }

  /* notas */
  for (const n of arr("notes")) {
    const content = str(n.content) || str(n.body);
    const title = str(n.title).trim();
    if (!title && !content) { failed++; continue; }
    try {
      await apiPost<NoteRow>("/hub/notes", {
        title: title || null,
        content,
        scope: n.scope === "personal" ? "personal" : "team",
        pinned: n.pinned === true,
      });
      created.notas++;
    } catch { failed++; }
  }

  /* contratos */
  for (const c of arr("contracts")) {
    const title = str(c.title).trim();
    if (!title) { failed++; continue; }
    const valueText = str(c.value);
    const legacyExtra: Record<string, unknown> = {};
    if (valueText) legacyExtra.valueText = valueText;
    if (str(c.pdfUrl)) legacyExtra.pdfUrl = str(c.pdfUrl);
    if (str(c.pdfTitle)) legacyExtra.pdfTitle = str(c.pdfTitle);
    if (num(c.pdfUploadedAt) != null) legacyExtra.pdfUploadedAt = num(c.pdfUploadedAt);
    try {
      await apiPost<ContractRow>("/hub/contracts", {
        title,
        clientName: str(c.clientName) || str(c.client) || null,
        clientId: resolveClient(c),
        status: str(c.status) || "borrador",
        amount: num(c.amount) ?? parseCLPAmount(valueText),
        currency: str(c.currency) || "CLP",
        issuedAt: toIso(c.issuedAt) ?? toIso(c.signedAt),
        expiresAt: toIso(c.expiresAt),
        driveFileId: str(c.driveFileId) || null,
        body: str(c.body) || str(c.notes) || null,
        extra: { ...rec(c.extra), ...legacyExtra },
      });
      created.contratos++;
    } catch { failed++; }
  }

  /* presupuestos */
  for (const q of arr("quotes")) {
    const title = str(q.title).trim();
    if (!title) { failed++; continue; }
    try {
      await apiPost<QuoteRow>("/hub/quotes", {
        title,
        clientName: str(q.clientName) || null,
        clientId: resolveClient(q),
        status: ["borrador", "enviado", "aceptado", "rechazado"].includes(str(q.status)) ? str(q.status) : "borrador",
        currency: str(q.currency) || "CLP",
        items: Array.isArray(q.items) ? q.items : [],
        subtotal: num(q.subtotal) ?? 0,
        discount: num(q.discount) ?? 0,
        tax: num(q.tax) ?? 0,
        total: num(q.total) ?? 0,
        validityDays: num(q.validityDays) ?? 15,
        issuedAt: toIso(q.issuedAt),
        expiresAt: toIso(q.expiresAt),
        notes: str(q.notes) || null,
        wizData: q.wizData && typeof q.wizData === "object" ? q.wizData : null,
        extra: rec(q.extra),
      });
      created.presupuestos++;
    } catch { failed++; }
  }

  return { created, failed };
}

export function summarizeImport(s: ImportSummary): string {
  const parts = Object.entries(s.created).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`);
  const base = parts.length ? `Importado: ${parts.join(" · ")}` : "No se importó ningún elemento";
  return s.failed > 0 ? `${base} · ${s.failed} con error` : base;
}
