import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Zap,
  Target,
  Megaphone,
  BookOpen,
  Lightbulb,
  Wrench,
  TrendingUp,
  Package,
  Sparkles,
  Play,
  Pause,
  Square,
  Video,
  Camera,
  ArrowLeft,
  Copy,
  Trash2,
  Loader2,
  Check,
  X,
  Clock,
  FileText,
  SwitchCamera,
  RotateCcw,
  Send,
  Flame,
} from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, credentials: "include" });
}

const CATEGORY_ICONS: Record<string, any> = {
  "corto-viral": Zap,
  "problema-solucion": Target,
  marketing: Megaphone,
  historia: BookOpen,
  educativo: Lightbulb,
  "behind-scenes": Wrench,
  opinion: TrendingUp,
  "pack-del-dia": Package,
};

const CATEGORY_COLORS: Record<string, { dot: string; text: string }> = {
  "corto-viral": { dot: "bg-red-500", text: "text-red-400" },
  "problema-solucion": { dot: "bg-blue-500", text: "text-blue-400" },
  marketing: { dot: "bg-purple-500", text: "text-purple-400" },
  historia: { dot: "bg-amber-500", text: "text-amber-400" },
  educativo: { dot: "bg-green-500", text: "text-green-400" },
  "behind-scenes": { dot: "bg-cyan-500", text: "text-cyan-400" },
  opinion: { dot: "bg-pink-500", text: "text-pink-400" },
  "pack-del-dia": { dot: "bg-orange-500", text: "text-orange-400" },
};

const PLATFORM_COLORS: Record<string, string> = {
  TikTok: "bg-black text-white",
  "Instagram Reels": "bg-gradient-to-r from-purple-600 to-pink-500 text-white",
  "YouTube Shorts": "bg-red-600 text-white",
};

const MOTIVATIONAL = [
  "El contenido que creas hoy, vende mañana",
  "Hoy es un gran día para crear contenido",
  "Cada video te acerca a más clientes",
];

type VideoIdea = {
  id: number;
  titulo: string;
  guion: string;
  descripcion: string | null;
  category: string;
  plataforma: string;
  duracionSugerida: string | null;
  tendencia: string | null;
  hashtags: string[] | null;
  inStudio: number;
  recordedAt: string | null;
  createdAt: string;
};

type StudioStats = {
  total: number;
  recorded: number;
  inStudio: number;
  byCategory: Record<string, number>;
};

type StudioView = "main" | "ideas" | "camera" | "teleprompter";

