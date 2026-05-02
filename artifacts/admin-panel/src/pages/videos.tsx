import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { Virtuoso } from "react-virtuoso";
import { Layout } from "@/components/layout";
import { VideoListSkeleton } from "@/components/skeletons";
import { PreviewPanel, TruncatedTextarea, type PreviewContent } from "@/components/network-previews";
import {
  LibraryControls,
  TemplateAndCampaignSelector,
  fillTemplateVariables,
  type Campaign as LibraryCampaign,
  type Template as LibraryTemplate,
} from "@/components/library-controls";
import type { Network } from "@/components/social-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video,
  Plus,
  Trash2,
  Folder,
  Image as ImageIcon,
  Loader2,
  Check,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  X,
  Copy,
  Clock,
  CalendarClock,
  Send,
  AlertCircle,
  Upload,
  HardDrive,
  FileVideo,
  FolderOpen,
  CheckCircle2,
  BarChart2,
  Eye,
  ThumbsUp,
  MessageSquare,
  Share2,
  Repeat2,
  MousePointerClick,
  Search,
  Bookmark,
  BookmarkPlus,
  Filter as FilterIcon,
  CircleSlash2,
  ShieldCheck,
  AtSign,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, credentials: "include" });
}

type VideoData = {
  id: number;
  title: string;
  description: string;
  coverPrompt?: string | null;
  coverImageBase64?: string | null;
  coverMimeType?: string | null;
  videoFileDriveId?: string | null;
  videoFileName?: string | null;
  driveFileId?: string | null;
  driveFolderId?: string | null;
  status: string;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  month?: string | null;
  week?: string | null;
  day?: string | null;
  videoNumber?: string | null;
  scheduleHour?: string | null;
  tiktokDescription?: string | null;
  instagramDescription?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  linkedinDescription?: string | null;
  xDescription?: string | null;
  facebookDescription?: string | null;
  tiktokPublishId?: string | null;
  tiktokStatus?: string | null;
  instagramMediaId?: string | null;
  instagramStatus?: string | null;
  youtubeVideoId?: string | null;
  youtubeStatus?: string | null;
  linkedinPostId?: string | null;
  linkedinStatus?: string | null;
  linkedinError?: string | null;
  xPostId?: string | null;
  xStatus?: string | null;
  xError?: string | null;
  facebookPostId?: string | null;
  facebookStatus?: string | null;
  facebookError?: string | null;
  campaignId?: number | null;
  templateId?: number | null;
  workflowStatus?: string | null;
  createdAt: string;
  updatedAt: string;
};

type TeamMember = {
  id: number;
  name: string;
  email: string;
  teamRole: string;
};

type VideoComment = {
  id: number;
  videoId: number;
  authorId: number;
  authorName: string | null;
  authorEmail: string | null;
  body: string;
  createdAt: string;
};

