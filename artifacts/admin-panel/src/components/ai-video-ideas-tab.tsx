import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, credentials: "include" });
}
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Check,
  Trash2,
  FileText,
  Loader2,
  CalendarDays,
  Eye,
  Sparkles,
  Copy,
  Bookmark,
  BookmarkCheck,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Zap,
  BookOpen,
  Megaphone,
  Wrench,
  Lightbulb,
  Flame,
  Target,
  Package,
  Filter,
  ImageIcon,
} from "lucide-react";
type AiVideoIdea = {
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
  saved: boolean;
  batchDate: string | null;
  coverImageUrl: string | null;
  recordedAt: string | null;
  createdAt: string;
};

const PLATFORM_COLORS: Record<string, string> = {
  "TikTok": "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "Instagram Reels": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "YouTube Shorts": "bg-red-500/20 text-red-400 border-red-500/30",
  "YouTube": "bg-red-600/20 text-red-300 border-red-600/30",
  "LinkedIn": "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const SECTION_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  "INTRO": { label: "Intro", color: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/20" },
  "DESARROLLO": { label: "Desarrollo", color: "text-blue-400", bg: "bg-blue-500/5", border: "border-blue-500/20" },
  "CIERRE": { label: "Cierre", color: "text-orange-400", bg: "bg-orange-500/5", border: "border-orange-500/20" },
};

type CategoryKey = "corto-viral" | "storytelling" | "marketing" | "behind-scenes" | "tutorial" | "tendencia" | "problema-solucion" | "pack-del-dia";

interface CategoryConfig {
  key: CategoryKey;
  label: string;
  shortLabel: string;
  icon: typeof Zap;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  duration: string;
  isPack?: boolean;
}

const CATEGORIES: CategoryConfig[] = [
  {
    key: "corto-viral",
    label: "Corto Viral",
    shortLabel: "Corto",
    icon: Zap,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/25",
    description: "Videos de 25-35 seg que enganchan al instante con una sola idea impactante",
    duration: "25-35s",
  },
  {
    key: "problema-solucion",
    label: "Problema / Solucion",
    shortLabel: "P/S",
    icon: Target,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/25",
    description: "Identifica un dolor del emprendedor y muestra la solucion directa",
    duration: "25-40s",
  },
  {
    key: "marketing",
    label: "Marketing",
    shortLabel: "Mktg",
    icon: Megaphone,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/25",
    description: "Videos que posicionan y generan leads con datos concretos",
    duration: "30-45s",
  },
  {
    key: "storytelling",
    label: "Storytelling",
    shortLabel: "Story",
    icon: BookOpen,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/25",
    description: "Historias emotivas de transformacion digital que conectan",
    duration: "60-90s",
  },
  {
    key: "tutorial",
    label: "Tutorial / Tips",
    shortLabel: "Tips",
    icon: Lightbulb,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/25",
    description: "Ensenar algo util y accionable que puedan aplicar hoy",
    duration: "35-60s",
  },
  {
    key: "behind-scenes",
    label: "Behind the Scenes",
    shortLabel: "BTS",
    icon: Wrench,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/25",
    description: "Mostrar el proceso real de trabajo para generar confianza",
    duration: "30-50s",
  },
  {
    key: "tendencia",
    label: "Tendencia / Hot Take",
    shortLabel: "Trend",
    icon: Flame,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/25",
    description: "Opinar sobre tendencias actuales de tech y negocios",
    duration: "30-45s",
  },
  {
    key: "pack-del-dia",
    label: "Pack del Dia",
    shortLabel: "Pack",
    icon: Package,
    color: "text-amber-300",
    bgColor: "bg-gradient-to-r from-amber-500/15 to-orange-500/15",
    borderColor: "border-amber-500/30",
    description: "1 corto + 1 marketing + 1 historia + 1 problema/solucion + 1 tip",
    duration: "Mix",
    isPack: true,
  },
];

const CATEGORY_MAP: Record<string, CategoryConfig> = {};
CATEGORIES.forEach(c => { CATEGORY_MAP[c.key] = c; });

export function cleanText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/=[\u00A8\u00B8\u00DD\u00C8\u00E3\u00AB\u00BB\u00AF\u00BF]/g, "")
    .trim();
}

