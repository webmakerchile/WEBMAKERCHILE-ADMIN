import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

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
  tiktokPublishId?: string | null;
  tiktokStatus?: string | null;
  instagramMediaId?: string | null;
  instagramStatus?: string | null;
  youtubeVideoId?: string | null;
  youtubeStatus?: string | null;
  createdAt: string;
  updatedAt: string;
};

type WizardStep = "info" | "cover" | "tiktok-instagram" | "youtube" | "review";

const STEPS: { key: WizardStep; label: string; shortLabel: string }[] = [
  { key: "info", label: "Información Básica", shortLabel: "Info" },
  { key: "cover", label: "Portada", shortLabel: "Portada" },
  { key: "tiktok-instagram", label: "TikTok e Instagram", shortLabel: "TikTok/IG" },
  { key: "youtube", label: "YouTube", shortLabel: "YouTube" },
  { key: "review", label: "Revisar y Programar", shortLabel: "Programar" },
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
    case "review":
      return video.status === "scheduled" || video.status === "published";
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
  if (video.status === "scheduled" || video.status === "published") done++;
  return Math.round((done / 5) * 100);
}

function getStatusBadge(video: VideoData) {
  const progress = getVideoProgress(video);
  if (video.status === "published") return { label: "Publicado", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  if (video.status === "scheduled") return { label: "Programado", className: "bg-orange-500/10 text-orange-400 border-orange-500/20" };
  if (progress === 100) return { label: "Listo", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
  if (progress > 0) return { label: `${progress}% completo`, className: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
  return { label: "Borrador", className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" };
}

export default function VideosPage() {
  const [selectedVideo, setSelectedVideo] = useState<VideoData | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("info");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: videos = [], isLoading } = useQuery<VideoData[]>({
    queryKey: ["videos"],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/content/videos`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; month?: string; week?: string; day?: string; videoNumber?: string; scheduleHour?: string }) => {
      const res = await apiFetch(`${API_BASE}/content/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedVideo(data);
      setIsCreating(false);
      setWizardStep("cover");
      toast({ title: "Video creado", description: "Ahora agrega la portada" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, any>) => {
      const res = await apiFetch(`${API_BASE}/content/videos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedVideo(data);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`${API_BASE}/content/videos/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      setSelectedVideo(null);
      toast({ title: "Video eliminado" });
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
          onGenerateCover={() => {
            if (selectedVideo) generateCoverMutation.mutate(selectedVideo.id);
          }}
          onDelete={() => {
            if (selectedVideo && confirm("¿Eliminar este video?")) {
              deleteMutation.mutate(selectedVideo.id);
            }
          }}
          isCreatingPending={createMutation.isPending}
          isUpdating={updateMutation.isPending}
          isGeneratingCover={generateCoverMutation.isPending}
          toast={toast}
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Gestor de Videos</h1>
            <p className="text-muted-foreground text-xs sm:text-lg">Tu editora puede completar cada video paso a paso sin salir de aquí.</p>
          </div>
          <Button
            onClick={() => { setIsCreating(true); setWizardStep("info"); }}
            className="bg-gradient-to-r from-primary to-orange-400 hover:from-orange-500 hover:to-orange-400 shadow-lg shadow-primary/25"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nuevo Video
          </Button>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-12 text-center">
              <Video className="w-12 h-12 text-primary/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sin videos registrados</h3>
              <p className="text-muted-foreground text-sm mb-4">Crea tu primer video y complétalo paso a paso</p>
              <Button onClick={() => { setIsCreating(true); setWizardStep("info"); }}>
                <Plus className="w-4 h-4 mr-2" />
                Crear primer video
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {videos.map((video: VideoData) => {
              const progress = getVideoProgress(video);
              const statusBadge = getStatusBadge(video);
              return (
                <Card
                  key={video.id}
                  className="bg-card/50 border-white/5 hover:border-primary/20 cursor-pointer transition-all duration-200"
                  onClick={() => {
                    setSelectedVideo(video);
                    if (!video.coverImageBase64) setWizardStep("cover");
                    else if (!video.tiktokDescription || !video.instagramDescription) setWizardStep("tiktok-instagram");
                    else if (!video.youtubeTitle || !video.youtubeDescription) setWizardStep("youtube");
                    else setWizardStep("review");
                  }}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-black/20 border border-white/5 flex-shrink-0 flex items-center justify-center">
                        {video.coverImageBase64 ? (
                          <img
                            src={`data:${video.coverMimeType || "image/png"};base64,${video.coverImageBase64}`}
                            className="w-full h-full object-cover"
                            alt=""
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
                          <ChevronRight className="w-5 h-5 text-muted-foreground/30 flex-shrink-0 hidden sm:block" />
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="outline" className={statusBadge.className + " text-[10px] sm:text-xs"}>
                            {statusBadge.label}
                          </Badge>
                          <div className="w-16 sm:w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
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
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
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
  onGenerateCover,
  onDelete,
  isCreatingPending,
  isUpdating,
  isGeneratingCover,
  toast,
}: {
  video: VideoData | null;
  isCreating: boolean;
  currentStep: WizardStep;
  onStepChange: (step: WizardStep) => void;
  onBack: () => void;
  onCreate: (data: any) => void;
  onUpdate: (data: any) => void;
  onGenerateCover: () => void;
  onDelete: () => void;
  isCreatingPending: boolean;
  isUpdating: boolean;
  isGeneratingCover: boolean;
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
    if (!formData.title || !formData.description) {
      toast({ title: "Completa título y descripción", variant: "destructive" });
      return;
    }
    if (isCreating) {
      onCreate({
        title: formData.title,
        description: formData.description,
        month: formData.month || undefined,
        week: formData.week || undefined,
        day: formData.day || undefined,
        videoNumber: formData.videoNumber || undefined,
        scheduleHour: formData.scheduleHour || undefined,
      });
    } else {
      onUpdate({
        title: formData.title,
        description: formData.description,
        month: formData.month || undefined,
        week: formData.week || undefined,
        day: formData.day || undefined,
        videoNumber: formData.videoNumber || undefined,
        scheduleHour: formData.scheduleHour || undefined,
      });
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al listado
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold">
            {isCreating ? "Nuevo Video" : video?.title}
          </h1>
          {video && (
            <p className="text-sm text-muted-foreground mt-0.5">
              Completa todos los pasos para programar en las 3 plataformas
            </p>
          )}
        </div>
        {video && (
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <Trash2 className="w-4 h-4 mr-1" />
            Eliminar
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1 bg-card/30 rounded-2xl p-2 border border-white/5">
        {STEPS.map((step, i) => {
          const isActive = step.key === currentStep;
          const isComplete = isStepComplete(video, step.key);
          const isClickable = !isCreating || step.key === "info";

          return (
            <button
              key={step.key}
              onClick={() => isClickable && onStepChange(step.key)}
              disabled={!isClickable}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : isComplete
                  ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
                  : "text-muted-foreground hover:bg-white/5"
              } ${!isClickable ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {isComplete && !isActive ? (
                <Check className="w-4 h-4" />
              ) : (
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive ? "bg-white/20" : "bg-white/5"
                }`}>
                  {i + 1}
                </span>
              )}
              <span className="hidden md:inline">{step.shortLabel}</span>
            </button>
          );
        })}
      </div>

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
              copyText={copyText}
            />
          )}

          {currentStep === "youtube" && video && (
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
              copyText={copyText}
            />
          )}

          {currentStep === "review" && video && (
            <StepReview
              video={{ ...video, ...formData }}
              onSchedule={() => {
                onUpdate({
                  status: "scheduled",
                  tiktokStatus: "scheduled",
                  instagramStatus: "scheduled",
                  youtubeStatus: "scheduled",
                  scheduledAt: new Date().toISOString(),
                });
                toast({
                  title: "¡Programado en las 3 plataformas!",
                  description: "TikTok, Instagram y YouTube están listos",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg">Seleccionar Video desde Drive</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-white/5 border-b border-white/5 flex items-center gap-3">
          <button
            onClick={navigateBack}
            disabled={folderHistory.length <= 1}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
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
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left group"
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
    <Card className="bg-card/50 border-white/5">
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

        <div className="grid grid-cols-5 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Mes</label>
            <select
              value={formData.month}
              onChange={(e) => setFormData({ ...formData, month: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">Seleccionar</option>
              <option value="Enero">Enero</option>
              <option value="Febrero">Febrero</option>
              <option value="Marzo">Marzo</option>
              <option value="Abril">Abril</option>
              <option value="Mayo">Mayo</option>
              <option value="Junio">Junio</option>
              <option value="Julio">Julio</option>
              <option value="Agosto">Agosto</option>
              <option value="Septiembre">Septiembre</option>
              <option value="Octubre">Octubre</option>
              <option value="Noviembre">Noviembre</option>
              <option value="Diciembre">Diciembre</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Semana</label>
            <select
              value={formData.week}
              onChange={(e) => setFormData({ ...formData, week: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">Seleccionar</option>
              <option value="Semana 1">Semana 1</option>
              <option value="Semana 2">Semana 2</option>
              <option value="Semana 3">Semana 3</option>
              <option value="Semana 4">Semana 4</option>
              <option value="Semana 5">Semana 5</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Día</label>
            <select
              value={formData.day}
              onChange={(e) => setFormData({ ...formData, day: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">Seleccionar</option>
              <option value="Lunes">Lunes</option>
              <option value="Martes">Martes</option>
              <option value="Miércoles">Miércoles</option>
              <option value="Jueves">Jueves</option>
              <option value="Viernes">Viernes</option>
              <option value="Sábado">Sábado</option>
              <option value="Domingo">Domingo</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Video #</label>
            <select
              value={formData.videoNumber}
              onChange={(e) => setFormData({ ...formData, videoNumber: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">Seleccionar</option>
              <option value="01">#01</option>
              <option value="02">#02</option>
              <option value="03">#03</option>
              <option value="04">#04</option>
              <option value="05">#05</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Hora</label>
            <select
              value={formData.scheduleHour}
              onChange={(e) => setFormData({ ...formData, scheduleHour: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none appearance-none cursor-pointer"
            >
              <option value="">Seleccionar</option>
              <option value="08:00">08:00</option>
              <option value="09:00">09:00</option>
              <option value="10:00">10:00</option>
              <option value="11:00">11:00</option>
              <option value="12:00">12:00</option>
              <option value="13:00">13:00</option>
              <option value="14:00">14:00</option>
              <option value="15:00">15:00</option>
              <option value="16:00">16:00</option>
              <option value="17:00">17:00</option>
              <option value="18:00">18:00</option>
              <option value="19:00">19:00</option>
              <option value="20:00">20:00</option>
              <option value="21:00">21:00</option>
              <option value="22:00">22:00</option>
            </select>
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
                    className="border-2 border-dashed border-white/10 hover:border-primary/50 hover:bg-white/5 rounded-xl p-6 text-center cursor-pointer transition-all"
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
                    className="border-2 border-dashed border-white/10 hover:border-orange-500/50 hover:bg-white/5 rounded-xl p-6 text-center cursor-pointer transition-all"
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
    <Card className="bg-card/50 border-white/5">
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
            <div className="w-48 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
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
            <Button variant="outline" onClick={onGenerate} disabled={isGenerating} className="border-white/10">
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Regenerar portada
            </Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-32 h-56 mx-auto rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center mb-6 bg-black/10">
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
          <Button variant="outline" onClick={onPrev} className="border-white/10">
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

function StepTikTokInstagram({
  formData,
  setFormData,
  video,
  onSave,
  onPrev,
  isPending,
  copyText,
}: {
  formData: any;
  setFormData: (data: any) => void;
  video: VideoData;
  onSave: () => void;
  onPrev: () => void;
  isPending: boolean;
  copyText: (text: string) => void;
}) {
  return (
    <Card className="bg-card/50 border-white/5">
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
            <textarea
              value={formData.tiktokDescription}
              onChange={(e) => setFormData({ ...formData, tiktokDescription: e.target.value })}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[180px]"
              placeholder={"✨ [Título atractivo]\n\n📌 [Descripción corta]\n\n#hashtag1 #hashtag2 #hashtag3"}
            />
            <p className="text-[10px] text-muted-foreground">Máximo 2200 caracteres · {formData.tiktokDescription.length}/2200</p>
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
            <textarea
              value={formData.instagramDescription}
              onChange={(e) => setFormData({ ...formData, instagramDescription: e.target.value })}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[180px]"
              placeholder={"✨ [Título atractivo]\n\n📌 [Descripción para Instagram]\n\n💡 Síguenos para más tips\n\n#hashtag1 #hashtag2 #hashtag3"}
            />
            <p className="text-[10px] text-muted-foreground">Máximo 2200 caracteres · {formData.instagramDescription.length}/2200</p>
          </div>
        </div>

        <div className="pt-4 flex justify-between">
          <Button variant="outline" onClick={onPrev} className="border-white/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || !formData.tiktokDescription || !formData.instagramDescription}
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
  copyText,
}: {
  formData: any;
  setFormData: (data: any) => void;
  video: VideoData;
  onSave: () => void;
  onPrev: () => void;
  isPending: boolean;
  copyText: (text: string) => void;
}) {
  return (
    <Card className="bg-card/50 border-white/5">
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
          <input
            value={formData.youtubeTitle}
            onChange={(e) => setFormData({ ...formData, youtubeTitle: e.target.value })}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            placeholder="Título optimizado para YouTube (máx. 100 caracteres)"
            maxLength={100}
          />
          <p className="text-[10px] text-muted-foreground">{formData.youtubeTitle.length}/100 caracteres</p>
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
          <textarea
            value={formData.youtubeDescription}
            onChange={(e) => setFormData({ ...formData, youtubeDescription: e.target.value })}
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[200px]"
            placeholder={"📌 [Descripción del video]\n\n🔔 Suscríbete para más contenido\n💻 Visítanos: webmakerchile.com\n\n#shorts #webdev #programacion"}
          />
          <p className="text-[10px] text-muted-foreground">{formData.youtubeDescription.length}/5000 caracteres</p>
        </div>

        <div className="pt-4 flex justify-between">
          <Button variant="outline" onClick={onPrev} className="border-white/10">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending || !formData.youtubeTitle || !formData.youtubeDescription}
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
  onSchedule: () => void;
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
    video.youtubeDescription;

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
  ];

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 border-white/5">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Revisar y Programar
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Revisa todo antes de programar en las 3 plataformas
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-6">
            {video.coverImageBase64 && (
              <div className="w-28 flex-shrink-0">
                <img
                  src={`data:${video.coverMimeType || "image/png"};base64,${video.coverImageBase64}`}
                  className="w-full aspect-[9/16] object-cover rounded-xl border border-white/10"
                  alt="Portada"
                />
              </div>
            )}
            <div className="flex-1">
              <h3 className="text-lg font-bold">{video.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{video.description}</p>
              {video.month && (
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant="outline" className="border-white/10">
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

          {isScheduled && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-emerald-400">Programado en las 3 plataformas</p>
                  {video.scheduleHour && (
                    <div className="flex items-center gap-2 mt-2 bg-white/5 rounded-lg px-3 py-2">
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
            <div className="bg-white/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Subida Inmediata</span>
                <span className="text-[10px] text-muted-foreground">· Se sube ahora, no en la hora programada</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Subir a YouTube ahora</p>
                  <p className="text-xs text-muted-foreground">
                    {hasVideoFile
                      ? `Subir "${video.videoFileName || "video"}" como Short privado (inmediato)`
                      : "Selecciona un video desde Google Drive para subirlo como Short privado"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {hasVideoFile ? (
                    <Button
                      onClick={() => handleYouTubeUpload()}
                      disabled={ytUploading}
                      className="bg-red-600 hover:bg-red-500 text-white"
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
                      className="bg-red-600 hover:bg-red-500 text-white"
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
            <div className="bg-black/20 border border-white/10 rounded-xl p-4 flex items-center gap-3">
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
            <div className="bg-white/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Subida Inmediata</span>
                <span className="text-[10px] text-muted-foreground">· Se sube ahora, no en la hora programada</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-black flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.98a8.18 8.18 0 004.76 1.52V7.05a4.84 4.84 0 01-1-.36z"/></svg>
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Subir a TikTok ahora</p>
                  <p className="text-xs text-muted-foreground">
                    {hasVideoFile
                      ? `Subir "${video.videoFileName || "video"}" a TikTok como privado (inmediato)`
                      : "Selecciona un video desde Google Drive para subirlo a TikTok"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {hasVideoFile ? (
                    <Button
                      onClick={() => handleTikTokUpload()}
                      disabled={ttUploading}
                      className="bg-black hover:bg-zinc-800 text-white border border-white/10"
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
                      className="bg-black hover:bg-zinc-800 text-white border border-white/10"
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
            <div className="bg-white/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Subida Inmediata</span>
                <span className="text-[10px] text-muted-foreground">· Se sube ahora como Reel público</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Subir a Instagram ahora</p>
                  <p className="text-xs text-muted-foreground">
                    {hasVideoFile
                      ? `Subir "${video.videoFileName || "video"}" como Reel público (inmediato)`
                      : "Selecciona un video desde Google Drive para publicar como Reel"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {hasVideoFile ? (
                    <Button
                      onClick={() => handleInstagramUpload()}
                      disabled={igUploading}
                      className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 hover:from-purple-500 hover:via-pink-400 hover:to-orange-300 text-white"
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
                      className="bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 hover:from-purple-500 hover:via-pink-400 hover:to-orange-300 text-white"
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
            <Button variant="outline" onClick={onPrev} className="border-white/10">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Anterior
            </Button>
            {!isScheduled && (
              <Button
                onClick={onSchedule}
                disabled={!allComplete || isPending}
                className="bg-gradient-to-r from-green-600 to-emerald-500 shadow-lg shadow-green-900/25"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Programar en las 3 Plataformas
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