type VideoReview = {
  id: number;
  videoId: number;
  requesterId: number;
  requesterName: string | null;
  reviewerId: number;
  reviewerName: string | null;
  reviewerEmail: string | null;
  status: string;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

type WizardStep = "info" | "cover" | "tiktok-instagram" | "youtube" | "linkedin-x" | "review" | "comments";

const STEPS: { key: WizardStep; label: string; shortLabel: string }[] = [
  { key: "info", label: "Información Básica", shortLabel: "Info" },
  { key: "cover", label: "Portada", shortLabel: "Portada" },
  { key: "tiktok-instagram", label: "TikTok e Instagram", shortLabel: "TikTok/IG" },
  { key: "youtube", label: "YouTube", shortLabel: "YouTube" },
  { key: "linkedin-x", label: "LinkedIn y X", shortLabel: "LinkedIn/X" },
  { key: "review", label: "Revisar y Programar", shortLabel: "Programar" },
  { key: "comments", label: "Comentarios y Aprobación", shortLabel: "Comentarios" },
];

function isStepComplete(video: VideoData | null, step: WizardStep): boolean {
  if (!video) return false;
  switch (step) {
    case "info":
      return !!video.title && !!video.description;
    case "cover":
      return !!video.coverImageBase64;
    case "tiktok-instagram":
      return !!video.tiktokDescription && !!video.instagramDescription;
    case "youtube":
      return !!video.youtubeTitle && !!video.youtubeDescription;
    case "linkedin-x":
      return !!video.linkedinDescription && !!video.xDescription;
    case "review":
      return video.status === "scheduled" || video.status === "published";
    case "comments":
      // Comments tab is informational and doesn't gate completeness.
      return true;
    default:
      return false;
  }
}

function getVideoProgress(video: VideoData): number {
  let done = 0;
  if (video.title && video.description) done++;
  if (video.coverImageBase64) done++;
  if (video.tiktokDescription && video.instagramDescription) done++;
  if (video.youtubeTitle && video.youtubeDescription) done++;
  if (video.linkedinDescription && video.xDescription) done++;
  if (video.status === "scheduled" || video.status === "published") done++;
  return Math.round((done / 6) * 100);
}

function getStatusBadge(video: VideoData) {
  const progress = getVideoProgress(video);
  if (video.status === "published") return { label: "Publicado", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  if (video.status === "partial") return { label: "Parcial", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  if (video.status === "error") return { label: "Error", className: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
  if (video.status === "scheduled") return { label: "Programado", className: "bg-orange-500/10 text-orange-400 border-orange-500/20" };
  if (progress === 100) return { label: "Listo", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
  if (progress > 0) return { label: `${progress}% completo`, className: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
  return { label: "Borrador", className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" };
}

type SavedView = {
  id: number;
  userId: number;
  name: string;
  filters: { q?: string; status?: string; network?: string; month?: string };
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos los estados" },
  { value: "draft", label: "Borrador" },
  { value: "cover_generated", label: "Portada lista" },
  { value: "scheduled", label: "Programado" },
  { value: "published", label: "Publicado" },
  { value: "partial", label: "Parcial" },
  { value: "error", label: "Con error" },
];

const NETWORK_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todas las redes" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X / Twitter" },
  { value: "facebook", label: "Facebook" },
];

// A video "belongs to" a network if it has a description prepared OR has been
// posted to it (postId/mediaId/videoId). This matches how the editor signals
// network-readiness across the app.
function videoMatchesNetwork(v: VideoData, net: string): boolean {
  switch (net) {
    case "youtube":
      return !!(v.youtubeTitle || v.youtubeDescription || v.youtubeVideoId);
    case "instagram":
      return !!(v.instagramDescription || v.instagramMediaId);
    case "tiktok":
      return !!(v.tiktokDescription || v.tiktokPublishId);
    case "linkedin":
      return !!(v.linkedinDescription || v.linkedinPostId);
    case "x":
      return !!(v.xDescription || v.xPostId);
    case "facebook":
      return !!(v.facebookDescription || v.facebookPostId);
    default:
      return true;
  }
}

export default function VideosPage() {
  const [selectedVideo, setSelectedVideo] = useState<VideoData | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("info");
  const [statsVideo, setStatsVideo] = useState<VideoData | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [networkFilter, setNetworkFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [savingView, setSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [bulkMonth, setBulkMonth] = useState("");
  const [bulkScheduleAt, setBulkScheduleAt] = useState("");
  const [generatingDescriptions, setGeneratingDescriptions] = useState(false);
  const [pendingReviewsActive, setPendingReviewsActive] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: videos = [], isLoading } = useQuery<VideoData[]>({
    queryKey: ["videos"],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/content/videos`);
      return res.json();
    },
  });

  const { data: pendingReviews = [] } = useQuery<{ id: number; videoId: number; videoTitle: string | null }[]>({
    queryKey: ["reviews", "pending"],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/reviews/pending`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60 * 1000,
  });
  const pendingReviewVideoIds = useMemo(
    () => new Set(pendingReviews.map((r) => r.videoId)),
    [pendingReviews],
  );

  const { data: savedViews = [] } = useQuery<SavedView[]>({
    queryKey: ["saved-views"],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/saved-views`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    videos.forEach((v) => { if (v.month) set.add(v.month); });
    return Array.from(set).sort();
  }, [videos]);

  const filteredVideos = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return videos.filter((v) => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (networkFilter !== "all" && !videoMatchesNetwork(v, networkFilter)) return false;
      if (monthFilter !== "all" && v.month !== monthFilter) return false;
      if (pendingReviewsActive && !pendingReviewVideoIds.has(v.id)) return false;
      if (campaignFilter !== "all") {
        if (campaignFilter === "none" && v.campaignId != null) return false;
        if (campaignFilter !== "none" && String(v.campaignId ?? "") !== campaignFilter) return false;
      }
      if (templateFilter !== "all") {
        if (templateFilter === "none" && v.templateId != null) return false;
        if (templateFilter !== "none" && String(v.templateId ?? "") !== templateFilter) return false;
      }
      if (!needle) return true;
      const haystack = [
        v.title,
        v.description,
        v.tiktokDescription,
        v.instagramDescription,
        v.youtubeTitle,
        v.youtubeDescription,
        v.linkedinDescription,
        v.xDescription,
        v.facebookDescription,
        v.month,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [videos, q, statusFilter, networkFilter, monthFilter, campaignFilter, templateFilter, pendingReviewsActive, pendingReviewVideoIds]);

  const filtersActive =
    q.trim().length > 0 ||
    statusFilter !== "all" ||
    networkFilter !== "all" ||
    monthFilter !== "all" ||
    campaignFilter !== "all" ||
    templateFilter !== "all";

  const { data: campaigns = [] } = useQuery<LibraryCampaign[]>({
    queryKey: ["library", "campaigns"],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/library/campaigns`);
      return r.ok ? r.json() : [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const campaignsById = useMemo(() => {
    const m = new Map<number, LibraryCampaign>();
    for (const c of campaigns) m.set(c.id, c);
    return m;
  }, [campaigns]);

  const { data: templates = [] } = useQuery<LibraryTemplate[]>({
    queryKey: ["library", "templates"],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/library/templates`);
      return r.ok ? r.json() : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Drop selections that no longer match the current filtered set so the
  // action bar always reflects what the user actually sees.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filteredVideos.map((v) => v.id));
      const next = new Set<number>();
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [filteredVideos]);

  // Open wizard immediately when arriving with `?new=1` URL param (deep links).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1" && !isCreating && !selectedVideo) {
      setIsCreating(true);
      setWizardStep("info");
      params.delete("new");
      const search = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    }
  }, []);

  // Open a specific video when arriving with `?select=<id>` (cross-page deep
  // link from the command palette). Runs after `videos` loads so the lookup
  // can resolve; clears the param once consumed so refreshing doesn't reopen.
  useEffect(() => {
    if (videos.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("select");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    const target = videos.find((v) => v.id === id);
    params.delete("select");
    const search = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    if (!target) return;
    setIsCreating(false);
    setSelectedVideo(target);
    if (!target.coverImageBase64) setWizardStep("cover");
    else if (!target.tiktokDescription || !target.instagramDescription) setWizardStep("tiktok-instagram");
    else if (!target.youtubeTitle || !target.youtubeDescription) setWizardStep("youtube");
    else if (!target.linkedinDescription || !target.xDescription) setWizardStep("linkedin-x");
    else setWizardStep("review");
  }, [videos]);

  // React to global events from the command palette / shortcuts. Using events
  // (instead of URL params) makes the actions reliable when the user is already
  // on /videos — wouter does not re-trigger pathname effects for query-only
  // changes, so we cannot rely on `?new=1` to drive the same-route case.
  useEffect(() => {
    const onNew = () => {
      setSelectedVideo(null);
      setIsCreating(true);
      setWizardStep("info");
    };
    const onSelect = (e: Event) => {
      const detail = (e as CustomEvent<{ id: number }>).detail;
      if (!detail || typeof detail.id !== "number") return;
      const target = videos.find((v) => v.id === detail.id);
      if (!target) return;
      setIsCreating(false);
      setSelectedVideo(target);
      if (!target.coverImageBase64) setWizardStep("cover");
      else if (!target.tiktokDescription || !target.instagramDescription) setWizardStep("tiktok-instagram");
      else if (!target.youtubeTitle || !target.youtubeDescription) setWizardStep("youtube");
      else if (!target.linkedinDescription || !target.xDescription) setWizardStep("linkedin-x");
      else setWizardStep("review");
    };
    window.addEventListener("videos:new", onNew);
    window.addEventListener("videos:select", onSelect as EventListener);
    return () => {
      window.removeEventListener("videos:new", onNew);
      window.removeEventListener("videos:select", onSelect as EventListener);
    };
  }, [videos]);

  // Page-scoped shortcuts: `a` selects all visible, Esc clears.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (selectedVideo || isCreating) return;
      const target = e.target as HTMLElement | null;
      if (target && (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "a") {
        e.preventDefault();
        setSelectedIds(new Set(filteredVideos.map((v) => v.id)));
      } else if (e.key === "Escape" && selectedIds.size > 0) {
        e.preventDefault();
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filteredVideos, selectedVideo, isCreating, selectedIds.size]);

  const toggleId = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    filteredVideos.length > 0 && filteredVideos.every((v) => selectedIds.has(v.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredVideos.map((v) => v.id)));
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch(`${API_BASE}/content/videos/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Error al eliminar videos");
      return res.json() as Promise<{ deleted: number; ids: number[] }>;
    },
    onMutate: async (ids: number[]) => {
      await queryClient.cancelQueries({ queryKey: ["videos"] });
      const previous = queryClient.getQueryData<VideoData[]>(["videos"]);
      if (previous) {
        const set = new Set(ids);
        queryClient.setQueryData<VideoData[]>(["videos"], previous.filter((v) => !set.has(v.id)));
      }
      return { previous };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedIds(new Set());
      toast({ title: `${data.deleted} videos eliminados` });
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["videos"], ctx.previous);
      toast({ title: "No se pudieron eliminar los videos", variant: "destructive" });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (vars: { ids: number[]; patch: Record<string, unknown> }) => {
      const res = await apiFetch(`${API_BASE}/content/videos/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      return res.json() as Promise<{ updated: number; ids: number[] }>;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["videos"] });
      const previous = queryClient.getQueryData<VideoData[]>(["videos"]);
      if (previous) {
        const set = new Set(vars.ids);
        queryClient.setQueryData<VideoData[]>(
          ["videos"],
          previous.map((v) => (set.has(v.id) ? ({ ...v, ...vars.patch } as VideoData) : v)),
        );
      }
      return { previous };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      toast({ title: `${data.updated} videos actualizados` });
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["videos"], ctx.previous);
      toast({ title: "No se pudieron actualizar los videos", variant: "destructive" });
    },
  });

  const createSavedViewMutation = useMutation({
    mutationFn: async (vars: { name: string; filters: SavedView["filters"] }) => {
      const res = await apiFetch(`${API_BASE}/saved-views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) throw new Error("Error al guardar la vista");
      return res.json() as Promise<SavedView>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views"] });
      setSavingView(false);
      setNewViewName("");
      toast({ title: "Vista guardada" });
    },
    onError: () => toast({ title: "No se pudo guardar la vista", variant: "destructive" }),
  });

  const deleteSavedViewMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_BASE}/saved-views/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Error al eliminar la vista");
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views"] });
      toast({ title: "Vista eliminada" });
    },
  });

  const applySavedView = (view: SavedView) => {
    setQ(view.filters.q || "");
    setStatusFilter(view.filters.status || "all");
    setNetworkFilter(view.filters.network || "all");
    setMonthFilter(view.filters.month || "all");
    // Saved views don't persist campaign/template yet — reset so applying a
    // view yields predictable results instead of leaking the previous filters.
    setCampaignFilter("all");
    setTemplateFilter("all");
    setSelectedIds(new Set());
  };

  const handleSaveCurrentView = () => {
    const name = newViewName.trim();
    if (!name) {
      toast({ title: "Ingresa un nombre para la vista", variant: "destructive" });
      return;
    }
    createSavedViewMutation.mutate({
      name,
      filters: {
        q: q.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        network: networkFilter !== "all" ? networkFilter : undefined,
        month: monthFilter !== "all" ? monthFilter : undefined,
      },
    });
  };

  const clearFilters = () => {
    setQ("");
    setStatusFilter("all");
    setNetworkFilter("all");
    setMonthFilter("all");
    setCampaignFilter("all");
    setTemplateFilter("all");
  };

  // Bulk: assign month label to N videos using the existing bulk-update endpoint.
  const handleBulkAssignMonth = () => {
    const month = bulkMonth.trim();
    if (!month) {
      toast({ title: "Ingresa un mes (ej. Mes 1)", variant: "destructive" });
      return;
    }
    bulkUpdateMutation.mutate(
      { ids: Array.from(selectedIds), patch: { month } },
      { onSuccess: () => setBulkMonth("") },
    );
  };

  // Bulk: schedule N videos at the same datetime via /content/videos/bulk-schedule.
  const handleBulkSchedule = async () => {
    if (!bulkScheduleAt) {
      toast({ title: "Selecciona fecha y hora", variant: "destructive" });
      return;
    }
    const scheduledAt = new Date(bulkScheduleAt).toISOString();
    try {
      const res = await apiFetch(`${API_BASE}/content/videos/bulk-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), scheduledAt }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { scheduled: number };
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setBulkScheduleAt("");
      toast({ title: `${data.scheduled} videos programados` });
    } catch {
      toast({ title: "No se pudieron programar los videos", variant: "destructive" });
    }
  };

  // Bulk: kick off description generation per-video. The server endpoint
  // returns the queued ids; we then call the existing per-video generator
  // sequentially so Gemini calls don't block each other or the UI.
  const handleBulkGenerateDescriptions = async () => {
    const ids = Array.from(selectedIds);
    // Backend caps this endpoint at 50 ids — surface that here so the user
    // gets a clear message instead of a generic 400 in the middle of a batch.
    if (ids.length > 50) {
      toast({
        title: `Selecciona máximo 50 videos para generar descripciones (tienes ${ids.length})`,
        variant: "destructive",
      });
      return;
    }
    setGeneratingDescriptions(true);
    try {
      const res = await apiFetch(`${API_BASE}/content/videos/bulk-generate-descriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      let ok = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          const r = await apiFetch(`${API_BASE}/content/videos/${id}/generate-descriptions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (r.ok) ok += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      toast({
        title: `Descripciones generadas: ${ok}${failed ? ` · Fallaron: ${failed}` : ""}`,
        variant: failed && !ok ? "destructive" : "default",
      });
    } catch {
      toast({ title: "No se pudieron generar las descripciones", variant: "destructive" });
    } finally {
      setGeneratingDescriptions(false);
    }
  };

  const autoGenerateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_BASE}/content/videos/${id}/generate-descriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false }),
      });
      if (!res.ok) throw new Error("Auto-generation failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      if (data.video) setSelectedVideo(data.video);
    },
    onError: () => {
      // Non-blocking: auto-generation failure doesn't stop the flow
    },
  });

  useEffect(() => {
    if (isLoading || selectedVideo) return;
    const params = new URLSearchParams(window.location.search);
    const selectId = params.get("select");
    if (!selectId) return;
    const target = videos.find((v) => String(v.id) === selectId);
    if (target) {
      setSelectedVideo(target);
      if (!target.coverImageBase64) setWizardStep("cover");
      else if (!target.tiktokDescription || !target.instagramDescription) setWizardStep("tiktok-instagram");
      else if (!target.youtubeTitle || !target.youtubeDescription) setWizardStep("youtube");
      else if (!target.linkedinDescription || !target.xDescription) setWizardStep("linkedin-x");
      else setWizardStep("review");
    }
  }, [isLoading, videos]);

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; month?: string; week?: string; day?: string; videoNumber?: string; scheduleHour?: string }) => {
      const res = await apiFetch(`${API_BASE}/content/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      // 403 can now come back from the new campaign/template ownership checks
      // — surface a friendly message instead of letting an HTML/error body
      // crash JSON parsing or trigger a misleading "Video creado" toast.
      if (!res.ok) {
        const detail = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(detail?.error || `No se pudo crear el video (HTTP ${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedVideo(data);
      setIsCreating(false);
      setWizardStep("cover");
      // Auto-generate descriptions in the background for new videos
      autoGenerateMutation.mutate(data.id);
      toast({ title: "Video creado", description: "Generando contenido con IA en segundo plano..." });
    },
    onError: (err: Error) => {
      toast({ title: "Error al crear video", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, any>) => {
      const res = await apiFetch(`${API_BASE}/content/videos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(detail?.error || `No se pudo guardar (HTTP ${res.status})`);
      }
      return res.json();
    },
    onMutate: async ({ id, ...patch }) => {
      await queryClient.cancelQueries({ queryKey: ["videos"] });
      const previous = queryClient.getQueryData<VideoData[]>(["videos"]);
      if (previous) {
        queryClient.setQueryData<VideoData[]>(
          ["videos"],
          previous.map((v) => (v.id === id ? ({ ...v, ...patch } as VideoData) : v)),
        );
      }
      return { previous };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedVideo(data);
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["videos"], ctx.previous);
      toast({ title: "Error al guardar", description: err.message, variant: "destructive" });
    },
  });

  // Atomically: update info fields → then trigger auto-generation if needed (no race condition)
  const handleSaveInfoStep = (infoData: Record<string, any>, shouldAutoGenerate: boolean) => {
    if (!selectedVideo) return;
    updateMutation.mutate(
      { id: selectedVideo.id, ...infoData },
      {
        onSuccess: (data) => {
          if (shouldAutoGenerate) {
            autoGenerateMutation.mutate(data.id);
          }
        },
      }
    );
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_BASE}/content/videos/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Error al eliminar");
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["videos"] });
      const previous = queryClient.getQueryData<VideoData[]>(["videos"]);
      if (previous) {
        queryClient.setQueryData<VideoData[]>(["videos"], previous.filter((v) => v.id !== id));
      }
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedVideo(null);
      toast({ title: "Video eliminado" });
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["videos"], ctx.previous);
      toast({ title: "No se pudo eliminar el video", variant: "destructive" });
    },
  });

  const generateCoverMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_BASE}/content/videos/${id}/generate-cover`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Error al generar portada");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedVideo(data);
      toast({ title: "Portada generada" });
    },
    onError: () => toast({ title: "Error al generar portada", variant: "destructive" }),
  });

  if (selectedVideo || isCreating) {
    return (
      <Layout>
        <VideoWizard
          video={selectedVideo}
          isCreating={isCreating}
          currentStep={wizardStep}
          onStepChange={setWizardStep}
          onBack={() => {
            setSelectedVideo(null);
            setIsCreating(false);
            setWizardStep("info");
          }}
          onCreate={(data) => createMutation.mutate(data)}
          onUpdate={(data) => {
            if (selectedVideo) updateMutation.mutate({ id: selectedVideo.id, ...data });
          }}
          onSaveInfoStep={handleSaveInfoStep}
          onGenerateCover={() => {
            if (selectedVideo) generateCoverMutation.mutate(selectedVideo.id);
          }}
          onAutoGenerate={(videoId) => autoGenerateMutation.mutate(videoId)}
          onDelete={() => {
            if (selectedVideo && confirm("¿Eliminar este video?")) {
              deleteMutation.mutate(selectedVideo.id);
            }
          }}
          isCreatingPending={createMutation.isPending}
          isUpdating={updateMutation.isPending}
          isGeneratingCover={generateCoverMutation.isPending}
          isAutoGenerating={autoGenerateMutation.isPending}
          toast={toast}
        />
      </Layout>
    );
  }

  const selectionCount = selectedIds.size;
  const noVideosAtAll = !isLoading && videos.length === 0;
  const noResults = !isLoading && videos.length > 0 && filteredVideos.length === 0;

  return (
    <Layout>
      <div className="space-y-6 pb-28">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Gestor de Videos</h1>
            <p className="text-muted-foreground text-xs sm:text-lg">Tu editora puede completar cada video paso a paso sin salir de aquí.</p>
          </div>
          <Button
            onClick={() => { setIsCreating(true); setWizardStep("info"); }}
            className="bg-gradient-to-r from-primary to-orange-400 hover:from-orange-500 hover:to-orange-400 shadow-lg shadow-primary/25 gap-2"
          >
            <Plus className="w-5 h-5" />
            Nuevo Video
            <KbdGroup className="ml-1 hidden sm:inline-flex">
              <Kbd className="bg-white/20 text-white">N</Kbd>
            </KbdGroup>
          </Button>
        </header>

        <div className="grid lg:grid-cols-[14rem_1fr] gap-4 lg:gap-6">
          {!noVideosAtAll && (
            <aside className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <Bookmark className="w-3 h-3" />
                  Vistas guardadas
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingReviewsActive((v) => !v)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-base ${
                  pendingReviewsActive
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                    : "bg-card/40 border-foreground/10 hover:bg-foreground/[0.04]"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 text-left">Mis revisiones pendientes</span>
                {pendingReviews.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/30 text-amber-100">
                    {pendingReviews.length}
                  </span>
                )}
              </button>
              <div className="rounded-xl border border-foreground/10 bg-card/40 divide-y divide-foreground/5 overflow-hidden">
                {savedViews.length === 0 && (
                  <p className="text-[11px] text-muted-foreground/70 px-3 py-3 leading-snug">
                    Aún no tienes vistas. Aplica filtros y guarda una para acceder rápido.
                  </p>
                )}
                {savedViews.map((view) => (
                  <div
                    key={view.id}
                    className="group flex items-center gap-2 px-2.5 py-2 hover:bg-foreground/[0.04] transition-base"
                  >
                    <button
                      type="button"
                      onClick={() => applySavedView(view)}
                      className="flex-1 text-left text-xs text-foreground truncate min-w-0"
                      title={view.name}
                    >
                      {view.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedViewMutation.mutate(view.id)}
                      className="text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      aria-label={`Eliminar vista ${view.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {filtersActive && !savingView && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSavingView(true)}
                  className="w-full h-8 text-xs"
                >
                  <BookmarkPlus className="w-3 h-3 mr-1" />
                  Guardar vista actual
                </Button>
              )}
              {savingView && (
                <div className="space-y-1.5">
                  <Input
                    value={newViewName}
                    onChange={(e) => setNewViewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveCurrentView();
                      if (e.key === "Escape") { setSavingView(false); setNewViewName(""); }
                    }}
                    placeholder="Nombre de la vista"
                    className="h-8 text-xs"
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={handleSaveCurrentView}
                      disabled={createSavedViewMutation.isPending}
                      className="h-7 text-xs flex-1"
                    >
                      {createSavedViewMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Guardar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setSavingView(false); setNewViewName(""); }}
                      className="h-7 text-xs"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </aside>
          )}

          <div className="min-w-0 space-y-4">
            {!noVideosAtAll && (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
                <div className="relative flex-1 min-w-[12rem]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar por título, descripción o red..."
                    className="pl-9 bg-card/40 border-foreground/10"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded transition-base"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="sm:w-44 bg-card/40 border-foreground/10">
                    <FilterIcon className="w-4 h-4 mr-2 text-muted-foreground/60" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={networkFilter} onValueChange={setNetworkFilter}>
                  <SelectTrigger className="sm:w-44 bg-card/40 border-foreground/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NETWORK_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="sm:w-40 bg-card/40 border-foreground/10">
                    <SelectValue placeholder="Todos los meses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los meses</SelectItem>
                    {availableMonths.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger className="sm:w-44 bg-card/40 border-foreground/10">
                    <SelectValue placeholder="Todas las campañas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las campañas</SelectItem>
                    <SelectItem value="none">Sin campaña</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={templateFilter} onValueChange={setTemplateFilter}>
                  <SelectTrigger className="sm:w-44 bg-card/40 border-foreground/10">
                    <SelectValue placeholder="Todas las plantillas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las plantillas</SelectItem>
                    <SelectItem value="none">Sin plantilla</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filtersActive && (
                  <Button
                    variant="ghost"
                    onClick={clearFilters}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <CircleSlash2 className="w-4 h-4 mr-1" />
                    Limpiar
                  </Button>
                )}
              </div>
            )}

            {isLoading ? (
          <VideoListSkeleton count={6} />
        ) : noVideosAtAll ? (
          <Card className="bg-card/30 border-foreground/10">
            <CardContent className="p-2">
              <EmptyState
                icon={Video}
                title="Sin videos registrados"
                description="Crea tu primer video. Te guiaremos paso a paso: información, portada, descripciones por red y revisión final."
                action={{
                  label: "Crear primer video",
                  onClick: () => { setIsCreating(true); setWizardStep("info"); },
                }}
                secondaryAction={{ label: "Ver ayuda", href: "/ayuda" }}
                size="lg"
              />
            </CardContent>
          </Card>
        ) : noResults ? (
          <Card className="bg-card/30 border-foreground/10">
            <CardContent className="p-8 text-center">
              <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">Ningún video coincide con tus filtros.</p>
              <Button variant="outline" onClick={clearFilters}>
                <CircleSlash2 className="w-4 h-4 mr-2" />
                Limpiar filtros
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-1">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAllVisible}
                />
                <span>
                  {selectionCount > 0
                    ? `${selectionCount} seleccionado${selectionCount === 1 ? "" : "s"}`
                    : `${filteredVideos.length} video${filteredVideos.length === 1 ? "" : "s"}`}
                </span>
              </label>
              {filtersActive && (
                <span className="text-[10px] text-muted-foreground/60">
                  Mostrando {filteredVideos.length} de {videos.length}
                </span>
              )}
            </div>

            {(() => {
              const renderVideoCard = (video: VideoData) => {
                const progress = getVideoProgress(video);
                const statusBadge = getStatusBadge(video);
                const isSelected = selectedIds.has(video.id);
                return (
                  <Card
                    key={video.id}
                    className={`bg-card/50 border-foreground/10 hover:border-primary/20 cursor-pointer transition-all duration-200 ${isSelected ? "border-primary/40 ring-1 ring-primary/30" : ""}`}
                    onClick={() => {
                      setSelectedVideo(video);
                      if (!video.coverImageBase64) setWizardStep("cover");
                      else if (!video.tiktokDescription || !video.instagramDescription) setWizardStep("tiktok-instagram");
                      else if (!video.youtubeTitle || !video.youtubeDescription) setWizardStep("youtube");
                      else if (!video.linkedinDescription || !video.xDescription) setWizardStep("linkedin-x");
                      else setWizardStep("review");
                    }}
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div
                          className="flex-shrink-0 pt-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleId(video.id)}
                            aria-label={isSelected ? `Deseleccionar "${video.title}"` : `Seleccionar "${video.title}"`}
                          />
                        </div>
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-foreground/[0.05] border border-foreground/10 flex-shrink-0 flex items-center justify-center">
                          {video.coverImageBase64 ? (
                            <img
                              src={`data:${video.coverMimeType || "image/png"};base64,${video.coverImageBase64}`}
                              className="w-full h-full object-cover"
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <Video className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground/30" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">{video.title}</h3>
                              <p className="text-xs sm:text-sm text-muted-foreground truncate">{video.description}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!!(video.youtubeVideoId || video.instagramMediaId || video.linkedinPostId || video.xPostId || video.tiktokPublishId) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="w-7 h-7 text-muted-foreground/50 hover:text-primary hover:bg-primary/10"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setStatsVideo(video);
                                  }}
                                  title="Ver estadísticas"
                                >
                                  <BarChart2 className="w-4 h-4" />
                                </Button>
                              )}
                              <ChevronRight className="w-5 h-5 text-muted-foreground/30 hidden sm:block" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className={statusBadge.className + " text-[10px] sm:text-xs"}>
                              {statusBadge.label}
                            </Badge>
                            {!video.tiktokDescription && !video.instagramDescription && !video.youtubeTitle && !video.youtubeDescription && !video.linkedinDescription && !video.xDescription && video.status !== "published" && (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px] sm:text-xs">
                                Sin descripciones
                              </Badge>
                            )}
                            <div className="w-16 sm:w-24 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-primary to-orange-400 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            {video.month && (
                              <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                                <Folder className="w-3 h-3" />
                                {video.month}/{video.week}/{video.day}/#{video.videoNumber}
                              </span>
                            )}
                            {video.campaignId != null && campaignsById.has(video.campaignId) ? (
                              <Link href={`/campanas/${video.campaignId}`}>
                                <a
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted hover:bg-muted/70 transition-colors"
                                  style={{ color: campaignsById.get(video.campaignId!)!.color }}
                                  title={`Campaña: ${campaignsById.get(video.campaignId!)!.name}`}
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: campaignsById.get(video.campaignId!)!.color }}
                                  />
                                  {campaignsById.get(video.campaignId!)!.name}
                                </a>
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              };
              // For long lists (>50 items) virtualize using window scroll so
              // hundreds of rows don't tank scroll FPS. Below the threshold
              // use a plain grid — keeps DOM simple and avoids Virtuoso's
              // mount cost.
              if (filteredVideos.length > 50) {
                return (
                  <Virtuoso
                    useWindowScroll
                    data={filteredVideos}
                    computeItemKey={(_, v) => v.id}
                    itemContent={(_, video) => (
                      <div className="pb-4">{renderVideoCard(video)}</div>
                    )}
                    increaseViewportBy={{ top: 400, bottom: 600 }}
                  />
                );
              }
              return (
                <div className="grid gap-4">
                  {filteredVideos.map((video) => renderVideoCard(video))}
                </div>
              );
            })()}
          </>
        )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectionCount > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl"
          >
            <div className="bg-card/95 backdrop-blur-xl border border-foreground/15 shadow-2xl rounded-2xl px-4 py-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-semibold flex-shrink-0">
                  {selectionCount}
                </span>
                <span className="text-sm font-medium truncate flex-1 min-w-0">
                  {selectionCount === 1 ? "1 video seleccionado" : `${selectionCount} videos seleccionados`}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedIds(new Set())}
                >
                  <X className="w-3 h-3 mr-1" />
                  Cancelar
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  onValueChange={(value) => {
                    bulkUpdateMutation.mutate({
                      ids: Array.from(selectedIds),
                      patch: { status: value },
                    });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-40">
                    <SelectValue placeholder="Cambiar estado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.filter((o) => o.value !== "all").map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="inline-flex items-center gap-1">
                  <Input
                    value={bulkMonth}
                    onChange={(e) => setBulkMonth(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleBulkAssignMonth(); }}
                    placeholder="Asignar mes"
                    className="h-8 text-xs w-32"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={handleBulkAssignMonth}
                    disabled={bulkUpdateMutation.isPending || !bulkMonth.trim()}
                    aria-label="Asignar mes a la selección"
                  >
                    <Folder className="w-3 h-3" />
                  </Button>
                </div>
                <div className="inline-flex items-center gap-1">
                  <Input
                    type="datetime-local"
                    value={bulkScheduleAt}
                    onChange={(e) => setBulkScheduleAt(e.target.value)}
                    className="h-8 text-xs w-44"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={handleBulkSchedule}
                    disabled={!bulkScheduleAt}
                    aria-label="Programar selección en lote"
                  >
                    <CalendarClock className="w-3 h-3" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={handleBulkGenerateDescriptions}
                  disabled={generatingDescriptions}
                >
                  {generatingDescriptions ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3 mr-1" />
                  )}
                  Generar descripciones
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => {
                    if (confirm(`¿Eliminar ${selectionCount} video${selectionCount === 1 ? "" : "s"}? Esta acción no se puede deshacer.`)) {
                      bulkDeleteMutation.mutate(Array.from(selectedIds));
                    }
                  }}
                >
                  {bulkDeleteMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3 h-3 mr-1" />
                      Eliminar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <VideoStatsModal
        video={statsVideo}
        onClose={() => setStatsVideo(null)}
      />
    </Layout>
  );
}