function GuionRenderer({ guion }: { guion: string }) {
  const cleaned = cleanText(guion);
  const sectionRegex = /(INTRO|DESARROLLO|CIERRE)\s*\(([^)]*)\)\s*:?/gi;
  const allMatches: { type: string; time: string; matchEnd: number; index: number }[] = [];

  let m;
  while ((m = sectionRegex.exec(cleaned)) !== null) {
    allMatches.push({
      type: m[1].toUpperCase(),
      time: m[2].trim(),
      matchEnd: m.index + m[0].length,
      index: m.index,
    });
  }

  if (allMatches.length === 0) {
    return <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{cleaned}</p>;
  }

  const parts: { type: string; time: string; content: string }[] = [];
  for (let i = 0; i < allMatches.length; i++) {
    const contentStart = allMatches[i].matchEnd;
    const contentEnd = i + 1 < allMatches.length ? allMatches[i + 1].index : cleaned.length;
    parts.push({ type: allMatches[i].type, time: allMatches[i].time, content: cleaned.slice(contentStart, contentEnd).trim() });
  }

  return (
    <div className="space-y-2.5">
      {parts.map((section, i) => {
        const style = SECTION_STYLES[section.type] || SECTION_STYLES["DESARROLLO"];
        const lines = section.content.split("\n").filter(l => l.trim());
        return (
          <div key={i} className={`rounded-md ${style.bg} border ${style.border} overflow-hidden`}>
            <div className={`flex items-center gap-2 px-3 py-1.5 border-b ${style.border}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${style.color}`}>{style.label}</span>
              {section.time && <span className="text-[10px] text-muted-foreground font-mono">{section.time}</span>}
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {lines.map((line, j) => {
                const trimmed = line.trim();
                const bracketMatch = trimmed.match(/^\[(.+)\]$/);
                if (bracketMatch) {
                  return (
                    <div key={j} className="flex items-start gap-1.5">
                      <Eye className="w-3 h-3 text-muted-foreground/60 mt-0.5 shrink-0" />
                      <span className="text-[11px] text-muted-foreground/70 italic">{bracketMatch[1]}</span>
                    </div>
                  );
                }
                return <p key={j} className="text-xs text-foreground/80 leading-relaxed">{trimmed}</p>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const config = CATEGORY_MAP[category];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md ${config.bgColor} ${config.color} border ${config.borderColor}`}>
      <Icon className="w-2.5 h-2.5" />
      {config.shortLabel}
    </span>
  );
}

export default function AiVideoIdeasTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [customContext, setCustomContext] = useState("");
  const [justSaved, setJustSaved] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>("corto-viral");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const { data: videoIdeas = [], isLoading } = useQuery<AiVideoIdea[]>({
    queryKey: ["/api/studio/ideas"],
    queryFn: async () => {
      const res = await apiFetch("/api/studio/ideas");
      if (!res.ok) throw new Error("Error al cargar ideas");
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async ({ category, context }: { category: string; context?: string }) => {
      const body: any = { category };
      if (context) body.context = context;
      const res = await apiFetch("/api/studio/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
      toast({ title: data.message || "Ideas generadas" });
    },
    onError: () => toast({ title: "Error al generar ideas", variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, saved }: { id: number; saved: boolean }) => {
      const res = await apiFetch(`/api/studio/ideas/${id}/${saved ? "unsave" : "save"}`, { method: "PATCH" });
      return res.json();
    },
    onSuccess: (_data, { id, saved }) => {
      if (!saved) {
        setJustSaved(id);
        toast({ title: "Lista para grabar", description: "Aparecera en la cola del estudio" });
        setTimeout(() => {
          setJustSaved(null);
          queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
        }, 800);
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/api/studio/ideas/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
      toast({ title: "Idea eliminada" });
    },
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      await apiFetch("/api/studio/ideas?keepRecorded=true", { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
      toast({ title: "Ideas limpiadas", description: "Se mantuvieron los videos grabados" });
      setShowDeleteConfirm(false);
    },
  });

  const [generatingCoverId, setGeneratingCoverId] = useState<number | null>(null);
  const [previewCoverUrl, setPreviewCoverUrl] = useState<string | null>(null);

  const coverMutation = useMutation({
    mutationFn: async (id: number) => {
      setGeneratingCoverId(id);
      const res = await apiFetch(`/api/studio/ideas/${id}/generate-cover`, { method: "POST" });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratingCoverId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
      toast({ title: "Portada generada" });
    },
    onError: (err: any) => {
      setGeneratingCoverId(null);
      toast({ title: "Error al generar portada", description: err.message, variant: "destructive" });
    },
  });

  const copyGuion = async (guion: string) => {
    await navigator.clipboard.writeText(guion);
    toast({ title: "Guion copiado al portapapeles" });
  };

  const filteredIdeas = useMemo(() => {
    if (filterCategory === "all") return videoIdeas;
    return videoIdeas.filter(i => i.category === filterCategory);
  }, [videoIdeas, filterCategory]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, AiVideoIdea[]> = {};
    filteredIdeas.forEach(idea => {
      const key = idea.batchDate || "sin-fecha";
      if (!groups[key]) groups[key] = [];
      groups[key].push(idea);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredIdeas]);

  const stats = useMemo(() => {
    const total = videoIdeas.length;
    const saved = videoIdeas.filter(i => i.saved && !i.recordedAt).length;
    const recorded = videoIdeas.filter(i => i.recordedAt).length;
    const byCategory: Record<string, number> = {};
    videoIdeas.forEach(i => {
      const cat = i.category || "corto-viral";
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
    return { total, saved, recorded, byCategory };
  }, [videoIdeas]);

  const selectedConfig = CATEGORIES.find(c => c.key === selectedCategory)!;

  const handleGenerate = () => {
    generateMutation.mutate({
      category: selectedCategory,
      context: customContext.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a0a0a] to-[#111] border border-foreground/10 p-4">
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-orange-500/[0.03] rounded-full blur-3xl" />
        <div className="relative space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-semibold text-foreground">Generador de Ideas</span>
          </div>

          <textarea
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            placeholder="Opcional: describe el enfoque que quieres... Ej: Videos sobre chatbots con IA para restaurantes"
            className="w-full bg-black/30 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/30 resize-none focus:outline-none focus:ring-1 focus:ring-orange-500/40 transition-colors min-h-[48px]"
            rows={2}
            data-testid="textarea-custom-context"
          />

          <div>
            <button
              onClick={() => setShowCategoryPicker(!showCategoryPicker)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all ${selectedConfig.borderColor} ${selectedConfig.bgColor}`}
              data-testid="button-toggle-category-picker"
            >
              <div className="flex items-center gap-2">
                <selectedConfig.icon className={`w-4 h-4 ${selectedConfig.color}`} />
                <span className={`text-sm font-medium ${selectedConfig.color}`}>{selectedConfig.label}</span>
                <span className="text-[10px] text-muted-foreground/50 font-mono">{selectedConfig.duration}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground/40 transition-transform ${showCategoryPicker ? "rotate-180" : ""}`} />
            </button>

            {showCategoryPicker && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 animate-in slide-in-from-top-2 duration-200">
                {CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const isSelected = selectedCategory === cat.key;
                  const count = stats.byCategory[cat.key] || 0;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => { setSelectedCategory(cat.key); setShowCategoryPicker(false); }}
                      className={`flex flex-col items-start p-2.5 rounded-xl border transition-all text-left ${
                        isSelected
                          ? `${cat.bgColor} ${cat.borderColor} ring-1 ring-foreground/10`
                          : "border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/[0.04]"
                      } ${cat.isPack ? "col-span-2 flex-row items-center" : ""}`}
                      data-testid={`button-category-${cat.key}`}
                    >
                      <div className={`flex items-center gap-1.5 ${cat.isPack ? "" : "mb-1"}`}>
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? cat.color : "text-muted-foreground/50"}`} />
                        <span className={`text-xs font-medium ${isSelected ? cat.color : "text-muted-foreground/70"}`}>{cat.label}</span>
                        {count > 0 && <span className="text-[9px] text-muted-foreground/30 font-mono">{count}</span>}
                      </div>
                      <p className={`text-[10px] leading-tight ${isSelected ? "text-muted-foreground/60" : "text-muted-foreground/30"} ${cat.isPack ? "ml-5" : ""}`}>
                        {cat.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className={`w-full text-sm h-11 rounded-xl shadow-lg font-semibold tracking-wide ${
              selectedCategory === "pack-del-dia"
                ? "bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-900/30"
                : "bg-gradient-to-r from-orange-600 to-pink-600 shadow-orange-900/25"
            }`}
            data-testid="button-generate-video-ideas"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : selectedCategory === "pack-del-dia" ? (
              <Package className="w-4 h-4 mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {generateMutation.isPending
              ? "Generando..."
              : selectedCategory === "pack-del-dia"
                ? "Generar Pack del Dia"
                : `Generar ${selectedConfig.label}`
            }
          </Button>
        </div>
      </div>

      {!isLoading && videoIdeas.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-1">
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground/40">
              <span>{stats.total} ideas</span>
              {stats.saved > 0 && <span className="text-orange-400/60">{stats.saved} en cola</span>}
              {stats.recorded > 0 && <span className="text-green-400/60">{stats.recorded} grabadas</span>}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Filter className="w-3 h-3 text-muted-foreground/30" />
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-transparent text-[10px] text-muted-foreground/50 border-none outline-none cursor-pointer"
                  data-testid="select-filter-category"
                >
                  <option value="all">Todas</option>
                  {CATEGORIES.filter(c => !c.isPack).map(cat => (
                    <option key={cat.key} value={cat.key}>{cat.label} ({stats.byCategory[cat.key] || 0})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                data-testid="button-bulk-delete-ideas"
              >
                <Trash2 className="w-3 h-3" />
                <span>Limpiar</span>
              </button>
            </div>
          </div>
          {showDeleteConfirm && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 animate-in slide-in-from-top-2 duration-200">
              <span className="text-xs text-red-400 flex-1">Eliminar todas las ideas no grabadas?</span>
              <button
                onClick={() => bulkDeleteMutation.mutate()}
                disabled={bulkDeleteMutation.isPending}
                className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500 transition-colors disabled:opacity-50"
                data-testid="button-confirm-bulk-delete"
              >
                {bulkDeleteMutation.isPending ? "Eliminando..." : "Si, limpiar"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1 rounded-lg bg-foreground/5 text-xs text-muted-foreground hover:bg-foreground/10 transition-colors"
                data-testid="button-cancel-bulk-delete"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-orange-500" />
        </div>
      ) : groupedByDate.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted/10 border border-border/30 flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6 text-muted-foreground/20" />
          </div>
          <p className="text-sm text-muted-foreground/40">
            {filterCategory !== "all" ? "No hay ideas en esta categoria" : "Selecciona una categoria y genera tus primeras ideas"}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedByDate.map(([date, ideas]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <CalendarDays className="w-3.5 h-3.5 text-muted-foreground/50" />
                <span className="text-xs font-medium text-muted-foreground/60">
                  {new Date(date + "T12:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
                </span>
                <span className="text-[10px] text-muted-foreground/30">{ideas.length} ideas</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {ideas.map(idea => {
                  const expanded = expandedId === idea.id;
                  const platformClass = PLATFORM_COLORS[idea.plataforma] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
                  const isSaved = idea.saved;
                  const wasJustSaved = justSaved === idea.id;

                  return (
                    <Card
                      key={idea.id}
                      className={`transition-all border-border/50 ${expanded ? "md:col-span-2 xl:col-span-3 duration-300" : "duration-300"} ${isSaved ? "border-orange-500/25 bg-orange-500/[0.02]" : "bg-card/40"} ${wasJustSaved ? "scale-[0.96] opacity-60 translate-x-2 duration-500" : ""}`}
                    >
                      <CardContent className="p-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm text-foreground leading-tight mb-1.5">
                              {cleanText(idea.titulo)}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <CategoryBadge category={idea.category || "corto-viral"} />
                              <Badge className={`text-[9px] border ${platformClass} py-0`} data-testid={`badge-platform-${idea.id}`}>
                                {idea.plataforma}
                              </Badge>
                              {idea.duracionSugerida && (
                                <span className="text-[10px] text-muted-foreground/50">{idea.duracionSugerida}</span>
                              )}
                              {idea.recordedAt && (
                                <Badge className="text-[9px] bg-green-500/10 text-green-400 border-green-500/20 py-0">Grabado</Badge>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => { if (!wasJustSaved) saveMutation.mutate({ id: idea.id, saved: idea.saved }); }}
                            disabled={wasJustSaved}
                            className={`p-2.5 rounded-xl transition-all duration-300 active:scale-75 ${
                              wasJustSaved
                                ? "text-green-400 bg-green-500/15 scale-110"
                                : isSaved
                                  ? "text-orange-400 bg-orange-500/10 hover:bg-orange-500/15"
                                  : "text-muted-foreground/40 hover:text-orange-400 hover:bg-orange-500/5"
                            }`}
                            title={isSaved ? "Quitar del Estudio" : "Enviar al Estudio"}
                            data-testid={`button-save-${idea.id}`}
                          >
                            {wasJustSaved ? (
                              <Check className="w-5 h-5 text-green-400" />
                            ) : isSaved ? (
                              <BookmarkCheck className="w-4 h-4" />
                            ) : (
                              <Bookmark className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        <p className="text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-2">
                          {cleanText(idea.descripcion || "")}
                        </p>

                        {idea.tendencia && (
                          <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/10">
                            <TrendingUp className="w-2.5 h-2.5 text-emerald-500/50 mt-0.5 shrink-0" />
                            <span className="text-[10px] text-emerald-400/60 leading-snug line-clamp-1">
                              {cleanText(idea.tendencia)}
                            </span>
                          </div>
                        )}

                        <button
                          onClick={() => setExpandedId(expanded ? null : idea.id)}
                          className="w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground py-1 rounded-md hover:bg-muted/20 transition-colors"
                          data-testid={`button-expand-${idea.id}`}
                        >
                          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {expanded ? "Ocultar" : "Ver guion"}
                        </button>

                        {expanded && (
                          <div className="space-y-2.5 animate-in slide-in-from-top-2 duration-200">
                            <div className="rounded-lg bg-card/60 border border-border/50 overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border/50">
                                <span className="text-[10px] font-semibold text-orange-400/80 flex items-center gap-1.5">
                                  <FileText className="w-3 h-3" /> Guion
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyGuion(idea.guion)}
                                  className="h-6 text-[10px] px-2"
                                  data-testid={`button-copy-guion-${idea.id}`}
                                >
                                  <Copy className="w-2.5 h-2.5 mr-1" />
                                  Copiar
                                </Button>
                              </div>
                              <div className="p-3 space-y-2">
                                <GuionRenderer guion={idea.guion} />
                              </div>
                            </div>

                            {idea.hashtags && idea.hashtags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {idea.hashtags.map((tag, i) => (
                                  <span key={i} className="text-[10px] text-blue-400/60">
                                    {tag.startsWith("#") ? tag : `#${tag}`}
                                  </span>
                                ))}
                              </div>
                            )}

                            {idea.coverImageUrl && (
                              <div className="rounded-lg overflow-hidden border border-border/50 bg-black/20">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20 border-b border-border/50">
                                  <span className="text-[10px] font-semibold text-orange-400/80 flex items-center gap-1.5">
                                    <ImageIcon className="w-3 h-3" /> Portada
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setPreviewCoverUrl(idea.coverImageUrl)}
                                    className="h-5 text-[9px] px-1.5"
                                    data-testid={`button-preview-cover-${idea.id}`}
                                  >
                                    <Eye className="w-2.5 h-2.5 mr-1" />
                                    Ampliar
                                  </Button>
                                </div>
                                <img
                                  src={idea.coverImageUrl}
                                  alt={`Portada: ${idea.titulo}`}
                                  className="w-full max-h-48 object-contain"
                                  data-testid={`img-cover-${idea.id}`}
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => coverMutation.mutate(idea.id)}
                                disabled={generatingCoverId === idea.id}
                                className="text-[11px] h-8 px-2.5 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                                data-testid={`button-generate-cover-${idea.id}`}
                              >
                                {generatingCoverId === idea.id ? (
                                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                ) : (
                                  <ImageIcon className="w-3 h-3 mr-1.5" />
                                )}
                                {idea.coverImageUrl ? "Regenerar" : "Portada IA"}
                              </Button>
                              {!isSaved && (
                                <Button
                                  size="sm"
                                  onClick={() => saveMutation.mutate({ id: idea.id, saved: false })}
                                  className="flex-1 bg-gradient-to-r from-orange-600 to-pink-600 text-[11px] h-8 rounded-lg"
                                  data-testid={`button-send-to-studio-${idea.id}`}
                                >
                                  <Clapperboard className="w-3 h-3 mr-1.5" />
                                  Enviar al Estudio
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteMutation.mutate(idea.id)}
                                className="text-[11px] h-8 px-2.5 text-muted-foreground/40 hover:text-red-400"
                                data-testid={`button-delete-video-idea-${idea.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewCoverUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewCoverUrl(null)}
          data-testid="modal-cover-preview"
        >
          <div className="relative max-w-sm w-full max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewCoverUrl}
              alt="Portada completa"
              className="w-full h-auto rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setPreviewCoverUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-foreground/10 backdrop-blur text-white flex items-center justify-center hover:bg-foreground/20 transition-colors"
              data-testid="button-close-cover-preview"
            >
              x
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
