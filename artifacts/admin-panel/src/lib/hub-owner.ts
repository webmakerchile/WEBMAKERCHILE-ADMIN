import { useQuery } from "@tanstack/react-query";
import type { HubScope } from "@workspace/roles";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

/* Formas mínimas del blob del Hub Ejecutivo (ver pages/ejecutivo.tsx). Los
   campos opcionales toleran tableros antiguos guardados antes de existir. */

export type ContractStatus = "borrador" | "activo" | "vencido" | "cancelado";

export interface HubModule { id?: string; name: string; desc?: string; price: number }

export interface HubDoc {
  client?: string; project?: string; scope?: string; date?: string; advisor?: string;
  modules?: HubModule[]; downPct?: number; notes?: string;
  monthly?: string; monthlyPrice?: string; validityDays?: number;
}

export interface HubBriefModule { modulo: string; descripcion: string; entregables: string[]; requisitos: string[] }

/** Versión técnica del contrato: qué construir, sin ningún dato comercial. */
export interface HubBrief {
  objetivo: string; contexto: string;
  alcance: HubBriefModule[];
  criteriosAceptacion: string[]; fueraDeAlcance: string[]; stackSugerido: string[];
  hitos: { nombre: string; detalle: string }[];
  generatedAt?: number;
}

export interface HubContract {
  id: string; title: string; client: string; value: string; status: ContractStatus;
  signedAt: string; expiresAt: string; notes: string;
  createdAt: number; updatedAt: number;
  pdfUrl?: string; pdfTitle?: string; pdfUploadedAt?: number; doc?: HubDoc;
  brief?: HubBrief; briefUrl?: string; briefTitle?: string;
  /** El servidor lo marca cuando censuró los montos para este rol. */
  moneyRedacted?: boolean;
}

export interface HubClient { id: string; name: string; contact: string; segment: string; notes: string; createdAt: number }
export interface HubMeeting { id: string; client: string; date: string; summary: string; notes: string; createdAt: number }
export interface HubProject {
  id: string; name: string; client: string; type: string; prio: string; status: string;
  owner: string; prog: number; notes: string; link: string; due?: string;
  contractId?: string; createdAt: number; updatedAt: number;
}
export interface HubTask {
  id: string; title: string; projectId: string; crit: string; stage: string;
  stageSince: number; stageTime?: Record<string, number>; notes: string;
  /** Ticket que originó esta tarea, si nació de una solicitud de otra área. */
  ticketId?: number;
  createdAt: number; updatedAt: number;
}

export interface HubOwnerData {
  contracts?: HubContract[];
  clients?: HubClient[];
  meetings?: HubMeeting[];
  projects?: HubProject[];
  tasks?: HubTask[];
  notes?: unknown[];
}

export interface HubOwnerResponse {
  data: HubOwnerData;
  owner: { name: string | null; email: string } | null;
  updatedAt: string | null;
  scopes: HubScope[];
}

/**
 * Vista de solo lectura del tablero de la dirección, recortada a lo que el rol
 * puede ver. El backend decide el recorte: aquí solo se consume.
 */
export function useHubOwner() {
  return useQuery<HubOwnerResponse>({
    queryKey: ["hub-owner"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/hub/owner`, { credentials: "include" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}) as { error?: string });
        throw new Error((e as { error?: string }).error || "No se pudo cargar la información");
      }
      return r.json();
    },
    staleTime: 60_000,
  });
}

/* ---------- helpers de formato / cálculo ---------- */

export const IVA_RATE = 0.19;

export const fmtCLP = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

/** "$1.234.567" → 1234567 (0 si no hay dígitos). */
export function parseCLP(v: string | undefined): number {
  const n = Number(String(v || "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Monto total (con IVA) de un contrato. Preferimos calcularlo desde los módulos
 * del documento — son la fuente del PDF — y caemos al campo `value` si no hay.
 */
export function contractTotal(c: HubContract): number {
  const mods = c.doc?.modules?.filter(m => (m?.name || "").trim() !== "") ?? [];
  if (mods.length > 0) {
    const neto = mods.reduce((a, m) => a + (Number(m.price) || 0), 0);
    return neto + Math.round(neto * IVA_RATE);
  }
  return parseCLP(c.value);
}

/** Neto e IVA derivados del total (los módulos se cargan netos). */
export function splitIva(total: number) {
  const neto = Math.round(total / (1 + IVA_RATE));
  return { neto, iva: total - neto };
}

export const fmtDate = (iso: string | undefined) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
};

/** Días que faltan para una fecha ISO (negativo = ya pasó). */
export function daysUntil(iso: string | undefined): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export const CONTRACT_STATUS_STYLE: Record<ContractStatus, { label: string; className: string }> = {
  borrador: { label: "Borrador", className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
  activo: { label: "Activo", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  vencido: { label: "Vencido", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  cancelado: { label: "Cancelado", className: "bg-red-500/10 text-red-400 border-red-500/20" },
};
