import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react";
import { useLang } from "@/lib/lang";
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
import { NETWORK_BG, NetworkIcon, type Network } from "@/components/social-icons";
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
import { cn } from "@/lib/utils";
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
  Download,
  FileText,
  FileDown,
  CloudOff,
  ChevronDown,
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

const MAX_VIDEO_SIZE_MB = 256;
const ACCEPTED_VIDEO_MIME_PREFIX = "video/";

type UploadProgress = { loaded: number; total: number; pct: number; bps: number };
type UploadHandle = {
  promise: Promise<{ ok: boolean; status: number; data: any }>;
  abort: () => void;
};

// XHR-based upload to expose real progress events. `fetch` no soporta
// `upload.onprogress`; XHR sí. Mantiene credentials:"include" para auth.
function uploadVideoWithProgress(
  url: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const fd = new FormData();
  fd.append("video", file);
  const startedAt = Date.now();
  const promise = new Promise<{ ok: boolean; status: number; data: any }>((resolve, reject) => {
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const elapsed = Math.max(1, (Date.now() - startedAt) / 1000);
      onProgress({
        loaded: ev.loaded,
        total: ev.total,
        pct: Math.min(100, Math.round((ev.loaded / ev.total) * 100)),
        bps: ev.loaded / elapsed,
      });
    };
    xhr.onload = () => {
      let data: any = null;
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* noop */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("UPLOAD_NETWORK_ERROR"));
    xhr.onabort = () => reject(new Error("UPLOAD_CANCELLED"));
    xhr.send(fd);
  });
  return { promise, abort: () => xhr.abort() };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
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
  tiktokError?: string | null;
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

function getSteps(t: ReturnType<typeof useLang>["t"]): { key: WizardStep; label: string; shortLabel: string }[] {
  return [
    { key: "info", label: t.stepInfo, shortLabel: t.stepInfoShort },
    { key: "cover", label: t.stepCover, shortLabel: t.stepCoverShort },
    { key: "tiktok-instagram", label: t.stepTikTokInstagram, shortLabel: t.stepTikTokShort },
    { key: "youtube", label: t.stepYouTube, shortLabel: t.stepYouTubeShort },
    { key: "linkedin-x", label: t.stepLinkedInX, shortLabel: t.stepLinkedInXShort },
    { key: "review", label: t.stepReview, shortLabel: t.stepReviewShort },
    { key: "comments", label: t.stepComments, shortLabel: t.stepCommentsShort },
  ];
}

