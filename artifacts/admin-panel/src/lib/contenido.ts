import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

/**
 * Datos de contenido para las pantallas de área (Edición, Redes, Marketing).
 *
 * Cada pantalla arma su propia vista: aquí solo vive la lectura compartida,
 * para no repetir el mismo fetch en tres archivos y que los tres muestren lo
 * mismo cuando hablan del mismo video.
 */

export type WorkflowStatus = "borrador" | "en_revision" | "aprobado" | "programado" | "publicado";

export const WORKFLOW_META: Record<WorkflowStatus, { label: string; className: string }> = {
  borrador: { label: "Borrador", className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
  en_revision: { label: "En revisión", className: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  aprobado: { label: "Aprobado", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  programado: { label: "Programado", className: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  publicado: { label: "Publicado", className: "bg-primary/10 text-primary border-primary/20" },
};

export const NETWORKS = ["youtube", "tiktok", "instagram", "linkedin", "x", "facebook"] as const;
export type Network = (typeof NETWORKS)[number];

export const NETWORK_LABELS: Record<Network, string> = {
  youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram",
  linkedin: "LinkedIn", x: "X", facebook: "Facebook",
};

export interface ContentVideo {
  id: number;
  title: string;
  description: string | null;
  status: string;
  workflowStatus: WorkflowStatus;
  scheduledAt: string | null;
  coverImageUrl: string | null;
  videoFileDriveId: string | null;
  tiktokDescription: string | null;
  instagramDescription: string | null;
  youtubeTitle: string | null;
  linkedinDescription: string | null;
  xDescription: string | null;
  tiktokStatus: string | null;
  instagramStatus: string | null;
  youtubeStatus: string | null;
  linkedinStatus: string | null;
  xStatus: string | null;
  facebookStatus: string | null;
  updatedAt: string;
  createdAt: string;
}

export function useVideos() {
  return useQuery<ContentVideo[]>({
    queryKey: ["/api/content/videos"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/content/videos`, { credentials: "include" });
      if (!r.ok) throw new Error("No se pudieron cargar los videos");
      return r.json();
    },
    staleTime: 30_000,
  });
}

export interface AnalyticsSummary {
  totals: { views: number; engagements: number; followers: number; posts: number };
  networks: { network: string; connected: boolean; metrics?: Record<string, number> }[];
}

export function useAnalytics(days = 7) {
  return useQuery<AnalyticsSummary>({
    queryKey: ["analytics-summary", days],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/analytics/summary?days=${days}`, { credentials: "include" });
      if (!r.ok) throw new Error("No se pudieron cargar las métricas");
      return r.json();
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/* ------------------------------------------------------------------
   Escritura.

   Las tres pantallas de contenido dejaron de ser tableros de lectura: cada
   rol actúa desde la suya sin pasar por el gestor de videos. Todas las
   mutaciones invalidan la MISMA clave, así Edición, Redes y Marketing ven el
   cambio en el momento en que ocurre.
   ------------------------------------------------------------------ */

async function apiJson<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(e.error || "No se pudo guardar el cambio");
  }
  return r.json() as Promise<T>;
}

/** Invalida todo lo que depende de los videos (lista, calendario, métricas). */
function useContenidoRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["/api/content/videos"] });
    void qc.invalidateQueries({ queryKey: ["reviews-pending"] });
    void qc.invalidateQueries({ queryKey: ["analytics-summary"] });
  };
}

/** Campos que las pantallas de área pueden escribir sobre un video. */
export interface VideoPatch {
  title?: string;
  description?: string | null;
  workflowStatus?: WorkflowStatus;
  status?: string;
  scheduledAt?: string | null;
  youtubeTitle?: string | null;
  tiktokDescription?: string | null;
  instagramDescription?: string | null;
  linkedinDescription?: string | null;
  xDescription?: string | null;
  tiktokStatus?: string | null;
  instagramStatus?: string | null;
  youtubeStatus?: string | null;
  linkedinStatus?: string | null;
  xStatus?: string | null;
  facebookStatus?: string | null;
}

export function usePatchVideo() {
  const refresh = useContenidoRefresh();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: VideoPatch }) =>
      apiJson<ContentVideo>(`/content/videos/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: refresh,
  });
}

export function useCreateVideo() {
  const refresh = useContenidoRefresh();
  return useMutation({
    // `description` es obligatorio en el esquema de creación: se manda vacío
    // cuando solo hay título, que es como nace un video en la mesa de edición.
    mutationFn: (body: { title: string; description?: string }) =>
      apiJson<ContentVideo>("/content/videos", {
        method: "POST",
        body: JSON.stringify({ description: "", ...body }),
      }),
    onSuccess: refresh,
  });
}

/** Pide revisión de un video: lo deja "en revisión" y avisa al revisor. */
export function useRequestReview() {
  const refresh = useContenidoRefresh();
  return useMutation({
    mutationFn: ({ videoId, assignedTo, message }: { videoId: number; assignedTo: number; message?: string }) =>
      apiJson<{ id: number }>(`/content/videos/${videoId}/reviews`, {
        method: "POST",
        body: JSON.stringify({ assignedTo, message: message || null }),
      }),
    onSuccess: refresh,
  });
}

/** Aprueba o pide cambios. Aprobar deja el video listo para programar. */
export function useReviewDecision() {
  const refresh = useContenidoRefresh();
  return useMutation({
    mutationFn: ({ videoId, decision, message }: { videoId: number; decision: "approve" | "request_changes"; message?: string }) =>
      apiJson<{ ok: boolean; workflowStatus: WorkflowStatus }>(`/content/videos/${videoId}/reviews/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, message: message || null }),
      }),
    onSuccess: refresh,
  });
}

export interface TeamMemberLite {
  id: number;
  name: string | null;
  email: string;
  teamRole: string;
  approvalStatus: string;
}

/** Equipo aprobado, para elegir a quién se le pide la revisión. */
export function useTeamMembers() {
  return useQuery<TeamMemberLite[]>({
    queryKey: ["team-members"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/team/members`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
}

/** Cuántas piezas le faltan a un video para poder programarse. */
export function missingPieces(v: ContentVideo): string[] {
  const faltan: string[] = [];
  if (!v.coverImageUrl) faltan.push("portada");
  if (!v.videoFileDriveId) faltan.push("archivo de video");
  if (!v.tiktokDescription && !v.instagramDescription) faltan.push("descripción TikTok/Instagram");
  if (!v.youtubeTitle) faltan.push("título de YouTube");
  return faltan;
}

/** Redes donde este video ya quedó publicado. */
export function publishedNetworks(v: ContentVideo): Network[] {
  const estado: Record<Network, string | null> = {
    youtube: v.youtubeStatus, tiktok: v.tiktokStatus, instagram: v.instagramStatus,
    linkedin: v.linkedinStatus, x: v.xStatus, facebook: v.facebookStatus,
  };
  return NETWORKS.filter(n => estado[n] === "published" || estado[n] === "uploaded");
}

export const fmtFecha = (iso: string | null) => {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "sin fecha";
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

export const fmtNumero = (n: number) => new Intl.NumberFormat("es-CL", { notation: n >= 10_000 ? "compact" : "standard" }).format(n || 0);
