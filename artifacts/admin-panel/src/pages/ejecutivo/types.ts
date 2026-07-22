/* ============================================================
   HUB EJECUTIVO — TIPOS (contrato /api/hub/*, ids numéricos)
   ============================================================ */

export type Prio = "alta" | "media" | "baja";
export type ProjStatus = "lead" | "disc" | "dev" | "rev" | "done";
/** Etapas finas del scrumban (UI, se guardan en extra.stage). */
export type TaskStage = "backlog" | "sprint" | "doing" | "qa_sent" | "qa_rev" | "done";
/** Estado canónico de tarea en el servidor. */
export type TaskStatus = "por_hacer" | "en_progreso" | "en_revision" | "hecho";
export type NoteScope = "team" | "personal";
export type ContractStatus = "borrador" | "activo" | "vencido" | "cancelado";
export type QuoteStatus = "borrador" | "enviado" | "aceptado" | "rechazado";

/** Tabs — coinciden con el query param ?tab= de la URL (los push llegan con estos valores). */
export type Tab =
  | "dashboard" | "proyectos" | "tareas" | "clientes" | "reuniones"
  | "notas" | "contratos" | "presupuestos" | "servicios" | "drive";
export type ProjView = "board" | "list";

export type Extra = Record<string, unknown>;

/* ---- Filas del servidor ---- */
export interface HubRowBase {
  id: number;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  extra: Extra | null;
}

export interface MemberRow {
  id: number;
  name: string | null;
  email: string;
  picture: string | null;
  role: string;
}

export interface ClientRow extends HubRowBase {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export interface ProjectRow extends HubRowBase {
  name: string;
  clientId: number | null;
  status: string | null;
  stage: string | null;
  priority: string | null;
  progress: number | null;
  dueDate: string | null;
  description: string | null;
}

export interface TaskRow extends HubRowBase {
  title: string;
  description: string | null;
  projectId: number | null;
  status: string | null;
  priority: string | null;
  dueDate: string | null;
  assigneeIds: number[] | null;
}

export interface MeetingRow extends HubRowBase {
  title: string;
  clientId: number | null;
  date: string | null;
  summary: string | null;
  notes: string | null;
  followUp: string | null;
  reminderSentAt: string | null;
}

/** hub_notes no lleva columna extra en el contrato. */
export interface NoteRow {
  id: number;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  title: string | null;
  content: string;
  scope: NoteScope;
  pinned: boolean;
}

export interface ContractRow extends HubRowBase {
  title: string;
  clientId: number | null;
  clientName: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  expiryRemindedAt: string | null;
  driveFileId: string | null;
  body: string | null;
}

export interface QuoteItem { descripcion: string; cantidad: number; precioUnitario: number; }

export interface QuoteRow extends HubRowBase {
  title: string;
  clientId: number | null;
  clientName: string | null;
  status: string | null;
  currency: string | null;
  items: QuoteItem[] | null;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  total: number | null;
  validityDays: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  wizData: WizData | null;
  contractId: number | null;
}

export interface HubOverview {
  counts: {
    projects: number;
    clients: number;
    tasksOpen: number;
    meetingsUpcoming: number;
    contractsActive: number;
    quotesOpen: number;
  };
  upcomingMeetings: unknown[];
  dueTasks: unknown[];
  expiringContracts: unknown[];
}

/* ---- Wizard de cotización ---- */
export interface WizModule { id: string; name: string; desc: string; price: number; }
export interface WizData {
  client: string;
  project: string;
  scope: string;
  date: string;
  advisor: string;
  modules: WizModule[];
  downPct: number;
  notes: string;
  monthly: string;
  monthlyPrice: string;
  validityDays: number;
}
export const emptyWiz = (): WizData => ({
  client: "", project: "", scope: "", date: new Date().toISOString().slice(0, 10), advisor: "",
  modules: [{ id: Math.random().toString(36).slice(2), name: "", desc: "", price: 0 }],
  downPct: 50, notes: "", monthly: "", monthlyPrice: "", validityDays: 15,
});

/* ---- Sheets ---- */
export type SheetKind =
  | null
  | { kind: "new-proj" } | { kind: "proj"; id: number }
  | { kind: "new-task" } | { kind: "task"; id: number }
  | { kind: "new-client" } | { kind: "client"; id: number }
  | { kind: "new-meet" } | { kind: "meet"; id: number }
  | { kind: "new-note" } | { kind: "note"; id: number }
  | { kind: "new-contract-mode" } | { kind: "new-contract" } | { kind: "new-contract-meeting" } | { kind: "contract"; id: number }
  | { kind: "quote-wizard"; id?: number }
  | { kind: "quote"; id: number };

export interface PdfData { url: string; title: string; uploadedAt: number; }