function isStepComplete(video: VideoData | null, step: WizardStep): boolean {
  if (!video) return false;
  switch (step) {
    case "info":
      return !!video.title && !!video.description;
    case "cover":
      // Optional — never block the wizard on cover.
      return true;
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

function getStatusBadge(video: VideoData, t: ReturnType<typeof useLang>["t"]) {
  const progress = getVideoProgress(video);
  if (video.status === "published") return { label: t.statusPublished, className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  if (video.status === "partial") return { label: t.statusPartial, className: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  if (video.status === "error") return { label: t.statusError, className: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
  if (video.status === "scheduled") return { label: t.statusScheduled, className: "bg-orange-500/10 text-orange-400 border-orange-500/20" };
  if (progress === 100) return { label: t.statusReady, className: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
  if (progress > 0) return { label: t.statusComplete(progress), className: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
  return { label: t.statusDraft, className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" };
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

function getStatusOptions(t: ReturnType<typeof useLang>["t"]): { value: string; label: string }[] {
  return [
    { value: "all", label: t.filterAllStatuses },
    { value: "draft", label: t.filterDraft },
    { value: "cover_generated", label: t.filterCoverReady },
    { value: "scheduled", label: t.filterScheduled },
    { value: "published", label: t.filterPublished },
    { value: "partial", label: t.filterPartial },
    { value: "error", label: t.filterError },
  ];
}

function getNetworkOptions(t: ReturnType<typeof useLang>["t"]): { value: string; label: string }[] {
  return [
    { value: "all", label: t.filterAllNetworks },
    { value: "youtube", label: "YouTube" },
    { value: "instagram", label: "Instagram" },
    { value: "tiktok", label: "TikTok" },
    { value: "linkedin", label: "LinkedIn" },
    { value: "x", label: "X / Twitter" },
    { value: "facebook", label: "Facebook" },
  ];
}

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

// CSV parser tolerant to quoted fields with commas/newlines and "" escapes.
// Returns rows of strings (header included). Empty trailing newlines are
// dropped. Unicode-friendly (no regex character class assumptions).
function parseCsv(text: string): string[][] {
  // Strip UTF-8 BOM (\uFEFF) — Excel/Sheets often add it on export, which
  // would otherwise corrupt the first header (`\uFEFFtitle` !== `title`).
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* skip; handle on next \n */ }
      else { field += ch; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

const CSV_TEMPLATE = `title,description,month,week,day,videoNumber,scheduleHour,campaignId,templateId
Cómo escalar tu agencia,"Tres claves para crecer sin perder calidad",Mes 1,Semana 1,Lunes,1,09:00,,
Errores comunes en TikTok,"Lo que nadie te dijo sobre el algoritmo",Mes 1,Semana 1,Miércoles,2,18:30,,
`;

type ParsedCsvRow = {
  index: number;
  raw: Record<string, string>;
  title: string;
  description: string;
  month: string;
  week: string;
  day: string;
  videoNumber: string;
  scheduleHour: string;
  campaignId: string;
  templateId: string;
  error: string | null;
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

const HEADER_ALIASES: Record<string, keyof ParsedCsvRow> = {
  title: "title", titulo: "title", título: "title",
  description: "description", descripcion: "description", descripción: "description",
  month: "month", mes: "month",
  week: "week", semana: "week",
  day: "day", dia: "day", día: "day",
  videonumber: "videoNumber", numero: "videoNumber", número: "videoNumber", "n°": "videoNumber",
  schedulehour: "scheduleHour", hora: "scheduleHour", time: "scheduleHour",
  campaignid: "campaignId", campana: "campaignId", campaña: "campaignId",
  templateid: "templateId", plantilla: "templateId", template: "templateId",
};

function ImportCsvDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedCsvRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [serverErrors, setServerErrors] = useState<{ row: number; error: string }[]>([]);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setFileName(null); setRows([]); setParseError(null); setProgress(null);
    setServerErrors([]); setImporting(false); setDragOver(false);
  };

  const close = () => { if (!importing) { reset(); onClose(); } };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setServerErrors([]);
    setProgress(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const grid = parseCsv(text);
        if (grid.length < 2) { setParseError(t.csvEmptyError); setRows([]); return; }
        const header = grid[0].map(normalizeHeader);
        const colIdx: Partial<Record<keyof ParsedCsvRow, number>> = {};
        header.forEach((h, i) => { const k = HEADER_ALIASES[h]; if (k) colIdx[k] = i; });
        if (colIdx.title === undefined || colIdx.description === undefined) {
          setParseError(t.csvMissingCols);
          setRows([]); return;
        }
        const parsed: ParsedCsvRow[] = grid.slice(1).map((cells, i) => {
          const get = (k: keyof ParsedCsvRow): string => {
            const idx = colIdx[k]; return idx !== undefined ? (cells[idx] ?? "").trim() : "";
          };
          const row: ParsedCsvRow = {
            index: i,
            raw: Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? "").trim()])),
            title: get("title"),
            description: get("description"),
            month: get("month"),
            week: get("week"),
            day: get("day"),
            videoNumber: get("videoNumber"),
            scheduleHour: get("scheduleHour"),
            campaignId: get("campaignId"),
            templateId: get("templateId"),
            error: null,
          };
          if (!row.title) row.error = t.csvRowMissingTitle;
          else if (!row.description) row.error = t.csvRowMissingDesc;
          else if (row.title.length > 240) row.error = t.csvRowTitleTooLong;
          else if (row.campaignId && !Number.isFinite(Number(row.campaignId)))
            row.error = t.csvCampaignIdInvalid(row.campaignId);
          else if (row.templateId && !Number.isFinite(Number(row.templateId)))
            row.error = t.csvTemplateIdInvalid(row.templateId);
          return row;
        });
        if (parsed.length === 0) { setParseError(t.csvNoData); setRows([]); return; }
        if (parsed.length > 200) { setParseError(t.csvTooManyRows(parsed.length)); setRows([]); return; }
        setParseError(null);
        setRows(parsed);
      } catch (err: any) {
        setParseError(err?.message || t.csvReadError);
        setRows([]);
      }
    };
    reader.onerror = () => setParseError(t.csvReadFileError);
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla-videos.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const validRows = useMemo(() => rows.filter((r) => !r.error), [rows]);
  const localErrorCount = rows.length - validRows.length;

  const handleImport = async () => {
    if (validRows.length === 0) {
      toast({ title: t.csvNoValidRows, variant: "destructive" });
      return;
    }
    setImporting(true);
    setServerErrors([]);
    // Chunk so the progress bar reflects real work; each chunk is its own
    // server-side transaction (all-or-nothing per chunk).
    const CHUNK = 25;
    const total = validRows.length;
    setProgress({ done: 0, total });
    let createdTotal = 0;
    const allErrors: { row: number; error: string }[] = [];
    try {
      for (let off = 0; off < total; off += CHUNK) {
        const chunk = validRows.slice(off, off + CHUNK).map((r) => ({
          title: r.title,
          description: r.description,
          month: r.month || null,
          week: r.week || null,
          day: r.day || null,
          videoNumber: r.videoNumber || null,
          scheduleHour: r.scheduleHour || null,
          campaignId: r.campaignId ? Number(r.campaignId) : null,
          templateId: r.templateId ? Number(r.templateId) : null,
        }));
        const res = await apiFetch(`${API_BASE}/content/videos/import-csv`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: chunk }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (Array.isArray(data?.errors)) {
            // Translate chunk-relative indices back to the ORIGINAL CSV row
            // index (`r.index`), since the table is keyed by that. Without
            // this hop, rows skipped locally would shift the mapping.
            data.errors.forEach((e: { row: number; error: string }) => {
              const valid = validRows[off + e.row];
              if (valid) allErrors.push({ row: valid.index, error: e.error });
              else allErrors.push({ row: off + e.row, error: e.error });
            });
          } else {
            allErrors.push({ row: validRows[off]?.index ?? off, error: data?.error || `Error ${res.status}` });
          }
          // Continue with subsequent chunks for best-effort partial import:
          // a transient failure on one chunk shouldn't strand the rest.
        } else {
          createdTotal += data.created || 0;
        }
        setProgress({ done: Math.min(total, off + chunk.length), total });
      }
      if (allErrors.length > 0) {
        setServerErrors(allErrors);
        toast({
          title: createdTotal > 0
            ? t.csvPartialError(createdTotal, allErrors.length)
            : t.csvImportFailed,
          variant: "destructive",
        });
      } else {
        toast({ title: t.csvImportedDraft(createdTotal) });
        onImported();
        // Small pause so the user sees the bar at 100% before closing.
        await new Promise((r) => setTimeout(r, 400));
        reset();
        onClose();
        return;
      }
      if (createdTotal > 0) onImported();
    } catch (err: any) {
      toast({ title: err?.message || t.csvImportError, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            {t.csvImportTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t.csvInstructions}
            </p>
            <Button size="sm" variant="outline" onClick={downloadTemplate} className="gap-2 shrink-0">
              <Download className="w-4 h-4" />
              {t.btnTemplate}
            </Button>
          </div>

          {rows.length === 0 && (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
              }}
              className={cn(
                "block rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors",
                dragOver ? "border-primary bg-primary/5" : "border-foreground/15 hover:border-foreground/30",
              )}
            >
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <FileText className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-sm text-foreground">{t.csvDragHere}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{t.csvMaxRows}</p>
            </label>
          )}

          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">{parseError}</div>
              <button onClick={reset} className="text-rose-200 hover:text-rose-50">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium text-foreground truncate max-w-[20rem]">{fileName}</span>
                  <span>·</span>
                  <span>{t.csvValidRows(validRows.length)}</span>
                  {localErrorCount > 0 && (
                    <span className="text-rose-400">· {t.csvBadRows(localErrorCount)}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={reset}
                  disabled={importing}
                  className="text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
                >
                  {t.btnChangeFile}
                </button>
              </div>

              <div className="rounded-lg border border-foreground/10 overflow-hidden">
                <div className="max-h-[40vh] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-foreground/5 text-muted-foreground sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">#</th>
                        <th className="text-left p-2 font-medium">{t.csvColTitle}</th>
                        <th className="text-left p-2 font-medium">{t.csvColDesc}</th>
                        <th className="text-left p-2 font-medium">{t.csvColMonthWeekDay}</th>
                        <th className="text-left p-2 font-medium">{t.csvColHour}</th>
                        <th className="text-left p-2 font-medium">{t.csvColStatus}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const serverErr = serverErrors.find((e) => e.row === r.index)?.error;
                        const err = r.error || serverErr;
                        return (
                          <tr key={r.index} className={cn("border-t border-foreground/5", err && "bg-rose-500/5")}>
                            <td className="p-2 align-top text-muted-foreground">{r.index + 2}</td>
                            <td className="p-2 align-top max-w-[12rem] truncate" title={r.title}>{r.title || <span className="text-muted-foreground/50 italic">vacío</span>}</td>
                            <td className="p-2 align-top max-w-[16rem] truncate" title={r.description}>{r.description || <span className="text-muted-foreground/50 italic">vacío</span>}</td>
                            <td className="p-2 align-top text-muted-foreground">{[r.month, r.week, r.day].filter(Boolean).join(" / ") || "—"}</td>
                            <td className="p-2 align-top text-muted-foreground">{r.scheduleHour || "—"}</td>
                            <td className="p-2 align-top">
                              {err
                                ? <span className="inline-flex items-center gap-1 text-rose-400"><AlertCircle className="w-3 h-3" />{err}</span>
                                : <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3 h-3" />OK</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {progress && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{importing ? t.csvImporting : t.csvImportDone}</span>
                    <span>{progress.done} / {progress.total}</span>
                  </div>
                  <div className="h-2 bg-foreground/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-orange-400 transition-all"
                      style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-foreground/10">
          <Button variant="outline" onClick={close} disabled={importing}>
            {t.btnCancel}
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || validRows.length === 0}
            className="gap-2"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? t.csvImporting : t.csvImportBtn(validRows.length)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const { t } = useLang();
  const statusOptions = useMemo(() => getStatusOptions(t), [t]);
  const networkOptions = useMemo(() => getNetworkOptions(t), [t]);

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

  const [importOpen, setImportOpen] = useState(false);

  // Clone an existing video as a "remix" — the backend keeps cover/file/
  // template/campaign and blanks per-network text + publish state, leaving the
  // user a fresh draft in the wizard ready for new descriptions.
  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_BASE}/content/videos/${id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error(t.toastDuplicateError);
      return res.json() as Promise<VideoData>;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      toast({ title: t.toastDuplicatedAs(row.title) });
    },
    onError: () => toast({ title: t.toastDuplicateFailed, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch(`${API_BASE}/content/videos/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error(t.toastDeleteVideosError);
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
      toast({ title: t.toastBulkDeleted(data.deleted) });
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["videos"], ctx.previous);
      toast({ title: t.toastDeleteVideosFailed, variant: "destructive" });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (vars: { ids: number[]; patch: Record<string, unknown> }) => {
      const res = await apiFetch(`${API_BASE}/content/videos/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) throw new Error(t.toastBulkUpdateError);
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
      toast({ title: t.toastBulkUpdated(data.updated) });
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["videos"], ctx.previous);
      toast({ title: t.toastBulkUpdateFailed, variant: "destructive" });
    },
  });

  const createSavedViewMutation = useMutation({
    mutationFn: async (vars: { name: string; filters: SavedView["filters"] }) => {
      const res = await apiFetch(`${API_BASE}/saved-views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) throw new Error(t.toastSaveViewFailed);
      return res.json() as Promise<SavedView>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views"] });
      setSavingView(false);
      setNewViewName("");
      toast({ title: t.toastVistaSaved });
    },
    onError: () => toast({ title: t.toastSaveViewError, variant: "destructive" }),
  });

  const deleteSavedViewMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_BASE}/saved-views/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(t.toastDeleteViewFailed);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-views"] });
      toast({ title: t.toastVistaDeleted });
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
      toast({ title: t.toastViewNameRequired, variant: "destructive" });
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
      toast({ title: t.toastMonthRequired, variant: "destructive" });
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
      toast({ title: t.toastDateTimeRequired, variant: "destructive" });
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
      toast({ title: t.toastBulkScheduled(data.scheduled) });
    } catch {
      toast({ title: t.toastBulkScheduleFailed, variant: "destructive" });
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
        title: t.toastBulkGenMax(ids.length),
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
        title: t.toastBulkGenResult(ok, failed),
        variant: failed && !ok ? "destructive" : "default",
      });
    } catch {
      toast({ title: t.toastBulkGenFailed, variant: "destructive" });
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
        throw new Error(detail?.error || t.toastCreateFailed(res.status));
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
      toast({ title: t.toastVideoCreated, description: t.toastVideoCreatedDesc });
    },
    onError: (err: Error) => {
      toast({ title: t.toastCreateVideoError, description: err.message, variant: "destructive" });
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
        throw new Error(detail?.error || t.toastSaveError(res.status));
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
      toast({ title: t.toastSaveFailed, description: err.message, variant: "destructive" });
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
      if (!res.ok && res.status !== 204) throw new Error(t.toastDeleteFailed);
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
      toast({ title: t.toastVideoDeleted });
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["videos"], ctx.previous);
      toast({ title: t.toastDeleteVideoError, variant: "destructive" });
    },
  });

  const generateCoverMutation = useMutation({
    mutationFn: async ({ id, network }: { id: number; network?: string }) => {
      const res = await apiFetch(`${API_BASE}/content/videos/${id}/generate-cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network }),
      });
      if (!res.ok) throw new Error(t.toastCoverError);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedVideo(data);
      toast({ title: t.toastCoverGenerated });
    },
    onError: () => toast({ title: t.toastCoverError, variant: "destructive" }),
  });

  // Upload a custom cover from the user's device. We read the file in the
  // browser as base64 and PATCH the existing fields the IA generator also
  // writes (`coverImageBase64`, `coverMimeType`), so the rest of the app
  // (publishing, previews, list thumbnails) needs no changes.
  const uploadCoverMutation = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      if (file.size > 8 * 1024 * 1024) {
        throw new Error(t.coverSizeError);
      }
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(t.coverReadError));
        reader.readAsDataURL(file);
      });
      const comma = dataUrl.indexOf(",");
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
      if (!base64) throw new Error(t.toastCoverEmptyError);
      const res = await apiFetch(`${API_BASE}/content/videos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coverImageBase64: base64,
          coverMimeType: file.type || "image/png",
        }),
      });
      if (!res.ok) throw new Error(t.coverUploadFailed);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedVideo(data);
      toast({ title: t.toastCoverUploaded });
    },
    onError: (err: Error) => toast({ title: t.toastCoverUploadError, description: err.message, variant: "destructive" }),
  });

  const clearCoverMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`${API_BASE}/content/videos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImageBase64: null, coverMimeType: null }),
      });
      if (!res.ok) throw new Error(t.clearCoverFailed);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedVideo(data);
    },
    onError: () => toast({ title: t.toastClearCoverError, variant: "destructive" }),
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
          onUploadCover={(file) => {
            if (selectedVideo) uploadCoverMutation.mutate({ id: selectedVideo.id, file });
          }}
          isUploadingCover={uploadCoverMutation.isPending}
          onClearCover={() => {
            if (selectedVideo) clearCoverMutation.mutate(selectedVideo.id);
          }}
          onGenerateCover={(network?: string) => {
            if (selectedVideo) generateCoverMutation.mutate({ id: selectedVideo.id, network });
          }}
          onAutoGenerate={(videoId) => autoGenerateMutation.mutate(videoId)}
          onDelete={() => {
            if (selectedVideo && confirm(t.confirmDeleteVideo)) {
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
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">{t.headerGestorVideos}</h1>
            <p className="text-muted-foreground text-xs sm:text-lg">{t.headerGestorDesc}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setImportOpen(true)}
              className="gap-2"
              title={t.csvImportTitle}
            >
              <Upload className="w-4 h-4" />
              {t.csvImportTitle}
            </Button>
            <Button
              onClick={() => { setIsCreating(true); setWizardStep("info"); }}
              className="bg-gradient-to-r from-primary to-orange-400 hover:from-orange-500 hover:to-orange-400 shadow-lg shadow-primary/25 gap-2"
            >
              <Plus className="w-5 h-5" />
              {t.btnNewVideo}
              <KbdGroup className="ml-1 hidden sm:inline-flex">
                <Kbd className="bg-white/20 text-white">N</Kbd>
              </KbdGroup>
            </Button>
          </div>
        </header>
        <ImportCsvDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            queryClient.invalidateQueries({ queryKey: ["videos"] });
          }}
        />

        <div className={cn("grid gap-4 lg:gap-6", !noVideosAtAll && "lg:grid-cols-[14rem_1fr]")}>
          {!noVideosAtAll && (
            <aside className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <Bookmark className="w-3 h-3" />
                  {t.savedViewsLabel}
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
                <span className="flex-1 text-left">{t.pendingReviewsLabel}</span>
                {pendingReviews.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/30 text-amber-100">
                    {pendingReviews.length}
                  </span>
                )}
              </button>
              <div className="rounded-xl border border-foreground/10 bg-card/40 divide-y divide-foreground/5 overflow-hidden">
                {savedViews.length === 0 && (
                  <p className="text-[11px] text-muted-foreground/70 px-3 py-3 leading-snug">
                    {t.noSavedViews}
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
                      aria-label={t.ariaDeleteView(view.name)}
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
                  {t.saveViewBtn}
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
                    placeholder={t.viewNamePlaceholder}
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
                      {createSavedViewMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : t.btnSave}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setSavingView(false); setNewViewName(""); }}
                      className="h-7 text-xs"
                    >
                      {t.btnCancel}
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
                    placeholder={t.searchPlaceholder}
                    className="pl-9 bg-card/40 border-foreground/10"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded transition-base"
                      aria-label={t.ariaClearSearch}
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
                    {statusOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={networkFilter} onValueChange={setNetworkFilter}>
                  <SelectTrigger className="sm:w-44 bg-card/40 border-foreground/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {networkOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="sm:w-40 bg-card/40 border-foreground/10">
                    <SelectValue placeholder={t.filterAllMonths} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.filterAllMonths}</SelectItem>
                    {availableMonths.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger className="sm:w-44 bg-card/40 border-foreground/10">
                    <SelectValue placeholder={t.filterAllCampaigns} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.filterAllCampaigns}</SelectItem>
                    <SelectItem value="none">{t.filterNoCampaign}</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={templateFilter} onValueChange={setTemplateFilter}>
                  <SelectTrigger className="sm:w-44 bg-card/40 border-foreground/10">
                    <SelectValue placeholder={t.filterAllTemplates} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.filterAllTemplates}</SelectItem>
                    <SelectItem value="none">{t.filterNoTemplate}</SelectItem>
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
                title={t.noVideosTitle}
                description={t.noVideosDesc}
                action={{
                  label: t.createFirstVideo,
                  onClick: () => { setIsCreating(true); setWizardStep("info"); },
                }}
                secondaryAction={{ label: t.secondaryViewHelp, href: "/ayuda" }}
                size="lg"
              />
            </CardContent>
          </Card>
        ) : noResults ? (
          <Card className="bg-card/30 border-foreground/10">
            <CardContent className="p-8 text-center">
              <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">{t.noMatchFilters}</p>
              <Button variant="outline" onClick={clearFilters}>
                <CircleSlash2 className="w-4 h-4 mr-2" />
                {t.btnClearFilters}
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
                    ? t.selectedCountLabel(selectionCount)
                    : t.videosCountLabel(filteredVideos.length)}
                </span>
              </label>
              {filtersActive && (
                <span className="text-[10px] text-muted-foreground/60">
                  {t.showingCount(filteredVideos.length, videos.length)}
                </span>
              )}
            </div>

            {(() => {
              const renderVideoCard = (video: VideoData) => {
                const progress = getVideoProgress(video);
                const statusBadge = getStatusBadge(video, t);
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
                            aria-label={isSelected ? t.ariaDeselect(video.title) : t.ariaSelect(video.title)}
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
                                  title={t.ariaViewStats}
                                >
                                  <BarChart2 className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-7 h-7 text-muted-foreground/50 hover:text-primary hover:bg-primary/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  duplicateMutation.mutate(video.id);
                                }}
                                disabled={duplicateMutation.isPending}
                                title={t.ariaRemixDuplicate}
                              >
                                {duplicateMutation.isPending && duplicateMutation.variables === video.id
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <Copy className="w-4 h-4" />}
                              </Button>
                              <ChevronRight className="w-5 h-5 text-muted-foreground/30 hidden sm:block" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className={statusBadge.className + " text-[10px] sm:text-xs"}>
                              {statusBadge.label}
                            </Badge>
                            {!video.tiktokDescription && !video.instagramDescription && !video.youtubeTitle && !video.youtubeDescription && !video.linkedinDescription && !video.xDescription && video.status !== "published" && (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px] sm:text-xs">
                                {t.badgeNoDescriptions}
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
                  {t.bulkBarLabel(selectionCount)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedIds(new Set())}
                >
                  <X className="w-3 h-3 mr-1" />
                  {t.btnCancel}
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
                    <SelectValue placeholder={t.bulkChangeStatus} />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.filter((o) => o.value !== "all").map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="inline-flex items-center gap-1">
                  <Input
                    value={bulkMonth}
                    onChange={(e) => setBulkMonth(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleBulkAssignMonth(); }}
                    placeholder={t.bulkAssignMonth}
                    className="h-8 text-xs w-32"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={handleBulkAssignMonth}
                    disabled={bulkUpdateMutation.isPending || !bulkMonth.trim()}
                    aria-label={t.ariaBulkMonth}
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
                    aria-label={t.ariaBulkSchedule}
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
                    if (confirm(t.confirmBulkDelete(selectionCount))) {
                      bulkDeleteMutation.mutate(Array.from(selectedIds));
                    }
                  }}
                >
                  {bulkDeleteMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3 h-3 mr-1" />
                      {t.btnDelete}
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
  const { t } = useLang();
  const { data, isLoading, error } = useQuery<VideoStats>({
    queryKey: ["video-stats", video?.id],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/content/videos/${video!.id}/stats`);
      if (!res.ok) throw new Error(t.toastLoadStatsError);
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
            {t.statDialogTitle(video?.title || "")}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 text-rose-400 text-sm py-4">
            <AlertCircle className="w-4 h-4" />
            {t.toastLoadStatsError}
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
                error={isStatError(yt) ? t.statErrorMsg : undefined}
                unavailable={false}
                rows={ytOk ? [
                  { icon: <Eye className="w-3.5 h-3.5" />, label: t.statViews, value: fmtNum(ytOk.views) },
                  { icon: <ThumbsUp className="w-3.5 h-3.5" />, label: t.statLikes, value: fmtNum(ytOk.likes) },
                  { icon: <MessageSquare className="w-3.5 h-3.5" />, label: t.statComments, value: fmtNum(ytOk.comments) },
                  { icon: <Clock className="w-3.5 h-3.5" />, label: t.statDuration, value: fmtTime(ytOk.averageViewDuration) },
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
                error={isStatError(ig) ? t.statErrorMsg : undefined}
                unavailable={false}
                rows={igOk ? [
                  { icon: <Eye className="w-3.5 h-3.5" />, label: t.statPlays, value: fmtNum(igOk.plays) },
                  { icon: <ThumbsUp className="w-3.5 h-3.5" />, label: t.statLikes, value: fmtNum(igOk.likes) },
                  { icon: <MessageSquare className="w-3.5 h-3.5" />, label: t.statComments, value: fmtNum(igOk.comments) },
                  { icon: <Share2 className="w-3.5 h-3.5" />, label: t.statReach, value: fmtNum(igOk.reach) },
                ] : []}
              />
            )}

            {/* LinkedIn */}
            {video?.linkedinPostId && (
              <NetworkStatCard
                label="LinkedIn"
                bgClass="bg-[#0A66C2]"
                loading={isLoading}
                error={isStatError(li) ? t.statErrorMsg : undefined}
                unavailable={false}
                rows={liOk ? [
                  { icon: <Eye className="w-3.5 h-3.5" />, label: t.statImpressions, value: fmtNum(liOk.impressions) },
                  { icon: <MousePointerClick className="w-3.5 h-3.5" />, label: t.statClicks, value: fmtNum(liOk.clicks) },
                  { icon: <ThumbsUp className="w-3.5 h-3.5" />, label: t.statReactions, value: fmtNum(liOk.reactions) },
                  { icon: <MessageSquare className="w-3.5 h-3.5" />, label: t.statComments, value: fmtNum(liOk.comments) },
                  { icon: <Share2 className="w-3.5 h-3.5" />, label: t.statShares, value: fmtNum(liOk.shares) },
                ] : []}
              />
            )}

            {/* X */}
            {video?.xPostId && (
              <NetworkStatCard
                label="X"
                bgClass="bg-black border border-foreground/10"
                loading={isLoading}
                error={isStatError(xd) ? t.statErrorMsg : undefined}
                unavailable={false}
                rows={xdOk ? [
                  { icon: <Eye className="w-3.5 h-3.5" />, label: t.statImpressions, value: fmtNum(xdOk.impressions) },
                  { icon: <ThumbsUp className="w-3.5 h-3.5" />, label: t.statLikes, value: fmtNum(xdOk.likes) },
                  { icon: <Repeat2 className="w-3.5 h-3.5" />, label: t.statRetweets, value: fmtNum(xdOk.retweets) },
                  { icon: <MessageSquare className="w-3.5 h-3.5" />, label: t.statReplies, value: fmtNum(xdOk.replies) },
                  { icon: <Share2 className="w-3.5 h-3.5" />, label: t.statQuotes, value: fmtNum(xdOk.quotes) },
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

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

// Field allow-list for the wizard auto-save. Only string fields the user can
// type into are debounced; status/schedule fields go through dedicated flows.
const AUTO_SAVE_FIELDS = [
  "title",
  "description",
  "month",
  "week",
  "day",
  "videoNumber",
  "scheduleHour",
  "tiktokDescription",
  "instagramDescription",
  "youtubeTitle",
  "youtubeDescription",
  "linkedinDescription",
  "xDescription",
  "facebookDescription",
] as const;

function useWizardAutoSave({
  videoId,
  isCreating,
  formData,
  toast,
}: {
  videoId: number | null;
  isCreating: boolean;
  formData: Record<string, any>;
  toast: any;
}) {
  const { t } = useLang();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const lastSavedRef = useRef<Record<string, any> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  // Reset baseline whenever the wizard switches to a different video so the
  // first edits are compared against the freshly-loaded server values.
  useEffect(() => {
    if (videoId == null || isCreating) {
      lastSavedRef.current = null;
      setStatus("idle");
      return;
    }
    const snapshot: Record<string, any> = {};
    for (const k of AUTO_SAVE_FIELDS) snapshot[k] = formData[k] ?? "";
    lastSavedRef.current = snapshot;
    setStatus("idle");
    // Intentionally keying only on videoId; we don't want every keystroke to
    // reset the baseline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, isCreating]);

  const computeDiff = useCallback((): Record<string, any> | null => {
    const baseline = lastSavedRef.current;
    if (!baseline) return null;
    const data = formDataRef.current;
    const diff: Record<string, any> = {};
    let any = false;
    for (const k of AUTO_SAVE_FIELDS) {
      const a = data[k] ?? "";
      const b = baseline[k] ?? "";
      if (a !== b) {
        diff[k] = a;
        any = true;
      }
    }
    return any ? diff : null;
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (videoId == null || isCreating) return false;
    const diff = computeDiff();
    if (!diff) return false;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus("saving");
    try {
      const res = await apiFetch(`${API_BASE}/content/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(diff),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(detail?.error || `HTTP ${res.status}`);
      }
      lastSavedRef.current = { ...(lastSavedRef.current || {}), ...diff };
      // If the user typed more during the request, we'll be marked dirty by
      // the watcher effect on the next render; otherwise we land on "saved".
      const stillDirty = computeDiff() !== null;
      setStatus(stillDirty ? "dirty" : "saved");
      setSavedAt(Date.now());
      return true;
    } catch (e: any) {
      if (e?.name === "AbortError") return false;
      console.error("[wizard auto-save]", e);
      setStatus("error");
      toast?.({ title: t.toastAutoSaveError, description: e?.message || t.toastRetry, variant: "destructive" });
      return false;
    }
  }, [videoId, isCreating, computeDiff, toast]);

  // Schedule a debounced flush whenever there's a diff vs the saved baseline.
  useEffect(() => {
    if (videoId == null || isCreating) return;
    const diff = computeDiff();
    if (!diff) {
      // Field reverted to the saved value; clear "dirty" without overwriting
      // a healthy "saved" indicator.
      setStatus((s) => (s === "dirty" ? "saved" : s));
      return;
    }
    setStatus((s) => (s === "saving" ? s : "dirty"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      flush();
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [formData, videoId, isCreating, computeDiff, flush]);

  // Best-effort save when the tab is being hidden so the user doesn't lose
  // last-second edits if they close before the debounce fires.
  useEffect(() => {
    if (videoId == null || isCreating) return;
    const onHide = () => {
      if (computeDiff()) flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [videoId, isCreating, computeDiff, flush]);

  return { status, savedAt, flush };
}

function SaveStatusIndicator({ status, savedAt }: { status: SaveStatus; savedAt: number | null }) {
  const { t } = useLang();
  // Simple "x s ago" formatter that ticks every 30s while a video is open.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== "saved") return;
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [status, savedAt]);
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t.autoSavingLabel}
      </span>
    );
  }
  if (status === "dirty") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
        <CloudOff className="w-3.5 h-3.5" />
        {t.autoUnsavedLabel}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
        <AlertCircle className="w-3.5 h-3.5" />
        {t.autoSaveErrorLabel}
      </span>
    );
  }
  // saved
  let label: string = t.autoSavedLabel;
  if (savedAt) {
    const diffSec = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
    if (diffSec < 5) label = t.autoSavedLabel;
    else if (diffSec < 60) label = t.autoSavedSecsAgo(diffSec);
    else label = t.autoSavedMinAgo(Math.floor(diffSec / 60));
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
      <CheckCircle2 className="w-3.5 h-3.5" />
      {label}
    </span>
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
  onUploadCover,
  isUploadingCover,
  onClearCover,
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
  onGenerateCover: (network?: string) => void;
  onUploadCover: (file: File) => void;
  isUploadingCover: boolean;
  onClearCover: () => void;
  onAutoGenerate: (videoId: number) => void;
  onDelete: () => void;
  isCreatingPending: boolean;
  isUpdating: boolean;
  isGeneratingCover: boolean;
  isAutoGenerating: boolean;
  toast: any;
}) {
  const queryClient = useQueryClient();
  const { t } = useLang();
  const steps = useMemo(() => getSteps(t), [t]);
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
    if (!(video && pendingVideoFile && !isCreating)) return;
    let cancelled = false;
    let pendingHandle: UploadHandle | null = null;
    const linkPending = async () => {
      try {
        if (pendingVideoFile.type === "drive") {
          const r = await apiFetch(`${API_BASE}/content/videos/${video.id}/link-drive-video`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ driveFileId: pendingVideoFile.driveFileId, fileName: pendingVideoFile.fileName }),
          });
          if (cancelled) return;
          if (!r.ok) {
            const detail = await r.json().catch(() => ({} as { error?: string }));
            throw new Error(detail?.error || t.errorLinkVideo(r.status));
          }
          toast({ title: t.videoLinked, description: pendingVideoFile.fileName });
        } else if (pendingVideoFile.type === "upload") {
          // Progreso real durante la subida diferida (post-creación) usando XHR.
          const uploadToast = toast({ title: t.toastUploadingVideo, description: `${pendingVideoFile.fileName} · 0%` });
          pendingHandle = uploadVideoWithProgress(
            `${API_BASE}/content/videos/${video.id}/upload-video`,
            pendingVideoFile.file,
            (p) => {
              if (cancelled) return;
              uploadToast.update({ id: uploadToast.id, title: t.toastUploadingVideo, description: `${pendingVideoFile.fileName} · ${p.pct}%` });
            },
          );
          const r = await pendingHandle.promise;
          if (cancelled) return;
          if (!r.ok) {
            throw new Error(r.data?.error || t.errorUploadVideo(r.status));
          }
          uploadToast.update({ id: uploadToast.id, title: t.toastVideoUploaded, description: pendingVideoFile.fileName });
        }
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } catch (err: any) {
        if (cancelled || err?.message === "UPLOAD_CANCELLED") return;
        console.error("Error linking pending video file:", err);
        toast({
          title: t.toastAttachError,
          description: err?.message || t.toastRetryFromInfo,
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setPendingVideoFile(null);
      }
    };
    linkPending();
    return () => {
      cancelled = true;
      if (pendingHandle) pendingHandle.abort();
    };
  }, [video?.id, isCreating]);

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      onStepChange(steps[nextIndex].key);
    }
  };

  const goPrev = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      onStepChange(steps[prevIndex].key);
    }
  };

  const handleSaveInfo = () => {
    if (!formData.title) {
      toast({ title: t.toastCompleteTitle, variant: "destructive" });
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

  const autoSave = useWizardAutoSave({
    videoId: video?.id ?? null,
    isCreating,
    formData,
    toast,
  });

  // Keyboard shortcuts: ←/→ navigate steps (ignored while typing), Cmd/Ctrl+S
  // forces an auto-save flush regardless of focus context.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        autoSave.flush().then((didSave) => {
          if (!didSave) toast({ title: t.toastNoChanges });
        });
        return;
      }
      if (isEditable) return;
      if (e.key === "ArrowRight") {
        if (currentStepIndex < steps.length - 1) {
          e.preventDefault();
          goNext();
        }
      } else if (e.key === "ArrowLeft") {
        if (currentStepIndex > 0) {
          e.preventDefault();
          goPrev();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentStepIndex, autoSave, toast]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0">
            <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">{t.wizardBack}</span>
            <span className="sm:hidden">{t.wizardBackShort}</span>
          </Button>
          {video && (
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 sm:hidden shrink-0 ml-auto">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-2xl font-display font-bold truncate">
            {isCreating ? t.wizardNewVideo : video?.title}
          </h1>
          <div className="flex items-center gap-3 mt-0.5">
            {video && (
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
                {t.wizardCompleteAll}
              </p>
            )}
            {!isCreating && video && (
              <SaveStatusIndicator status={autoSave.status} savedAt={autoSave.savedAt} />
            )}
          </div>
        </div>
        {video && (
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 hidden sm:flex shrink-0">
            <Trash2 className="w-4 h-4 mr-1" />
            {t.wizardDelete}
          </Button>
        )}
      </div>

      <div className="sticky top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 bg-background/85 backdrop-blur-md py-2 sm:py-0 sm:bg-transparent sm:backdrop-blur-none">
        <div className="flex items-center gap-1 bg-card/40 rounded-2xl p-1.5 sm:p-2 border border-foreground/10 overflow-x-auto scrollbar-none">
          {steps.map((step, i) => {
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
                {isActive && (autoSave.status === "dirty" || autoSave.status === "saving") && (
                  <span
                    title={autoSave.status === "saving" ? t.wizardSavingTooltip : t.wizardUnsavedTooltip}
                    className={`hidden sm:inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      autoSave.status === "saving"
                        ? "bg-white/15 text-white/90"
                        : "bg-amber-400/15 text-amber-200"
                    }`}
                  >
                    {autoSave.status === "saving" ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <CloudOff className="w-2.5 h-2.5" />
                    )}
                    {autoSave.status === "saving" ? t.wizardSaving : t.wizardUnsaved}
                  </span>
                )}
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
          <span>{t.wizardAutoGenerating}</span>
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
              onUpload={onUploadCover}
              isUploading={isUploadingCover}
              onClear={onClearCover}
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
                  toast({ title: t.toastScheduleError, description: msg, variant: "destructive" });
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ["videos"] });
                const platforms = includeFacebook ? t.platforms6 : t.platforms5;
                toast({
                  title: t.toastScheduled(platforms),
                  description: hour
                    ? t.toastAutoUpload(hour)
                    : t.toastAutoUploadNow,
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
  const { t } = useLang();
  const [folderId, setFolderId] = useState(DEFAULT_DRIVE_ROOT);
  const [folderHistory, setFolderHistory] = useState<{ id: string; name: string }[]>([
    { id: DEFAULT_DRIVE_ROOT, name: "WebMaker Latam" },
  ]);

  const { data: filesData, isLoading: filesLoading, error: filesError } = useQuery({
    queryKey: ["drive-files", folderId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/drive/files?folderId=${folderId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: t.driveLoadFilesError }));
        throw new Error(err.error || t.driveLoadFilesError);
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
        const err = await res.json().catch(() => ({ error: t.driveLoadFoldersError }));
        throw new Error(err.error || t.driveLoadFoldersError);
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
            <h3 className="font-semibold text-lg">{t.drivePickerTitle}</h3>
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
              <p className="text-sm font-medium mb-2">{t.driveAccessError}</p>
              <p className="text-xs text-muted-foreground text-center max-w-md">
                {(filesError as any)?.message || (foldersError as any)?.message || t.driveUnknownError}
              </p>
              <p className="text-xs text-muted-foreground mt-2">{t.driveSignOutHint}</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">{t.driveEmptyFolder}</p>
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
                    {t.driveSelect}
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
  const { t } = useLang();
  const { toast } = useToast();
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [linking, setLinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [resultMsg, setResultMsg] = useState<{ success?: boolean; error?: string; fileName?: string } | null>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const uploadHandleRef = useRef<UploadHandle | null>(null);

  const validateVideoFile = (file: File): string | null => {
    if (!file.type.startsWith(ACCEPTED_VIDEO_MIME_PREFIX)) {
      return t.invalidVideoFile(file.type);
    }
    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > MAX_VIDEO_SIZE_MB) {
      return t.videoFileTooLarge(sizeMB.toFixed(1), MAX_VIDEO_SIZE_MB);
    }
    return null;
  };

  const cancelUpload = () => {
    if (uploadHandleRef.current) {
      uploadHandleRef.current.abort();
      uploadHandleRef.current = null;
    }
  };

  // Si el componente se desmonta mientras hay una subida en curso, abortarla
  // para no dejar un XHR colgado consumiendo red ni disparar setState tardíos.
  useEffect(() => {
    return () => {
      if (uploadHandleRef.current) {
        uploadHandleRef.current.abort();
        uploadHandleRef.current = null;
      }
    };
  }, []);

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
        setResultMsg({ success: false, error: data.error || t.errorLinkFallback });
      }
    } catch (err: any) {
      setResultMsg({ success: false, error: err.message });
    } finally {
      setLinking(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    const validationError = validateVideoFile(file);
    if (validationError) {
      setResultMsg({ success: false, error: validationError });
      toast({ title: t.toastInvalidFile, description: validationError, variant: "destructive" });
      return;
    }

    if (!video) {
      if (setPendingVideoFile) setPendingVideoFile({ type: "upload", file, fileName: file.name });
      return;
    }

    setUploading(true);
    setResultMsg(null);
    setUploadProgress({ loaded: 0, total: file.size, pct: 0, bps: 0 });
    try {
      const handle = uploadVideoWithProgress(
        `${API_BASE}/content/videos/${video.id}/upload-video`,
        file,
        (p) => setUploadProgress(p),
      );
      uploadHandleRef.current = handle;
      const r = await handle.promise;
      if (r.ok && r.data?.success) {
        setResultMsg({ success: true, fileName: r.data.fileName });
        if (onVideoUploaded) onVideoUploaded();
      } else {
        const msg = r.data?.error || t.uploadHttpError(r.status);
        setResultMsg({ success: false, error: msg });
        toast({ title: t.toastUploadError, description: msg, variant: "destructive" });
      }
    } catch (err: any) {
      const rawMsg = err?.message || "";
      // Upload cancelled by user: don't show as aggressive error.
      if (rawMsg === "UPLOAD_CANCELLED") {
        setResultMsg(null);
        toast({ title: t.toastUploadCancelled });
      } else {
        const msg = rawMsg === "UPLOAD_NETWORK_ERROR" ? t.uploadNetworkError : (rawMsg || t.toastUploadError);
        setResultMsg({ success: false, error: msg });
        toast({ title: t.toastUploadError, description: msg, variant: "destructive" });
      }
    } finally {
      uploadHandleRef.current = null;
      setUploading(false);
      setUploadProgress(null);
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
          {t.stepInfoTitle}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t.stepInfoSubtitle}
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
          <label className="text-sm font-medium">{t.videoTitleLabel}</label>
          <input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            placeholder={t.videoTitlePlaceholder}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t.videoDescLabel}</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[100px]"
            placeholder={t.videoDescPlaceholder}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">{t.labelMonth}</label>
            <select
              value={formData.month}
              onChange={(e) => setFormData({ ...formData, month: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">--</option>
              <option value="Enero">{t.monthAbbrs[0]}</option>
              <option value="Febrero">{t.monthAbbrs[1]}</option>
              <option value="Marzo">{t.monthAbbrs[2]}</option>
              <option value="Abril">{t.monthAbbrs[3]}</option>
              <option value="Mayo">{t.monthAbbrs[4]}</option>
              <option value="Junio">{t.monthAbbrs[5]}</option>
              <option value="Julio">{t.monthAbbrs[6]}</option>
              <option value="Agosto">{t.monthAbbrs[7]}</option>
              <option value="Septiembre">{t.monthAbbrs[8]}</option>
              <option value="Octubre">{t.monthAbbrs[9]}</option>
              <option value="Noviembre">{t.monthAbbrs[10]}</option>
              <option value="Diciembre">{t.monthAbbrs[11]}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">{t.labelWeek}</label>
            <select
              value={formData.week}
              onChange={(e) => setFormData({ ...formData, week: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">--</option>
              <option value="Semana 1">{t.weekAbbrs[0]}</option>
              <option value="Semana 2">{t.weekAbbrs[1]}</option>
              <option value="Semana 3">{t.weekAbbrs[2]}</option>
              <option value="Semana 4">{t.weekAbbrs[3]}</option>
              <option value="Semana 5">{t.weekAbbrs[4]}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">{t.labelDay}</label>
            <select
              value={formData.day}
              onChange={(e) => setFormData({ ...formData, day: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">--</option>
              <option value="Lunes">{t.dayAbbrs[0]}</option>
              <option value="Martes">{t.dayAbbrs[1]}</option>
              <option value="Miércoles">{t.dayAbbrs[2]}</option>
              <option value="Jueves">{t.dayAbbrs[3]}</option>
              <option value="Viernes">{t.dayAbbrs[4]}</option>
              <option value="Sábado">{t.dayAbbrs[5]}</option>
              <option value="Domingo">{t.dayAbbrs[6]}</option>
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
            <label className="text-[11px] font-medium text-muted-foreground">{t.labelHour}</label>
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
            {t.labelVideoFile}
          </label>

          {videoAttached ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
              {/* Inline preview when the video is linked to a Drive file. The
                  /preview-video endpoint streams with `inline` disposition and
                  supports Range so seeking works without buffering the whole
                  file. Falls back to a metadata-only block while the user has
                  only a pending selection (no DB row to stream from yet). */}
              {hasVideoLinked && video?.id ? (
                <div className="bg-black">
                  <video
                    key={video.videoFileDriveId || video.id}
                    src={`${API_BASE}/content/videos/${video.id}/preview-video`}
                    poster={video.coverImageBase64 ? `data:${video.coverMimeType || "image/png"};base64,${video.coverImageBase64}` : undefined}
                    controls
                    preload="metadata"
                    playsInline
                    className="w-full max-h-[480px] bg-black object-contain"
                  >
                    {t.videoUnsupported}
                  </video>
                </div>
              ) : null}
              <div className="flex items-center gap-3 p-4">
                <FileVideo className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-400">
                    {hasVideoLinked ? t.videoLinked : hasPending && pendingVideoFile?.type === "drive" ? t.videoDriveSelected : t.videoSelected}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {displayFileName || t.videoAttachedFile}
                  </p>
                  {hasPending && !hasVideoLinked && (
                    <p className="text-xs text-primary/70 mt-1">{t.videoWillLinkOnSave}</p>
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
            </div>
          ) : (
            <div className="space-y-3">
              {linking ? (
                <div className="border-2 border-dashed border-primary/50 bg-primary/5 rounded-xl p-8 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">{t.linkingFromDrive}</p>
                  </div>
                </div>
              ) : uploading ? (
                <div className="border-2 border-dashed border-primary/50 bg-primary/5 rounded-xl p-6 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                      <p className="text-sm font-medium text-foreground truncate">
                        {t.uploadingToDrive}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelUpload}
                      className="text-xs text-muted-foreground hover:text-red-400 shrink-0"
                    >
                      {t.btnCancel}
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 w-full rounded-full bg-foreground/10 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-150 ease-out"
                        style={{ width: `${uploadProgress?.pct ?? 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{uploadProgress?.pct ?? 0}%</span>
                      <span>
                        {uploadProgress
                          ? `${formatBytes(uploadProgress.loaded)} / ${formatBytes(uploadProgress.total)}`
                          : t.uploadPreparing}
                        {uploadProgress && uploadProgress.bps > 0 && ` · ${formatBytes(uploadProgress.bps)}/s`}
                      </span>
                    </div>
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
                      <p className="text-sm font-medium text-foreground">{t.uploadFromDrive}</p>
                      <p className="text-xs text-muted-foreground/60">
                        {t.uploadFromDriveHint}
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => videoFileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    className="border-2 border-dashed border-foreground/10 hover:border-orange-500/50 hover:bg-foreground/5 rounded-xl p-6 text-center cursor-pointer transition-all"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-orange-400" />
                      <p className="text-sm font-medium text-foreground">{t.uploadOrDrag}</p>
                      <p className="text-xs text-muted-foreground/60">
                        {t.uploadSizeHint(MAX_VIDEO_SIZE_MB)}
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
            {isCreating ? t.btnCreateContinue : t.btnSaveContinue}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Per-network thumbnail dimensions used in the cover preview grid. Each
 * network crops the cover to its native aspect-ratio so the user can see
 * how the image will look across all 5 destinations before publishing.
 */
const COVER_NETWORK_PREVIEWS: { network: Network; label: string; ratio: string }[] = [
  { network: "tiktok", label: "TikTok", ratio: "9/16" },
  { network: "instagram", label: "Instagram", ratio: "4/5" },
  { network: "youtube", label: "YouTube", ratio: "16/9" },
  { network: "linkedin", label: "LinkedIn", ratio: "1.91/1" },
  { network: "x", label: "X", ratio: "16/9" },
  { network: "facebook", label: "Facebook", ratio: "1.91/1" },
];

function CoverNetworkGrid({
  src,
  onGenerate,
  generatingNetwork,
  isGenerating,
}: {
  src: string;
  onGenerate?: (network: string) => void;
  generatingNetwork?: string | null;
  isGenerating?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {COVER_NETWORK_PREVIEWS.map(({ network, label, ratio }) => {
        const isThisGenerating = isGenerating && generatingNetwork === network;
        const isOtherGenerating = isGenerating && generatingNetwork !== network && generatingNetwork != null;
        return (
          <div
            key={network}
            className="bg-card/70 border border-foreground/10 rounded-xl overflow-hidden group relative"
          >
            <div className="px-2 py-1.5 flex items-center gap-1.5 border-b border-foreground/5">
              <span className={`w-4 h-4 rounded flex items-center justify-center ${NETWORK_BG[network]}`}>
                <NetworkIcon network={network} className="w-2.5 h-2.5" />
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
            </div>
            <div className="bg-black/40 flex items-center justify-center relative">
              <img
                src={src}
                alt={`Vista previa ${label}`}
                className="w-full object-cover"
                style={{ aspectRatio: ratio }}
              />
              {onGenerate && (
                <div className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => !isGenerating && onGenerate(network)}
                    disabled={isGenerating}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-white transition-all
                      ${isThisGenerating
                        ? "bg-primary/90 cursor-wait"
                        : isOtherGenerating
                        ? "bg-black/50 cursor-not-allowed opacity-50"
                        : "bg-black/60 hover:bg-primary/80 cursor-pointer"
                      }`}
                  >
                    {isThisGenerating
                      ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      : <Sparkles className="w-2.5 h-2.5" />
                    }
                    Regenerar
                  </button>
                </div>
              )}
              {isThisGenerating && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepCover({
  video,
  onGenerate,
  isGenerating,
  onUpload,
  isUploading,
  onClear,
  onNext,
  onPrev,
}: {
  video: VideoData;
  onGenerate: (network?: string) => void;
  isGenerating: boolean;
  onUpload: (file: File) => void;
  isUploading: boolean;
  onClear: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const { t } = useLang();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasCover = !!video.coverImageBase64;
  const coverSrc = hasCover
    ? `data:${video.coverMimeType || "image/png"};base64,${video.coverImageBase64}`
    : null;

  const { toast } = useToast();
  const [promptOpen, setPromptOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>(video.coverPrompt || "");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [generatingNetwork, setGeneratingNetwork] = useState<string | null>(null);

  useEffect(() => {
    setCustomPrompt(video.coverPrompt || "");
  }, [video.id, video.coverPrompt]);

  useEffect(() => {
    if (!isGenerating) setGeneratingNetwork(null);
  }, [isGenerating]);

  const handleGenerateForNetwork = (network: string) => {
    setGeneratingNetwork(network);
    onGenerate(network);
  };

  const handleGenerateGlobal = () => {
    setGeneratingNetwork(null);
    onGenerate();
  };

  const savePromptAndGenerate = async () => {
    setSavingPrompt(true);
    try {
      const trimmed = customPrompt.trim();
      const res = await apiFetch(`${API_BASE}/content/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverPrompt: trimmed ? trimmed : null }),
      });
      if (!res.ok) throw new Error(t.toastSavePromptError);
      handleGenerateGlobal();
    } catch (err) {
      toast({ title: t.toastSavePromptErrorTitle, description: String(err), variant: "destructive" });
    } finally {
      setSavingPrompt(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    // Allow re-selecting the same file later.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card className="bg-card/50 border-foreground/10">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-primary" />
          {t.coverTitle} <span className="text-xs font-normal text-muted-foreground">{t.coverOptional}</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t.coverSubtitle}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onPick}
        />

        {hasCover && coverSrc ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <Check className="w-3 h-3 mr-1" />
                {t.coverReady}
              </Badge>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isGenerating}
                  className="border-foreground/10"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {t.btnReplace}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateGlobal}
                  disabled={isGenerating || isUploading}
                  className="border-foreground/10"
                >
                  {isGenerating && !generatingNetwork ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {t.btnRegenerate}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClear}
                  disabled={isUploading || isGenerating}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t.btnRemove}
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                {t.coverHowItLooks}
              </p>
              <CoverNetworkGrid
                src={coverSrc}
                onGenerate={handleGenerateForNetwork}
                generatingNetwork={generatingNetwork}
                isGenerating={isGenerating}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-8 space-y-5">
            <div className="w-32 h-56 mx-auto rounded-2xl border-2 border-dashed border-foreground/15 flex items-center justify-center bg-foreground/[0.04]">
              <ImageIcon className="w-12 h-12 text-muted-foreground/20" />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isGenerating}
                variant="outline"
                className="border-foreground/15"
              >
                {isUploading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t.btnUploading}</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" />{t.btnUpload}</>
                )}
              </Button>
              <Button
                onClick={handleGenerateGlobal}
                disabled={isGenerating || isUploading}
                className="bg-gradient-to-r from-primary to-orange-400"
              >
                {isGenerating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t.btnGenerating}</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" />{t.btnGenerate}</>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.coverFileHint}
            </p>
          </div>
        )}

        <div className="rounded-xl border border-foreground/10 bg-background/40">
          <button
            type="button"
            onClick={() => setPromptOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-foreground/[0.02] transition"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{t.coverPromptTitle}</span>
              {video.coverPrompt ? (
                <span className="text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                  {t.coverPromptActive}
                </span>
              ) : null}
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${promptOpen ? "rotate-180" : ""}`} />
          </button>
          {promptOpen && (
            <div className="px-4 pb-4 space-y-2 border-t border-foreground/5 pt-3">
              <p className="text-xs text-muted-foreground">
                {t.coverPromptDesc}
              </p>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value.slice(0, 4000))}
                rows={6}
                placeholder={t.coverPromptPlaceholder(video.title)}
                className="w-full bg-background border border-foreground/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none font-mono resize-y leading-snug"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground/70">{customPrompt.length}/4000</span>
                <Button
                  size="sm"
                  onClick={savePromptAndGenerate}
                  disabled={savingPrompt || isGenerating}
                  className="bg-primary"
                >
                  {savingPrompt || isGenerating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t.btnGenerating}</>

                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" />{t.btnGenerateWithPrompt}</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 flex flex-col sm:flex-row sm:justify-between gap-2">
          <Button variant="outline" onClick={onPrev} className="border-foreground/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t.btnPrev}
          </Button>
          <div className="flex gap-2 sm:ml-auto">
            {!hasCover ? (
              <Button variant="ghost" onClick={onNext} className="text-muted-foreground hover:text-foreground">
                {t.btnContinueWithoutCover}
              </Button>
            ) : null}
            <Button onClick={onNext} className="bg-primary">
              <ChevronRight className="w-4 h-4 mr-2" />
              {t.btnSaveContinue}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AutoGeneratingPlaceholder({ label }: { label: string }) {
  const { t } = useLang();
  return (
    <div className="w-full bg-background/50 border border-primary/20 rounded-xl px-4 py-3 min-h-[180px] flex flex-col items-center justify-center gap-2 text-primary/60">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-xs">{t.autoGenLabel(label)}</span>
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
  const [aiBusy, setAiBusy] = useState(false);
  const { t } = useLang();
  const showTikTokPlaceholder = (isAutoGenerating || aiBusy) && !formData.tiktokDescription;
  const showInstagramPlaceholder = (isAutoGenerating || aiBusy) && !formData.instagramDescription;
  const generateAi = async () => {
    if (!video?.id) return;
    setAiBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/content/videos/${video.id}/generate-descriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: ["tiktok", "instagram"], force: true }),
      });
      if (!res.ok) throw new Error(t.errorGeneratingDescriptions);
      const data = await res.json();
      setFormData((prev: any) => ({
        ...prev,
        ...(typeof data?.descriptions?.tiktok === "string" ? { tiktokDescription: data.descriptions.tiktok } : {}),
        ...(typeof data?.descriptions?.instagram === "string" ? { instagramDescription: data.descriptions.instagram } : {}),
      }));
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
              <span className="text-2xl">📱</span>
              {t.stepTikTokCardTitle}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t.stepTikTokSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={generateAi}
            disabled={aiBusy || isAutoGenerating}
            className="px-3 py-1.5 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded-lg border border-primary/30 disabled:opacity-50 whitespace-nowrap"
          >
            {(aiBusy || isAutoGenerating) ? t.btnGenerating : t.btnGenerateAI}
          </button>
        </div>
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
                  <Copy className="w-3 h-3 inline mr-1" />{t.btnCopy}
                </button>
              )}
            </div>
            {showTikTokPlaceholder ? (
              <AutoGeneratingPlaceholder label={t.descLabelTikTok} />
            ) : (
              <TruncatedTextarea
                value={formData.tiktokDescription}
                onChange={(e) => setFormData({ ...formData, tiktokDescription: e.target.value })}
                truncateAt={150}
                maxLength={2200}
                placeholder={"✨ [Catchy title]\n\n📌 [Short description]\n\n#hashtag1 #hashtag2 #hashtag3"}
                ariaLabel={t.descLabelTikTok}
              />
            )}
            {!showTikTokPlaceholder && (
              <p className="text-[10px] text-muted-foreground">{t.tiktokCharHint(formData.tiktokDescription.length)}</p>
            )}
            <LibraryControls
              network="tiktok"
              videoId={video?.id}
              title={formData.title}
              description={formData.description}
              currentText={formData.tiktokDescription || ""}
              onAppend={(txt) => setFormData({ ...formData, tiktokDescription: txt })}
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
                  <Copy className="w-3 h-3 inline mr-1" />{t.btnCopy}
                </button>
              )}
            </div>
            {showInstagramPlaceholder ? (
              <AutoGeneratingPlaceholder label={t.descLabelInstagram} />
            ) : (
              <TruncatedTextarea
                value={formData.instagramDescription}
                onChange={(e) => setFormData({ ...formData, instagramDescription: e.target.value })}
                truncateAt={125}
                maxLength={2200}
                placeholder={"✨ [Catchy title]\n\n📌 [Instagram description]\n\n💡 Follow for more tips\n\n#hashtag1 #hashtag2 #hashtag3"}
                ariaLabel={t.descLabelInstagram}
              />
            )}
            {!showInstagramPlaceholder && (
              <p className="text-[10px] text-muted-foreground">{t.instagramCharHint(formData.instagramDescription.length)}</p>
            )}
            <LibraryControls
              network="instagram"
              videoId={video?.id}
              title={formData.title}
              description={formData.description}
              currentText={formData.instagramDescription || ""}
              onAppend={(txt) => setFormData({ ...formData, instagramDescription: txt })}
            />
          </div>
        </div>

        <div className="pt-4 flex justify-between">
          <Button variant="outline" onClick={onPrev} className="border-foreground/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t.btnPrev}
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || isAutoGenerating || !formData.tiktokDescription || !formData.instagramDescription}
            className="bg-primary"
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ChevronRight className="w-4 h-4 mr-2" />}
            {t.btnSaveContinue}
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
  const [aiBusy, setAiBusy] = useState(false);
  const { t } = useLang();
  const showYoutubeTitlePlaceholder = (isAutoGenerating || aiBusy) && !formData.youtubeTitle;
  const showYoutubeDescPlaceholder = (isAutoGenerating || aiBusy) && !formData.youtubeDescription;
  const generateAi = async () => {
    if (!video?.id) return;
    setAiBusy(true);
    try {
      const res = await apiFetch(`${API_BASE}/content/videos/${video.id}/generate-descriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: ["youtube"], force: true }),
      });
      if (!res.ok) throw new Error(t.errorGeneratingDescriptions);
      const data = await res.json();
      setFormData((prev: any) => ({
        ...prev,
        ...(typeof data?.descriptions?.youtube === "string" ? { youtubeDescription: data.descriptions.youtube } : {}),
        ...(data?.video?.youtubeTitle && !prev.youtubeTitle ? { youtubeTitle: data.video.youtubeTitle } : {}),
      }));
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
              <span className="w-7 h-7 rounded bg-red-600 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </span>
              YouTube
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t.stepYouTubeSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={generateAi}
            disabled={aiBusy || isAutoGenerating}
            className="px-3 py-1.5 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded-lg border border-primary/30 disabled:opacity-50 whitespace-nowrap"
          >
            {(aiBusy || isAutoGenerating) ? t.btnGenerating : t.btnGenerateAI}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">{t.ytTitleLabel}</label>
            {formData.youtubeTitle && (
              <button onClick={() => copyText(formData.youtubeTitle)} className="text-xs text-primary hover:text-primary/80">
                <Copy className="w-3 h-3 inline mr-1" />{t.btnCopy}
              </button>
            )}
          </div>
          {showYoutubeTitlePlaceholder ? (
            <div className="w-full bg-background/50 border border-primary/20 rounded-xl px-4 py-3 h-12 flex items-center gap-2 text-primary/60">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="text-xs">{t.btnGenerating}</span>
            </div>
          ) : (
            <input
              value={formData.youtubeTitle}
              onChange={(e) => setFormData({ ...formData, youtubeTitle: e.target.value })}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              placeholder={t.ytTitlePlaceholderFull}
              maxLength={100}
            />
          )}
          {!showYoutubeTitlePlaceholder && (
            <p className="text-[10px] text-muted-foreground">{t.ytTitleHint(formData.youtubeTitle.length)}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">{t.ytDescLabel}</label>
            {formData.youtubeDescription && (
              <button onClick={() => copyText(formData.youtubeDescription)} className="text-xs text-primary hover:text-primary/80">
                <Copy className="w-3 h-3 inline mr-1" />{t.btnCopy}
              </button>
            )}
          </div>
          {showYoutubeDescPlaceholder ? (
            <AutoGeneratingPlaceholder label={t.descLabelYouTube} />
          ) : (
            <TruncatedTextarea
              value={formData.youtubeDescription}
              onChange={(e) => setFormData({ ...formData, youtubeDescription: e.target.value })}
              truncateAt={157}
              maxLength={5000}
              minHeightClass="min-h-[200px]"
              placeholder={"📌 [Video description]\n\n🔔 Subscribe for more content\n💻 Visit us: webmakerchile.com\n\n#shorts #webdev"}
              ariaLabel={t.descLabelYouTube}
            />
          )}
          {!showYoutubeDescPlaceholder && (
            <p className="text-[10px] text-muted-foreground">{t.ytDescHint(formData.youtubeDescription.length)}</p>
          )}
          <LibraryControls
            network="youtube"
            videoId={video?.id}
            title={formData.youtubeTitle || formData.title}
            description={formData.description}
            currentText={formData.youtubeDescription || ""}
            onAppend={(txt) => setFormData({ ...formData, youtubeDescription: txt })}
          />
        </div>

        <div className="pt-4 flex justify-between">
          <Button variant="outline" onClick={onPrev} className="border-foreground/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t.btnPrev}
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || isAutoGenerating || !formData.youtubeTitle || !formData.youtubeDescription}
            className="bg-primary"
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ChevronRight className="w-4 h-4 mr-2" />}
            {t.btnSaveContinue}
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
  const { t } = useLang();
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
      if (!res.ok) throw new Error(t.errorGeneratingDescriptions);
      const data = await res.json();
      setFormData((prev: any) => ({
        ...prev,
        ...(typeof data?.descriptions?.linkedin === "string" ? { linkedinDescription: data.descriptions.linkedin } : {}),
        ...(typeof data?.descriptions?.x === "string" ? { xDescription: data.descriptions.x.slice(0, 280) } : {}),
        ...(typeof data?.descriptions?.facebook === "string" ? { facebookDescription: data.descriptions.facebook.slice(0, 500) } : {}),
      }));
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
              {t.stepLinkedInXCardTitle}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t.stepLinkedInXCardSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={generateAi}
            disabled={aiBusy || isAutoGenerating}
            className="px-3 py-1.5 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded-lg border border-primary/30 disabled:opacity-50 whitespace-nowrap"
          >
            {(aiBusy || isAutoGenerating) ? t.btnGenerating : t.btnGenerateAI}
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
                  <Copy className="w-3 h-3 inline mr-1" />{t.btnCopy}
                </button>
              )}
            </div>
            {showLinkedInPlaceholder ? (
              <AutoGeneratingPlaceholder label={t.descLabelLinkedIn} />
            ) : (
              <TruncatedTextarea
                value={formData.linkedinDescription}
                onChange={(e) => setFormData({ ...formData, linkedinDescription: e.target.value })}
                truncateAt={210}
                maxLength={3000}
                placeholder={"💡 [Professional insight]\n\n📌 [Extended description with business context]\n\n#WebDev #Tech #Development"}
                ariaLabel={t.descLabelLinkedIn}
              />
            )}
            {!showLinkedInPlaceholder && (
              <p className="text-[10px] text-muted-foreground">{t.linkedinCharHint((formData.linkedinDescription || "").length)}</p>
            )}
            <LibraryControls
              network="linkedin"
              videoId={video?.id}
              title={formData.title}
              description={formData.description}
              currentText={formData.linkedinDescription || ""}
              onAppend={(txt) => setFormData({ ...formData, linkedinDescription: txt })}
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
                  <Copy className="w-3 h-3 inline mr-1" />{t.btnCopy}
                </button>
              )}
            </div>
            {showXPlaceholder ? (
              <AutoGeneratingPlaceholder label={t.descLabelX} />
            ) : (
              <textarea
                value={formData.xDescription}
                onChange={(e) => setFormData({ ...formData, xDescription: e.target.value })}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[180px]"
                placeholder={"🚀 [Short and direct tweet]\n\n#WebDev #Tech"}
                maxLength={280}
              />
            )}
            {!showXPlaceholder && (
              <p className={`text-[10px] ${xLen > 280 ? "text-red-400" : "text-muted-foreground"}`}>
                {t.xCharHint(xLen)}
              </p>
            )}
            <LibraryControls
              network="x"
              videoId={video?.id}
              title={formData.title}
              description={formData.description}
              currentText={formData.xDescription || ""}
              onAppend={(txt) => setFormData({ ...formData, xDescription: txt.slice(0, 280) })}
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
              <span className="text-[10px] text-muted-foreground font-normal">{t.fbDescOptional}</span>
            </label>
            {formData.facebookDescription && (
              <button onClick={() => copyText(formData.facebookDescription)} className="text-xs text-primary hover:text-primary/80">
                <Copy className="w-3 h-3 inline mr-1" />{t.btnCopy}
              </button>
            )}
          </div>
          <TruncatedTextarea
            value={formData.facebookDescription}
            onChange={(e) => setFormData({ ...formData, facebookDescription: e.target.value.slice(0, 500) })}
            truncateAt={480}
            maxLength={500}
            minHeightClass="min-h-[100px]"
            placeholder={"What are you learning today? Share with your community 👇\n\n#WebDev #Tech"}
            ariaLabel="Facebook description"
          />
          <p className="text-[10px] text-muted-foreground">{t.fbCharHint((formData.facebookDescription || "").length)}</p>
          <LibraryControls
            network="facebook"
            videoId={video?.id}
            title={formData.title}
            description={formData.description}
            currentText={formData.facebookDescription || ""}
            onAppend={(txt) => setFormData({ ...formData, facebookDescription: txt.slice(0, 500) })}
          />
        </div>

        <div className="pt-4 flex justify-between">
          <Button variant="outline" onClick={onPrev} className="border-foreground/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t.btnPrev}
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || isAutoGenerating || !formData.linkedinDescription || !formData.xDescription || xLen > 280}
            className="bg-primary"
          >
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ChevronRight className="w-4 h-4 mr-2" />}
            {t.btnSaveContinue}
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
  const { t } = useLang();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ttFileInputRef = useRef<HTMLInputElement>(null);
  const [ytUploading, setYtUploading] = useState(false);
  const [ytResult, setYtResult] = useState<{ success?: boolean; message?: string; youtubeUrl?: string; error?: string; thumbnailSet?: boolean; thumbnailError?: string } | null>(null);
  const [ttUploading, setTtUploading] = useState(false);
  const [ttResult, setTtResult] = useState<{ success?: boolean; message?: string; publishId?: string; error?: string } | null>(null);
  const [ttPollStatus, setTtPollStatus] = useState<string | null>(null);
  const [ttPolling, setTtPolling] = useState(false);
  const [igUploading, setIgUploading] = useState(false);
  const [igResult, setIgResult] = useState<{ success?: boolean; message?: string; mediaId?: string; error?: string } | null>(null);
  const [showYtDrivePicker, setShowYtDrivePicker] = useState(false);
  const [showTtDrivePicker, setShowTtDrivePicker] = useState(false);
  const [showIgDrivePicker, setShowIgDrivePicker] = useState(false);
  const [includeFacebook, setIncludeFacebook] = useState(!!video.facebookDescription);
  const queryClient = useQueryClient();

  const hasVideoFile = !!video.videoFileDriveId;

  useEffect(() => {
    if (!ttResult?.success || !ttResult.publishId) return;
    const POLL_INTERVAL_MS = 5000;
    const MAX_POLLS = 24;
    let count = 0;
    let stopped = false;

    setTtPolling(true);
    setTtPollStatus(null);

    const poll = async () => {
      if (stopped) return;
      try {
        const res = await apiFetch(`${API_BASE}/tiktok/publish-status/${video.id}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          data?: { status?: string; fail_reason?: string };
          error?: { code?: string; message?: string };
        };
        const status = data.data?.status ?? null;
        setTtPollStatus(status);
        if (status === "PUBLISH_COMPLETE" || status === "FAILED") {
          stopped = true;
          setTtPolling(false);
          queryClient.invalidateQueries({ queryKey: ["videos"] });
          return;
        }
      } catch {
        // transient errors are silently ignored; polling continues
      }
      count++;
      if (count >= MAX_POLLS) {
        stopped = true;
        setTtPolling(false);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };

    setTimeout(poll, POLL_INTERVAL_MS);
    return () => { stopped = true; setTtPolling(false); };
  }, [ttResult?.success, ttResult?.publishId, video.id]);

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
        setYtResult({ success: false, error: t.errorServer(res.status) });
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setYtResult({ success: true, message: data.message, youtubeUrl: data.youtubeUrl, thumbnailSet: data.thumbnailSet, thumbnailError: data.thumbnailError });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setYtResult({ success: false, error: data.error || t.errorUnknown });
      }
    } catch (err: any) {
      setYtResult({ success: false, error: err.message || t.errorNetwork });
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
        setTtResult({ success: false, error: t.errorServer(res.status) });
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setTtResult({ success: true, message: data.message, publishId: data.publishId });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setTtResult({ success: false, error: data.error || t.errorUnknown });
      }
    } catch (err: any) {
      setTtResult({ success: false, error: err.message || t.errorNetwork });
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
        setYtResult({ success: false, error: t.errorNoVideoFile });
        setYtUploading(false);
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setYtResult({ success: false, error: t.errorServerReload(res.status) });
        setYtUploading(false);
        return;
      }
      const data = await res.json();

      if (res.ok && data.success) {
        setYtResult({ success: true, message: data.message, youtubeUrl: data.youtubeUrl, thumbnailSet: data.thumbnailSet, thumbnailError: data.thumbnailError });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setYtResult({ success: false, error: data.error || t.errorUnknown });
      }
    } catch (err: any) {
      setYtResult({ success: false, error: err.message || t.errorNetwork });
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
        setIgResult({ success: false, error: t.errorServer(res.status) });
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setIgResult({ success: true, message: data.message, mediaId: data.mediaId });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setIgResult({ success: false, error: data.error || t.errorUnknown });
      }
    } catch (err: any) {
      setIgResult({ success: false, error: err.message || t.errorNetwork });
    } finally {
      setIgUploading(false);
    }
  };

  const handleInstagramUpload = async () => {
    if (!hasVideoFile) {
      setIgResult({ success: false, error: t.errorNoVideoFileDrive });
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
        setIgResult({ success: false, error: t.errorServerReload(res.status) });
        setIgUploading(false);
        return;
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setIgResult({ success: true, message: data.message, mediaId: data.mediaId });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setIgResult({ success: false, error: data.error || t.errorUnknown });
      }
    } catch (err: any) {
      setIgResult({ success: false, error: err.message || t.errorNetwork });
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
        setTtResult({ success: false, error: t.errorNoVideoFile });
        setTtUploading(false);
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setTtResult({ success: false, error: t.errorServerReload(res.status) });
        setTtUploading(false);
        return;
      }
      const data = await res.json();

      if (res.ok && data.success) {
        setTtResult({ success: true, message: data.message, publishId: data.publishId });
        queryClient.invalidateQueries({ queryKey: ["videos"] });
      } else {
        setTtResult({ success: false, error: data.error || t.errorUnknown });
      }
    } catch (err: any) {
      setTtResult({ success: false, error: err.message || t.errorNetwork });
    } finally {
      setTtUploading(false);
    }
  };

  // Cover is optional (Publer-style flow): user can schedule without it and
  // come back later to add/generate one. Per-network descriptions remain
  // required so each platform receives valid content at publish time.
  const allComplete =
    video.title &&
    video.description &&
    video.tiktokDescription &&
    video.instagramDescription &&
    video.youtubeTitle &&
    video.youtubeDescription &&
    video.linkedinDescription &&
    video.xDescription;

  // Plain-text export shared by "Copiar todo" and the .txt download. Sections
  // are skipped when the corresponding network has no description so the file
  // stays compact and only contains real content.
  const buildExportText = (): string => {
    const parts: string[] = [];
    parts.push(video.title || "(Sin título)");
    if (video.description) parts.push("", video.description);
    const sections: { label: string; body: string }[] = [
      { label: "TikTok", body: video.tiktokDescription || "" },
      { label: "Instagram", body: video.instagramDescription || "" },
      {
        label: "YouTube",
        body: [video.youtubeTitle, video.youtubeDescription].filter(Boolean).join("\n\n"),
      },
      { label: "LinkedIn", body: video.linkedinDescription || "" },
      { label: "X (Twitter)", body: video.xDescription || "" },
      { label: "Facebook", body: video.facebookDescription || "" },
    ];
    for (const s of sections) {
      if (!s.body.trim()) continue;
      parts.push("", `=== ${s.label} ===`, s.body);
    }
    return parts.join("\n");
  };

  const handleCopyAll = () => {
    copyText(buildExportText());
  };

  const sanitizeFilename = (s: string) =>
    (s || "video")
      .normalize("NFKD")
      .replace(/[^\w\s.-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 60) || "video";

  const handleDownloadTxt = () => {
    const blob = new Blob([buildExportText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilename(video.title)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [exportingPdf, setExportingPdf] = useState(false);
  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      // Lazy-loaded so the (~250 KB) library doesn't ship in the initial bundle.
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 48;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      const titleLines = doc.splitTextToSize(video.title || "(Sin título)", contentWidth);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 24 + 12;

      if (video.coverImageBase64) {
        const mime = video.coverMimeType || "image/png";
        const fmt = mime.includes("jpeg") || mime.includes("jpg") ? "JPEG" : "PNG";
        const imgW = 120;
        const imgH = imgW * (16 / 9);
        ensureSpace(imgH);
        try {
          doc.addImage(`data:${mime};base64,${video.coverImageBase64}`, fmt, margin, y, imgW, imgH);
          y += imgH + 16;
        } catch (e) {
          // Some Drive-served PNGs are RGBA; jsPDF can throw. Skip silently and
          // keep the rest of the document.
          console.warn("[export pdf] cover image skipped:", e);
        }
      }

      if (video.description) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(video.description, contentWidth);
        ensureSpace(lines.length * 14);
        doc.text(lines, margin, y);
        y += lines.length * 14 + 12;
      }

      const sections: { label: string; body: string }[] = [
        { label: "TikTok", body: video.tiktokDescription || "" },
        { label: "Instagram", body: video.instagramDescription || "" },
        {
          label: "YouTube",
          body: [video.youtubeTitle, video.youtubeDescription].filter(Boolean).join("\n\n"),
        },
        { label: "LinkedIn", body: video.linkedinDescription || "" },
        { label: "X (Twitter)", body: video.xDescription || "" },
        { label: "Facebook", body: video.facebookDescription || "" },
      ];
      for (const s of sections) {
        if (!s.body.trim()) continue;
        ensureSpace(40);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(s.label, margin, y);
        y += 18;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(s.body, contentWidth);
        // Render line by line so we can paginate cleanly when the section
        // overflows; jsPDF won't auto-break across pages.
        for (const line of lines) {
          ensureSpace(14);
          doc.text(line, margin, y);
          y += 14;
        }
        y += 10;
      }

      doc.save(`${sanitizeFilename(video.title)}.pdf`);
    } catch (e: any) {
      console.error("[export pdf] failed:", e);
      // Surface to the user; there's no toast in scope here so use the parent's
      // copyText path-adjacent pattern instead.
      alert(t.alertPdfExportFailed(e?.message || t.errorUnknown));
    } finally {
      setExportingPdf(false);
    }
  };

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
            {t.reviewTitle}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t.reviewSubtitle}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
            {video.coverImageBase64 && (
              <div className="w-20 sm:w-28 flex-shrink-0 mx-auto sm:mx-0">
                <img
                  src={`data:${video.coverMimeType || "image/png"};base64,${video.coverImageBase64}`}
                  className="w-full aspect-[9/16] object-cover rounded-xl border border-foreground/10"
                  alt={t.altCover}
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

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleCopyAll} className="border-foreground/10">
              <Copy className="w-4 h-4 mr-2" />
              {t.btnCopyAll}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadTxt} className="border-foreground/10">
              <FileText className="w-4 h-4 mr-2" />
              {t.btnDownloadTxt}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="border-foreground/10"
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 mr-2" />
              )}
              {exportingPdf ? t.btnExportingPdf : t.btnExportPdf}
            </Button>
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
                        {t.reviewReady}
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {t.reviewPending}
                      </Badge>
                    )}
                    {isScheduled && platform.status === "scheduled" && (
                      <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px]">
                        <Clock className="w-3 h-3 mr-1" />
                        {t.reviewScheduled}
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
                <p className="text-sm font-medium text-amber-400">{t.reviewIncomplete}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.reviewIncompleteDesc}
                </p>
              </div>
            </div>
          )}

          {(video.tiktokError || video.linkedinError || video.xError || video.tiktokStatus === "error" || video.status === "partial" || video.status === "error") && (
            <div className={`rounded-xl p-4 space-y-2 border ${
              video.status === "partial"
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-rose-500/10 border-rose-500/30"
            }`}>
              <div className="flex items-start gap-2">
                <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${video.status === "partial" ? "text-amber-400" : "text-rose-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${video.status === "partial" ? "text-amber-300" : "text-rose-300"}`}>
                    {video.status === "partial" ? t.reviewPartiallyPublished : t.reviewPublishErrors}
                  </p>
                  <div className="mt-2 space-y-1">
                    {(video.tiktokError || video.tiktokStatus === "error") && (
                      <div className="text-xs px-2 py-1.5 rounded bg-destructive/10 text-destructive border border-destructive/30">
                        <span className="font-semibold">TikTok:</span> {video.tiktokError || t.reviewPublishErrors}
                      </div>
                    )}
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
                  <p className="text-sm font-medium text-emerald-400">{t.reviewScheduledSuccess}</p>
                  {video.scheduleHour && (
                    <div className="flex items-center gap-2 mt-2 bg-foreground/5 rounded-lg px-3 py-2">
                      <Clock className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">{t.reviewScheduledTime} <span className="text-primary">{video.scheduleHour}</span></span>
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
                <p className="text-sm font-medium text-red-400">{t.reviewUploadedToYT}</p>
                <p className="text-xs text-muted-foreground">ID: {video.youtubeVideoId}</p>
              </div>
              <a
                href={`https://youtube.com/shorts/${video.youtubeVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-red-400 hover:text-red-300 underline"
              >
                {t.reviewViewOnYT}
              </a>
            </div>
          ) : isScheduled && video.youtubeTitle && (
            <div className="bg-foreground/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">{t.reviewImmediateUpload}</span>
                <span className="text-[10px] text-muted-foreground">{t.reviewImmediateSubtitle}</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{t.reviewUploadYTNow}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {hasVideoFile
                        ? t.reviewUploadPrivateYT(video.videoFileName || "video")
                        : t.reviewSelectFromDrive}
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
                      {ytUploading ? t.reviewUploading : t.reviewUploadFromDrive}
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
                      {ytUploading ? t.reviewUploading : t.reviewFromDrive}
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
                          {t.reviewThumbnailError(ytResult.thumbnailError)}
                        </p>
                      )}
                      {ytResult.thumbnailSet && (
                        <p className="text-xs text-emerald-400 mt-1">{t.reviewThumbnailApplied}</p>
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
                <p className="text-sm font-medium text-foreground">{t.reviewUploadedToTT}</p>
                <p className="text-xs text-muted-foreground">Publish ID: {video.tiktokPublishId}</p>
              </div>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full font-medium">
                {t.reviewSentToTT}
              </span>
            </div>
          ) : isScheduled && video.tiktokDescription && (
            <div className="bg-foreground/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">{t.reviewImmediateUpload}</span>
                <span className="text-[10px] text-muted-foreground">{t.reviewImmediateSubtitle}</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.98a8.18 8.18 0 004.76 1.52V7.05a4.84 4.84 0 01-1-.36z"/></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{t.reviewUploadTTNow}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {hasVideoFile
                        ? t.reviewUploadPrivateTT(video.videoFileName || "video")
                        : t.reviewSelectFromDrive}
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
                      {ttUploading ? t.reviewUploading : t.reviewUploadFromDrive}
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
                      {ttUploading ? t.reviewUploading : t.reviewFromDrive}
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
                    ? ttPollStatus === "FAILED"
                      ? "bg-red-500/10 border border-red-500/20 text-red-400"
                      : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}>
                  {ttResult.success ? (
                    <>
                      {ttPolling ? (
                        <Loader2 className="w-5 h-5 flex-shrink-0 mt-0.5 animate-spin" />
                      ) : ttPollStatus === "PUBLISH_COMPLETE" ? (
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      ) : ttPollStatus === "FAILED" ? (
                        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-bold">
                          {ttPollStatus === "PUBLISH_COMPLETE"
                            ? t.reviewTTPublished
                            : ttPollStatus === "FAILED"
                            ? t.reviewTTFailed
                            : ttPolling
                            ? t.reviewTTProcessing
                            : t.reviewTTSuccessTitle}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {ttPolling
                            ? `${t.reviewTTPollingStatus}${ttPollStatus ? ` (${ttPollStatus})` : "…"}`
                            : ttResult.message}
                        </p>
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
                <p className="text-sm font-medium text-pink-400">{t.reviewUploadedToIG}</p>
                <p className="text-xs text-muted-foreground">Media ID: {video.instagramMediaId}</p>
              </div>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full font-medium">
                {t.reviewPublishedIG}
              </span>
            </div>
          ) : isScheduled && video.instagramDescription && (
            <div className="bg-foreground/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">{t.reviewImmediateUpload}</span>
                <span className="text-[10px] text-muted-foreground">{t.reviewImmediateSubtitleIG}</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{t.reviewUploadIGNow}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {hasVideoFile
                        ? t.reviewUploadReel(video.videoFileName || "video")
                        : t.reviewSelectFromDrive}
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
                      {igUploading ? t.reviewUploading : t.reviewUploadFromDrive}
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
                      {igUploading ? t.reviewUploading : t.reviewFromDrive}
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
                        <p className="font-bold">{t.reviewIGSuccessTitle}</p>
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
              {t.btnPrev}
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
                    <span>{t.reviewIncludeFacebook}</span>
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
                  {t.btnSchedule}
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
  const { t } = useLang();
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
  const wfTranslatedLabels: Record<string, string> = {
    borrador: t.wfBorrador,
    en_revision: t.wfEnRevision,
    aprobado: t.wfAprobado,
    programado: t.wfProgramado,
    publicado: t.wfPublicado,
  };
  const wfLabel = wfTranslatedLabels[status] ?? wf.label;
  const reviewers = members.filter((m) => m.teamRole === "reviewer");

  const requestReview = async () => {
    if (!reviewerId) {
      toast({ title: t.toastSelectReviewer, variant: "destructive" });
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
      toast({ title: t.toastReviewRequested });
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
      let toastTitle: string = decision === "approved" ? t.toastVideoApproved : t.toastChangesRequested;
      if (thenSchedule && decision === "approved") {
        if (video.scheduledAt) {
          const sr = await apiFetch(`${API_BASE}/content/videos/${video.id}/schedule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduledAt: video.scheduledAt, driveFolderId: video.driveFolderId ?? null }),
          });
          if (!sr.ok) {
            toast({ title: t.toastApprovedButNotScheduled, description: await sr.text(), variant: "destructive" });
          } else {
            toastTitle = t.toastApprovedAndScheduled;
          }
        } else if (onJumpToReview) {
          toastTitle = t.toastApprovedChooseDate;
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
          {wfLabel}
        </span>
        {pending && (
          <span className="text-xs text-muted-foreground">
            {t.reviewAssignedTo(pending.reviewerName || pending.reviewerEmail || "")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onJumpToComments} className="h-8 text-xs">
            <MessageSquare className="w-3.5 h-3.5 mr-1" /> {t.btnComments}
          </Button>
          {!pending && status !== "aprobado" && status !== "publicado" && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-8 text-xs">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" /> {t.btnRequestReview}
            </Button>
          )}
          {pending && (isReviewer || isAssignedReviewer) && (
            <>
              <Button size="sm" variant="outline" onClick={() => decide("changes_requested")} disabled={submitting} className="h-8 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10">
                {t.btnRequestChanges}
              </Button>
              <Button size="sm" onClick={() => decide("approved")} disabled={submitting} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500">
                <Check className="w-3.5 h-3.5 mr-1" /> {t.btnApprove}
              </Button>
              {onJumpToReview && (
                <Button size="sm" onClick={() => decide("approved", true)} disabled={submitting} className="h-8 text-xs bg-emerald-700 hover:bg-emerald-600">
                  <Send className="w-3.5 h-3.5 mr-1" /> {t.btnApproveSchedule}
                </Button>
              )}
            </>
          )}
          {!pending && isReviewer && status !== "aprobado" && status !== "publicado" && (
            <>
              <Button size="sm" onClick={() => decide("approved")} disabled={submitting} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500">
                <Check className="w-3.5 h-3.5 mr-1" /> {t.btnApproveDirect}
              </Button>
              {onJumpToReview && (
                <Button size="sm" onClick={() => decide("approved", true)} disabled={submitting} className="h-8 text-xs bg-emerald-700 hover:bg-emerald-600">
                  <Send className="w-3.5 h-3.5 mr-1" /> {t.btnApproveSchedule}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.btnRequestReview}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">{t.labelReviewer}</label>
              <select
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-card/40 border border-foreground/10 text-sm"
              >
                <option value="">{t.selectReviewer}</option>
                {reviewers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name || r.email}</option>
                ))}
              </select>
              {reviewers.length === 0 && (
                <p className="text-[11px] text-amber-400 mt-1">{t.reviewNoReviewers}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t.reviewNoteLabel}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-card/40 border border-foreground/10 text-sm"
                placeholder={t.reviewNotePlaceholder}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>{t.btnCancel}</Button>
              <Button onClick={requestReview} disabled={submitting || !reviewerId}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                {t.btnRequestReview}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CommentsAndApproval({ video, onUpdated }: { video: VideoData; onUpdated: () => void }) {
  const { t } = useLang();
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
            <MessageSquare className="w-4 h-4" /> {t.commentsTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />{t.commentsLoading}</div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.commentsEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-xl border border-foreground/10 bg-card/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span><strong className="text-foreground/80">{c.authorName || c.authorEmail || t.userFallback}</strong> · {new Date(c.createdAt).toLocaleString(t.dateLocale as string)}</span>
                    {me && c.authorId === me.id && (
                      <button onClick={() => remove(c.id)} className="text-muted-foreground/60 hover:text-destructive" aria-label={t.ariaDeleteComment}>
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
              placeholder={t.commentsPlaceholder}
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
                <Send className="w-3.5 h-3.5 mr-1" /> {t.commentsSubmit}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4" /> {t.approvalHistoryTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.approvalEmpty}</p>
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
                      {r.status === "approved" ? t.statusApproved : r.status === "changes_requested" ? t.statusChanges : t.statusPending}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {t.approvalRequestedBy(r.requesterName || "—")} · {new Date(r.createdAt).toLocaleString(t.dateLocale as string)}
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
