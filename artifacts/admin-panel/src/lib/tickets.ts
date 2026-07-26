import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TicketArea } from "@workspace/roles";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export const TICKET_STATUSES = ["abierto", "en_progreso", "en_revision", "resuelto", "cerrado"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["crítica", "alta", "media", "baja"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const STATUS_META: Record<TicketStatus, { label: string; className: string }> = {
  abierto: { label: "Abierto", className: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  en_progreso: { label: "En progreso", className: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  en_revision: { label: "En revisión", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  resuelto: { label: "Resuelto", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  cerrado: { label: "Cerrado", className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
};

export const PRIORITY_META: Record<TicketPriority, { label: string; className: string }> = {
  "crítica": { label: "Crítica", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  alta: { label: "Alta", className: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  media: { label: "Media", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  baja: { label: "Baja", className: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
};

export interface TicketPerson { id: number; name: string | null; email: string; picture: string | null }

export interface Ticket {
  id: number;
  title: string;
  description: string;
  area: TicketArea;
  status: TicketStatus;
  priority: TicketPriority;
  createdBy: number;
  assignedTo: number | null;
  dueDate: string;
  projectId: string;
  contractId: string;
  taskId: string;
  clientName: string;
  videoId: number | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creator: TicketPerson | null;
  assignee: TicketPerson | null;
  commentCount: number;
}

export interface TicketsResponse {
  tickets: Ticket[];
  myAreas: TicketArea[];
  canConvertToTask: boolean;
  areas: TicketArea[];
}

export interface TicketComment {
  id: number;
  body: string;
  createdAt: string;
  userId: number;
  authorName: string | null;
  authorEmail: string | null;
  authorPicture: string | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}) as { error?: string });
    throw new Error((e as { error?: string }).error || "Error de conexión");
  }
  return r.json() as Promise<T>;
}

export function useTickets(includeClosed = false) {
  return useQuery<TicketsResponse>({
    queryKey: ["tickets", includeClosed],
    queryFn: () => api<TicketsResponse>(`/tickets${includeClosed ? "?includeClosed=1" : ""}`),
    // El tablero es compartido: refrescamos para ver lo que pide el resto.
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

export function useTicketComments(ticketId: number | null) {
  return useQuery<TicketComment[]>({
    queryKey: ["ticket-comments", ticketId],
    queryFn: () => api<TicketComment[]>(`/tickets/${ticketId}/comments`),
    enabled: ticketId !== null,
  });
}

/** Invalidamos tickets y comentarios: cualquier cambio afecta ambas vistas. */
function useTicketInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["tickets"] });
    void qc.invalidateQueries({ queryKey: ["ticket-comments"] });
  };
}

export interface NewTicket {
  title: string;
  description: string;
  area: TicketArea;
  priority: TicketPriority;
  dueDate?: string;
  projectId?: string;
  contractId?: string;
  clientName?: string;
  assignedTo?: number | null;
}

export function useCreateTicket() {
  const invalidate = useTicketInvalidation();
  return useMutation({
    mutationFn: (t: NewTicket) => api<Ticket>("/tickets", { method: "POST", body: JSON.stringify(t) }),
    onSuccess: invalidate,
  });
}

export function useUpdateTicket() {
  const invalidate = useTicketInvalidation();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<Ticket> & { id: number }) =>
      api<Ticket>(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: invalidate,
  });
}

export function useCommentTicket() {
  const invalidate = useTicketInvalidation();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) =>
      api<TicketComment>(`/tickets/${id}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: invalidate,
  });
}

/** Convierte el ticket en tarea del Scrumban del tablero compartido. */
export function useTicketToTask() {
  const invalidate = useTicketInvalidation();
  return useMutation({
    mutationFn: (id: number) => api<{ ticket: Ticket }>(`/tickets/${id}/to-task`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export const fmtWhen = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
};
