import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
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
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Check,
  Mic,
  MicOff,
  Maximize2,
  Minimize2,
  RotateCcw,
  SwitchCamera,
  Filter,
  Clapperboard,
  Send,
  Flame,
  BookmarkCheck,
  Bookmark,
  Clock,
  FileText,
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

const CATEGORY_COLORS: Record<string, { color: string; bgClass: string; progressColor: string }> = {
  "corto-viral": { color: "text-red-400", bgClass: "bg-red-500/10 text-red-400 border-red-500/20", progressColor: "bg-red-500" },
  "problema-solucion": { color: "text-blue-400", bgClass: "bg-blue-500/10 text-blue-400 border-blue-500/20", progressColor: "bg-blue-500" },
  marketing: { color: "text-purple-400", bgClass: "bg-purple-500/10 text-purple-400 border-purple-500/20", progressColor: "bg-purple-500" },
  historia: { color: "text-amber-400", bgClass: "bg-amber-500/10 text-amber-400 border-amber-500/20", progressColor: "bg-amber-500" },
  educativo: { color: "text-green-400", bgClass: "bg-green-500/10 text-green-400 border-green-500/20", progressColor: "bg-green-500" },
  "behind-scenes": { color: "text-cyan-400", bgClass: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", progressColor: "bg-cyan-500" },
  opinion: { color: "text-pink-400", bgClass: "bg-pink-500/10 text-pink-400 border-pink-500/20", progressColor: "bg-pink-500" },
  "pack-del-dia": { color: "text-orange-400", bgClass: "bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-orange-400 border-orange-500/20", progressColor: "bg-orange-500" },
};

const PLATFORM_COLORS: Record<string, string> = {
  TikTok: "bg-black/50 text-white border-white/10",
  "Instagram Reels": "bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-pink-300 border-pink-500/20",
  "YouTube Shorts": "bg-red-500/10 text-red-400 border-red-500/20",
};

const MOTIVATIONAL = [
  "Hoy es un gran día para crear contenido",
  "Cada video te acerca a más clientes",
  "El contenido que creas hoy, vende mañana",
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

type StudioView = "ideas" | "teleprompter" | "camera";

function truncateText(text: string, maxLen = 150) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + "...";
}

function CategoryBadge({ category }: { category: string }) {
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS["corto-viral"];
  const Icon = CATEGORY_ICONS[category] || Zap;
  const label = category.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-[0.15em] ${colors.bgClass}`}>
      <Icon className="w-3 h-3 mr-1" />
      {label}
    </Badge>
  );
}

export default function StudioPage() {
  const [view, setView] = useState<StudioView>("ideas");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showRecorded, setShowRecorded] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<VideoIdea | null>(null);
  const [expandedGuion, setExpandedGuion] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ["studio-categories"],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/studio/categories`);
      return res.json();
    },
  });

  const { data: ideas = [], isLoading: ideasLoading } = useQuery({
    queryKey: ["studio-ideas", selectedCategory, showRecorded],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      if (showRecorded) params.set("recorded", "true");
      else params.set("recorded", "false");
      const res = await apiFetch(`${API_BASE}/studio/ideas?${params}`);
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
      queryClient.invalidateQueries({ queryKey: ["studio-stats"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`${API_BASE}/studio/ideas/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-ideas"] });
      queryClient.invalidateQueries({ queryKey: ["studio-stats"] });
      toast({ title: "Idea eliminada" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async (keepRecorded: boolean) => {
      await apiFetch(`${API_BASE}/studio/ideas?keepRecorded=${keepRecorded}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-ideas"] });
      queryClient.invalidateQueries({ queryKey: ["studio-stats"] });
      toast({ title: "Ideas limpiadas" });
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
      } else {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        toast({
          title: "Error al crear video",
          description: err.error || "No se pudo crear el video en el gestor",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Error al crear video en el gestor", variant: "destructive" });
    }
  };

  const copyGuion = (guion: string) => {
    navigator.clipboard.writeText(guion);
    toast({ title: "Guion copiado al portapapeles" });
  };

  if (view === "teleprompter" && selectedIdea) {
    return (
      <Layout>
        <TeleprompterView
          idea={selectedIdea}
          onBack={() => setView("ideas")}
          onMarkRecorded={() => {
            markRecordedAndCreateVideo(selectedIdea);
            setView("ideas");
          }}
        />
      </Layout>
    );
  }

  if (view === "camera") {
    return (
      <Layout>
        <CameraView
          idea={selectedIdea}
          onBack={() => setView("ideas")}
          onRecorded={() => {
            if (selectedIdea) {
              markRecordedAndCreateVideo(selectedIdea);
            }
            setView("ideas");
          }}
        />
      </Layout>
    );
  }

  const motivation = MOTIVATIONAL[Math.floor(Math.random() * MOTIVATIONAL.length)];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-gradient flex items-center gap-3">
              <Clapperboard className="w-8 h-8 text-primary" />
              Estudio de Trabajo
            </h1>
            <p className="text-muted-foreground mt-1">{motivation}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSelectedIdea(null); setView("camera"); }}
              className="border-primary/30 hover:bg-primary/10"
            >
              <Camera className="w-4 h-4 mr-2" />
              Grabación Libre
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-card/50 border-white/5">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Ideas totales</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-white/5">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.recorded}</p>
                  <p className="text-xs text-muted-foreground">Grabados</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-white/5">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                  <Video className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.inStudio}</p>
                  <p className="text-xs text-muted-foreground">En cola</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <Button
            variant={selectedCategory === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory("all")}
            className={selectedCategory === "all" ? "" : "border-white/10"}
          >
            Todas
          </Button>
          {categories.map((cat: any) => {
            const Icon = CATEGORY_ICONS[cat.key] || Zap;
            const isActive = selectedCategory === cat.key;
            return (
              <Button
                key={cat.key}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat.key)}
                className={isActive ? "" : "border-white/10"}
              >
                <Icon className="w-3.5 h-3.5 mr-1.5" />
                {cat.label}
                {stats?.byCategory[cat.key] ? (
                  <span className="ml-1.5 text-[10px] opacity-70">
                    {stats.byCategory[cat.key]}
                  </span>
                ) : null}
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() =>
              generateMutation.mutate({
                category: selectedCategory === "all" ? "corto-viral" : selectedCategory,
              })
            }
            disabled={generateMutation.isPending}
            className="bg-gradient-to-r from-orange-600 to-pink-600 shadow-orange-900/25"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {selectedCategory === "pack-del-dia" ? "Generar Pack del Día" : "Generar Ideas IA"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRecorded(!showRecorded)}
            className="border-white/10"
          >
            {showRecorded ? <EyeOff className="w-4 h-4 mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}
            {showRecorded ? "Ocultar grabados" : "Ver grabados"}
          </Button>

          {ideas.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearMutation.mutate(true)}
              className="border-red-500/20 text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Limpiar
            </Button>
          )}
        </div>

        {ideasLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : ideas.length === 0 ? (
          <Card className="bg-card/30 border-white/5">
            <CardContent className="p-12 text-center">
              <Sparkles className="w-12 h-12 text-primary/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sin ideas aún</h3>
              <p className="text-muted-foreground text-sm">
                Selecciona una categoría y genera tus primeras ideas
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {ideas.map((idea: VideoIdea) => {
              const isExpanded = expandedGuion === idea.id;
              return (
                <Card key={idea.id} className="bg-card/50 border-white/5 hover:border-white/10 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <CategoryBadge category={idea.category} />
                          <Badge variant="outline" className={`text-[10px] border ${PLATFORM_COLORS[idea.plataforma] || ""}`}>
                            {idea.plataforma}
                          </Badge>
                          {idea.duracionSugerida && (
                            <Badge variant="outline" className="text-[10px] border-white/10">
                              <Clock className="w-3 h-3 mr-1" />
                              {idea.duracionSugerida}
                            </Badge>
                          )}
                          {idea.recordedAt && (
                            <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">
                              <Check className="w-3 h-3 mr-1" />
                              Grabado
                            </Badge>
                          )}
                        </div>

                        <h3 className="font-semibold text-sm text-foreground leading-tight mb-1.5">
                          {idea.titulo}
                        </h3>

                        {idea.descripcion && (
                          <p className="text-xs text-muted-foreground/70 mb-2">{idea.descripcion}</p>
                        )}

                        {idea.tendencia && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <Flame className="w-3 h-3 text-orange-400" />
                            <span className="text-[10px] font-semibold text-orange-400/80">{idea.tendencia}</span>
                          </div>
                        )}

                        <button
                          onClick={() => setExpandedGuion(isExpanded ? null : idea.id)}
                          className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 mb-2"
                        >
                          <FileText className="w-3 h-3" />
                          {isExpanded ? "Ocultar" : "Ver guion"}
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>

                        {isExpanded && (
                          <div className="bg-black/20 rounded-lg p-3 mb-2 border border-white/5">
                            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{idea.guion}</p>
                          </div>
                        )}

                        {idea.hashtags && idea.hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {idea.hashtags.map((tag, i) => (
                              <span key={i} className="text-[10px] text-primary/60">#{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-primary/10"
                          onClick={() => copyGuion(idea.guion)}
                          title="Copiar guion"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-primary/10"
                          onClick={() => { setSelectedIdea(idea); setView("teleprompter"); }}
                          title="Teleprompter"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-primary/10"
                          onClick={() => { setSelectedIdea(idea); setView("camera"); }}
                          title="Grabar"
                        >
                          <Video className="w-4 h-4" />
                        </Button>
                        {!idea.recordedAt ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-green-500/10 text-muted-foreground hover:text-green-400"
                            onClick={() => {
                              markRecordedAndCreateVideo(idea);
                            }}
                            title="Marcar como grabado"
                          >
                            <Bookmark className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-400"
                            onClick={() => {
                              updateMutation.mutate({ id: idea.id, recordedAt: null });
                            }}
                            title="Desmarcar grabado"
                          >
                            <BookmarkCheck className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
                          onClick={() => deleteMutation.mutate(idea.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
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

function TeleprompterView({ idea, onBack, onMarkRecorded }: {
  idea: VideoIdea;
  onBack: () => void;
  onMarkRecorded: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState([50]);
  const [fontSize, setFontSize] = useState(24);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isMirrored, setIsMirrored] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const words = idea.guion.split(/\s+/).filter(w => w.length > 0);

  const scrollTeleprompter = useCallback(() => {
    if (!scrollRef.current || !isPlaying) return;
    const scrollSpeed = (speed[0] / 100) * 3;
    scrollRef.current.scrollTop += scrollSpeed;
    animRef.current = requestAnimationFrame(scrollTeleprompter);
  }, [isPlaying, speed]);

  useEffect(() => {
    if (isPlaying) {
      animRef.current = requestAnimationFrame(scrollTeleprompter);
    } else if (animRef.current) {
      cancelAnimationFrame(animRef.current);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, scrollTeleprompter]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const resetScroll = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setHighlightIndex(-1);
    setIsPlaying(false);
  };

  const categoryColors = CATEGORY_COLORS[idea.category] || CATEGORY_COLORS["corto-viral"];

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-foreground">{idea.titulo}</h2>
          <div className="flex items-center gap-2 mt-1">
            <CategoryBadge category={idea.category} />
            <Badge variant="outline" className="text-[10px]">{idea.plataforma}</Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={toggleFullscreen} className="border-white/10">
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </div>

      <div className="bg-black/40 rounded-2xl border border-white/5 overflow-hidden">
        <div className="flex items-center gap-4 p-4 border-b border-white/5 bg-black/20">
          <Button
            size="sm"
            variant={isPlaying ? "destructive" : "default"}
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {isPlaying ? "Pausar" : "Iniciar"}
          </Button>
          <Button size="sm" variant="outline" onClick={resetScroll} className="border-white/10">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reiniciar
          </Button>

          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Velocidad</span>
            <Slider
              value={speed}
              onValueChange={setSpeed}
              min={10}
              max={100}
              step={5}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-8">{speed[0]}%</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Tamaño</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 border-white/10"
              onClick={() => setFontSize(Math.max(16, fontSize - 2))}
            >
              -
            </Button>
            <span className="text-xs w-6 text-center">{fontSize}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 border-white/10"
              onClick={() => setFontSize(Math.min(48, fontSize + 2))}
            >
              +
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsMirrored(!isMirrored)}
            className={`border-white/10 ${isMirrored ? "bg-primary/10 text-primary" : ""}`}
          >
            Espejo
          </Button>
        </div>

        <div
          ref={scrollRef}
          className="h-[60vh] overflow-y-auto p-8 md:p-12"
          style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
        >
          <div className="max-w-2xl mx-auto text-center">
            <p style={{ fontSize: fontSize * 0.75, lineHeight: 1.9 }} className="font-normal text-white/95">
              {words.map((word, i) => (
                <span
                  key={i}
                  className={`${highlightIndex >= 0 && i === highlightIndex ? "text-primary font-bold bg-primary/20 rounded px-1" : ""}`}
                >
                  {word}{" "}
                </span>
              ))}
            </p>
            <p className="mt-16 text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
              FIN DEL GUION
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <Button
          onClick={onMarkRecorded}
          className="bg-gradient-to-r from-green-600 to-emerald-600"
        >
          <Check className="w-4 h-4 mr-2" />
          Marcar como Grabado
        </Button>
      </div>
    </div>
  );
}

function CameraView({ idea, onBack, onRecorded }: {
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

    const options = { mimeType: "video/webm;codecs=vp9,opus" };
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, options);
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
      if (previewRef.current) {
        previewRef.current.src = URL.createObjectURL(blob);
      }
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

  const switchCamera = async () => {
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

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">
            {idea ? idea.titulo : "Grabación Libre"}
          </h2>
          {idea && (
            <div className="flex items-center gap-2 mt-1">
              <CategoryBadge category={idea.category} />
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={toggleFullscreen} className="border-white/10">
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </div>

      {cameraError ? (
        <Card className="bg-card/50 border-red-500/20">
          <CardContent className="p-8 text-center">
            <Camera className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-400 mb-2">Cámara no disponible</h3>
            <p className="text-sm text-muted-foreground">{cameraError}</p>
            <Button onClick={startCamera} className="mt-4" variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="relative bg-black rounded-2xl overflow-hidden border border-white/5">
              {!recordedBlob ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full aspect-[9/16] max-h-[70vh] object-cover"
                    style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
                  />
                  {isRecording && (
                    <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10">
                      <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? "bg-yellow-500" : "bg-red-500 animate-pulse"}`} />
                      <span className="text-sm font-semibold text-white tracking-widest">
                        {formatTime(recordingTime)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <video
                  ref={previewRef}
                  controls
                  className="w-full aspect-[9/16] max-h-[70vh] object-cover"
                />
              )}
            </div>

            <div className="flex items-center justify-center gap-3 mt-4">
              {!recordedBlob ? (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full border-white/10"
                    onClick={switchCamera}
                    disabled={isRecording}
                  >
                    <SwitchCamera className="w-5 h-5" />
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full border-white/10"
                    onClick={() => setIsMirrored(!isMirrored)}
                  >
                    <span className="text-xs font-bold">↔</span>
                  </Button>

                  {!isRecording ? (
                    <Button
                      className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 border-4 border-white/20"
                      onClick={startRecording}
                      disabled={!cameraReady}
                    >
                      <div className="w-8 h-8 rounded-full bg-white" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-12 w-12 rounded-full border-white/10"
                        onClick={pauseRecording}
                      >
                        {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                      </Button>
                      <Button
                        className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 border-4 border-white/20"
                        onClick={stopRecording}
                      >
                        <Square className="w-8 h-8 fill-white text-white" />
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => { setRecordedBlob(null); }} className="border-white/10">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Grabar de nuevo
                  </Button>
                  <Button onClick={downloadVideo} className="bg-primary">
                    <Send className="w-4 h-4 mr-2" />
                    Descargar Video
                  </Button>
                  <Button
                    onClick={onRecorded}
                    className="bg-gradient-to-r from-green-600 to-emerald-600"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Listo
                  </Button>
                </>
              )}
            </div>
          </div>

          {idea && (
            <div className="space-y-4">
              <Card className="bg-card/50 border-white/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Guion
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">
                    {idea.guion}
                  </p>
                </CardContent>
              </Card>

              {idea.hashtags && idea.hashtags.length > 0 && (
                <Card className="bg-card/50 border-white/5">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {idea.hashtags.map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-xs border-primary/20 text-primary/80">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