export default function StudioPage() {
  const [view, setView] = useState<StudioView>("main");
  const [selectedIdea, setSelectedIdea] = useState<VideoIdea | null>(null);
  const [activeTab, setActiveTab] = useState<"estudio" | "ideas">("estudio");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: ideas = [], isLoading: ideasLoading } = useQuery({
    queryKey: ["studio-ideas", false],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("recorded", "false");
      const res = await apiFetch(`${API_BASE}/studio/ideas?${params}`);
      return res.json();
    },
  });

  const { data: allIdeas = [] } = useQuery({
    queryKey: ["studio-ideas-all"],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/studio/ideas`);
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["studio-categories"],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/studio/categories`);
      return res.json();
    },
  });

  const { data: stats } = useQuery<StudioStats>({
    queryKey: ["studio-stats"],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/studio/stats`);
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async ({ category, count }: { category: string; count?: number }) => {
      const res = await apiFetch(`${API_BASE}/studio/ideas/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, count: count || 3 }),
      });
      if (!res.ok) throw new Error("Error al generar");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["studio-ideas"] });
      queryClient.invalidateQueries({ queryKey: ["studio-ideas-all"] });
      queryClient.invalidateQueries({ queryKey: ["studio-stats"] });
      toast({ title: "Ideas generadas", description: `${data.count} ideas creadas` });
    },
    onError: () => toast({ title: "Error al generar ideas", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; inStudio?: number; recordedAt?: string | null }) => {
      const res = await apiFetch(`${API_BASE}/studio/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-ideas"] });
      queryClient.invalidateQueries({ queryKey: ["studio-ideas-all"] });
      queryClient.invalidateQueries({ queryKey: ["studio-stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`${API_BASE}/studio/ideas/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-ideas"] });
      queryClient.invalidateQueries({ queryKey: ["studio-ideas-all"] });
      queryClient.invalidateQueries({ queryKey: ["studio-stats"] });
      toast({ title: "Idea eliminada" });
    },
  });

  const markRecordedAndCreateVideo = async (idea: VideoIdea) => {
    updateMutation.mutate({ id: idea.id, recordedAt: new Date().toISOString() });
    try {
      const res = await apiFetch(`${API_BASE}/content/videos/from-studio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: idea.titulo,
          description: idea.descripcion || idea.guion?.substring(0, 200) || "",
          category: idea.category,
          hashtags: idea.hashtags || [],
        }),
      });
      if (res.ok) {
        toast({
          title: "Video creado en el Gestor",
          description: "La portada se está generando automáticamente con IA",
        });
      }
    } catch {
      toast({ title: "Error al crear video en el gestor", variant: "destructive" });
    }
  };

  const motivation = MOTIVATIONAL[Math.floor(Date.now() / 86400000) % MOTIVATIONAL.length];

  const readyToRecord = ideas.filter((i: VideoIdea) => !i.recordedAt);
  const totalIdeas = stats?.total || allIdeas.length || 0;

  const today = new Date();
  const dayOfWeek = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const recordedAll = allIdeas.filter((i: VideoIdea) => i.recordedAt);
  const recordedWeek = recordedAll.filter((i: VideoIdea) => new Date(i.recordedAt!) >= startOfWeek).length;
  const recordedMonth = recordedAll.filter((i: VideoIdea) => new Date(i.recordedAt!) >= startOfMonth).length;

  let streak = 0;
  if (recordedAll.length > 0) {
    const sortedDates = [...new Set(recordedAll.map((i: VideoIdea) => new Date(i.recordedAt!).toDateString()))].sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );
    const todayStr = today.toDateString();
    const yesterdayStr = new Date(today.getTime() - 86400000).toDateString();
    if (sortedDates[0] === todayStr || sortedDates[0] === yesterdayStr) {
      streak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86400000);
        if (diffDays === 1) streak++;
        else break;
      }
    }
  }

  if (view === "camera") {
    return (
      <CameraRecorder
        idea={selectedIdea}
        onBack={() => setView("main")}
        onRecorded={() => {
          if (selectedIdea) markRecordedAndCreateVideo(selectedIdea);
          setView("main");
        }}
      />
    );
  }

  if (view === "teleprompter" && selectedIdea) {
    return (
      <TeleprompterRecorder
        idea={selectedIdea}
        onBack={() => setView("main")}
        onRecorded={() => {
          markRecordedAndCreateVideo(selectedIdea);
          setView("main");
        }}
      />
    );
  }

  return (
    <Layout>
      <div className="space-y-5 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">Estudio</h1>
            <p className="text-sm text-muted-foreground">{motivation}</p>
          </div>
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-primary">{totalIdeas}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("estudio")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === "estudio"
                ? "bg-primary text-white shadow-lg shadow-primary/25"
                : "bg-white/5 text-muted-foreground hover:bg-white/10"
            }`}
          >
            <Video className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Estudio
          </button>
          <button
            onClick={() => setActiveTab("ideas")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeTab === "ideas"
                ? "bg-primary text-white shadow-lg shadow-primary/25"
                : "bg-white/5 text-muted-foreground hover:bg-white/10"
            }`}
          >
            <Sparkles className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Ideas IA
          </button>
        </div>

        {activeTab === "estudio" && (
          <>
            <button
              onClick={() => { setSelectedIdea(null); setView("camera"); }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/20 hover:border-blue-500/40 transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                <Camera className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground">Grabar libre</p>
                <p className="text-xs text-muted-foreground">Sin guion, solo tú y la cámara</p>
              </div>
              <Play className="w-5 h-5 text-blue-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="grid grid-cols-4 gap-3">
              <StatCircle value={streak} label="Racha" color="border-orange-500" textColor="text-orange-400" />
              <StatCircle value={recordedWeek} label="Semana" color="border-blue-500" textColor="text-blue-400" />
              <StatCircle value={recordedMonth} label="Mes" color="border-green-500" textColor="text-green-400" />
              <StatCircle value={recordedAll.length} label="Total" color="border-white/20" textColor="text-foreground" plain />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                Listos para grabar
              </p>

              {ideasLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : readyToRecord.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Video className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No hay ideas pendientes.</p>
                  <p className="text-xs mt-1">Ve a "Ideas IA" para generar nuevas</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {readyToRecord.map((idea: VideoIdea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      onPlay={() => { setSelectedIdea(idea); setView("teleprompter"); }}
                      onCamera={() => { setSelectedIdea(idea); setView("camera"); }}
                      onDelete={() => deleteMutation.mutate(idea.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "ideas" && (
          <IdeasTab
            categories={categories}
            stats={stats}
            onGenerate={(category: string) => generateMutation.mutate({ category })}
            isGenerating={generateMutation.isPending}
          />
        )}
      </div>
    </Layout>
  );
}

function StatCircle({ value, label, color, textColor, plain }: {
  value: number;
  label: string;
  color: string;
  textColor: string;
  plain?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center ${
        plain
          ? "border-2 border-white/10"
          : `border-[3px] ${color}`
      }`}>
        <span className={`text-xl sm:text-2xl font-bold ${textColor}`}>{value}</span>
      </div>
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function IdeaCard({ idea, onPlay, onCamera, onDelete }: {
  idea: VideoIdea;
  onPlay: () => void;
  onCamera: () => void;
  onDelete: () => void;
}) {
  const colors = CATEGORY_COLORS[idea.category] || CATEGORY_COLORS["corto-viral"];
  const platformColor = PLATFORM_COLORS[idea.plataforma] || "bg-zinc-700 text-white";
  const progress = Math.random() * 60 + 20;

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3 hover:border-white/10 transition-colors">
      <div className="flex items-start gap-3">
        <button
          onClick={onPlay}
          className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-600/20 transition-colors"
        >
          <Play className="w-4 h-4 text-white ml-0.5" />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-foreground leading-snug">{idea.titulo}</h3>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${platformColor}`}>
              {idea.plataforma}
            </span>
            {idea.duracionSugerida && (
              <span className="text-[10px] text-muted-foreground">{idea.duracionSugerida}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onCamera}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="Grabar con cámara"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-red-500/10 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors"
            title="Eliminar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colors.dot}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function IdeasTab({ categories, stats, onGenerate, isGenerating }: {
  categories: any[];
  stats: StudioStats | undefined;
  onGenerate: (category: string) => void;
  isGenerating: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecciona una categoría para generar ideas con IA.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {categories.map((cat: any) => {
          const Icon = CATEGORY_ICONS[cat.key] || Zap;
          const colors = CATEGORY_COLORS[cat.key] || CATEGORY_COLORS["corto-viral"];
          const isActive = selected === cat.key;
          const count = stats?.byCategory[cat.key] || 0;

          return (
            <button
              key={cat.key}
              onClick={() => setSelected(isActive ? null : cat.key)}
              className={`relative p-4 rounded-2xl border transition-all text-left ${
                isActive
                  ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${
                isActive ? "bg-primary/20 text-primary" : `bg-white/5 ${colors.text}`
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-foreground">{cat.label}</p>
              {count > 0 && (
                <span className="absolute top-2 right-2 text-[10px] bg-white/5 text-muted-foreground px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <Button
          onClick={() => onGenerate(selected)}
          disabled={isGenerating}
          className="w-full bg-gradient-to-r from-orange-600 to-pink-600 shadow-lg shadow-orange-900/25 py-6 text-base"
        >
          {isGenerating ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5 mr-2" />
          )}
          {isGenerating ? "Generando..." : `Generar ideas de ${categories.find((c: any) => c.key === selected)?.label || selected}`}
        </Button>
      )}
    </div>
  );
}

function CameraRecorder({ idea, onBack, onRecorded }: {
  idea: VideoIdea | null;
  onBack: () => void;
  onRecorded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMirrored, setIsMirrored] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);
  const [fontSize, setFontSize] = useState(16);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraReady(true);
    } catch (err: any) {
      setCameraError(err.message || "No se pudo acceder a la cámara");
      setCameraReady(false);
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera]);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    setRecordedBlob(null);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, { mimeType: "video/webm;codecs=vp9,opus" });
    } catch {
      try {
        recorder = new MediaRecorder(streamRef.current, { mimeType: "video/webm" });
      } catch {
        recorder = new MediaRecorder(streamRef.current);
      }
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      if (previewRef.current) previewRef.current.src = URL.createObjectURL(blob);
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setIsPaused(false);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      } else {
        mediaRecorderRef.current.pause();
        if (timerRef.current) clearInterval(timerRef.current);
      }
      setIsPaused(!isPaused);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === "user" ? "environment" : "user");
  };

  const downloadVideo = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grabacion-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  if (cameraError) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-8">
        <Camera className="w-16 h-16 text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-red-400 mb-2">Cámara no disponible</h3>
        <p className="text-sm text-muted-foreground text-center mb-4">{cameraError}</p>
        <div className="flex gap-3">
          <Button onClick={startCamera} variant="outline">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reintentar
          </Button>
          <Button onClick={onBack} variant="ghost">Volver</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {!recordedBlob ? (
        <>
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
            />

            <button
              onClick={onBack}
              className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>

            <button
              onClick={switchCamera}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"
              disabled={isRecording}
            >
              <SwitchCamera className="w-5 h-5 text-white" />
            </button>

            {isRecording && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/10">
                <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? "bg-yellow-500" : "bg-red-500 animate-pulse"}`} />
                <span className="text-sm font-mono font-semibold text-white tracking-widest">
                  {formatTime(recordingTime)}
                </span>
              </div>
            )}

            <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3">
              <button
                onClick={() => setIsMirrored(!isMirrored)}
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 text-white text-xs font-bold"
              >
                ↔
              </button>
              <button
                className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 text-white text-[10px] font-medium"
              >
                {fontSize === 16 ? "1.0x" : `${(fontSize / 16).toFixed(1)}x`}
              </button>
            </div>
          </div>

          <div className="bg-black/80 backdrop-blur-xl border-t border-white/5 safe-bottom">
            <div className="flex items-center justify-center gap-2 py-2">
              <button
                onClick={() => setFontSize(Math.max(12, fontSize - 2))}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              >
                A-
              </button>
              <span className="text-xs text-muted-foreground">{fontSize}px</span>
              <button
                onClick={() => setFontSize(Math.min(32, fontSize + 2))}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              >
                A+
              </button>
            </div>

            <div className="flex items-center justify-center gap-6 pb-6 pt-2">
              {isRecording && (
                <button
                  onClick={pauseRecording}
                  className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/20"
                >
                  {isPaused ? <Play className="w-5 h-5 text-white" /> : <Pause className="w-5 h-5 text-white" />}
                </button>
              )}

              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={!cameraReady}
                  className="w-[72px] h-[72px] rounded-full border-4 border-white/30 flex items-center justify-center bg-transparent hover:border-white/50 transition-colors disabled:opacity-50"
                >
                  <div className="w-14 h-14 rounded-full bg-red-600" />
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="w-[72px] h-[72px] rounded-full border-4 border-white/30 flex items-center justify-center bg-transparent"
                >
                  <Square className="w-7 h-7 fill-red-600 text-red-600" />
                </button>
              )}

              {isRecording && (
                <div className="w-12 h-12" />
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 relative overflow-hidden bg-black">
            <video
              ref={previewRef}
              controls
              className="absolute inset-0 w-full h-full object-contain"
            />
            <button
              onClick={onBack}
              className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="bg-black/80 backdrop-blur-xl border-t border-white/5 safe-bottom">
            <div className="flex items-center justify-center gap-3 p-4 pb-6">
              <Button
                variant="outline"
                onClick={() => setRecordedBlob(null)}
                className="border-white/10 text-white"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                De nuevo
              </Button>
              <Button onClick={downloadVideo} className="bg-white/10 text-white hover:bg-white/20">
                <Send className="w-4 h-4 mr-2" />
                Descargar
              </Button>
              <Button
                onClick={onRecorded}
                className="bg-gradient-to-r from-green-600 to-emerald-600 text-white"
              >
                <Check className="w-4 h-4 mr-2" />
                Listo
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TeleprompterRecorder({ idea, onBack, onRecorded }: {
  idea: VideoIdea;
  onBack: () => void;
  onRecorded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [isMirrored, setIsMirrored] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const [showScript, setShowScript] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const colors = CATEGORY_COLORS[idea.category] || CATEGORY_COLORS["corto-viral"];
  const categoryLabel = idea.category.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraReady(true);
    } catch {}
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [startCamera]);

  const doScroll = useCallback(() => {
    if (!scrollRef.current || !isScrolling) return;
    scrollRef.current.scrollTop += scrollSpeed * 0.8;
    animRef.current = requestAnimationFrame(doScroll);
  }, [isScrolling, scrollSpeed]);

  useEffect(() => {
    if (isScrolling) {
      animRef.current = requestAnimationFrame(doScroll);
    } else if (animRef.current) {
      cancelAnimationFrame(animRef.current);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isScrolling, doScroll]);

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    setRecordedBlob(null);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, { mimeType: "video/webm;codecs=vp9,opus" });
    } catch {
      try {
        recorder = new MediaRecorder(streamRef.current, { mimeType: "video/webm" });
      } catch {
        recorder = new MediaRecorder(streamRef.current);
      }
    }

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      if (previewRef.current) previewRef.current.src = URL.createObjectURL(blob);
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setIsPaused(false);
    setRecordingTime(0);
    setIsScrolling(true);
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
        setIsScrolling(true);
      } else {
        mediaRecorderRef.current.pause();
        if (timerRef.current) clearInterval(timerRef.current);
        setIsScrolling(false);
      }
      setIsPaused(!isPaused);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      setIsScrolling(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const switchCamera = () => setFacingMode(prev => prev === "user" ? "environment" : "user");

  const downloadVideo = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grabacion-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const guionLines = idea.guion.split("\n").filter(l => l.trim());

  if (recordedBlob) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="flex-1 relative overflow-hidden">
          <video ref={previewRef} controls className="absolute inset-0 w-full h-full object-contain" />
          <button
            onClick={onBack}
            className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
        </div>
        <div className="bg-black/80 backdrop-blur-xl border-t border-white/5 safe-bottom">
          <div className="flex items-center justify-center gap-3 p-4 pb-6">
            <Button variant="outline" onClick={() => setRecordedBlob(null)} className="border-white/10 text-white">
              <RotateCcw className="w-4 h-4 mr-2" />
              De nuevo
            </Button>
            <Button onClick={downloadVideo} className="bg-white/10 text-white hover:bg-white/20">
              <Send className="w-4 h-4 mr-2" />
              Descargar
            </Button>
            <Button onClick={onRecorded} className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
              <Check className="w-4 h-4 mr-2" />
              Listo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
        />

        {showScript && (
          <div className="absolute inset-0 bg-black/60 z-10">
            <div
              ref={scrollRef}
              className="absolute inset-0 overflow-y-auto px-6 sm:px-10 pt-20 pb-40"
            >
              <div className="max-w-xl mx-auto">
                <div className="flex items-center gap-2 mb-6">
                  <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {categoryLabel}
                  </span>
                </div>

                {guionLines.map((line, i) => (
                  <p
                    key={i}
                    className="text-white font-semibold leading-relaxed mb-5"
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    {line}
                  </p>
                ))}

                <p className="text-center text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground/40 mt-16">
                  FIN DEL GUION
                </p>
                <div className="h-[50vh]" />
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onBack}
          className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        <button
          onClick={switchCamera}
          disabled={isRecording}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10"
        >
          <SwitchCamera className="w-5 h-5 text-white" />
        </button>

        {isRecording && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 backdrop-blur-md border border-white/10">
            <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? "bg-yellow-500" : "bg-red-500 animate-pulse"}`} />
            <span className="text-sm font-mono font-semibold text-white tracking-widest">
              {formatTime(recordingTime)}
            </span>
          </div>
        )}

        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3">
          <button
            onClick={() => setIsMirrored(!isMirrored)}
            className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 text-white text-xs font-bold"
          >
            ↔
          </button>
          <button
            onClick={() => setShowScript(!showScript)}
            className={`w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 ${showScript ? "text-primary" : "text-white"}`}
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 text-white text-[10px] font-medium"
          >
            {scrollSpeed.toFixed(1)}x
          </button>
        </div>
      </div>

      <div className="bg-black/80 backdrop-blur-xl border-t border-white/5 z-20 safe-bottom">
        {showScript && (
          <div className="flex items-center justify-center gap-4 py-2">
            <button
              onClick={() => { setScrollSpeed(1); setIsScrolling(false); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                scrollSpeed === 1 && !isScrolling ? "bg-white/10 border-white/20 text-foreground" : "border-white/5 text-muted-foreground"
              }`}
            >
              CERCA
            </button>
            <button
              onClick={() => { setScrollSpeed(2); if (!isRecording) setIsScrolling(true); }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                scrollSpeed === 2 ? "bg-white/10 border-white/20 text-foreground" : "border-white/5 text-muted-foreground"
              }`}
            >
              LEJOS
            </button>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 py-1">
          <button
            onClick={() => setFontSize(Math.max(12, fontSize - 2))}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          >
            A-
          </button>
          <span className="text-xs text-muted-foreground">{fontSize}px</span>
          <button
            onClick={() => setFontSize(Math.min(32, fontSize + 2))}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          >
            A+
          </button>
        </div>

        <div className="flex items-center justify-center gap-6 pb-6 pt-2">
          {isRecording && (
            <button
              onClick={pauseRecording}
              className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/20"
            >
              {isPaused ? <Play className="w-5 h-5 text-white" /> : <Pause className="w-5 h-5 text-white" />}
            </button>
          )}

          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={!cameraReady}
              className="w-[72px] h-[72px] rounded-full border-4 border-white/30 flex items-center justify-center bg-transparent hover:border-white/50 transition-colors disabled:opacity-50"
            >
              <div className="w-14 h-14 rounded-full bg-red-600" />
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="w-[72px] h-[72px] rounded-full border-4 border-white/30 flex items-center justify-center bg-transparent"
            >
              <Square className="w-7 h-7 fill-red-600 text-red-600" />
            </button>
          )}

          {isRecording && <div className="w-12 h-12" />}
        </div>
      </div>
    </div>
  );
}