type YouTubeMetrics = { views: number; likes: number; comments: number; averageViewDuration: number; url: string };
type InstagramMetrics = { likes: number; comments: number; plays: number; reach: number; totalInteractions: number };
type LinkedInMetrics = { impressions: number; clicks: number; reactions: number; comments: number; shares: number };
type XMetrics = { impressions: number; likes: number; retweets: number; replies: number; quotes: number; bookmarks: number };
type StatError = { error: string };
type TikTokUnavailable = { available: false; reason: string };

type VideoStats = {
  videoId: number;
  stats: {
    youtube?: YouTubeMetrics | StatError;
    instagram?: InstagramMetrics | StatError;
    linkedin?: LinkedInMetrics | StatError;
    x?: XMetrics | StatError;
    tiktok?: TikTokUnavailable;
  };
};

function isStatError(v: unknown): v is StatError {
  return typeof v === "object" && v !== null && "error" in v;
}

function VideoStatsModal({ video, onClose }: { video: VideoData | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery<VideoStats>({
    queryKey: ["video-stats", video?.id],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/content/videos/${video!.id}/stats`);
      if (!res.ok) throw new Error("Error al cargar estadísticas");
      return res.json();
    },
    enabled: !!video,
    staleTime: 0,
  });

  const hasPublishedNetworks = video && (
    video.youtubeVideoId || video.instagramMediaId || video.linkedinPostId ||
    video.xPostId || video.tiktokPublishId
  );

  const fmtNum = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

  const fmtTime = (secs: number) => {
    if (!secs) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const yt = data?.stats.youtube;
  const ig = data?.stats.instagram;
  const li = data?.stats.linkedin;
  const xd = data?.stats.x;

  const ytOk = yt && !isStatError(yt) ? (yt as YouTubeMetrics) : null;
  const igOk = ig && !isStatError(ig) ? (ig as InstagramMetrics) : null;
  const liOk = li && !isStatError(li) ? (li as LinkedInMetrics) : null;
  const xdOk = xd && !isStatError(xd) ? (xd as XMetrics) : null;

  return (
    <Dialog open={!!video} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg bg-card border-foreground/10 overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BarChart2 className="w-4 h-4 text-primary" />
            Estadísticas — {video?.title}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-sm py-4">
            <AlertCircle className="w-4 h-4" />
            Error al cargar estadísticas
          </div>
        )}

        {!error && !hasPublishedNetworks && !isLoading && (
          <p className="text-muted-foreground text-sm py-4 text-center">
            Este video aún no tiene publicaciones en redes sociales.
          </p>
        )}

        {!error && hasPublishedNetworks && (
          <div className="space-y-4 mt-1">

            {/* YouTube */}
            {video?.youtubeVideoId && (
              <NetworkStatCard
                label="YouTube"
                bgClass="bg-red-600"
                loading={isLoading}
                error={isStatError(yt) ? "No se pudieron cargar las métricas" : undefined}
                unavailable={false}
                rows={ytOk ? [
                  { icon: <Eye className="w-3.5 h-3.5" />, label: "Vistas", value: fmtNum(ytOk.views) },
                  { icon: <ThumbsUp className="w-3.5 h-3.5" />, label: "Me gusta", value: fmtNum(ytOk.likes) },
                  { icon: <MessageSquare className="w-3.5 h-3.5" />, label: "Comentarios", value: fmtNum(ytOk.comments) },
                  { icon: <Clock className="w-3.5 h-3.5" />, label: "Duración promedio", value: fmtTime(ytOk.averageViewDuration) },
                ] : []}
                link={ytOk?.url}
              />
            )}

            {/* Instagram */}
            {video?.instagramMediaId && (
              <NetworkStatCard
                label="Instagram"
                bgClass="bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400"
                loading={isLoading}
                error={isStatError(ig) ? "No se pudieron cargar las métricas" : undefined}
                unavailable={false}
                rows={igOk ? [
                  { icon: <Eye className="w-3.5 h-3.5" />, label: "Reproducciones", value: fmtNum(igOk.plays) },
                  { icon: <ThumbsUp className="w-3.5 h-3.5" />, label: "Me gusta", value: fmtNum(igOk.likes) },
                  { icon: <MessageSquare className="w-3.5 h-3.5" />, label: "Comentarios", value: fmtNum(igOk.comments) },
                  { icon: <Share2 className="w-3.5 h-3.5" />, label: "Alcance", value: fmtNum(igOk.reach) },
                ] : []}
              />
            )}

            {/* LinkedIn */}
            {video?.linkedinPostId && (
              <NetworkStatCard
                label="LinkedIn"
                bgClass="bg-[#0A66C2]"
                loading={isLoading}
                error={isStatError(li) ? "No se pudieron cargar las métricas" : undefined}
                unavailable={false}
                rows={liOk ? [
                  { icon: <Eye className="w-3.5 h-3.5" />, label: "Impresiones", value: fmtNum(liOk.impressions) },
                  { icon: <MousePointerClick className="w-3.5 h-3.5" />, label: "Clics", value: fmtNum(liOk.clicks) },
                  { icon: <ThumbsUp className="w-3.5 h-3.5" />, label: "Reacciones", value: fmtNum(liOk.reactions) },
                  { icon: <MessageSquare className="w-3.5 h-3.5" />, label: "Comentarios", value: fmtNum(liOk.comments) },
                  { icon: <Share2 className="w-3.5 h-3.5" />, label: "Compartidos", value: fmtNum(liOk.shares) },
                ] : []}
              />
            )}

            {/* X */}
            {video?.xPostId && (
              <NetworkStatCard
                label="X"
                bgClass="bg-black border border-foreground/10"
                loading={isLoading}
                error={isStatError(xd) ? "No se pudieron cargar las métricas" : undefined}
                unavailable={false}
                rows={xdOk ? [
                  { icon: <Eye className="w-3.5 h-3.5" />, label: "Impresiones", value: fmtNum(xdOk.impressions) },
                  { icon: <ThumbsUp className="w-3.5 h-3.5" />, label: "Me gusta", value: fmtNum(xdOk.likes) },
                  { icon: <Repeat2 className="w-3.5 h-3.5" />, label: "Retweets", value: fmtNum(xdOk.retweets) },
                  { icon: <MessageSquare className="w-3.5 h-3.5" />, label: "Respuestas", value: fmtNum(xdOk.replies) },
                  { icon: <Share2 className="w-3.5 h-3.5" />, label: "Citas", value: fmtNum(xdOk.quotes) },
                ] : []}
              />
            )}

            {/* TikTok — scope limitation */}
            {video?.tiktokPublishId && (
              <NetworkStatCard
                label="TikTok"
                bgClass="bg-black border border-foreground/10"
                loading={false}
                unavailable={true}
                rows={[]}
              />
            )}

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NetworkStatCard({
  label,
  bgClass,
  loading,
  error,
  unavailable,
  rows,
  link,
  impressionNote,
}: {
  label: string;
  bgClass: string;
  loading: boolean;
  error?: string;
  unavailable?: boolean;
  rows: { icon: ReactNode; label: string; value: string }[];
  link?: string;
  impressionNote?: string;
}) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] overflow-hidden">
      <div className={`px-4 py-2.5 flex items-center justify-between ${bgClass}`}>
        <span className="text-white text-xs font-semibold tracking-wide">{label}</span>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="text-white/70 text-[10px] hover:text-white underline underline-offset-2">
            Ver en plataforma
          </a>
        )}
      </div>
      <div className="px-4 py-3">
        {loading ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-1.5 animate-pulse">
                <div className="w-3.5 h-3.5 rounded bg-foreground/10 flex-shrink-0" />
                <div className="h-2.5 bg-foreground/10 rounded flex-1" />
                <div className="h-2.5 w-8 bg-foreground/10 rounded ml-auto" />
              </div>
            ))}
          </div>
        ) : unavailable ? (
          <p className="text-xs text-muted-foreground/60 text-center py-1">
            Estadísticas no disponibles con los permisos actuales
          </p>
        ) : error ? (
          <p className="text-xs text-rose-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">{row.icon}</span>
                  <span className="text-[10px] text-muted-foreground">{row.label}</span>
                  <span className={`ml-auto text-xs font-semibold ${row.value === "No disponible" ? "text-muted-foreground/50" : "text-foreground"}`}>{row.value}</span>
                </div>
              ))}
            </div>
            {impressionNote && (
              <p className="text-[10px] text-muted-foreground/50 mt-2 leading-tight">{impressionNote}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VideoWizard({
  video,
  isCreating,
  currentStep,
  onStepChange,
  onBack,
  onCreate,
  onUpdate,
  onSaveInfoStep,
  onGenerateCover,
  onAutoGenerate,
  onDelete,
  isCreatingPending,
  isUpdating,
  isGeneratingCover,
  isAutoGenerating,
  toast,
}: {
  video: VideoData | null;
  isCreating: boolean;
  currentStep: WizardStep;
  onStepChange: (step: WizardStep) => void;
  onBack: () => void;
  onCreate: (data: any) => void;
  onUpdate: (data: any) => void;
  onSaveInfoStep: (infoData: Record<string, any>, shouldAutoGenerate: boolean) => void;
  onGenerateCover: () => void;
  onAutoGenerate: (videoId: number) => void;
  onDelete: () => void;
  isCreatingPending: boolean;
  isUpdating: boolean;
  isGeneratingCover: boolean;
  isAutoGenerating: boolean;
  toast: any;
}) {
  const queryClient = useQueryClient();
  const [pendingVideoFile, setPendingVideoFile] = useState<
    { type: "drive"; driveFileId: string; fileName: string } | { type: "upload"; file: File; fileName: string } | null
  >(null);
  const [formData, setFormData] = useState({
    title: video?.title || "",
    description: video?.description || "",
    month: video?.month || "",
    week: video?.week || "",
    day: video?.day || "",
    videoNumber: video?.videoNumber || "",
    scheduleHour: video?.scheduleHour || "",
    tiktokDescription: video?.tiktokDescription || "",
    instagramDescription: video?.instagramDescription || "",
    youtubeTitle: video?.youtubeTitle || "",
    youtubeDescription: video?.youtubeDescription || "",
    linkedinDescription: video?.linkedinDescription || "",
    xDescription: video?.xDescription || "",
    facebookDescription: video?.facebookDescription || "",
    templateId: (video?.templateId ?? null) as number | null,
    campaignId: (video?.campaignId ?? null) as number | null,
  });

  useEffect(() => {
    if (video) {
      setFormData({
        title: video.title || "",
        description: video.description || "",
        month: video.month || "",
        week: video.week || "",
        day: video.day || "",
        videoNumber: video.videoNumber || "",
        scheduleHour: video.scheduleHour || "",
        tiktokDescription: video.tiktokDescription || "",
        instagramDescription: video.instagramDescription || "",
        youtubeTitle: video.youtubeTitle || "",
        youtubeDescription: video.youtubeDescription || "",
        linkedinDescription: video.linkedinDescription || "",
        xDescription: video.xDescription || "",
        facebookDescription: video.facebookDescription || "",
        templateId: video.templateId ?? null,
        campaignId: video.campaignId ?? null,
      });
    }
  }, [video]);

  useEffect(() => {
    if (video && pendingVideoFile && !isCreating) {
      const linkPending = async () => {
        try {
          if (pendingVideoFile.type === "drive") {
            await apiFetch(`${API_BASE}/content/videos/${video.id}/link-drive-video`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ driveFileId: pendingVideoFile.driveFileId, fileName: pendingVideoFile.fileName }),
            });
          } else if (pendingVideoFile.type === "upload") {
            const fd = new FormData();
            fd.append("video", pendingVideoFile.file);
            await apiFetch(`${API_BASE}/content/videos/${video.id}/upload-video`, {
              method: "POST",
              body: fd,
            });
          }
          queryClient.invalidateQueries({ queryKey: ["videos"] });
        } catch (err) {
          console.error("Error linking pending video file:", err);
        }
        setPendingVideoFile(null);
      };
      linkPending();
    }
  }, [video?.id, isCreating]);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      onStepChange(STEPS[nextIndex].key);
    }
  };

  const goPrev = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      onStepChange(STEPS[prevIndex].key);
    }
  };

  const handleSaveInfo = () => {
    if (!formData.title) {
      toast({ title: "Completa el título del video", variant: "destructive" });
      return;
    }
    // Forward per-network description fields too — when the user applies a
    // template in this step they live in `formData` only; without including
    // them here the rehydrate-from-server effect would wipe the prefill.
    const infoData = {
      title: formData.title,
      description: formData.description,
      month: formData.month || undefined,
      week: formData.week || undefined,
      day: formData.day || undefined,
      videoNumber: formData.videoNumber || undefined,
      scheduleHour: formData.scheduleHour || undefined,
      templateId: formData.templateId,
      campaignId: formData.campaignId,
      tiktokDescription: formData.tiktokDescription || undefined,
      instagramDescription: formData.instagramDescription || undefined,
      youtubeTitle: formData.youtubeTitle || undefined,
      youtubeDescription: formData.youtubeDescription || undefined,
      linkedinDescription: formData.linkedinDescription || undefined,
      xDescription: formData.xDescription || undefined,
      facebookDescription: formData.facebookDescription || undefined,
    };
    if (isCreating) {
      onCreate(infoData);
      // Auto-generation for new videos is triggered in createMutation.onSuccess (VideosPage)
    } else {
      // Check before update, using video prop (stable snapshot from before user edits)
      const hasNoDescriptions =
        !video?.tiktokDescription &&
        !video?.instagramDescription &&
        !video?.youtubeTitle &&
        !video?.youtubeDescription &&
        !video?.linkedinDescription &&
        !video?.xDescription;
      // onSaveInfoStep: updates DB first, then (in onSuccess) optionally triggers auto-generation
      // This guarantees auto-generate reads the freshly-saved title+description from DB
      onSaveInfoStep(infoData, hasNoDescriptions);
      goNext();
    }
  };

  const handleSavePlatforms = (fields: Record<string, string>) => {
    onUpdate(fields);
    goNext();
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado al portapapeles" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Volver al listado</span>
            <span className="sm:hidden">Volver</span>
          </Button>
          {video && (
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 sm:hidden shrink-0 ml-auto">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-2xl font-display font-bold truncate">
            {isCreating ? "Nuevo Video" : video?.title}
          </h1>
          {video && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-1">
              Completa todos los pasos para programar en las 6 plataformas
            </p>
          )}
        </div>
        {video && (
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 hidden sm:flex shrink-0">
            <Trash2 className="w-4 h-4 mr-1" />
            Eliminar
          </Button>
        )}
      </div>

      <div className="sticky top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 bg-background/85 backdrop-blur-md py-2 sm:py-0 sm:bg-transparent sm:backdrop-blur-none">
        <div className="flex items-center gap-1 bg-card/40 rounded-2xl p-1.5 sm:p-2 border border-foreground/10 overflow-x-auto scrollbar-none">
          {STEPS.map((step, i) => {
            const isActive = step.key === currentStep;
            const isComplete = isStepComplete(video, step.key);
            const isClickable = !isCreating || step.key === "info";

            return (
              <button
                key={step.key}
                onClick={() => isClickable && onStepChange(step.key)}
                disabled={!isClickable}
                className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 min-w-0 ${
                  isActive
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : isComplete
                    ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                    : "text-muted-foreground hover:bg-foreground/5"
                } ${!isClickable ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                {isComplete && !isActive ? (
                  <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                ) : (
                  <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold shrink-0 ${
                    isActive ? "bg-foreground/20" : "bg-foreground/5"
                  }`}>
                    {i + 1}
                  </span>
                )}
                <span className={isActive ? "inline" : "hidden sm:inline"}>{step.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {video && (
        <ApprovalBar
          video={video}
          onJumpToComments={() => onStepChange("comments")}
          onJumpToReview={() => onStepChange("review")}
        />
      )}

      {isAutoGenerating && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>Generando contenido con IA para todas las plataformas...</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {currentStep === "info" && (
            <StepInfo
              formData={formData}
              setFormData={setFormData}
              onSave={handleSaveInfo}
              isPending={isCreatingPending || isUpdating}
              isCreating={isCreating}
              video={video}
              onVideoUploaded={() => {
                queryClient.invalidateQueries({ queryKey: ["videos"] });
              }}
              pendingVideoFile={pendingVideoFile}
              setPendingVideoFile={setPendingVideoFile}
            />
          )}

          {currentStep === "cover" && video && (
            <StepCover
              video={video}
              onGenerate={onGenerateCover}
              isGenerating={isGeneratingCover}
              onNext={goNext}
              onPrev={goPrev}
            />
          )}

          {currentStep === "tiktok-instagram" && video && (
            <StepWithPreview
              networks={["tiktok", "instagram"]}
              content={{
                tiktok: { text: formData.tiktokDescription || "" },
                instagram: { text: formData.instagramDescription || "" },
              }}
              video={video}
            >
              <StepTikTokInstagram
                formData={formData}
                setFormData={setFormData}
                video={video}
                onSave={() =>
                  handleSavePlatforms({
                    tiktokDescription: formData.tiktokDescription,
                    instagramDescription: formData.instagramDescription,
                  })
                }
                onPrev={goPrev}
                isPending={isUpdating}
                isAutoGenerating={isAutoGenerating}
                copyText={copyText}
              />
            </StepWithPreview>
          )}

          {currentStep === "youtube" && video && (
            <StepWithPreview
              networks={["youtube"]}
              content={{
                youtube: {
                  text: formData.youtubeDescription || "",
                  title: formData.youtubeTitle || "",
                },
              }}
              video={video}
            >
              <StepYouTube
                formData={formData}
                setFormData={setFormData}
                video={video}
                onSave={() =>
                  handleSavePlatforms({
                    youtubeTitle: formData.youtubeTitle,
                    youtubeDescription: formData.youtubeDescription,
                  })
                }
                onPrev={goPrev}
                isPending={isUpdating}
                isAutoGenerating={isAutoGenerating}
                copyText={copyText}
              />
            </StepWithPreview>
          )}

          {currentStep === "linkedin-x" && video && (
            <StepWithPreview
              networks={["linkedin", "x", "facebook"]}
              content={{
                linkedin: { text: formData.linkedinDescription || "" },
                x: { text: formData.xDescription || "" },
                facebook: { text: formData.facebookDescription || "" },
              }}
              video={video}
            >
              <StepLinkedInX
                formData={formData}
                setFormData={setFormData}
                video={video}
                onSave={() =>
                  handleSavePlatforms({
                    linkedinDescription: formData.linkedinDescription,
                    xDescription: formData.xDescription,
                    facebookDescription: formData.facebookDescription,
                  })
                }
                onPrev={goPrev}
                isPending={isUpdating}
                isAutoGenerating={isAutoGenerating}
                copyText={copyText}
              />
            </StepWithPreview>
          )}

          {currentStep === "comments" && video && (
            <CommentsAndApproval video={video} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["videos"] })} />
          )}

          {currentStep === "review" && video && (
            <StepReview
              video={{ ...video, ...formData }}
              onSchedule={async (includeFacebook) => {
                let scheduledDate: Date;
                const hour = formData.scheduleHour;
                if (hour && /^\d{1,2}:\d{2}$/.test(hour)) {
                  const [h, m] = hour.split(":").map(Number);
                  scheduledDate = new Date();
                  scheduledDate.setHours(h, m, 0, 0);
                  if (scheduledDate <= new Date()) {
                    scheduledDate.setDate(scheduledDate.getDate() + 1);
                  }
                } else {
                  scheduledDate = new Date();
                }
                // Per-platform pending statuses go through PATCH (not gated).
                onUpdate({
                  tiktokStatus: "pending",
                  instagramStatus: "pending",
                  youtubeStatus: "pending",
                  linkedinStatus: "pending",
                  xStatus: "pending",
                  facebookStatus: includeFacebook ? "pending" : "skipped",
                });
                // Scheduling itself goes through the guarded /schedule
                // endpoint so the approval workflow is enforced server-side.
                const sr = await apiFetch(`${API_BASE}/content/videos/${video!.id}/schedule`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ scheduledAt: scheduledDate.toISOString(), driveFolderId: video!.driveFolderId ?? null }),
                });
                if (!sr.ok) {
                  const msg = await sr.text();
                  toast({ title: "No se pudo programar", description: msg, variant: "destructive" });
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ["videos"] });
                const platforms = includeFacebook ? "6 plataformas" : "5 plataformas";
                toast({
                  title: `¡Programado en las ${platforms}!`,
                  description: hour
                    ? `Se subirá automáticamente a las ${hour} hrs`
                    : "Se subirá automáticamente ahora",
                });
              }}
              onPrev={goPrev}
              isPending={isUpdating}
              copyText={copyText}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const DEFAULT_DRIVE_ROOT = "1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB";

function DriveVideoPicker({
  onSelect,
  onClose,
}: {
  onSelect: (file: { id: string; name: string; mimeType: string }) => void;
  onClose: () => void;
}) {
  const [folderId, setFolderId] = useState(DEFAULT_DRIVE_ROOT);
  const [folderHistory, setFolderHistory] = useState<{ id: string; name: string }[]>([
    { id: DEFAULT_DRIVE_ROOT, name: "WebMakerChile" },
  ]);

  const { data: filesData, isLoading: filesLoading, error: filesError } = useQuery({
    queryKey: ["drive-files", folderId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/drive/files?folderId=${folderId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al cargar archivos" }));
        throw new Error(err.error || "Error al cargar archivos");
      }
      return res.json();
    },
    retry: false,
  });

  const { data: foldersData, isLoading: foldersLoading, error: foldersError } = useQuery({
    queryKey: ["drive-folders", folderId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/drive/folders?parentId=${folderId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al cargar carpetas" }));
        throw new Error(err.error || "Error al cargar carpetas");
      }
      return res.json();
    },
    retry: false,
  });

  const navigateToFolder = (id: string, name: string) => {
    setFolderHistory((prev) => [...prev, { id, name }]);
    setFolderId(id);
  };

  const navigateBack = () => {
    if (folderHistory.length > 1) {
      const newHistory = [...folderHistory];
      newHistory.pop();
      const prev = newHistory[newHistory.length - 1];
      setFolderHistory(newHistory);
      setFolderId(prev.id);
    }
  };

  const isLoading = filesLoading || foldersLoading;
  const folders = foldersData || [];
  const files = (filesData?.files || []).filter((f: any) =>
    f.mimeType?.startsWith("video/")
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-foreground/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[85vh] sm:max-h-[80vh] flex flex-col shadow-2xl sm:mx-4">
        <div className="p-4 border-b border-foreground/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg">Seleccionar Video desde Drive</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-foreground/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-foreground/5 border-b border-foreground/10 flex items-center gap-3">
          <button
            onClick={navigateBack}
            disabled={folderHistory.length <= 1}
            className="p-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 disabled:opacity-30 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 text-sm overflow-x-auto whitespace-nowrap">
            {folderHistory.map((folder, i) => (
              <span key={folder.id} className="flex items-center">
                <span
                  className={`cursor-pointer hover:text-primary transition-colors ${
                    i === folderHistory.length - 1 ? "text-primary font-medium" : "text-muted-foreground"
                  }`}
                  onClick={() => {
                    const newHistory = folderHistory.slice(0, i + 1);
                    setFolderHistory(newHistory);
                    setFolderId(folder.id);
                  }}
                >
                  {folder.name}
                </span>
                {i < folderHistory.length - 1 && (
                  <span className="text-muted-foreground/30 mx-1">/</span>
                )}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 min-h-[300px]">
          {(filesError || foldersError) ? (
            <div className="flex flex-col items-center justify-center py-16 text-red-400">
              <p className="text-sm font-medium mb-2">Error al acceder a Google Drive</p>
              <p className="text-xs text-muted-foreground text-center max-w-md">
                {(filesError as any)?.message || (foldersError as any)?.message || "Error desconocido"}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Cierra sesión y vuelve a iniciar para otorgar permisos de Drive.</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No hay carpetas ni videos en esta ubicación</p>
            </div>
          ) : (
            <div className="space-y-1">
              {folders.map((folder: any) => (
                <button
                  key={folder.id}
                  onClick={() => navigateToFolder(folder.id, folder.name)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-foreground/5 transition-colors text-left group"
                >
                  <Folder className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium truncate flex-1">{folder.name}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}

              {files.map((file: any) => (
                <button
                  key={file.id}
                  onClick={() => onSelect({ id: file.id, name: file.name, mimeType: file.mimeType })}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary/10 hover:border-primary/20 border border-transparent transition-all text-left group"
                >
                  <FileVideo className="w-5 h-5 text-orange-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    {file.size && (
                      <p className="text-xs text-muted-foreground">
                        {(parseInt(file.size) / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    Seleccionar
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepInfo({
  formData,
  setFormData,
  onSave,
  isPending,
  isCreating,
  video,
  onVideoUploaded,
  pendingVideoFile,
  setPendingVideoFile,
}: {
  formData: any;
  setFormData: (data: any) => void;
  onSave: () => void;
  isPending: boolean;
  isCreating: boolean;
  video?: VideoData | null;
  onVideoUploaded?: () => void;
  pendingVideoFile?: { type: "drive"; driveFileId: string; fileName: string } | { type: "upload"; file: File; fileName: string } | null;
  setPendingVideoFile?: (f: any) => void;
}) {
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [linking, setLinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ success?: boolean; error?: string; fileName?: string } | null>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const hasVideoLinked = !!(video?.videoFileDriveId) || !!resultMsg?.success;
  const hasPending = !!pendingVideoFile;
  const videoAttached = hasVideoLinked || hasPending;
  const displayFileName = resultMsg?.fileName || pendingVideoFile?.fileName || video?.videoFileName || null;

  const handleDriveSelect = async (file: { id: string; name: string; mimeType: string }) => {
    setShowDrivePicker(false);

    if (!video) {
      if (setPendingVideoFile) setPendingVideoFile({ type: "drive", driveFileId: file.id, fileName: file.name });
      return;
    }

    setLinking(true);
    setResultMsg(null);
    try {
      const res = await apiFetch(`${API_BASE}/content/videos/${video.id}/link-drive-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId: file.id, fileName: file.name }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResultMsg({ success: true, fileName: data.fileName });
        if (onVideoUploaded) onVideoUploaded();
      } else {
        setResultMsg({ success: false, error: data.error || "Error al vincular" });
      }
    } catch (err: any) {
      setResultMsg({ success: false, error: err.message });
    } finally {
      setLinking(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!video) {
      if (setPendingVideoFile) setPendingVideoFile({ type: "upload", file, fileName: file.name });
      return;
    }

    setUploading(true);
    setResultMsg(null);
    try {
      const fd = new FormData();
      fd.append("video", file);
      const res = await apiFetch(`${API_BASE}/content/videos/${video.id}/upload-video`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResultMsg({ success: true, fileName: data.fileName });
        if (onVideoUploaded) onVideoUploaded();
      } else {
        setResultMsg({ success: false, error: data.error || "Error al subir" });
      }
    } catch (err: any) {
      setResultMsg({ success: false, error: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleClearSelection = () => {
    if (setPendingVideoFile) setPendingVideoFile(null);
    setResultMsg(null);
  };

  return (
    <Card className="bg-card/50 border-foreground/10">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Video className="w-5 h-5 text-primary" />
          Información Básica
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Ingresa los datos principales del video
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <TemplateAndCampaignSelector
          templateId={formData.templateId ?? null}
          campaignId={formData.campaignId ?? null}
          onTemplateChange={(id) => setFormData({ ...formData, templateId: id })}
          onCampaignChange={(id) => setFormData({ ...formData, campaignId: id })}
          onApplyTemplate={(template, values) => {
            // Template field keys mirror the persisted shape from
            // `lib/db/src/schema/library.ts#TemplateFields` so the wizard
            // honours every per-network description the user saved.
            // Each key here is also a (string-typed) field on `VideoData`,
            // so we can write into a typed Partial<VideoData> without `any`.
            type TemplateTargetKey =
              | "description"
              | "tiktokDescription"
              | "instagramDescription"
              | "youtubeTitle"
              | "youtubeDescription"
              | "linkedinDescription"
              | "xDescription"
              | "facebookDescription";
            const targets: readonly TemplateTargetKey[] = [
              "description",
              "tiktokDescription",
              "instagramDescription",
              "youtubeTitle",
              "youtubeDescription",
              "linkedinDescription",
              "xDescription",
              "facebookDescription",
            ];
            const fields = template.fields || {};
            const patch: Partial<VideoData> = { templateId: template.id };
            for (const key of targets) {
              const raw = fields[key];
              if (typeof raw === "string" && raw.length > 0) {
                patch[key] = fillTemplateVariables(raw, values);
              }
            }
            setFormData({ ...formData, ...patch });
          }}
        />

        <div className="space-y-2">
          <label className="text-sm font-medium">Título del Video</label>
          <input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            placeholder="Ej: Setup minimalista 2024"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Descripción General</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[100px]"
            placeholder="¿De qué trata el video?"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Mes</label>
            <select
              value={formData.month}
              onChange={(e) => setFormData({ ...formData, month: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">--</option>
              <option value="Enero">Ene</option>
              <option value="Febrero">Feb</option>
              <option value="Marzo">Mar</option>
              <option value="Abril">Abr</option>
              <option value="Mayo">May</option>
              <option value="Junio">Jun</option>
              <option value="Julio">Jul</option>
              <option value="Agosto">Ago</option>
              <option value="Septiembre">Sep</option>
              <option value="Octubre">Oct</option>
              <option value="Noviembre">Nov</option>
              <option value="Diciembre">Dic</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Semana</label>
            <select
              value={formData.week}
              onChange={(e) => setFormData({ ...formData, week: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">--</option>
              <option value="Semana 1">Sem 1</option>
              <option value="Semana 2">Sem 2</option>
              <option value="Semana 3">Sem 3</option>
              <option value="Semana 4">Sem 4</option>
              <option value="Semana 5">Sem 5</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Dia</label>
            <select
              value={formData.day}
              onChange={(e) => setFormData({ ...formData, day: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">--</option>
              <option value="Lunes">Lun</option>
              <option value="Martes">Mar</option>
              <option value="Miércoles">Mie</option>
              <option value="Jueves">Jue</option>
              <option value="Viernes">Vie</option>
              <option value="Sábado">Sab</option>
              <option value="Domingo">Dom</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Video #</label>
            <select
              value={formData.videoNumber}
              onChange={(e) => setFormData({ ...formData, videoNumber: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">--</option>
              <option value="01">#01</option>
              <option value="02">#02</option>
              <option value="03">#03</option>
              <option value="04">#04</option>
              <option value="05">#05</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Hora</label>
            <div className="flex items-center gap-1.5">
              <select
                value={formData.scheduleHour ? formData.scheduleHour.split(":")[0] : ""}
                onChange={(e) => {
                  const h = e.target.value;
                  if (!h) { setFormData({ ...formData, scheduleHour: "" }); return; }
                  const currentMin = formData.scheduleHour ? formData.scheduleHour.split(":")[1] : "00";
                  setFormData({ ...formData, scheduleHour: `${h}:${currentMin}` });
                }}
                className="flex-1 bg-background border border-border rounded-lg px-2 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer text-center"
              >
                <option value="">HH</option>
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-muted-foreground font-bold">:</span>
              <select
                value={formData.scheduleHour ? formData.scheduleHour.split(":")[1] : ""}
                onChange={(e) => {
                  const m = e.target.value;
                  const currentH = formData.scheduleHour ? formData.scheduleHour.split(":")[0] : "12";
                  setFormData({ ...formData, scheduleHour: `${currentH}:${m}` });
                }}
                className="flex-1 bg-background border border-border rounded-lg px-2 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer text-center"
              >
                <option value="">MM</option>
                {["00", "15", "30", "45"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <FileVideo className="w-4 h-4 text-primary" />
            Archivo de Video
          </label>

          {videoAttached ? (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <FileVideo className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-400">
                  {hasVideoLinked ? "Video vinculado" : hasPending && pendingVideoFile?.type === "drive" ? "Video de Drive seleccionado" : "Video seleccionado"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {displayFileName || "Archivo adjunto"}
                </p>
                {hasPending && !hasVideoLinked && (
                  <p className="text-xs text-primary/70 mt-1">Se vinculará al guardar</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                disabled={linking || uploading}
                className="text-xs"
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {linking || uploading ? (
                <div className="border-2 border-dashed border-primary/50 bg-primary/5 rounded-xl p-8 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">
                      {linking ? "Vinculando desde Drive..." : "Subiendo archivo..."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setShowDrivePicker(true)}
                    className="border-2 border-dashed border-foreground/10 hover:border-primary/50 hover:bg-foreground/5 rounded-xl p-6 text-center cursor-pointer transition-all"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <HardDrive className="w-8 h-8 text-primary" />
                      <p className="text-sm font-medium text-foreground">Desde Google Drive</p>
                      <p className="text-xs text-muted-foreground/60">
                        Selecciona un video de tu Drive
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => videoFileRef.current?.click()}
                    className="border-2 border-dashed border-foreground/10 hover:border-orange-500/50 hover:bg-foreground/5 rounded-xl p-6 text-center cursor-pointer transition-all"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-orange-400" />
                      <p className="text-sm font-medium text-foreground">Subir Archivo</p>
                      <p className="text-xs text-muted-foreground/60">
                        MP4, MOV · Máx 256MB
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <input
            ref={videoFileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />

          {resultMsg && !resultMsg.success && (
            <div className="rounded-lg p-3 text-sm bg-red-500/10 border border-red-500/20 text-red-400">
              {resultMsg.error}
            </div>
          )}

          {showDrivePicker && (
            <DriveVideoPicker
              onSelect={handleDriveSelect}
              onClose={() => setShowDrivePicker(false)}
            />
          )}
        </div>

        <div className="pt-4 flex justify-end">
          <Button onClick={onSave} disabled={isPending} className="bg-primary">
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ChevronRight className="w-4 h-4 mr-2" />
            )}
            {isCreating ? "Crear y Continuar" : "Guardar y Continuar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepCover({
  video,
  onGenerate,
  isGenerating,
  onNext,
  onPrev,
}: {
  video: VideoData;
  onGenerate: () => void;
  isGenerating: boolean;
  onNext: () => void;
  onPrev: () => void;
}) {
  return (
    <Card className="bg-card/50 border-foreground/10">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-primary" />
          Portada del Video
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Genera la portada con IA basada en el título del video
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {video.coverImageBase64 ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-48 rounded-2xl overflow-hidden border border-foreground/10 shadow-2xl">
              <img
                src={`data:${video.coverMimeType || "image/png"};base64,${video.coverImageBase64}`}
                className="w-full aspect-[9/16] object-cover"
                alt="Portada"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <Check className="w-3 h-3 mr-1" />
                Portada generada
              </Badge>
            </div>
            <Button variant="outline" onClick={onGenerate} disabled={isGenerating} className="border-foreground/10">
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Regenerar portada
            </Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-32 h-56 mx-auto rounded-2xl border-2 border-dashed border-foreground/15 flex items-center justify-center mb-6 bg-foreground/[0.04]">
              <ImageIcon className="w-12 h-12 text-muted-foreground/20" />
            </div>
            <p className="text-muted-foreground mb-4">
              Se generará una portada con IA usando el estilo del zorro de WebMakerChile
            </p>
            <Button
              onClick={onGenerate}
              disabled={isGenerating}
              className="bg-gradient-to-r from-primary to-orange-400"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generando portada...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generar Portada con IA
                </>
              )}
            </Button>
          </div>
        )}

        <div className="pt-4 flex justify-between">
          <Button variant="outline" onClick={onPrev} className="border-foreground/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>
          <Button onClick={onNext} className="bg-primary">
            <ChevronRight className="w-4 h-4 mr-2" />
            Continuar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AutoGeneratingPlaceholder({ label }: { label: string }) {
  return (
    <div className="w-full bg-background/50 border border-primary/20 rounded-xl px-4 py-3 min-h-[180px] flex flex-col items-center justify-center gap-2 text-primary/60">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-xs">Generando {label} con IA...</span>
    </div>
  );
}

/**
 * Wraps a wizard step with a live preview panel on the right column.
 * Stacks vertically below the form on screens < lg.
 */
function StepWithPreview({
  networks,
  content,
  video,
  children,
}: {
  networks: Network[];
  content: Partial<Record<Network, PreviewContent>>;
  video: VideoData;
  children: ReactNode;
}) {
  const previewVideo = useMemo(
    () => ({
      id: video.id,
      title: video.title,
      videoFileDriveId: video.videoFileDriveId ?? null,
    }),
    [video.id, video.title, video.videoFileDriveId],
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      <div className="lg:col-span-7 min-w-0">{children}</div>
      <aside className="lg:col-span-5 min-w-0">
        <PreviewPanel networks={networks} content={content} video={previewVideo} />
      </aside>
    </div>
  );
}

function StepTikTokInstagram({
  formData,
  setFormData,
  video,
  onSave,
  onPrev,
  isPending,
  isAutoGenerating,
  copyText,
}: {
  formData: any;
  setFormData: (data: any) => void;
  video: VideoData;
  onSave: () => void;
  onPrev: () => void;
  isPending: boolean;
  isAutoGenerating: boolean;
  copyText: (text: string) => void;
}) {
  const showTikTokPlaceholder = isAutoGenerating && !formData.tiktokDescription;
  const showInstagramPlaceholder = isAutoGenerating && !formData.instagramDescription;

  return (
    <Card className="bg-card/50 border-foreground/10">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <span className="text-2xl">📱</span>
          TikTok e Instagram
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Escribe las descripciones para TikTok e Instagram. Incluye hashtags y emojis.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-black flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9a6.33 6.33 0 00-.79-.05A6.34 6.34 0 003.15 15.3a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.37a8.16 8.16 0 004.76 1.52V7.45a4.85 4.85 0 01-1-.76z"/></svg>
                </span>
                TikTok
              </label>
              {formData.tiktokDescription && (
                <button onClick={() => copyText(formData.tiktokDescription)} className="text-xs text-primary hover:text-primary/80">
                  <Copy className="w-3 h-3 inline mr-1" />Copiar
                </button>
              )}
            </div>
            {showTikTokPlaceholder ? (
              <AutoGeneratingPlaceholder label="descripción de TikTok" />
            ) : (
              <TruncatedTextarea
                value={formData.tiktokDescription}
                onChange={(e) => setFormData({ ...formData, tiktokDescription: e.target.value })}
                truncateAt={150}
                maxLength={2200}
                placeholder={"✨ [Título atractivo]\n\n📌 [Descripción corta]\n\n#hashtag1 #hashtag2 #hashtag3"}
                ariaLabel="Descripción para TikTok"
              />
            )}
            {!showTikTokPlaceholder && (
              <p className="text-[10px] text-muted-foreground">Máximo 2200 caracteres · {formData.tiktokDescription.length}/2200</p>
            )}
            <LibraryControls
              network="tiktok"
              videoId={video?.id}
              title={formData.title}
              description={formData.description}
              currentText={formData.tiktokDescription || ""}
              onAppend={(t) => setFormData({ ...formData, tiktokDescription: t })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </span>
                Instagram
              </label>
              {formData.instagramDescription && (
                <button onClick={() => copyText(formData.instagramDescription)} className="text-xs text-primary hover:text-primary/80">
                  <Copy className="w-3 h-3 inline mr-1" />Copiar
                </button>
              )}
            </div>
            {showInstagramPlaceholder ? (
              <AutoGeneratingPlaceholder label="descripción de Instagram" />
            ) : (
              <TruncatedTextarea
                value={formData.instagramDescription}
                onChange={(e) => setFormData({ ...formData, instagramDescription: e.target.value })}
                truncateAt={125}
                maxLength={2200}
                placeholder={"✨ [Título atractivo]\n\n📌 [Descripción para Instagram]\n\n💡 Síguenos para más tips\n\n#hashtag1 #hashtag2 #hashtag3"}
                ariaLabel="Descripción para Instagram"
              />
            )}
            {!showInstagramPlaceholder && (
              <p className="text-[10px] text-muted-foreground">Máximo 2200 caracteres · {formData.instagramDescription.length}/2200</p>
            )}
            <LibraryControls
              network="instagram"
              videoId={video?.id}
              title={formData.title}
              description={formData.description}
              currentText={formData.instagramDescription || ""}
              onAppend={(t) => setFormData({ ...formData, instagramDescription: t })}
            />
          </div>
        </div>

        <div className="pt-4 flex justify-between">
          <Button variant="outline" onClick={onPrev} className="border-foreground/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || isAutoGenerating || !formData.tiktokDescription || !formData.instagramDescription}
            className="bg-primary"
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ChevronRight className="w-4 h-4 mr-2" />}
            Guardar y Continuar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepYouTube({
  formData,
  setFormData,
  video,
  onSave,
  onPrev,
  isPending,
  isAutoGenerating,
  copyText,
}: {
  formData: any;
  setFormData: (data: any) => void;
  video: VideoData;
  onSave: () => void;
  onPrev: () => void;
  isPending: boolean;
  isAutoGenerating: boolean;
  copyText: (text: string) => void;
}) {
  const showYoutubeTitlePlaceholder = isAutoGenerating && !formData.youtubeTitle;
  const showYoutubeDescPlaceholder = isAutoGenerating && !formData.youtubeDescription;

  return (
    <Card className="bg-card/50 border-foreground/10">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <span className="w-7 h-7 rounded bg-red-600 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          </span>
          YouTube
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Título y descripción para YouTube Shorts. El título es diferente al de TikTok/Instagram.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">Título para YouTube</label>
            {formData.youtubeTitle && (
              <button onClick={() => copyText(formData.youtubeTitle)} className="text-xs text-primary hover:text-primary/80">
                <Copy className="w-3 h-3 inline mr-1" />Copiar
              </button>
            )}
          </div>
          {showYoutubeTitlePlaceholder ? (
            <div className="w-full bg-background/50 border border-primary/20 rounded-xl px-4 py-3 h-12 flex items-center gap-2 text-primary/60">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="text-xs">Generando título de YouTube con IA...</span>
            </div>
          ) : (
            <input
              value={formData.youtubeTitle}
              onChange={(e) => setFormData({ ...formData, youtubeTitle: e.target.value })}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              placeholder="Título optimizado para YouTube (máx. 100 caracteres)"
              maxLength={100}
            />
          )}
          {!showYoutubeTitlePlaceholder && (
            <p className="text-[10px] text-muted-foreground">{formData.youtubeTitle.length}/100 caracteres</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">Descripción para YouTube</label>
            {formData.youtubeDescription && (
              <button onClick={() => copyText(formData.youtubeDescription)} className="text-xs text-primary hover:text-primary/80">
                <Copy className="w-3 h-3 inline mr-1" />Copiar
              </button>
            )}
          </div>
          {showYoutubeDescPlaceholder ? (
            <AutoGeneratingPlaceholder label="descripción de YouTube" />
          ) : (
            <TruncatedTextarea
              value={formData.youtubeDescription}
              onChange={(e) => setFormData({ ...formData, youtubeDescription: e.target.value })}
              truncateAt={157}
              maxLength={5000}
              minHeightClass="min-h-[200px]"
              placeholder={"📌 [Descripción del video]\n\n🔔 Suscríbete para más contenido\n💻 Visítanos: webmakerchile.com\n\n#shorts #webdev #programacion"}
              ariaLabel="Descripción para YouTube"
            />
          )}
          {!showYoutubeDescPlaceholder && (
            <p className="text-[10px] text-muted-foreground">{formData.youtubeDescription.length}/5000 caracteres</p>
          )}
          <LibraryControls
            network="youtube"
            videoId={video?.id}
            title={formData.youtubeTitle || formData.title}
            description={formData.description}
            currentText={formData.youtubeDescription || ""}
            onAppend={(t) => setFormData({ ...formData, youtubeDescription: t })}
          />
        </div>

        <div className="pt-4 flex justify-between">
          <Button variant="outline" onClick={onPrev} className="border-foreground/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || isAutoGenerating || !formData.youtubeTitle || !formData.youtubeDescription}
            className="bg-primary"
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ChevronRight className="w-4 h-4 mr-2" />}
            Guardar y Continuar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepLinkedInX({
  formData,
  setFormData,
  video,
  onSave,
  onPrev,
  isPending,
  isAutoGenerating,
  copyText,
}: {
  formData: any;
  setFormData: (data: any) => void;
  video: VideoData;
  onSave: () => void;
  onPrev: () => void;
  isPending: boolean;
  isAutoGenerating: boolean;
  copyText: (text: string) => void;
}) {
  const xLen = (formData.xDescription || "").length;
  const [aiBusy, setAiBusy] = useState(false);
  const showLinkedInPlaceholder = (isAutoGenerating || aiBusy) && !formData.linkedinDescription;
  const showXPlaceholder = (isAutoGenerating || aiBusy) && !formData.xDescription;
  const generateAi = async () => {
    if (!video?.id) return;
    setAiBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/content/videos/${video.id}/generate-descriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: ["linkedin", "x", "facebook"], force: true }),
      });
      if (!res.ok) throw new Error("Error generando descripciones");
      const data = await res.json();
      const next = { ...formData };
      if (typeof data?.descriptions?.linkedin === "string") next.linkedinDescription = data.descriptions.linkedin;
      if (typeof data?.descriptions?.x === "string") next.xDescription = data.descriptions.x.slice(0, 280);
      if (typeof data?.descriptions?.facebook === "string") next.facebookDescription = data.descriptions.facebook.slice(0, 500);
      setFormData(next);
    } catch (err) {
      console.error(err);
    } finally {
      setAiBusy(false);
    }
  };
  return (
    <Card className="bg-card/50 border-foreground/10">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <span className="text-2xl">💼</span>
              LinkedIn, X y Facebook
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Textos para LinkedIn (máx. 3000), X (máx. 280) y Facebook (máx. 500). Facebook es opcional.
            </p>
          </div>
          <button
            type="button"
            onClick={generateAi}
            disabled={aiBusy || isAutoGenerating}
            className="px-3 py-1.5 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded-lg border border-primary/30 disabled:opacity-50 whitespace-nowrap"
          >
            {(aiBusy || isAutoGenerating) ? "Generando..." : "✨ Generar con IA"}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-[#0A66C2] flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M19 0h-14c-2.76 0-5 2.24-5 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5v-14c0-2.76-2.24-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.27c-.97 0-1.75-.79-1.75-1.76s.78-1.76 1.75-1.76 1.75.79 1.75 1.76-.78 1.76-1.75 1.76zm13.5 12.27h-3v-5.6c0-3.37-4-3.11-4 0v5.6h-3v-11h3v1.76c1.4-2.59 7-2.78 7 2.48v6.76z"/></svg>
                </span>
                LinkedIn
              </label>
              {formData.linkedinDescription && (
                <button onClick={() => copyText(formData.linkedinDescription)} className="text-xs text-primary hover:text-primary/80">
                  <Copy className="w-3 h-3 inline mr-1" />Copiar
                </button>
              )}
            </div>
            {showLinkedInPlaceholder ? (
              <AutoGeneratingPlaceholder label="descripción de LinkedIn" />
            ) : (
              <TruncatedTextarea
                value={formData.linkedinDescription}
                onChange={(e) => setFormData({ ...formData, linkedinDescription: e.target.value })}
                truncateAt={210}
                maxLength={3000}
                placeholder={"💡 [Insight profesional]\n\n📌 [Descripción extendida con contexto de negocio]\n\n#WebDev #ChileTech #DesarrolloWeb"}
                ariaLabel="Descripción para LinkedIn"
              />
            )}
            {!showLinkedInPlaceholder && (
              <p className="text-[10px] text-muted-foreground">Máximo 3000 caracteres · {(formData.linkedinDescription || "").length}/3000</p>
            )}
            <LibraryControls
              network="linkedin"
              videoId={video?.id}
              title={formData.title}
              description={formData.description}
              currentText={formData.linkedinDescription || ""}
              onAppend={(t) => setFormData({ ...formData, linkedinDescription: t })}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-black flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </span>
                X (Twitter)
              </label>
              {formData.xDescription && (
                <button onClick={() => copyText(formData.xDescription)} className="text-xs text-primary hover:text-primary/80">
                  <Copy className="w-3 h-3 inline mr-1" />Copiar
                </button>
              )}
            </div>
            {showXPlaceholder ? (
              <AutoGeneratingPlaceholder label="tweet para X" />
            ) : (
              <textarea
                value={formData.xDescription}
                onChange={(e) => setFormData({ ...formData, xDescription: e.target.value })}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[180px]"
                placeholder={"🚀 [Tweet corto y directo]\n\n#WebDev #Chile"}
                maxLength={280}
              />
            )}
            {!showXPlaceholder && (
              <p className={`text-[10px] ${xLen > 280 ? "text-red-400" : "text-muted-foreground"}`}>
                Máximo 280 caracteres · {xLen}/280
              </p>
            )}
            <LibraryControls
              network="x"
              videoId={video?.id}
              title={formData.title}
              description={formData.description}
              currentText={formData.xDescription || ""}
              onAppend={(t) => setFormData({ ...formData, xDescription: t.slice(0, 280) })}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-[#1877F2] flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </span>
              Facebook
              <span className="text-[10px] text-muted-foreground font-normal">(opcional)</span>
            </label>
            {formData.facebookDescription && (
              <button onClick={() => copyText(formData.facebookDescription)} className="text-xs text-primary hover:text-primary/80">
                <Copy className="w-3 h-3 inline mr-1" />Copiar
              </button>
            )}
          </div>
          <TruncatedTextarea
            value={formData.facebookDescription}
            onChange={(e) => setFormData({ ...formData, facebookDescription: e.target.value.slice(0, 500) })}
            truncateAt={480}
            maxLength={500}
            minHeightClass="min-h-[100px]"
            placeholder={"¿Qué aprendes hoy? Comparte con tu comunidad 👇\n\n#WebDev #Chile"}
            ariaLabel="Descripción para Facebook"
          />
          <p className="text-[10px] text-muted-foreground">Máximo 500 caracteres · {(formData.facebookDescription || "").length}/500</p>
          <LibraryControls
            network="facebook"
            videoId={video?.id}
            title={formData.title}
            description={formData.description}
            currentText={formData.facebookDescription || ""}
            onAppend={(t) => setFormData({ ...formData, facebookDescription: t.slice(0, 500) })}
          />
        </div>

        <div className="pt-4 flex justify-between">
          <Button variant="outline" onClick={onPrev} className="border-foreground/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || isAutoGenerating || !formData.linkedinDescription || !formData.xDescription || xLen > 280}
            className="bg-primary"
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ChevronRight className="w-4 h-4 mr-2" />}
            Guardar y Continuar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepReview({
  video,
  onSchedule,
  onPrev,
  isPending,
  copyText,
}: {
  video: VideoData & Record<string, any>;
  onSchedule: (includeFacebook: boolean) => void;
  onPrev: () => void;
  isPending: boolean;
  copyText: (text: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ttFileInputRef = useRef<HTMLInputElement>(null);
  const [ytUploading, setYtUploading] = useState(false);
  const [ytResult, setYtResult] = useState<{ success?: boolean; message?: string; youtubeUrl?: string; error?: string; thumbnailSet?: boolean; thumbnailError?: string } | null>(null);
  const [ttUploading, setTtUploading] = useState(false);
  const [ttResult, setTtResult] = useState<{ success?: boolean; message?: string; publishId?: string; error?: string } | null>(null);
  const [igUploading, setIgUploading] = useState(false);
  const [igResult, setIgResult] = useState<{ success?: boolean; message?: string; mediaId?: string; error?: string } | null>(null);
  const [showYtDrivePicker, setShowYtDrivePicker] = useState(false);
  const [showTtDrivePicker, setShowTtDrivePicker] = useState(false);
  const [showIgDrivePicker, setShowIgDrivePicker] = useState(false);
  const [includeFacebook, setIncludeFacebook] = useState(!!video.facebookDescription);
  const queryClient = useQueryClient();

  const hasVideoFile = !!video.videoFileDriveId;

  const handleYtDriveSelect = async (file: { id: string; name: string }) => {
    setShowYtDrivePicker(false);
    setYtUploading(true);
    setYtResult(null);
    try {
      await apiFetch(`${API_BASE}/content/videos/${video.id}/link-drive-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId: file.id, fileName: file.name }),
      });
      const res = await apiFetch(`${API_BASE}/youtube/upload-from-drive/${video.id}`, {
        method: "POST",
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setYtResult({ success: false, error: `Error del servidor (${res.status}).` });
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setYtResult({ success: true, message: data.message, youtubeUrl: data.youtubeUrl, thumbnailSet: data.thumbnailSet, thumbnailError: data.thumbnailError });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setYtResult({ success: false, error: data.error || "Error desconocido" });
      }
    } catch (err: any) {
      setYtResult({ success: false, error: err.message || "Error de red" });
    } finally {
      setYtUploading(false);
    }
  };

  const handleTtDriveSelect = async (file: { id: string; name: string }) => {
    setShowTtDrivePicker(false);
    setTtUploading(true);
    setTtResult(null);
    try {
      await apiFetch(`${API_BASE}/content/videos/${video.id}/link-drive-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId: file.id, fileName: file.name }),
      });
      const res = await apiFetch(`${API_BASE}/tiktok/upload-from-drive/${video.id}`, {
        method: "POST",
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setTtResult({ success: false, error: `Error del servidor (${res.status}).` });
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setTtResult({ success: true, message: data.message, publishId: data.publishId });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setTtResult({ success: false, error: data.error || "Error desconocido" });
      }
    } catch (err: any) {
      setTtResult({ success: false, error: err.message || "Error de red" });
    } finally {
      setTtUploading(false);
    }
  };

  const handleYouTubeUpload = async (file?: File) => {
    setYtUploading(true);
    setYtResult(null);
    try {
      let res: Response;
      if (hasVideoFile && !file) {
        res = await apiFetch(`${API_BASE}/youtube/upload-from-drive/${video.id}`, {
          method: "POST",
        });
      } else if (file) {
        const fd = new FormData();
        fd.append("video", file);
        res = await apiFetch(`${API_BASE}/youtube/upload/${video.id}`, {
          method: "POST",
          body: fd,
        });
      } else {
        setYtResult({ success: false, error: "No hay archivo de video. Sube uno en el paso 1." });
        setYtUploading(false);
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setYtResult({ success: false, error: `Error del servidor (${res.status}). Recarga la página e intenta de nuevo.` });
        setYtUploading(false);
        return;
      }
      const data = await res.json();

      if (res.ok && data.success) {
        setYtResult({ success: true, message: data.message, youtubeUrl: data.youtubeUrl, thumbnailSet: data.thumbnailSet, thumbnailError: data.thumbnailError });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setYtResult({ success: false, error: data.error || "Error desconocido" });
      }
    } catch (err: any) {
      setYtResult({ success: false, error: err.message || "Error de red" });
    } finally {
      setYtUploading(false);
    }
  };

  const handleIgDriveSelect = async (file: { id: string; name: string }) => {
    setShowIgDrivePicker(false);
    setIgUploading(true);
    setIgResult(null);
    try {
      await apiFetch(`${API_BASE}/content/videos/${video.id}/link-drive-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId: file.id, fileName: file.name }),
      });
      const res = await apiFetch(`${API_BASE}/instagram/upload-from-drive/${video.id}`, {
        method: "POST",
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setIgResult({ success: false, error: `Error del servidor (${res.status}).` });
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setIgResult({ success: true, message: data.message, mediaId: data.mediaId });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setIgResult({ success: false, error: data.error || "Error desconocido" });
      }
    } catch (err: any) {
      setIgResult({ success: false, error: err.message || "Error de red" });
    } finally {
      setIgUploading(false);
    }
  };

  const handleInstagramUpload = async () => {
    if (!hasVideoFile) {
      setIgResult({ success: false, error: "No hay archivo de video en Drive. Sube uno primero." });
      return;
    }
    setIgUploading(true);
    setIgResult(null);
    try {
      const res = await apiFetch(`${API_BASE}/instagram/upload-from-drive/${video.id}`, {
        method: "POST",
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setIgResult({ success: false, error: `Error del servidor (${res.status}). Recarga la página e intenta de nuevo.` });
        setIgUploading(false);
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setIgResult({ success: true, message: data.message, mediaId: data.mediaId });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setIgResult({ success: false, error: data.error || "Error desconocido" });
      }
    } catch (err: any) {
      setIgResult({ success: false, error: err.message || "Error de red" });
    } finally {
      setIgUploading(false);
    }
  };

  const handleTikTokUpload = async (file?: File) => {
    setTtUploading(true);
    setTtResult(null);
    try {
      let res: Response;
      if (hasVideoFile && !file) {
        res = await apiFetch(`${API_BASE}/tiktok/upload-from-drive/${video.id}`, {
          method: "POST",
        });
      } else if (file) {
        const fd = new FormData();
        fd.append("video", file);
        res = await apiFetch(`${API_BASE}/tiktok/upload/${video.id}`, {
          method: "POST",
          body: fd,
        });
      } else {
        setTtResult({ success: false, error: "No hay archivo de video. Sube uno en el paso 1." });
        setTtUploading(false);
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setTtResult({ success: false, error: `Error del servidor (${res.status}). Recarga la página e intenta de nuevo.` });
        setTtUploading(false);
        return;
      }
      const data = await res.json();

      if (res.ok && data.success) {
        setTtResult({ success: true, message: data.message, publishId: data.publishId });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setTtResult({ success: false, error: data.error || "Error desconocido" });
      }
    } catch (err: any) {
      setTtResult({ success: false, error: err.message || "Error de red" });
    } finally {
      setTtUploading(false);
    }
  };

  const allComplete =
    video.title &&
    video.description &&
    video.coverImageBase64 &&
    video.tiktokDescription &&
    video.instagramDescription &&
    video.youtubeTitle &&
    video.youtubeDescription &&
    video.linkedinDescription &&
    video.xDescription;

  const isScheduled = video.status === "scheduled" || video.status === "published";

  const platforms = [
    {
      name: "TikTok",
      icon: (
        <span className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9a6.33 6.33 0 00-.79-.05A6.34 6.34 0 003.15 15.3a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.37a8.16 8.16 0 004.76 1.52V7.45a4.85 4.85 0 01-1-.76z"/></svg>
        </span>
      ),
      status: video.tiktokStatus,
      content: video.tiktokDescription,
      ready: !!video.tiktokDescription,
    },
    {
      name: "Instagram",
      icon: (
        <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
        </span>
      ),
      status: video.instagramStatus,
      content: video.instagramDescription,
      ready: !!video.instagramDescription,
    },
    {
      name: "YouTube",
      icon: (
        <span className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        </span>
      ),
      status: video.youtubeStatus,
      content: video.youtubeTitle ? `${video.youtubeTitle}\n\n${video.youtubeDescription || ""}` : "",
      ready: !!video.youtubeTitle && !!video.youtubeDescription,
    },
    {
      name: "LinkedIn",
      icon: (
        <span className="w-8 h-8 rounded-lg bg-[#0A66C2] flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M19 0h-14c-2.76 0-5 2.24-5 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5v-14c0-2.76-2.24-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.27c-.97 0-1.75-.79-1.75-1.76s.78-1.76 1.75-1.76 1.75.79 1.75 1.76-.78 1.76-1.75 1.76zm13.5 12.27h-3v-5.6c0-3.37-4-3.11-4 0v5.6h-3v-11h3v1.76c1.4-2.59 7-2.78 7 2.48v6.76z"/></svg>
        </span>
      ),
      status: video.linkedinStatus,
      content: video.linkedinDescription || "",
      ready: !!video.linkedinDescription,
    },
    {
      name: "X (Twitter)",
      icon: (
        <span className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </span>
      ),
      status: video.xStatus,
      content: video.xDescription || "",
      ready: !!video.xDescription,
    },
    {
      name: "Facebook",
      icon: (
        <span className="w-8 h-8 rounded-lg bg-[#1877F2] flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </span>
      ),
      status: video.facebookStatus,
      content: video.facebookDescription || "",
      ready: !!video.facebookDescription,
      optional: true,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 border-foreground/10">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Revisar y Programar
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Revisa todo antes de programar en las 6 plataformas
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            {video.coverImageBase64 && (
              <div className="w-20 sm:w-28 flex-shrink-0 mx-auto sm:mx-0">
                <img
                  src={`data:${video.coverMimeType || "image/png"};base64,${video.coverImageBase64}`}
                  className="w-full aspect-[9/16] object-cover rounded-xl border border-foreground/10"
                  alt="Portada"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-bold">{video.title}</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">{video.description}</p>
              {video.month && (
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="outline" className="border-foreground/10 text-[10px] sm:text-xs">
                    <Folder className="w-3 h-3 mr-1" />
                    {video.month}/{video.week}/{video.day}/#{video.videoNumber}{video.scheduleHour ? ` · ${video.scheduleHour}` : ""}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {platforms.map((platform) => (
              <div
                key={platform.name}
                className={`flex items-center gap-4 p-4 rounded-xl border ${
                  platform.ready
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-red-500/20 bg-red-500/5"
                }`}
              >
                {platform.icon}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{platform.name}</span>
                    {platform.ready ? (
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                        <Check className="w-3 h-3 mr-1" />
                        Listo
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Pendiente
                      </Badge>
                    )}
                    {isScheduled && platform.status === "scheduled" && (
                      <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
                        <Clock className="w-3 h-3 mr-1" />
                        Programado
                      </Badge>
                    )}
                  </div>
                  {platform.content && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{platform.content.substring(0, 80)}...</p>
                  )}
                </div>
                {platform.content && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => copyText(platform.content!)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {!allComplete && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">Faltan datos por completar</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Completa todos los pasos anteriores antes de programar
                </p>
              </div>
            </div>
          )}

          {(video.linkedinError || video.xError || video.status === "partial" || video.status === "error") && (
            <div className={`rounded-xl p-4 space-y-2 border ${
              video.status === "partial"
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-rose-500/10 border-rose-500/30"
            }`}>
              <div className="flex items-start gap-2">
                <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${video.status === "partial" ? "text-amber-400" : "text-rose-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${video.status === "partial" ? "text-amber-300" : "text-rose-300"}`}>
                    {video.status === "partial" ? "Publicado parcialmente" : "Hubo errores al publicar"}
                  </p>
                  <div className="mt-2 space-y-1">
                    {video.linkedinError && (
                      <div className="text-xs px-2 py-1.5 rounded bg-destructive/10 text-destructive border border-destructive/30">
                        <span className="font-semibold">LinkedIn:</span> {video.linkedinError}
                      </div>
                    )}
                    {video.xError && (
                      <div className="text-xs px-2 py-1.5 rounded bg-destructive/10 text-destructive border border-destructive/30">
                        <span className="font-semibold">X:</span> {video.xError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isScheduled && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-emerald-400">Programado en las plataformas configuradas</p>
                  {video.scheduleHour && (
                    <div className="flex items-center gap-2 mt-2 bg-foreground/5 rounded-lg px-3 py-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Hora programada: <span className="text-primary">{video.scheduleHour}</span></span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({video.month} / {video.week} / {video.day})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {video.youtubeVideoId ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">Subido a YouTube</p>
                <p className="text-xs text-muted-foreground">ID: {video.youtubeVideoId}</p>
              </div>
              <a
                href={`https://youtube.com/shorts/${video.youtubeVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-red-400 hover:text-red-300 underline"
              >
                Ver en YouTube
              </a>
            </div>
          ) : isScheduled && video.youtubeTitle && (
            <div className="bg-foreground/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Subida Inmediata</span>
                <span className="text-[10px] text-muted-foreground">· Se sube ahora, no en la hora programada</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Subir a YouTube ahora</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {hasVideoFile
                        ? `Subir "${video.videoFileName || "video"}" como Short privado`
                        : "Selecciona un video desde Drive"}
                    </p>
                  </div>
                </div>
                <div className="flex">
                  {hasVideoFile ? (
                    <Button
                      onClick={() => handleYouTubeUpload()}
                      disabled={ytUploading}
                      className="bg-red-600 hover:bg-red-500 text-white w-full sm:w-auto"
                      size="sm"
                    >
                      {ytUploading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      {ytUploading ? "Subiendo..." : "Subir desde Drive"}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setShowYtDrivePicker(true)}
                      disabled={ytUploading}
                      className="bg-red-600 hover:bg-red-500 text-white w-full sm:w-auto"
                      size="sm"
                    >
                      {ytUploading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FolderOpen className="w-4 h-4 mr-2" />
                      )}
                      {ytUploading ? "Subiendo..." : "Desde Drive"}
                    </Button>
                  )}
                </div>
              </div>
              {showYtDrivePicker && (
                <DriveVideoPicker
                  onSelect={(file) => handleYtDriveSelect(file)}
                  onClose={() => setShowYtDrivePicker(false)}
                />
              )}

              {ytResult && (
                <div className={`rounded-lg p-3 text-sm ${
                  ytResult.success
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}>
                  {ytResult.success ? (
                    <div>
                      <p className="font-medium">{ytResult.message}</p>
                      {ytResult.youtubeUrl && (
                        <a href={ytResult.youtubeUrl} target="_blank" rel="noopener noreferrer" className="underline text-xs mt-1 block">
                          {ytResult.youtubeUrl}
                        </a>
                      )}
                      {ytResult.thumbnailSet === false && ytResult.thumbnailError && (
                        <p className="text-xs text-amber-400 mt-2">
                          ⚠ Portada no aplicada: {ytResult.thumbnailError}
                        </p>
                      )}
                      {ytResult.thumbnailSet && (
                        <p className="text-xs text-emerald-400 mt-1">✓ Portada aplicada como miniatura</p>
                      )}
                    </div>
                  ) : (
                    <p>{ytResult.error}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {video.tiktokPublishId ? (
            <div className="bg-foreground/[0.04] border border-foreground/10 rounded-xl p-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.98a8.18 8.18 0 004.76 1.52V7.05a4.84 4.84 0 01-1-.36z"/></svg>
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Subido a TikTok</p>
                <p className="text-xs text-muted-foreground">Publish ID: {video.tiktokPublishId}</p>
              </div>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full font-medium">
                Enviado
              </span>
            </div>
          ) : isScheduled && video.tiktokDescription && (
            <div className="bg-foreground/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Subida Inmediata</span>
                <span className="text-[10px] text-muted-foreground">· Se sube ahora, no en la hora programada</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.98a8.18 8.18 0 004.76 1.52V7.05a4.84 4.84 0 01-1-.36z"/></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Subir a TikTok ahora</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {hasVideoFile
                        ? `Subir "${video.videoFileName || "video"}" como privado`
                        : "Selecciona un video desde Drive"}
                    </p>
                  </div>
                </div>
                <div className="flex">
                  {hasVideoFile ? (
                    <Button
                      onClick={() => handleTikTokUpload()}
                      disabled={ttUploading}
                      className="bg-black hover:bg-zinc-800 text-white border border-foreground/10 w-full sm:w-auto"
                      size="sm"
                    >
                      {ttUploading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      {ttUploading ? "Subiendo..." : "Subir desde Drive"}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setShowTtDrivePicker(true)}
                      disabled={ttUploading}
                      className="bg-black hover:bg-zinc-800 text-white border border-foreground/10 w-full sm:w-auto"
                      size="sm"
                    >
                      {ttUploading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FolderOpen className="w-4 h-4 mr-2" />
                      )}
                      {ttUploading ? "Subiendo..." : "Desde Drive"}
                    </Button>
                  )}
                </div>
              </div>
              {showTtDrivePicker && (
                <DriveVideoPicker
                  onSelect={(file) => handleTtDriveSelect(file)}
                  onClose={() => setShowTtDrivePicker(false)}
                />
              )}

              {ttResult && (
                <div className={`rounded-xl p-4 text-sm flex items-start gap-3 ${
                  ttResult.success
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}>
                  {ttResult.success ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Subida exitosa a TikTok</p>
                        <p className="text-xs text-muted-foreground mt-1">{ttResult.message}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <p>{ttResult.error}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {video.instagramMediaId ? (
            <div className="bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-orange-500/10 border border-pink-500/20 rounded-xl p-4 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-pink-400">Subido a Instagram</p>
                <p className="text-xs text-muted-foreground">Media ID: {video.instagramMediaId}</p>
              </div>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full font-medium">
                Publicado
              </span>
            </div>
          ) : isScheduled && video.instagramDescription && (
            <div className="bg-foreground/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Subida Inmediata</span>
                <span className="text-[10px] text-muted-foreground">· Se sube ahora como Reel público</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Subir a Instagram ahora</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {hasVideoFile
                        ? `Subir "${video.videoFileName || "video"}" como Reel`
                        : "Selecciona un video desde Drive"}
                    </p>
                  </div>
                </div>
                <div className="flex">
                  {hasVideoFile ? (
                    <Button
                      onClick={() => handleInstagramUpload()}
                      disabled={igUploading}
                      className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 hover:from-purple-500 hover:via-pink-400 hover:to-orange-300 text-white w-full sm:w-auto"
                      size="sm"
                    >
                      {igUploading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      {igUploading ? "Subiendo..." : "Subir desde Drive"}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setShowIgDrivePicker(true)}
                      disabled={igUploading}
                      className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 hover:from-purple-500 hover:via-pink-400 hover:to-orange-300 text-white w-full sm:w-auto"
                      size="sm"
                    >
                      {igUploading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FolderOpen className="w-4 h-4 mr-2" />
                      )}
                      {igUploading ? "Subiendo..." : "Desde Drive"}
                    </Button>
                  )}
                </div>
              </div>
              {showIgDrivePicker && (
                <DriveVideoPicker
                  onSelect={(file) => handleIgDriveSelect(file)}
                  onClose={() => setShowIgDrivePicker(false)}
                />
              )}

              {igResult && (
                <div className={`rounded-xl p-4 text-sm flex items-start gap-3 ${
                  igResult.success
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}>
                  {igResult.success ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Subida exitosa a Instagram</p>
                        <p className="text-xs text-muted-foreground mt-1">{igResult.message}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <p>{igResult.error}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-4 flex justify-between">
            <Button variant="outline" onClick={onPrev} className="border-foreground/10">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Anterior
            </Button>
            {!isScheduled && (
              <div className="flex items-center gap-3 flex-wrap justify-end">
                {video.facebookDescription && (
                  <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                    <input
                      type="checkbox"
                      checked={includeFacebook}
                      onChange={(e) => setIncludeFacebook(e.target.checked)}
                      className="w-4 h-4 accent-[#1877F2] rounded"
                    />
                    <span className="w-5 h-5 rounded bg-[#1877F2] flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    </span>
                    <span>Incluir Facebook</span>
                  </label>
                )}
                <Button
                  onClick={() => onSchedule(includeFacebook)}
                  disabled={!allComplete || isPending}
                  className="bg-gradient-to-r from-green-600 to-emerald-500 shadow-lg shadow-green-900/25"
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Programar
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const WORKFLOW_LABEL: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "bg-foreground/10 text-foreground/70 border-foreground/15" },
  en_revision: { label: "En revisión", cls: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  aprobado: { label: "Aprobado", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
  programado: { label: "Programado", cls: "bg-orange-500/15 text-orange-300 border-orange-500/25" },
  publicado: { label: "Publicado", cls: "bg-sky-500/15 text-sky-300 border-sky-500/25" },
};

function useTeamMembers() {
  return useQuery<TeamMember[]>({
    queryKey: ["team", "members"],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/team/members`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useCurrentUser() {
  return useQuery<{ id: number; email: string; name: string | null; teamRole: string } | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/auth/me`);
      if (!r.ok) return null;
      const j = await r.json();
      return j.user ?? j;
    },
    staleTime: 5 * 60 * 1000,
  });
}

function ApprovalBar({ video, onJumpToComments, onJumpToReview }: { video: VideoData; onJumpToComments: () => void; onJumpToReview?: () => void }) {
  const { data: me } = useCurrentUser();
  const { data: members = [] } = useTeamMembers();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reviewerId, setReviewerId] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: reviews = [] } = useQuery<VideoReview[]>({
    queryKey: ["video-reviews", video.id],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/content/videos/${video.id}/reviews`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const pending = reviews.find((r) => r.status === "pending");
  const isReviewer = me?.teamRole === "reviewer";
  const isAssignedReviewer = pending && me && pending.reviewerId === me.id;
  const status = (video.workflowStatus || "borrador") as keyof typeof WORKFLOW_LABEL;
  const wf = WORKFLOW_LABEL[status] || WORKFLOW_LABEL.borrador;
  const reviewers = members.filter((m) => m.teamRole === "reviewer");

  const requestReview = async () => {
    if (!reviewerId) {
      toast({ title: "Selecciona un revisor", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const r = await apiFetch(`${API_BASE}/content/videos/${video.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerId: Number(reviewerId), note }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Revisión solicitada" });
      setOpen(false);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["video-reviews", video.id] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["reviews", "pending"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (decision: "approved" | "changes_requested", thenSchedule = false) => {
    setSubmitting(true);
    try {
      const r = await apiFetch(`${API_BASE}/content/videos/${video.id}/reviews/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      if (!r.ok) throw new Error(await r.text());
      let toastTitle = decision === "approved" ? "Video aprobado" : "Cambios solicitados";
      if (thenSchedule && decision === "approved") {
        if (video.scheduledAt) {
          const sr = await apiFetch(`${API_BASE}/content/videos/${video.id}/schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduledAt: video.scheduledAt, driveFolderId: video.driveFolderId ?? null }),
          });
          if (!sr.ok) {
            toast({ title: "Aprobado, pero no se pudo programar", description: await sr.text(), variant: "destructive" });
          } else {
            toastTitle = "Aprobado y programado";
          }
        } else if (onJumpToReview) {
          toastTitle = "Aprobado · elige fecha para programar";
          onJumpToReview();
        }
      }
      toast({ title: toastTitle });
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["video-reviews", video.id] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["reviews", "pending"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-foreground/10 bg-card/40">
        <span className={`text-[11px] uppercase tracking-wider px-2 py-1 rounded-md border ${wf.cls}`}>
          {wf.label}
        </span>
        {pending && (
          <span className="text-xs text-muted-foreground">
            Revisión asignada a <strong className="text-foreground/80">{pending.reviewerName || pending.reviewerEmail}</strong>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onJumpToComments} className="h-8 text-xs">
            <MessageSquare className="w-3.5 h-3.5 mr-1" /> Comentarios
          </Button>
          {!pending && status !== "aprobado" && status !== "publicado" && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-8 text-xs">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Pedir revisión
            </Button>
          )}
          {pending && (isReviewer || isAssignedReviewer) && (
            <>
              <Button size="sm" variant="outline" onClick={() => decide("changes_requested")} disabled={submitting} className="h-8 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10">
                Solicitar cambios
              </Button>
              <Button size="sm" onClick={() => decide("approved")} disabled={submitting} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500">
                <Check className="w-3.5 h-3.5 mr-1" /> Aprobar
              </Button>
              {onJumpToReview && (
                <Button size="sm" onClick={() => decide("approved", true)} disabled={submitting} className="h-8 text-xs bg-emerald-700 hover:bg-emerald-600">
                  <Send className="w-3.5 h-3.5 mr-1" /> Aprobar y programar
                </Button>
              )}
            </>
          )}
          {!pending && isReviewer && status !== "aprobado" && status !== "publicado" && (
            <>
              <Button size="sm" onClick={() => decide("approved")} disabled={submitting} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500">
                <Check className="w-3.5 h-3.5 mr-1" /> Aprobar directamente
              </Button>
              {onJumpToReview && (
                <Button size="sm" onClick={() => decide("approved", true)} disabled={submitting} className="h-8 text-xs bg-emerald-700 hover:bg-emerald-600">
                  <Send className="w-3.5 h-3.5 mr-1" /> Aprobar y programar
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir revisión</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Revisor</label>
              <select
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-card/40 border border-foreground/10 text-sm"
              >
                <option value="">Selecciona un revisor…</option>
                {reviewers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name || r.email}</option>
                ))}
              </select>
              {reviewers.length === 0 && (
                <p className="text-[11px] text-amber-400 mt-1">No hay revisores asignados. Ve a /equipo para asignar uno.</p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nota (opcional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-card/40 border border-foreground/10 text-sm"
                placeholder="¿Qué quieres que revise?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={requestReview} disabled={submitting || !reviewerId}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                Enviar solicitud
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CommentsAndApproval({ video, onUpdated }: { video: VideoData; onUpdated: () => void }) {
  const { data: me } = useCurrentUser();
  const { data: members = [] } = useTeamMembers();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestQuery, setSuggestQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: comments = [], isLoading } = useQuery<VideoComment[]>({
    queryKey: ["video-comments", video.id],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/content/videos/${video.id}/comments`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: reviews = [] } = useQuery<VideoReview[]>({
    queryKey: ["video-reviews", video.id],
    queryFn: async () => {
      const r = await apiFetch(`${API_BASE}/content/videos/${video.id}/reviews`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const submit = async () => {
    const txt = body.trim();
    if (!txt) return;
    try {
      const r = await apiFetch(`${API_BASE}/content/videos/${video.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: txt }),
      });
      if (!r.ok) throw new Error(await r.text());
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["video-comments", video.id] });
      onUpdated();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const remove = async (id: number) => {
    try {
      const r = await apiFetch(`${API_BASE}/comments/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      queryClient.invalidateQueries({ queryKey: ["video-comments", video.id] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const onBodyChange = (val: string) => {
    setBody(val);
    const cursor = textareaRef.current?.selectionStart ?? val.length;
    const upToCursor = val.slice(0, cursor);
    const m = upToCursor.match(/@([\w.+-]*)$/);
    if (m) {
      setSuggestQuery(m[1].toLowerCase());
      setShowSuggest(true);
    } else {
      setShowSuggest(false);
    }
  };

  const insertMention = (email: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = body.slice(0, cursor).replace(/@([\w.+-]*)$/, `@${email} `);
    const after = body.slice(cursor);
    const next = before + after;
    setBody(next);
    setShowSuggest(false);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const suggestions = useMemo(() => {
    return members
      .filter((m) => m.email.toLowerCase().includes(suggestQuery) || (m.name || "").toLowerCase().includes(suggestQuery))
      .slice(0, 6);
  }, [members, suggestQuery]);

  const renderBody = (text: string) => {
    // Lightweight markdown: **bold**, *italic*, `code`, [text](url), and @email mentions.
    const tokenRe = /(@[\w.+-]+@[\w.-]+\.[\w]+)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))/g;
    const out: ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = tokenRe.exec(text)) !== null) {
      if (m.index > last) out.push(<span key={key++}>{text.slice(last, m.index)}</span>);
      const tok = m[0];
      if (m[1]) out.push(<span key={key++} className="text-primary font-medium">{tok}</span>);
      else if (m[2]) out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
      else if (m[3]) out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
      else if (m[4]) out.push(<code key={key++} className="px-1 py-0.5 rounded bg-foreground/10 text-[0.85em]">{tok.slice(1, -1)}</code>);
      else if (m[5]) {
        const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (lm) out.push(<a key={key++} href={lm[2]} target="_blank" rel="noreferrer" className="text-primary underline">{lm[1]}</a>);
      }
      last = m.index + tok.length;
    }
    if (last < text.length) out.push(<span key={key++}>{text.slice(last)}</span>);
    return out;
  };

  return (
    <div className="grid lg:grid-cols-[1fr_20rem] gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="w-4 h-4" /> Comentarios del equipo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Cargando…</div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay comentarios. Sé el primero en abrir la conversación.</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-xl border border-foreground/10 bg-card/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span><strong className="text-foreground/80">{c.authorName || c.authorEmail || "Usuario"}</strong> · {new Date(c.createdAt).toLocaleString("es-ES")}</span>
                    {me && c.authorId === me.id && (
                      <button onClick={() => remove(c.id)} className="text-muted-foreground/60 hover:text-destructive" aria-label="Eliminar comentario">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap break-words">{renderBody(c.body)}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              rows={3}
              placeholder="Escribe un comentario… usa @email para mencionar a alguien"
              className="w-full px-3 py-2 rounded-lg bg-card/40 border border-foreground/10 text-sm resize-y"
            />
            {showSuggest && suggestions.length > 0 && (
              <div className="absolute z-30 bottom-full mb-1 left-0 right-0 max-w-sm rounded-lg border border-foreground/10 bg-popover shadow-xl overflow-hidden">
                {suggestions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => insertMention(m.email)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-foreground/[0.05] flex items-center gap-2"
                  >
                    <AtSign className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium">{m.name || m.email}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{m.email}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-2">
              <Button size="sm" onClick={submit} disabled={!body.trim()}>
                <Send className="w-3.5 h-3.5 mr-1" /> Comentar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4" /> Historial de aprobación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin solicitudes de revisión todavía.</p>
          ) : (
            <ul className="space-y-2">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-lg border border-foreground/10 bg-card/40 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground/80">{r.reviewerName || r.reviewerEmail}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                      r.status === "approved" ? "bg-emerald-500/15 text-emerald-300" :
                      r.status === "changes_requested" ? "bg-amber-500/15 text-amber-300" :
                      "bg-foreground/10 text-foreground/70"
                    }`}>
                      {r.status === "approved" ? "Aprobado" : r.status === "changes_requested" ? "Cambios" : "Pendiente"}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    Solicitada por {r.requesterName || "—"} · {new Date(r.createdAt).toLocaleString("es-ES")}
                  </div>
                  {r.decisionNote && <p className="mt-1 italic text-foreground/80">"{r.decisionNote}"</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
