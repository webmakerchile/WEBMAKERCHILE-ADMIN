import { useState, useEffect, useRef, useMemo, useCallback, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useLang } from "@/lib/lang";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";

function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, credentials: "include" });
}

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
import { Layout } from "@/components/layout";
import {
  Video,
  VideoOff,
  Play,
  Pause,
  Clock,
  Trophy,
  Zap,
  Copy,
  Check,
  X,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Eye,
  Target,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Loader2,
  Clapperboard,
  Mic,
  MicOff,
  RotateCcw,
  Camera,
  Square,
  Upload,
  CircleDot,
  SwitchCamera,
  Send,
  FileText,
  Trash2,
  Scissors,
  Wand2,
  ZoomIn,
  ZoomOut,
  Type,
} from "lucide-react";
import AiVideoIdeasTab from "@/components/ai-video-ideas-tab";

const PLATFORM_COLORS: Record<string, string> = {
  "TikTok": "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "Instagram Reels": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "YouTube Shorts": "bg-red-500/20 text-red-400 border-red-500/30",
  "YouTube": "bg-red-600/20 text-red-300 border-red-600/30",
  "LinkedIn": "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const SECTION_CONFIG: Record<string, { label: string; bgClass: string; progressColor: string }> = {
  "INTRO": { label: "INTRO", bgClass: "text-emerald-300", progressColor: "bg-emerald-500" },
  "DESARROLLO": { label: "DESARROLLO", bgClass: "text-blue-300", progressColor: "bg-blue-500" },
  "CIERRE": { label: "CIERRE", bgClass: "text-orange-300", progressColor: "bg-orange-500" },
};

// Motivational strings now come from t.studioMotivational (see lang.tsx)

function cleanText(text: string): string {
  return text.replace(/\*\*/g, "").replace(/=[\u00A8\u00B8\u00DD\u00C8\u00E3\u00AB\u00BB\u00AF\u00BF]/g, "").trim();
}

function normalizeWord(w: string): string {
  return w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

interface ParsedSection { type: string; time: string; lines: string[]; }

type BgUpload = {
  id: string;
  title: string;
  status: "uploading" | "processing" | "done" | "error";
  progress: number;
  message: string;
  driveVerified?: boolean;
  driveLink?: string;
};

function parseGuion(guion: string): ParsedSection[] {
  const cleaned = cleanText(guion);
  const sectionRegex = /(INTRO|DESARROLLO|CIERRE)\s*\(([^)]*)\)\s*:?/gi;
  const allMatches: { type: string; time: string; matchEnd: number; index: number }[] = [];
  let m;
  while ((m = sectionRegex.exec(cleaned)) !== null) {
    allMatches.push({ type: m[1].toUpperCase(), time: m[2].trim(), matchEnd: m.index + m[0].length, index: m.index });
  }
  if (allMatches.length === 0) {
    return [{ type: "DESARROLLO", time: "", lines: cleaned.split("\n").filter(l => l.trim()) }];
  }
  return allMatches.map((match, i) => {
    const contentEnd = i + 1 < allMatches.length ? allMatches[i + 1].index : cleaned.length;
    const content = cleaned.slice(match.matchEnd, contentEnd).trim();
    return { type: match.type, time: match.time, lines: content.split("\n").filter(l => l.trim()) };
  });
}

function StatsRing({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const progress = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - progress);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-[68px] h-[68px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 70 70">
          <circle cx="35" cy="35" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-white/5" />
          <circle cx="35" cy="35" r={radius} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-1000 ease-out" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-foreground">{value}</span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground/70 font-medium">{label}</span>
    </div>
  );
}

interface WordToken {
  word: string;
  normalized: string;
  lineIdx: number;
  wordIdx: number;
  globalIdx: number;
  isDirective: boolean;
  isSectionHeader: boolean;
}

function TeleprompterView({
  idea, onBack, onMarkRecorded, isRecording,
}: {
  idea: AiVideoIdea; onBack: () => void; onMarkRecorded: (id: number) => void; isRecording: boolean;
}) {
  const sections = useMemo(() => parseGuion(idea.guion), [idea.guion]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(35);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(22);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const speedRef = useRef(35);

  const { t } = useLang();
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [highlightUpTo, setHighlightUpTo] = useState(-1);
  const recognitionRef = useRef<any>(null);
  const voiceModeRef = useRef(false);
  const sessionIdRef = useRef(0);
  const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const voiceStartedRef = useRef(false);

  const allLines = useMemo(() => {
    const result: { text: string; type: string; isDirective: boolean; isSectionHeader: boolean }[] = [];
    sections.forEach((section) => {
      result.push({ text: section.type + (section.time ? ` (${section.time})` : ""), type: section.type, isDirective: false, isSectionHeader: true });
      section.lines.forEach((line) => {
        const trimmed = line.trim();
        result.push({ text: trimmed, type: section.type, isDirective: /^\[.+\]$/.test(trimmed), isSectionHeader: false });
      });
    });
    return result;
  }, [sections]);

  const wordTokens = useMemo(() => {
    const tokens: WordToken[] = [];
    let globalIdx = 0;
    allLines.forEach((line, lineIdx) => {
      if (line.isSectionHeader || line.isDirective) return;
      const words = line.text.split(/\s+/).filter(w => w.length > 0);
      words.forEach((word, wordIdx) => {
        tokens.push({ word, normalized: normalizeWord(word), lineIdx, wordIdx, globalIdx, isDirective: false, isSectionHeader: false });
        globalIdx++;
      });
    });
    return tokens;
  }, [allLines]);

  const tokensByLine = useMemo(() => {
    const map = new Map<number, WordToken[]>();
    wordTokens.forEach(t => {
      const arr = map.get(t.lineIdx) || [];
      arr.push(t);
      map.set(t.lineIdx, arr);
    });
    return map;
  }, [wordTokens]);

  const highlightUpToRef = useRef(highlightUpTo);
  highlightUpToRef.current = highlightUpTo;
  const scrollDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordTokensRef = useRef(wordTokens);
  wordTokensRef.current = wordTokens;

  const startVoiceRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    const currentSession = ++sessionIdRef.current;
    const recognition = new SpeechRecognition();
    recognition.lang = "es-CL";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 2;
    recognitionRef.current = recognition;

    let resultThrottle = 0;

    recognition.onresult = (event: any) => {
      if (sessionIdRef.current !== currentSession) return;
      const now = Date.now();
      if (now - resultThrottle < 150) return;
      resultThrottle = now;

      let recentTranscript = "";
      const start = Math.max(0, event.results.length - 3);
      for (let i = start; i < event.results.length; i++) {
        recentTranscript += event.results[i][0].transcript + " ";
      }

      const spokenWords = recentTranscript.trim().split(/\s+/).map(normalizeWord).filter(w => w.length > 2);
      if (spokenWords.length === 0) return;

      const tokens = wordTokensRef.current;
      const currentPos = highlightUpToRef.current;
      const searchStart = Math.max(0, currentPos + 1);
      const maxJump = 12;
      const searchEnd = Math.min(tokens.length, searchStart + maxJump);
      const lastSpoken = spokenWords.slice(-5);

      const matchesAt: number[] = [];
      for (let ti = searchStart; ti < searchEnd; ti++) {
        const tn = tokens[ti].normalized;
        if (tn.length < 2) continue;
        for (let si = 0; si < lastSpoken.length; si++) {
          const sp = lastSpoken[si];
          const isExact = tn === sp;
          const isClose = !isExact && tn.length >= 4 && sp.length >= 4 && (
            (tn.length >= 5 && sp.length >= 5 && (tn.startsWith(sp.slice(0, 5)) || sp.startsWith(tn.slice(0, 5)))) ||
            (tn === sp.slice(0, tn.length) || sp === tn.slice(0, sp.length))
          );
          if (isExact || isClose) {
            matchesAt.push(ti);
            break;
          }
        }
      }

      if (matchesAt.length === 0) return;

      let bestMatch = currentPos;
      if (matchesAt.length >= 2) {
        bestMatch = matchesAt[matchesAt.length - 1];
      } else {
        const jump = matchesAt[0] - currentPos;
        if (jump <= 4) {
          bestMatch = matchesAt[0];
        }
      }

      if (bestMatch > currentPos && bestMatch <= currentPos + maxJump) {
        setHighlightUpTo(bestMatch);
        if (scrollDebounce.current) clearTimeout(scrollDebounce.current);
        scrollDebounce.current = setTimeout(() => {
          const el = wordRefs.current.get(bestMatch);
          if (el && scrollRef.current) {
            const cr = scrollRef.current.getBoundingClientRect();
            const er = el.getBoundingClientRect();
            const dy = er.top - cr.top - cr.height * 0.35;
            if (Math.abs(dy) > 10) {
              scrollRef.current.scrollBy({ top: dy, behavior: "smooth" });
            }
          }
        }, 100);
      }
    };

    recognition.onend = () => {
      if (sessionIdRef.current !== currentSession) return;
      if (voiceModeRef.current) {
        setTimeout(() => {
          if (sessionIdRef.current !== currentSession || !voiceModeRef.current) return;
          try { recognition.start(); } catch { setIsListening(false); }
        }, 200);
      } else {
        setIsListening(false);
      }
    };

    recognition.onerror = (e: any) => {
      if (sessionIdRef.current !== currentSession) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        voiceModeRef.current = false;
        voiceStartedRef.current = false;
        setVoiceMode(false);
        setIsListening(false);
      }
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }, []);

  const toggleVoiceMode = useCallback(() => {
    if (voiceMode) {
      voiceModeRef.current = false;
      voiceStartedRef.current = false;
      setVoiceMode(false);
      setIsListening(false);
      sessionIdRef.current++;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
    } else {
      voiceModeRef.current = true;
      setVoiceMode(true);
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, [voiceMode]);

  useEffect(() => {
    if (voiceMode && !voiceStartedRef.current) {
      voiceStartedRef.current = true;
      const t = setTimeout(() => startVoiceRecognition(), 100);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [voiceMode, startVoiceRecognition]);

  useEffect(() => {
    return () => {
      voiceModeRef.current = false;
      sessionIdRef.current++;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
      if (scrollDebounce.current) clearTimeout(scrollDebounce.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, []);

  const resetScript = useCallback(() => {
    setHighlightUpTo(-1);
    if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    speedRef.current = speed;
  }, [isPlaying, speed]);

  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => {
      if (!isPlayingRef.current || !scrollRef.current) return;
      scrollRef.current.scrollTop += speedRef.current / 60;
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen?.();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen?.();
        setIsFullscreen(false);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const resetControlsTimer = useCallback(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    setShowControls(true);
    if (isPlayingRef.current || voiceModeRef.current) {
      controlsTimer.current = setTimeout(() => setShowControls(false), 5000);
    }
  }, []);

  useEffect(() => {
    if (isPlaying || voiceMode) {
      controlsTimer.current = setTimeout(() => setShowControls(false), 5000);
    } else {
      setShowControls(true);
    }
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [isPlaying, voiceMode]);

  const handleBack = useCallback(() => {
    voiceModeRef.current = false;
    sessionIdRef.current++;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (document.fullscreenElement) document.exitFullscreen?.();
    onBack();
  }, [onBack]);

  const renderLineWithHighlights = useCallback((line: { text: string }, lineIdx: number) => {
    if (!voiceMode && highlightUpTo < 0) {
      return <span>{line.text}</span>;
    }
    const lineTokens = tokensByLine.get(lineIdx);
    if (!lineTokens || lineTokens.length === 0) {
      return <span className={highlightUpTo >= 0 ? "text-white/30" : ""}>{line.text}</span>;
    }
    const words = line.text.split(/(\s+)/);
    let wordCount = 0;
    return words.map((part, pi) => {
      if (/^\s+$/.test(part)) return <span key={pi}>{part}</span>;
      const token = lineTokens[wordCount];
      wordCount++;
      if (!token) return <span key={pi}>{part}</span>;
      const lit = token.globalIdx <= highlightUpTo;
      return (
        <span key={pi} ref={(el) => { if (el) wordRefs.current.set(token.globalIdx, el); }}
          className={lit ? "text-white transition-colors duration-200" : "text-white/30 transition-colors duration-200"}>
          {part}
        </span>
      );
    });
  }, [tokensByLine, highlightUpTo, voiceMode]);

  const hasVoiceSupport = typeof window !== "undefined" && (
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  return (
    <div ref={containerRef}
      className={`fixed inset-0 z-[100] bg-[#050505] flex flex-col`}
      data-testid="teleprompter-view"
    >
      <div className={`absolute top-0 left-0 right-0 z-[40] transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/90 via-black/60 to-transparent pb-10">
          <button onClick={handleBack} className="p-3 rounded-full bg-white/10 backdrop-blur-sm text-white active:scale-90 transition-transform touch-manipulation" data-testid="button-teleprompter-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            {voiceMode && isListening && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/30">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] text-red-400 font-medium">{t.studioListening}</span>
              </div>
            )}
            <Badge className={`text-[10px] border ${PLATFORM_COLORS[idea.plataforma] || "bg-gray-500/20 text-gray-400"}`}>
              {idea.plataforma}
            </Badge>
            {idea.duracionSugerida && (
              <Badge variant="secondary" className="text-[10px] bg-white/10 text-white/70 border-white/20">
                <Clock className="w-2.5 h-2.5 mr-1" />{idea.duracionSugerida}
              </Badge>
            )}
          </div>
          <button onClick={toggleFullscreen} className="p-3 rounded-full bg-white/10 backdrop-blur-sm text-white active:scale-90 transition-transform touch-manipulation" data-testid="button-fullscreen">
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-start pt-2 overflow-hidden relative z-[1]">
        <div className="w-1.5 flex flex-col gap-[2px] ml-2 mt-16 shrink-0 rounded-full overflow-hidden">
          {sections.map((section, i) => (
            <div key={i} className={`${SECTION_CONFIG[section.type]?.progressColor || "bg-gray-500"} opacity-80`}
              style={{ height: `${Math.max(100 / sections.length, 20)}%`, minHeight: "16px" }} />
          ))}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 md:px-12 py-16"
          style={{ maxHeight: "100dvh" }} onTouchStart={resetControlsTimer} onClick={resetControlsTimer}>
          <h2 className="text-base md:text-lg font-bold text-orange-400/90 mb-6 text-center leading-tight max-w-lg mx-auto">
            {cleanText(idea.titulo)}
          </h2>

          <div className="space-y-5 max-w-xl mx-auto pb-48">
            {allLines.map((line, i) => {
              if (line.isSectionHeader) {
                const config = SECTION_CONFIG[line.type];
                return (
                  <div key={i} className="flex items-center gap-3 py-3 mt-4">
                    <div className={`w-2.5 h-2.5 rounded-full ${config?.progressColor || "bg-gray-500"}`} />
                    <span className={`text-xs font-bold uppercase tracking-[0.2em] ${config?.bgClass || "text-gray-300"}`}>{line.text}</span>
                  </div>
                );
              }
              if (line.isDirective) {
                return (
                  <div key={i} className="flex items-start gap-2 py-0.5">
                    <Eye className="w-3.5 h-3.5 text-yellow-400/40 mt-1 shrink-0" />
                    <span className="text-yellow-200/40 italic" style={{ fontSize: fontSize * 0.7 }}>{line.text}</span>
                  </div>
                );
              }
              return (
                <p key={i} className={`leading-[1.9] font-normal ${voiceMode && highlightUpTo >= 0 ? "" : "text-white/95"}`} style={{ fontSize }}>
                  {renderLineWithHighlights(line, i)}
                </p>
              );
            })}

            <div className="flex flex-col items-center gap-5 py-16 mt-8">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center animate-pulse">
                <Check className="w-7 h-7 text-white" />
              </div>
              <p className="text-white/40 text-xs tracking-wide">FIN DEL GUION</p>
              <Button onClick={() => onMarkRecorded(idea.id)} disabled={isRecording}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-10 py-6 text-base rounded-2xl shadow-lg shadow-green-900/40 active:scale-95 transition-transform touch-manipulation"
                data-testid="button-mark-recorded">
                {isRecording ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Trophy className="w-5 h-5 mr-2" />}
                Listo, grabado
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 z-[40] transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-16 pb-8 px-6">
          <div className="max-w-sm mx-auto space-y-4">
            <div className="flex items-center justify-center gap-5">
              <button onClick={() => setFontSize(Math.max(14, fontSize - 2))}
                className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-white/50 hover:bg-white/15 active:scale-90 transition-transform text-xs font-bold touch-manipulation"
                data-testid="button-font-decrease">A-</button>

              {hasVoiceSupport && (
                <button onClick={toggleVoiceMode}
                  className={`w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-transform touch-manipulation ${
                    voiceMode
                      ? "bg-red-500 shadow-lg shadow-red-900/40 text-white"
                      : "bg-white/8 text-white/50 hover:bg-white/15"
                  }`}
                  data-testid="button-voice-mode">
                  {voiceMode ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </button>
              )}

              <button onClick={() => { if (voiceMode) return; setIsPlaying(p => { isPlayingRef.current = !p; return !p; }); resetControlsTimer(); }}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl active:scale-90 transition-transform touch-manipulation ${
                  voiceMode ? "bg-white/5 shadow-none opacity-30" :
                  isPlaying ? "bg-white/15 shadow-white/5" : "bg-gradient-to-br from-orange-500 to-pink-600 shadow-orange-900/40"
                }`}
                data-testid="button-play-pause">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>

              {voiceMode && (
                <button onClick={resetScript}
                  className="w-12 h-12 rounded-full bg-white/8 flex items-center justify-center text-white/50 hover:bg-white/15 active:scale-90 transition-transform touch-manipulation"
                  data-testid="button-restart-script">
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}

              <button onClick={() => setFontSize(Math.min(44, fontSize + 2))}
                className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-white/50 hover:bg-white/15 active:scale-90 transition-transform text-sm font-bold touch-manipulation"
                data-testid="button-font-increase">A+</button>
            </div>

            {!voiceMode && (
              <div className="flex items-center gap-3 px-1">
                <span className="text-[9px] text-white/30 w-8">{t.studioSlow}</span>
                <Slider value={[speed]} onValueChange={([v]) => { setSpeed(v); speedRef.current = v; }} min={8} max={100} step={4} className="flex-1" data-testid="slider-speed" />
                <span className="text-[9px] text-white/30 w-10 text-right">{t.studioFast}</span>
              </div>
            )}

            {voiceMode && (
              <p className="text-center text-[10px] text-white/30">
                {isListening ? t.studioSpeakFollow : t.studioActivatingMic}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type CameraErrorBoundaryProps = { onBack: () => void; children: ReactNode; errorTitle: string; retryLabel: string; backLabel: string };
class CameraErrorBoundary extends Component<CameraErrorBoundaryProps, { hasError: boolean; error: string }> {
  constructor(props: CameraErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message || "Error desconocido" };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[CameraErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <div className="text-center space-y-4 px-8">
            <VideoOff className="w-16 h-16 text-red-400/50 mx-auto" />
            <p className="text-white/70 text-sm font-medium">{this.props.errorTitle}</p>
            <p className="text-white/30 text-xs max-w-xs">{this.state.error}</p>
            <Button onClick={() => { this.setState({ hasError: false, error: "" }); }} variant="outline" className="text-white border-white/20 touch-manipulation">
              {this.props.retryLabel}
            </Button>
            <Button onClick={this.props.onBack} variant="ghost" className="text-white/40 touch-manipulation block mx-auto">
              {this.props.backLabel}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function CameraRecordingView({
  idea,
  onBack,
  onComplete,
  bgUploads,
  addBgUpload,
  runBgUploadFn,
}: {
  idea: AiVideoIdea | null;
  onBack: () => void;
  onComplete: () => void;
  bgUploads: BgUpload[];
  addBgUpload: (upload: BgUpload) => void;
  runBgUploadFn: (blob: Blob, bgId: string, uploadTitle: string, uploadIdeaId: number | null, uploadIdeaGuion: string, uploadMimeType: string, uploadWaMessage: string, uploadSegs: Array<{start: number, end: number}> | null, uploadAutoEdit: boolean, uploadEnableSubtitles: boolean) => void;
}) {
  const hasScript = !!idea?.guion;
  type Phase = "recording" | "loading-video" | "editing" | "review" | "uploading" | "done";
  const { t } = useLang();
  const { toast } = useToast();
  const mountedRef = useRef(true);

  const [phase, setPhase] = useState<Phase>("recording");

  const videoRef = useRef<HTMLVideoElement>(null);
  const touchAreaRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderMimeRef = useRef("video/webm");
  const streamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimeRef = useRef(0);
  recordingTimeRef.current = recordingTime;
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const facingModeRef = useRef<"user" | "environment">("user");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  type ClipMark = { startSec: number; endSec: number; teleprompterPos: number; duration: number };
  const [clipMarks, setClipMarks] = useState<ClipMark[]>([]);
  const clipMarksRef = useRef<ClipMark[]>([]);
  clipMarksRef.current = clipMarks;
  const clipStartTimeRef = useRef(0);
  const clipBlobsRef = useRef<Blob[]>([]);
  const currentChunksRef = useRef<Blob[]>([]);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const zoomRef = useRef(1);
  const zoomMinRef = useRef(1);
  const zoomMaxRef = useRef(1);
  const hasNativeZoomRef = useRef(false);
  const lastPinchDistRef = useRef(0);
  const zoomIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [teleprompterMode, setTeleprompterMode] = useState<"cerca" | "lejos">("cerca");
  const [fontSize, setFontSize] = useState(16);
  const [highlightUpTo, setHighlightUpTo] = useState(-1);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceModeRef = useRef(false);
  const sessionIdRef = useRef(0);
  const highlightUpToRef = useRef(-1);
  highlightUpToRef.current = highlightUpTo;
  const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const scrollDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [currentPreviewTime, setCurrentPreviewTime] = useState(0);
  const [videoReady, setVideoReady] = useState(false);

  type Segment = { id: number; startSec: number; endSec: number; enabled: boolean };
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const segmentIdCounter = useRef(1);
  const segmentsRef = useRef<Segment[]>([]);

  const [fileName, setFileName] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [autoEdit, setAutoEdit] = useState(false);
  const [enableSubtitles, setEnableSubtitles] = useState(false);

  const [voiceCountdown, setVoiceCountdown] = useState<{ count: number; type: "reset" | "tryout" } | null>(null);
  const voiceCountdownRef = useRef(false);
  const voiceCommandCooldownRef = useRef(0);
  const countdownTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleVoiceResetRef = useRef<() => void>(() => {});
  const handleVoiceTryoutRef = useRef<() => void>(() => {});
  const handleVoiceStopRef = useRef<() => void>(() => {});
  const handleVoiceGoToDriveRef = useRef<() => void>(() => {});
  const handleVoicePlayRef = useRef<() => void>(() => {});

  const sections = useMemo(() => idea?.guion ? parseGuion(idea.guion) : [], [idea?.guion]);
  const allLines = useMemo(() => {
    const result: { text: string; type: string; isDirective: boolean; isSectionHeader: boolean }[] = [];
    sections.forEach((section) => {
      result.push({ text: section.type + (section.time ? ` (${section.time})` : ""), type: section.type, isDirective: false, isSectionHeader: true });
      section.lines.forEach((line) => {
        const trimmed = line.trim();
        result.push({ text: trimmed, type: section.type, isDirective: /^\[.+\]$/.test(trimmed), isSectionHeader: false });
      });
    });
    return result;
  }, [sections]);

  const wordTokens = useMemo(() => {
    const tokens: WordToken[] = [];
    let globalIdx = 0;
    allLines.forEach((line, lineIdx) => {
      if (line.isSectionHeader || line.isDirective) return;
      const words = line.text.split(/\s+/).filter(w => w.length > 0);
      words.forEach((word, wordIdx) => {
        tokens.push({ word, normalized: normalizeWord(word), lineIdx, wordIdx, globalIdx, isDirective: false, isSectionHeader: false });
        globalIdx++;
      });
    });
    return tokens;
  }, [allLines]);

  const tokensByLine = useMemo(() => {
    const map = new Map<number, WordToken[]>();
    wordTokens.forEach(t => {
      const arr = map.get(t.lineIdx) || [];
      arr.push(t);
      map.set(t.lineIdx, arr);
    });
    return map;
  }, [wordTokens]);

  const wordTokensRef = useRef(wordTokens);
  wordTokensRef.current = wordTokens;

  const applyZoom = useCallback((newZoom: number) => {
    const minZoom = hasNativeZoomRef.current ? zoomMinRef.current : 0.5;
    const clamped = Math.max(minZoom, Math.min(zoomMaxRef.current, newZoom));
    zoomRef.current = clamped;
    setZoomLevel(clamped);
    setShowZoomIndicator(true);
    if (zoomIndicatorTimer.current) clearTimeout(zoomIndicatorTimer.current);
    zoomIndicatorTimer.current = setTimeout(() => setShowZoomIndicator(false), 1500);
    if (hasNativeZoomRef.current && streamRef.current && clamped >= 1) {
      const vt = streamRef.current.getVideoTracks()[0];
      if (vt) { try { vt.applyConstraints({ advanced: [{ zoom: clamped } as any] }); } catch {} }
    }
  }, []);

  const stopAllTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => { try { t.stop(); } catch {} });
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    stopAllTracks();
    setCameraReady(false);
    setCameraError(false);
    zoomRef.current = 1;
    setZoomLevel(1);
    hasNativeZoomRef.current = false;
    try {
      const portraitVideo: MediaTrackConstraints = {
        facingMode: facing,
        frameRate: { ideal: 30, max: 30 },
        width: { ideal: 1080, max: 1920 },
        height: { ideal: 1920, max: 2560 },
        aspectRatio: { ideal: 9 / 16 },
      };
      const fallbackVideo: MediaTrackConstraints = {
        facingMode: facing,
        frameRate: { ideal: 30, max: 30 },
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: portraitVideo,
          audio: true,
        });
      } catch (firstErr) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: fallbackVideo,
            audio: true,
          });
        } catch (audioErr) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: fallbackVideo,
            audio: false,
          });
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
          } catch {}
        }
      }
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        const trackW = settings.width || 0;
        const trackH = settings.height || 0;
        console.log(`[Camera] Track dimensions: ${trackW}x${trackH}`);
        if (trackW > trackH) {
          try {
            await videoTrack.applyConstraints({
              width: { ideal: trackH, max: trackH },
              height: { ideal: trackW, max: trackW },
              aspectRatio: { ideal: 9 / 16 },
            });
            const newSettings = videoTrack.getSettings();
            console.log(`[Camera] After re-constraint: ${newSettings.width}x${newSettings.height}`);
          } catch (e) {
            console.log("[Camera] Could not re-constrain to portrait, will use CSS rotation");
          }
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      if (videoTrack) {
        try {
          const caps = videoTrack.getCapabilities() as any;
          if (caps.zoom) {
            hasNativeZoomRef.current = true;
            zoomMinRef.current = caps.zoom.min || 0.5;
            zoomMaxRef.current = caps.zoom.max || 1;
          } else { zoomMinRef.current = 0.5; zoomMaxRef.current = 5; }
        } catch { zoomMinRef.current = 0.5; zoomMaxRef.current = 5; }
      }
      setCameraReady(true);
    } catch (err) {
      console.error("Camera error:", err);
      if (!mountedRef.current) return;
      setCameraError(true);
      toast({ title: t.cameraError, variant: "destructive" });
    }
  }, [stopAllTracks, toast]);

  const startVoiceRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
    const currentSession = ++sessionIdRef.current;
    const recognition = new SR();
    recognition.lang = "es-CL";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 2;
    recognitionRef.current = recognition;
    let throttle = 0;

    recognition.onresult = (event: any) => {
      if (sessionIdRef.current !== currentSession) return;
      if (voiceCountdownRef.current) return;
      const now = Date.now();

      let fullRecent = "";
      const recentStart = Math.max(0, event.results.length - 3);
      for (let i = recentStart; i < event.results.length; i++) fullRecent += event.results[i][0].transcript + " ";
      const lowerRecent = fullRecent.toLowerCase().trim();

      if (now - voiceCommandCooldownRef.current > 3000) {
        const goToDriveMatch = /\bgo\s*to\s*drive\b|\bgoto\s*drive\b|\bgo\s*tu\s*drive\b/.test(lowerRecent);
        const resetMatch = /\breset\b/.test(lowerRecent);
        const tryoutMatch = /\btry\s*out\b|\btryout\b|\btraiaut\b|\btrai\s*aut\b/.test(lowerRecent);
        const recState = mediaRecorderRef.current?.state;
        const stopMatch = !goToDriveMatch && recState === "recording" && /\bstop\b/.test(lowerRecent);
        const playMatch = recState !== "recording" && /\bplay\b/.test(lowerRecent);

        if (goToDriveMatch) {
          voiceCommandCooldownRef.current = now;
          handleVoiceGoToDriveRef.current();
          return;
        }
        if (resetMatch) {
          voiceCommandCooldownRef.current = now;
          handleVoiceResetRef.current();
          return;
        }
        if (tryoutMatch) {
          voiceCommandCooldownRef.current = now;
          handleVoiceTryoutRef.current();
          return;
        }
        if (stopMatch) {
          voiceCommandCooldownRef.current = now;
          handleVoiceStopRef.current();
          return;
        }
        if (playMatch) {
          voiceCommandCooldownRef.current = now;
          handleVoicePlayRef.current();
          return;
        }
      }

      if (now - throttle < 150) return;
      throttle = now;
      let recent = "";
      const start = Math.max(0, event.results.length - 3);
      for (let i = start; i < event.results.length; i++) recent += event.results[i][0].transcript + " ";
      const spoken = recent.trim().split(/\s+/).map(normalizeWord).filter(w => w.length > 2);
      if (spoken.length === 0) return;
      const tokens = wordTokensRef.current;
      const pos = highlightUpToRef.current;
      const searchStart = Math.max(0, pos + 1);
      const maxJump = 12;
      const searchEnd = Math.min(tokens.length, searchStart + maxJump);
      const last = spoken.slice(-5);

      const matchesAt: number[] = [];
      for (let ti = searchStart; ti < searchEnd; ti++) {
        const tn = tokens[ti].normalized;
        if (tn.length < 2) continue;
        for (let si = 0; si < last.length; si++) {
          const sp = last[si];
          const isExact = tn === sp;
          const isClose = !isExact && tn.length >= 4 && sp.length >= 4 && (
            (tn.length >= 5 && sp.length >= 5 && (tn.startsWith(sp.slice(0, 5)) || sp.startsWith(tn.slice(0, 5)))) ||
            (tn === sp.slice(0, tn.length) || sp === tn.slice(0, sp.length))
          );
          if (isExact || isClose) {
            matchesAt.push(ti);
            break;
          }
        }
      }

      if (matchesAt.length === 0) return;

      let best = pos;
      if (matchesAt.length >= 2) {
        best = matchesAt[matchesAt.length - 1];
      } else {
        const jump = matchesAt[0] - pos;
        if (jump <= 4) {
          best = matchesAt[0];
        }
      }

      if (best > pos && best <= pos + maxJump) {
        setHighlightUpTo(best);
        if (scrollDebounce.current) clearTimeout(scrollDebounce.current);
        scrollDebounce.current = setTimeout(() => {
          const el = wordRefs.current.get(best);
          if (el && scrollRef.current) {
            const cr = scrollRef.current.getBoundingClientRect();
            const er = el.getBoundingClientRect();
            const dy = er.top - cr.top - cr.height * 0.35;
            if (Math.abs(dy) > 10) scrollRef.current.scrollBy({ top: dy, behavior: "smooth" });
          }
        }, 100);
      }
    };

    recognition.onend = () => {
      if (sessionIdRef.current !== currentSession) return;
      if (voiceModeRef.current) {
        setTimeout(() => {
          if (sessionIdRef.current !== currentSession || !voiceModeRef.current) return;
          try { recognition.start(); } catch { setIsListening(false); }
        }, 200);
      } else { setIsListening(false); }
    };

    recognition.onerror = (e: any) => {
      if (sessionIdRef.current !== currentSession) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        voiceModeRef.current = false;
        setIsListening(false);
      } else if (e.error === "audio-capture" || e.error === "network") {
        if (voiceModeRef.current) {
          setTimeout(() => {
            if (sessionIdRef.current !== currentSession || !voiceModeRef.current) return;
            try { recognition.start(); } catch { setIsListening(false); }
          }, 1000);
        }
      }
    };

    try { recognition.start(); setIsListening(true); } catch { setIsListening(false); }
  }, []);

  const stopVoiceRecognition = useCallback(() => {
    voiceModeRef.current = false;
    sessionIdRef.current++;
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
    setIsListening(false);
  }, []);

  const getMimeType = useCallback(() => {
    const mimeOptions = [
      "video/mp4;codecs=avc1,mp4a.40.2",
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=h264,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp8",
      "video/webm;codecs=vp9,opus",
      "video/webm",
    ];
    return mimeOptions.find(m => MediaRecorder.isTypeSupported(m)) || "";
  }, []);

  const createRecorder = useCallback(() => {
    if (!streamRef.current) return null;
    const mimeType = getMimeType();
    const opts: MediaRecorderOptions = {};
    if (mimeType) opts.mimeType = mimeType;
    opts.videoBitsPerSecond = 8_000_000;
    const recorder = new MediaRecorder(streamRef.current, opts);
    recorderMimeRef.current = recorder.mimeType || mimeType;
    currentChunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) currentChunksRef.current.push(e.data); };
    recorder.onerror = () => {
      if (!mountedRef.current) return;
      toast({ title: t.recordingError, variant: "destructive" });
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      stopVoiceRecognition();
    };
    return recorder;
  }, [getMimeType, toast, stopVoiceRecognition]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    clipBlobsRef.current = [];
    setClipMarks([]);
    clipStartTimeRef.current = 0;
    try {
      const recorder = createRecorder();
      if (!recorder) { toast({ title: t.recordingStartError, variant: "destructive" }); return; }
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
      voiceModeRef.current = true;
      startVoiceRecognition();
    } catch {
      toast({ title: t.browserNoVideo, variant: "destructive" });
    }
  }, [toast, startVoiceRecognition, createRecorder]);

  const handlePause = useCallback(() => {
    if (!isRecording || isPaused) return;
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state !== "recording") return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopVoiceRecognition();
    const clipEnd = recordingTime;
    const clipDur = clipEnd - clipStartTimeRef.current;

    const savePromise = new Promise<void>((resolve) => {
      rec.onstop = () => {
        const clipBlob = new Blob(currentChunksRef.current, { type: recorderMimeRef.current });
        currentChunksRef.current = [];
        if (clipBlob.size > 0) {
          clipBlobsRef.current.push(clipBlob);
          console.log(`[studio] Clip ${clipBlobsRef.current.length} saved: ${(clipBlob.size / 1024 / 1024).toFixed(1)}MB, dur=${clipDur}s`);
        }
        resolve();
      };
      try { rec.stop(); } catch { resolve(); }
    });

    savePromise.then(() => {
      if (!mountedRef.current) return;
      setClipMarks(prev => [...prev, {
        startSec: clipStartTimeRef.current,
        endSec: clipEnd,
        teleprompterPos: highlightUpToRef.current,
        duration: clipDur,
      }]);
      setIsPaused(true);
    });
  }, [isRecording, isPaused, recordingTime, stopVoiceRecognition]);

  const handleResume = useCallback(() => {
    if (!isPaused) return;
    const recorder = createRecorder();
    if (!recorder) return;
    mediaRecorderRef.current = recorder;
    recorder.start(250);
    clipStartTimeRef.current = recordingTime;
    setIsPaused(false);
    timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    voiceModeRef.current = true;
    startVoiceRecognition();
  }, [isPaused, recordingTime, startVoiceRecognition, createRecorder]);

  const handleDeleteLastClip = useCallback(() => {
    if (!isPaused || clipMarks.length === 0) return;
    const lastClip = clipMarks[clipMarks.length - 1];
    const newMarks = clipMarks.slice(0, -1);
    setClipMarks(newMarks);

    clipBlobsRef.current.pop();
    console.log(`[studio] Deleted clip ${clipMarks.length}, remaining blobs: ${clipBlobsRef.current.length}`);

    const clipDur = lastClip.duration;
    setRecordingTime(prev => Math.max(0, prev - clipDur));
    clipStartTimeRef.current = newMarks.length > 0 ? newMarks[newMarks.length - 1].endSec : 0;

    if (newMarks.length === 0) {
      setHighlightUpTo(-1);
      if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const prevPos = newMarks[newMarks.length - 1].teleprompterPos;
      setHighlightUpTo(prevPos);
      setTimeout(() => {
        const el = wordRefs.current.get(prevPos);
        if (el && scrollRef.current) {
          const cr = scrollRef.current.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          const dy = er.top - cr.top - cr.height * 0.3;
          scrollRef.current.scrollBy({ top: dy, behavior: "smooth" });
        }
      }, 50);
    }

    toast({ title: `Clip ${clipMarks.length} eliminado` });
  }, [isPaused, clipMarks, toast]);

  const clearCountdownTimers = useCallback(() => {
    countdownTimersRef.current.forEach(t => clearTimeout(t));
    countdownTimersRef.current = [];
  }, []);

  const runCountdownThenStart = useCallback((type: "reset" | "tryout") => {
    if (voiceCountdownRef.current) return;
    voiceCountdownRef.current = true;
    stopVoiceRecognition();
    clearCountdownTimers();
    setVoiceCountdown({ count: 2, type });
    const t1 = setTimeout(() => {
      if (!mountedRef.current) { voiceCountdownRef.current = false; return; }
      setVoiceCountdown({ count: 1, type });
      const t2 = setTimeout(() => {
        if (!mountedRef.current) { voiceCountdownRef.current = false; return; }
        voiceCountdownRef.current = false;
        setVoiceCountdown(null);
        if (!streamRef.current) return;
        const recorder = createRecorder();
        if (!recorder) return;
        mediaRecorderRef.current = recorder;
        recorder.start(250);
        if (type === "reset") {
          clipBlobsRef.current = [];
          setClipMarks([]);
          clipStartTimeRef.current = 0;
          setRecordingTime(0);
          setIsRecording(true);
          setIsPaused(false);
          setHighlightUpTo(-1);
          if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 });
        } else {
          setIsPaused(false);
        }
        timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        voiceModeRef.current = true;
        startVoiceRecognition();
      }, 1000);
      countdownTimersRef.current.push(t2);
    }, 1000);
    countdownTimersRef.current.push(t1);
  }, [stopVoiceRecognition, createRecorder, startVoiceRecognition, clearCountdownTimers]);

  const handleVoiceReset = useCallback(() => {
    if (voiceCountdownRef.current) return;
    const rec = mediaRecorderRef.current;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopVoiceRecognition();
    if (rec && rec.state === "recording") {
      rec.onstop = () => {
        currentChunksRef.current = [];
        clipBlobsRef.current = [];
        runCountdownThenStart("reset");
      };
      try { rec.stop(); } catch {
        currentChunksRef.current = [];
        clipBlobsRef.current = [];
        runCountdownThenStart("reset");
      }
    } else {
      currentChunksRef.current = [];
      clipBlobsRef.current = [];
      setClipMarks([]);
      runCountdownThenStart("reset");
    }
  }, [stopVoiceRecognition, runCountdownThenStart]);

  handleVoiceResetRef.current = handleVoiceReset;

  const handleVoiceTryout = useCallback(() => {
    if (voiceCountdownRef.current) return;
    const rec = mediaRecorderRef.current;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopVoiceRecognition();

    const deleteLastAndRestart = (marksSnapshot: ClipMark[]) => {
      if (marksSnapshot.length === 0) {
        clipBlobsRef.current = [];
        setClipMarks([]);
        setRecordingTime(0);
        setHighlightUpTo(-1);
        if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 });
        runCountdownThenStart("reset");
        return;
      }
      const lastClip = marksSnapshot[marksSnapshot.length - 1];
      const newMarks = marksSnapshot.slice(0, -1);
      clipBlobsRef.current.pop();
      setClipMarks(newMarks);
      clipMarksRef.current = newMarks;
      const clipDur = lastClip.duration;
      setRecordingTime(prev => Math.max(0, prev - clipDur));
      clipStartTimeRef.current = newMarks.length > 0 ? newMarks[newMarks.length - 1].endSec : 0;
      if (newMarks.length === 0) {
        setHighlightUpTo(-1);
        if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 });
      } else {
        const prevPos = newMarks[newMarks.length - 1].teleprompterPos;
        setHighlightUpTo(prevPos);
      }
      runCountdownThenStart("tryout");
    };

    if (rec && rec.state === "recording") {
      const clipEnd = recordingTimeRef.current;
      const clipDur = clipEnd - clipStartTimeRef.current;
      rec.onstop = () => {
        const clipBlob = new Blob(currentChunksRef.current, { type: recorderMimeRef.current });
        currentChunksRef.current = [];
        if (clipBlob.size > 0) {
          clipBlobsRef.current.push(clipBlob);
        }
        const savedMark: ClipMark = { startSec: clipStartTimeRef.current, endSec: clipEnd, teleprompterPos: highlightUpToRef.current, duration: clipDur };
        const allMarks = [...clipMarksRef.current, savedMark];
        clipMarksRef.current = allMarks;
        setClipMarks(allMarks);
        deleteLastAndRestart(allMarks);
      };
      try { rec.stop(); } catch {
        deleteLastAndRestart(clipMarksRef.current);
      }
    } else {
      deleteLastAndRestart(clipMarksRef.current);
    }
  }, [stopVoiceRecognition, runCountdownThenStart]);

  handleVoiceTryoutRef.current = handleVoiceTryout;

  const handleVoiceStop = useCallback(() => {
    if (voiceCountdownRef.current) return;
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state !== "recording") return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopVoiceRecognition();
    const clipEnd = recordingTimeRef.current;
    const clipDur = clipEnd - clipStartTimeRef.current;

    rec.onstop = () => {
      const clipBlob = new Blob(currentChunksRef.current, { type: recorderMimeRef.current });
      currentChunksRef.current = [];
      if (clipBlob.size > 0) {
        clipBlobsRef.current.push(clipBlob);
        console.log(`[studio] STOP clip ${clipBlobsRef.current.length}: ${(clipBlob.size / 1024 / 1024).toFixed(1)}MB, dur=${clipDur}s`);
      }
      const mark: ClipMark = { startSec: clipStartTimeRef.current, endSec: clipEnd, teleprompterPos: highlightUpToRef.current, duration: clipDur };
      const newMarks = [...clipMarksRef.current, mark];
      clipMarksRef.current = newMarks;
      setClipMarks(newMarks);
      clipStartTimeRef.current = clipEnd;
      setIsPaused(true);
      voiceModeRef.current = true;
      const t = setTimeout(() => startVoiceRecognition(), 300);
      stopRestartTimerRef.current = t;
    };
    try { rec.stop(); } catch {}
  }, [stopVoiceRecognition, startVoiceRecognition]);

  handleVoiceStopRef.current = handleVoiceStop;

  const handleVoicePlay = useCallback(() => {
    if (voiceCountdownRef.current) return;
    if (isRecording && !isPaused) return;
    if (!isRecording) {
      startRecording();
      return;
    }
    runCountdownThenStart("tryout");
  }, [isRecording, isPaused, startRecording, runCountdownThenStart]);

  handleVoicePlayRef.current = handleVoicePlay;

  const handleVoiceGoToDrive = useCallback(async () => {
    if (voiceCountdownRef.current) return;
    clearCountdownTimers();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopVoiceRecognition();

    const rec = mediaRecorderRef.current;

    const doUpload = async () => {
      const mergedBlob = clipBlobsRef.current.length > 0
        ? new Blob(clipBlobsRef.current, { type: recorderMimeRef.current })
        : null;
      setIsRecording(false);
      setIsPaused(false);
      stopAllTracks();

      if (!mergedBlob || mergedBlob.size === 0) {
        toast({ title: t.studioNoVideoToUpload, variant: "destructive" });
        return;
      }

      console.log(`[studio] GO TO DRIVE (bg): ${(mergedBlob.size / 1024 / 1024).toFixed(1)}MB, ${clipBlobsRef.current.length} clips`);

      const autoFileName = idea ? cleanText(idea.titulo).slice(0, 60).replace(/[^a-zA-Z0-9\s\-áéíóúñÁÉÍÓÚÑ]/g, "").trim() : `Video ${new Date().toLocaleDateString("es-CL")}`;
      const ext = mergedBlob.type.includes("mp4") ? "mp4" : "webm";
      const mimeType = mergedBlob.type || (ext === "mp4" ? "video/mp4" : "video/webm");
      const bgId = `bg-${Date.now()}`;

      addBgUpload({
        id: bgId,
        title: autoFileName,
        status: "uploading" as const,
        progress: 0,
        message: t.studioUploading((mergedBlob.size / 1024 / 1024).toFixed(1)),
      });

      toast({ title: t.studioUploadingBg, description: t.studioUploadingBgDesc(autoFileName) });

      runBgUploadFn(mergedBlob, bgId, autoFileName, idea?.id || null, idea?.guion || "", mimeType, "", null, autoEdit, enableSubtitles);
      onBack();
    };

    if (rec && rec.state === "recording") {
      rec.onstop = () => {
        const lastClipBlob = new Blob(currentChunksRef.current, { type: recorderMimeRef.current });
        currentChunksRef.current = [];
        if (lastClipBlob.size > 0) {
          clipBlobsRef.current.push(lastClipBlob);
        }
        doUpload();
      };
      try { rec.stop(); } catch { doUpload(); }
    } else {
      doUpload();
    }
  }, [stopVoiceRecognition, stopAllTracks, clearCountdownTimers, idea, toast, addBgUpload, runBgUploadFn, onBack]);

  handleVoiceGoToDriveRef.current = handleVoiceGoToDrive;

  const stopRecording = useCallback(() => {
    return new Promise<Blob | null>((resolve) => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      stopVoiceRecognition();

      const rec = mediaRecorderRef.current;

      const mergeAndResolve = () => {
        if (isPaused || !rec || rec.state === "inactive") {
          const mergedBlob = clipBlobsRef.current.length > 0
            ? new Blob(clipBlobsRef.current, { type: recorderMimeRef.current })
            : null;
          setIsRecording(false);
          setIsPaused(false);
          const totalMB = mergedBlob ? (mergedBlob.size / 1024 / 1024).toFixed(1) : "0";
          console.log(`[studio] Final merged blob: ${totalMB}MB from ${clipBlobsRef.current.length} clips`);
          resolve(mergedBlob && mergedBlob.size > 0 ? mergedBlob : null);
          return;
        }

        const timeout = setTimeout(() => { setIsRecording(false); setIsPaused(false); resolve(null); }, 5000);
        rec.onstop = () => {
          clearTimeout(timeout);
          const lastClipBlob = new Blob(currentChunksRef.current, { type: recorderMimeRef.current });
          currentChunksRef.current = [];
          if (lastClipBlob.size > 0) {
            clipBlobsRef.current.push(lastClipBlob);
          }
          const mergedBlob = clipBlobsRef.current.length > 0
            ? new Blob(clipBlobsRef.current, { type: recorderMimeRef.current })
            : null;
          setIsRecording(false);
          setIsPaused(false);
          const totalMB = mergedBlob ? (mergedBlob.size / 1024 / 1024).toFixed(1) : "0";
          console.log(`[studio] Final merged blob: ${totalMB}MB from ${clipBlobsRef.current.length} clips`);
          resolve(mergedBlob && mergedBlob.size > 0 ? mergedBlob : null);
        };
        try { rec.stop(); } catch { clearTimeout(timeout); setIsRecording(false); setIsPaused(false); resolve(null); }
      };

      mergeAndResolve();
    });
  }, [isPaused, stopVoiceRecognition]);

  const tempPreviewFilenameRef = useRef<string | null>(null);
  const previewBlobUrlRef = useRef<string | null>(null);
  const [videoSrcReady, setVideoSrcReady] = useState(false);

  const setupPreview = useCallback((blob: Blob) => {
    const localUrl = URL.createObjectURL(blob);
    previewBlobUrlRef.current = localUrl;
    setBlobUrl(localUrl);
    setVideoSrcReady(true);
    console.log(`[studio] Preview ready (blob): ${(blob.size / 1024 / 1024).toFixed(1)}MB, type=${blob.type}`);
  }, []);

  const handleStopToEdit = useCallback(async () => {
    const knownDur = recordingTime;

    let thumb: string | null = null;
    try {
      const camVideo = videoRef.current;
      if (camVideo && camVideo.videoWidth > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = camVideo.videoWidth;
        canvas.height = camVideo.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(camVideo, 0, 0);
          thumb = canvas.toDataURL("image/jpeg", 0.7);
        }
      }
    } catch {}

    const blob = await stopRecording();
    if (!blob || blob.size === 0) {
      toast({ title: t.studioNoVideoRecorded, variant: "destructive" });
      return;
    }
    stopAllTracks();
    setRecordedBlob(blob);
    setThumbnailUrl(thumb);
    setClipMarks([]);
    segmentIdCounter.current = 1;
    setSelectedSegmentId(null);
    setCurrentPreviewTime(0);
    setIsPreviewPlaying(false);
    setVideoSrcReady(false);

    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }

    const dur = knownDur > 0 ? knownDur : 1;
    setVideoDuration(dur);
    setSegments([{ id: segmentIdCounter.current++, startSec: 0, endSec: dur, enabled: true }]);
    setVideoReady(true);

    const defaultName = idea ? cleanText(idea.titulo).slice(0, 60).replace(/[^a-zA-Z0-9\s\-áéíóúñÁÉÍÓÚÑ]/g, "").trim() : "";
    setFileName(defaultName || `Video ${new Date().toLocaleDateString("es-CL")}`);
    setWaMessage("");
    setPhase("review");

    console.log(`[studio] Recording done: ${(blob.size / 1024 / 1024).toFixed(1)}MB (only kept clips), type=${blob.type}, dur=${dur}s, clips=${clipBlobsRef.current.length}`);
  }, [stopRecording, stopAllTracks, toast, recordingTime, idea]);

  const handleTrimDone = useCallback(() => {
    if (previewVideoRef.current) previewVideoRef.current.pause();
    setIsPreviewPlaying(false);
    const defaultName = idea ? cleanText(idea.titulo).slice(0, 60).replace(/[^a-zA-Z0-9\s\-áéíóúñÁÉÍÓÚÑ]/g, "").trim() : "";
    setFileName(defaultName || `Video ${new Date().toLocaleDateString("es-CL")}`);
    setWaMessage("");
    setPhase("review");
  }, [idea]);

  const handleUpload = useCallback(async () => {
    if (!recordedBlob) return;

    const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
    const mimeType = recordedBlob.type || (ext === "mp4" ? "video/mp4" : "video/webm");
    const enabledSegs = segments.filter(s => s.enabled);
    const isFullVideo = enabledSegs.length === 1 && enabledSegs[0].startSec < 0.5 && enabledSegs[0].endSec >= videoDuration - 0.5;
    const segsToSend = !isFullVideo && enabledSegs.length > 0
      ? enabledSegs.map(s => ({ start: +s.startSec.toFixed(2), end: +s.endSec.toFixed(2) }))
      : null;

    const uploadTitle = fileName || idea?.titulo || `Video ${new Date().toLocaleDateString("es-CL")}`;
    const bgId = `bg-${Date.now()}`;
    const blobCopy = new Blob([recordedBlob], { type: recordedBlob.type });

    addBgUpload({
      id: bgId,
      title: uploadTitle,
      status: "uploading",
      progress: 0,
      message: `Subiendo (${(blobCopy.size / 1024 / 1024).toFixed(1)} MB)...`,
    });

    toast({ title: t.studioUploadingBg, description: t.studioUploadingBgDesc(uploadTitle) });

    runBgUploadFn(blobCopy, bgId, uploadTitle, idea?.id || null, idea?.guion || "", mimeType, waMessage.trim(), segsToSend, autoEdit, enableSubtitles);
    onBack();
  }, [recordedBlob, fileName, waMessage, idea, segments, videoDuration, toast, addBgUpload, runBgUploadFn, onBack]);

  const cleanupTempPreview = useCallback(() => {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
    if (tempPreviewFilenameRef.current) {
      fetch(`/api/studio/temp-preview/${encodeURIComponent(tempPreviewFilenameRef.current)}`, {
        method: "DELETE", credentials: "include"
      }).catch(() => {});
      tempPreviewFilenameRef.current = null;
    }
  }, []);

  const handleDiscard = useCallback(() => {
    cleanupTempPreview();
    setBlobUrl(null);
    setRecordedBlob(null);
    setThumbnailUrl(null);
    setVideoDuration(0);
    setSegments([]);
    setSelectedSegmentId(null);
    setCurrentPreviewTime(0);
    setIsPreviewPlaying(false);
    setVideoSrcReady(false);
    setVideoReady(false);
    setClipMarks([]);
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setHighlightUpTo(-1);
    setIsListening(false);
    clipBlobsRef.current = [];
    currentChunksRef.current = [];
    clipStartTimeRef.current = 0;
    voiceModeRef.current = false;
    mediaRecorderRef.current = null;
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
    setPhase("recording");
    startCamera(facingModeRef.current);
  }, [startCamera, cleanupTempPreview]);

  const fullCleanup = useCallback(() => {
    cleanupTempPreview();
    stopVoiceRecognition();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") { try { mediaRecorderRef.current.stop(); } catch {} }
    mediaRecorderRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
    countdownTimersRef.current.forEach(t => clearTimeout(t));
    countdownTimersRef.current = [];
    if (stopRestartTimerRef.current) { clearTimeout(stopRestartTimerRef.current); stopRestartTimerRef.current = null; }
    voiceCountdownRef.current = false;
    stopAllTracks();
    clipBlobsRef.current = [];
    currentChunksRef.current = [];
  }, [stopAllTracks, stopVoiceRecognition, cleanupTempPreview]);

  const handleBack = useCallback(() => {
    mountedRef.current = false;
    fullCleanup();
    onBack();
  }, [onBack, fullCleanup]);

  const switchCamera = useCallback(() => {
    if (isRecording && !isPaused) return;
    const newFacing = facingModeRef.current === "user" ? "environment" : "user";
    facingModeRef.current = newFacing;
    setFacingMode(newFacing);
    startCamera(newFacing);
  }, [isRecording, isPaused, startCamera]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatTimePrecise = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
  };

  const renderLineWithHighlights = useCallback((line: { text: string }, lineIdx: number) => {
    if (highlightUpTo < 0) return <span>{line.text}</span>;
    const lineTokens = tokensByLine.get(lineIdx);
    if (!lineTokens || lineTokens.length === 0) return <span className="text-white/30">{line.text}</span>;
    const words = line.text.split(/(\s+)/);
    let wordCount = 0;
    return words.map((part, pi) => {
      if (/^\s+$/.test(part)) return <span key={pi}>{part}</span>;
      const token = lineTokens[wordCount];
      wordCount++;
      if (!token) return <span key={pi}>{part}</span>;
      const lit = token.globalIdx <= highlightUpTo;
      return (
        <span key={pi} ref={(el) => { if (el) wordRefs.current.set(token.globalIdx, el); }}
          className={lit ? "text-white transition-colors duration-200" : "text-white/30 transition-colors duration-200"}>
          {part}
        </span>
      );
    });
  }, [tokensByLine, highlightUpTo]);

  useEffect(() => {
    mountedRef.current = true;
    clipBlobsRef.current = [];
    currentChunksRef.current = [];
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setCameraReady(false);
    setCameraError(false);
    setHighlightUpTo(-1);
    setIsListening(false);
    setClipMarks([]);
    clipStartTimeRef.current = 0;
    voiceModeRef.current = false;
    sessionIdRef.current = 0;
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(true);
      toast({ title: t.studioCameraNotAvailable, variant: "destructive" });
    } else {
      const cameraTimeout = setTimeout(() => {
        if (mountedRef.current && !streamRef.current) {
          setCameraError(true);
          toast({ title: t.studioCameraTimeout, variant: "destructive" });
        }
      }, 15000);
      startCamera("user").finally(() => clearTimeout(cameraTimeout));
    }
    const handleDeviceChange = async () => {
      if (!mountedRef.current || !streamRef.current) return;
      if (!navigator.mediaDevices?.getUserMedia) return;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") return;
      const audioTracks = streamRef.current.getAudioTracks();
      const hasLiveAudio = audioTracks.some(t => t.readyState === "live");
      if (!hasLiveAudio) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioTracks.forEach(t => { try { t.stop(); streamRef.current?.removeTrack(t); } catch {} });
          audioStream.getAudioTracks().forEach(t => streamRef.current?.addTrack(t));
        } catch {}
      }
    };
    try { navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange); } catch {}
    return () => {
      mountedRef.current = false;
      try { navigator.mediaDevices?.removeEventListener("devicechange", handleDeviceChange); } catch {}
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") { try { mediaRecorderRef.current.stop(); } catch {} }
      mediaRecorderRef.current = null;
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => { try { t.stop(); } catch {} }); streamRef.current = null; }
      if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} recognitionRef.current = null; }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (zoomIndicatorTimer.current) clearTimeout(zoomIndicatorTimer.current);
      if (scrollDebounce.current) clearTimeout(scrollDebounce.current);
      clipBlobsRef.current = [];
      currentChunksRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const el = touchAreaRef.current;
    if (!el) return;
    const getTouchDist = (e: TouchEvent) => {
      if (e.touches.length < 2) return 0;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 2) { e.preventDefault(); lastPinchDistRef.current = getTouchDist(e); } };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const dist = getTouchDist(e);
      if (lastPinchDistRef.current > 0) applyZoom(zoomRef.current * (dist / lastPinchDistRef.current));
      lastPinchDistRef.current = dist;
    };
    const onTouchEnd = () => { lastPinchDistRef.current = 0; };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [phase, applyZoom]);

  const videoDurationRef = useRef(videoDuration);
  videoDurationRef.current = videoDuration;
  segmentsRef.current = segments;


  const initVideoFromDuration = useCallback((dur: number) => {
    if (!dur || !isFinite(dur) || dur <= 0) return;
    setVideoDuration(dur);
    setVideoReady(true);
    setCurrentPreviewTime(0);
    if (segmentsRef.current.length === 0) {
      setSegments([{ id: segmentIdCounter.current++, startSec: 0, endSec: dur, enabled: true }]);
    }
  }, []);

  const handleVideoMetadata = useCallback(() => {
    const video = previewVideoRef.current;
    if (!video) return;
    const dur = video.duration;
    if (dur && isFinite(dur) && dur > 0 && Math.abs(dur - videoDuration) > 0.5) {
      setVideoDuration(dur);
      if (segmentsRef.current.length === 1) {
        const seg = segmentsRef.current[0];
        if (seg.startSec === 0 && Math.abs(seg.endSec - videoDuration) < 1.5) {
          setSegments([{ ...seg, endSec: dur }]);
        }
      }
    }
  }, [videoDuration]);

  const handleVideoTimeUpdate = useCallback(() => {
    if (previewVideoRef.current) {
      setCurrentPreviewTime(previewVideoRef.current.currentTime);
    }
  }, []);

  useEffect(() => {
    if (phase !== "editing" || !blobUrl || !videoSrcReady) return;
    const video = previewVideoRef.current;
    if (!video) return;
    video.load();
  }, [phase, blobUrl, videoSrcReady]);


  const handleSplitAtPlayhead = useCallback(() => {
    const video = previewVideoRef.current;
    if (!video || videoDuration <= 0) return;
    const t = video.currentTime;
    setSegments(prev => {
      const segIdx = prev.findIndex(s => t >= s.startSec && t < s.endSec);
      if (segIdx === -1) return prev;
      const seg = prev[segIdx];
      if (t - seg.startSec < 0.3 || seg.endSec - t < 0.3) return prev;
      const newSegs = [...prev];
      newSegs.splice(segIdx, 1,
        { id: seg.id, startSec: seg.startSec, endSec: t, enabled: seg.enabled },
        { id: segmentIdCounter.current++, startSec: t, endSec: seg.endSec, enabled: seg.enabled }
      );
      return newSegs;
    });
  }, [videoDuration]);

  const handleToggleSegment = useCallback((segId: number) => {
    setSegments(prev => prev.map(s => s.id === segId ? { ...s, enabled: !s.enabled } : s));
    setSelectedSegmentId(segId);
  }, []);

  const handleDeleteSegment = useCallback((segId: number) => {
    setSegments(prev => prev.map(s => s.id === segId ? { ...s, enabled: false } : s));
    setSelectedSegmentId(null);
  }, []);

  const handlePreviewPlayPause = useCallback(() => {
    const video = previewVideoRef.current;
    if (!video || !blobUrl) return;
    if (isPreviewPlaying) {
      video.pause();
      setIsPreviewPlaying(false);
    } else {
      video.play().then(() => {
        setIsPreviewPlaying(true);
        handleVideoMetadata();
      }).catch(() => {
        video.muted = true;
        video.play().then(() => {
          setIsPreviewPlaying(true);
          handleVideoMetadata();
        }).catch(() => setIsPreviewPlaying(false));
      });
    }
  }, [isPreviewPlaying, handleVideoMetadata, blobUrl]);

  if (phase === "review") {
    return (
      <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center justify-between px-4 py-4">
          <button onClick={handleDiscard} className="p-3 rounded-full bg-white/10 text-white active:scale-90 transition-transform touch-manipulation" data-testid="button-back-to-edit">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h3 className="text-white font-medium text-sm">Enviar video</h3>
          <div className="w-11" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <div className="max-w-md mx-auto space-y-4 mt-2">
            {thumbnailUrl && (
              <div className="rounded-xl overflow-hidden border border-white/10 aspect-[9/16] max-h-48 mx-auto w-auto relative bg-black">
                <img src={thumbnailUrl} alt="Preview" className="w-full h-full object-cover" data-testid="img-video-thumbnail" />
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/70 text-[10px] text-white/80 font-mono">
                  {formatTime(Math.round(videoDuration))}
                </div>
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-green-600/80 text-[10px] text-white font-medium flex items-center gap-1">
                  <Video className="w-3 h-3" />
                  {recordedBlob ? (recordedBlob.size / 1024 / 1024).toFixed(1) + " MB" : ""}
                </div>
              </div>
            )}
            {!thumbnailUrl && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col items-center gap-2">
                <Video className="w-8 h-8 text-green-400" />
                <p className="text-white/60 text-xs">Video grabado</p>
                <p className="text-white/30 text-[10px]">
                  {recordedBlob ? (recordedBlob.size / 1024 / 1024).toFixed(1) + " MB" : ""} - {formatTime(Math.round(videoDuration))}
                </p>
              </div>
            )}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-orange-400 shrink-0" />
                <div className="flex-1">
                  <label className="text-[11px] text-white/50 block mb-1.5">Nombre en Google Drive</label>
                  <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)}
                    className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-500/50"
                    placeholder="Nombre del video..." data-testid="input-file-name" />
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <Send className="w-5 h-5 text-green-400 shrink-0" />
                <div className="flex-1">
                  <label className="text-[11px] text-white/50 block mb-1.5">Mensaje de WhatsApp (opcional)</label>
                  <textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} rows={3}
                    className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-green-500/50 resize-none"
                    placeholder="Mensaje adicional para WhatsApp..." data-testid="input-wa-message" />
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
              <button
                type="button"
                onClick={() => setAutoEdit(!autoEdit)}
                className="w-full flex items-center justify-between gap-3"
                data-testid="button-auto-edit-toggle"
              >
                <div className="flex items-center gap-3">
                  <Wand2 className="w-5 h-5 text-cyan-400 shrink-0" />
                  <div className="text-left">
                    <p className="text-sm text-white font-medium">Auto-Editar</p>
                    <p className="text-[10px] text-white/40 mt-0.5">Recorte automatico + portada</p>
                  </div>
                </div>
                <div className={`w-11 h-6 rounded-full transition-colors relative ${autoEdit ? "bg-cyan-500" : "bg-white/15"}`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoEdit ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </button>
              {autoEdit && (
                <button
                  type="button"
                  onClick={() => setEnableSubtitles(!enableSubtitles)}
                  className="w-full flex items-center justify-between gap-3 pl-8"
                  data-testid="button-subtitles-toggle"
                >
                  <div className="flex items-center gap-3">
                    <Type className="w-4 h-4 text-orange-400 shrink-0" />
                    <div className="text-left">
                      <p className="text-sm text-white font-medium">Subtitulos</p>
                      <p className="text-[10px] text-white/40 mt-0.5">Texto animado sobre el video</p>
                    </div>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors relative ${enableSubtitles ? "bg-orange-500" : "bg-white/15"}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enableSubtitles ? "translate-x-5" : "translate-x-0.5"}`} />
                  </div>
                </button>
              )}
            </div>
            {idea && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center gap-3">
                  <Video className="w-4 h-4 text-white/40 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[11px] text-white/50">{cleanText(idea.titulo)}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{idea.plataforma}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-5 pb-8" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))" }}>
          <div className="max-w-md mx-auto flex gap-3">
            <button onClick={handleDiscard} className="flex-1 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-sm font-medium active:scale-95 transition-transform touch-manipulation">
              {t.studioDiscard}
            </button>
            <button onClick={handleUpload} className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-green-900/40 touch-manipulation" data-testid="button-confirm-upload">
              <Upload className="w-4 h-4" />
              {t.studioUploadToDrive}
            </button>
          </div>
        </div>
      </div>
    );
  }


  if (phase === "editing") {
    const enabledSegs = segments.filter(s => s.enabled);
    const totalEnabledDur = enabledSegs.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
    const playbackPct = videoDuration > 0 ? (currentPreviewTime / videoDuration) * 100 : 0;
    const selectedSeg = segments.find(s => s.id === selectedSegmentId);
    return (
      <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleDiscard} className="p-3 rounded-full bg-white/10 text-white active:scale-90 transition-transform touch-manipulation" data-testid="button-discard-edit">
            <Trash2 className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-orange-400" />
            <h3 className="text-white font-medium text-sm">Editar video</h3>
          </div>
          <button onClick={handleTrimDone} disabled={enabledSegs.length === 0} className="px-4 py-2 rounded-full bg-green-600 text-white text-xs font-medium active:scale-90 transition-transform touch-manipulation disabled:opacity-40" data-testid="button-trim-done">
            Siguiente
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-3 min-h-0">
          <div className="relative w-full max-w-sm aspect-[9/16] rounded-xl overflow-hidden bg-black border border-white/10">
            {videoSrcReady ? (
              <video ref={previewVideoRef} src={blobUrl || undefined} playsInline controls preload="auto"
                className="w-full h-full object-cover"
                onLoadedMetadata={handleVideoMetadata}
                onLoadedData={handleVideoMetadata}
                onDurationChange={handleVideoMetadata}
                onCanPlay={handleVideoMetadata}
                onTimeUpdate={handleVideoTimeUpdate}
                onPlay={() => setIsPreviewPlaying(true)}
                onPause={() => setIsPreviewPlaying(false)}
                onError={(e) => {
                  const video = e.currentTarget;
                  const err = video.error;
                  console.error(`[studio] Video error: code=${err?.code}, msg=${err?.message}, src=${blobUrl?.substring(0, 80)}`);
                }}
                data-testid="video-preview" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center" data-testid="video-loading">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full bg-orange-600/60 backdrop-blur-sm flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                  <span className="text-[11px] text-white/60 font-medium">Preparando video...</span>
                </div>
              </div>
            )}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <div className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm">
                <span className="text-[10px] text-white font-mono">{formatTimePrecise(currentPreviewTime)}</span>
              </div>
              <div className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm">
                <span className="text-[10px] text-white font-mono">{formatTimePrecise(videoDuration)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}>
          <div className="max-w-md mx-auto space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-white/40 font-mono">{segments.length} clip{segments.length !== 1 ? "s" : ""}</span>
              <span className="text-[10px] text-orange-400 font-medium font-mono">Final: {formatTimePrecise(totalEnabledDur)}</span>
            </div>

            <div className="relative h-12 rounded-lg overflow-hidden bg-white/5 border border-white/10">
              {segments.map((seg) => {
                const leftPct = videoDuration > 0 ? (seg.startSec / videoDuration) * 100 : 0;
                const widthPct = videoDuration > 0 ? ((seg.endSec - seg.startSec) / videoDuration) * 100 : 0;
                const isSelected = seg.id === selectedSegmentId;
                return (
                  <button key={seg.id}
                    onClick={() => {
                      setSelectedSegmentId(seg.id === selectedSegmentId ? null : seg.id);
                      if (previewVideoRef.current) {
                        previewVideoRef.current.currentTime = seg.startSec;
                        setCurrentPreviewTime(seg.startSec);
                      }
                    }}
                    className={`absolute top-0 bottom-0 transition-all touch-manipulation ${
                      seg.enabled
                        ? isSelected ? "bg-orange-500/60 border-y-2 border-orange-400" : "bg-green-600/40 hover:bg-green-600/50"
                        : isSelected ? "bg-red-900/50 border-y-2 border-red-500" : "bg-white/5"
                    }`}
                    style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
                    data-testid={`segment-${seg.id}`}
                  >
                    <span className="text-[8px] text-white/60 font-mono absolute bottom-0.5 left-1 truncate" style={{ maxWidth: "calc(100% - 8px)" }}>
                      {formatTimePrecise(seg.endSec - seg.startSec)}
                    </span>
                    {!seg.enabled && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <X className="w-3 h-3 text-red-400/60" />
                      </div>
                    )}
                  </button>
                );
              })}
              {videoDuration > 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-white z-10 pointer-events-none transition-[left] duration-75"
                  style={{ left: `${playbackPct}%` }} />
              )}
            </div>

            {selectedSeg && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-[10px] text-white/40 font-mono">
                  {formatTimePrecise(selectedSeg.startSec)} - {formatTimePrecise(selectedSeg.endSec)}
                </span>
                <button onClick={() => handleToggleSegment(selectedSeg.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-medium active:scale-95 transition-transform touch-manipulation ${
                    selectedSeg.enabled ? "bg-red-600/20 border border-red-500/30 text-red-400" : "bg-green-600/20 border border-green-500/30 text-green-400"
                  }`} data-testid="button-toggle-segment">
                  {selectedSeg.enabled ? t.studioExclude : t.studioInclude}
                </button>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button onClick={handlePreviewPlayPause}
                className="w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center active:scale-90 transition-transform touch-manipulation" data-testid="button-play-edit">
                {isPreviewPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
              </button>
              <button onClick={handleSplitAtPlayhead}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-orange-600/20 border border-orange-500/30 text-orange-400 text-[11px] font-medium active:scale-95 transition-transform touch-manipulation" data-testid="button-split">
                <Scissors className="w-4 h-4" />
                Cortar aqui
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {cameraError ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-4 px-8">
            <VideoOff className="w-16 h-16 text-white/30 mx-auto" />
            <p className="text-white/50 text-sm">{t.studioCameraError}</p>
            <p className="text-white/30 text-xs">{t.studioCameraPermission}</p>
            <Button onClick={() => startCamera(facingModeRef.current)} variant="outline" className="text-white border-white/20 touch-manipulation">
              {t.studioCameraRetry}
            </Button>
            <Button onClick={handleBack} variant="ghost" className="text-white/40 touch-manipulation">
              {t.studioCameraBack}
            </Button>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 overflow-hidden">
          <video ref={videoRef} autoPlay playsInline muted
            className={`absolute inset-0 w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
            style={(!hasNativeZoomRef.current && zoomLevel !== 1) || zoomLevel < 1 ? { transform: `${facingMode === "user" ? "scaleX(-1) " : ""}scale(${zoomLevel})` } : undefined} />
          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-[2]">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
                <p className="text-white/60 text-sm">{t.studioInitializingCamera}</p>
                <p className="text-white/30 text-xs">{t.studioInitializingCameraHint}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <div ref={touchAreaRef} className="absolute inset-0 z-[5]" style={{ touchAction: "none" }} />

      {showZoomIndicator && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[30] px-4 py-2 rounded-full bg-black/70 backdrop-blur-sm border border-white/20">
          <span className="text-sm text-white font-mono font-medium">{zoomLevel.toFixed(1)}x</span>
        </div>
      )}

      <div className="absolute right-2 z-[25] flex flex-col items-center gap-1" style={{ top: "30%", bottom: "35%" }}>
        <ZoomIn className="w-3.5 h-3.5 text-white/50 mb-1" />
        <div className="flex-1 relative w-8 flex items-center justify-center">
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] rounded-full bg-white/15" />
          <input
            type="range"
            min={hasNativeZoomRef.current ? zoomMinRef.current * 10 : 5}
            max={zoomMaxRef.current * 10}
            step={1}
            value={zoomLevel * 10}
            onChange={(e) => applyZoom(Number(e.target.value) / 10)}
            className="absolute w-full touch-manipulation"
            style={{
              writingMode: "vertical-lr" as any,
              direction: "rtl",
              height: "100%",
              WebkitAppearance: "none",
              appearance: "none",
              background: "transparent",
              cursor: "pointer",
            }}
            data-testid="slider-zoom"
          />
        </div>
        <ZoomOut className="w-3.5 h-3.5 text-white/50 mt-1" />
        <div className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md border border-white/10 mt-1">
          <span className="text-[9px] text-white/70 font-mono">{zoomLevel.toFixed(1)}x</span>
        </div>
      </div>

      {voiceCountdown && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${voiceCountdown.type === "reset" ? "border-red-500 bg-red-500/20" : "border-orange-500 bg-orange-500/20"}`}>
              <span className="text-5xl font-bold text-white font-mono">{voiceCountdown.count}</span>
            </div>
            <span className={`text-sm font-semibold uppercase tracking-widest ${voiceCountdown.type === "reset" ? "text-red-400" : "text-orange-400"}`}>
              {voiceCountdown.type === "reset" ? t.studioVoiceReset : t.studioVoiceRetry}
            </span>
          </div>
        </div>
      )}

      {bgUploads.length > 0 && phase === "recording" && (
        <div className="absolute top-2 left-14 right-14 z-[35] flex flex-col gap-1" style={{ marginTop: "max(0.5rem, env(safe-area-inset-top, 8px))" }}>
          {bgUploads.map(bg => (
            <div key={bg.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg backdrop-blur-md border ${bg.status === "done" ? "bg-green-900/70 border-green-500/40" : bg.status === "error" ? "bg-red-900/70 border-red-500/40" : "bg-black/70 border-white/10"}`}>
              {bg.status === "uploading" || bg.status === "processing" ? (
                <Loader2 className="w-3 h-3 text-orange-400 animate-spin shrink-0" />
              ) : bg.status === "done" ? (
                <Check className="w-3 h-3 text-green-400 shrink-0" />
              ) : (
                <X className="w-3 h-3 text-red-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[9px] text-white/80 font-medium truncate">{bg.title}</div>
                <div className="text-[8px] text-white/50">{bg.message}</div>
              </div>
              {(bg.status === "uploading" || bg.status === "processing") && (
                <div className="w-8 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${bg.progress}%` }} />
                </div>
              )}
              {bg.status === "done" && bg.driveVerified && (
                <Check className="w-3 h-3 text-green-400 shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="relative z-[20] flex items-center justify-between px-4 py-3" style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 12px))" }}>
        <button onClick={handleBack} className="p-3.5 rounded-full bg-black/50 backdrop-blur-md text-white active:scale-90 transition-transform touch-manipulation border border-white/10" data-testid="button-camera-back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          {isRecording && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md border ${isPaused ? "bg-yellow-500/30 border-yellow-500/40" : "bg-red-500/30 border-red-500/40"}`}>
              <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? "bg-yellow-500" : "bg-red-500 animate-pulse"}`} />
              <span className="text-sm font-mono text-white font-bold">{formatTime(recordingTime)}</span>
              {isPaused && <span className="text-[10px] text-yellow-300 font-medium ml-1">PAUSA</span>}
            </div>
          )}
          {isListening && isRecording && !isPaused && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-500/30">
              <Mic className="w-3 h-3 text-green-400" />
              <span className="text-[10px] text-green-400 font-medium">Voz</span>
            </div>
          )}
        </div>
        {(!isRecording || isPaused) ? (
          <button onClick={switchCamera} className="p-3.5 rounded-full bg-black/50 backdrop-blur-md text-white active:scale-90 transition-transform touch-manipulation border border-white/10" data-testid="button-switch-camera">
            <SwitchCamera className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-12" />
        )}
      </div>

      {hasScript && teleprompterMode === "lejos" && (
        <div className="absolute inset-0 z-[10] flex flex-col pointer-events-none" style={{ paddingTop: "max(4rem, calc(env(safe-area-inset-top, 12px) + 56px))", paddingBottom: "160px" }}>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-2 pb-4 pointer-events-auto" style={{ background: "rgba(0,0,0,0.88)" }}>
            <div className="space-y-3 max-w-md mx-auto pb-2">
              {allLines.map((line, i) => {
                if (line.isSectionHeader) {
                  const config = SECTION_CONFIG[line.type];
                  return (
                    <div key={i} className="flex items-center gap-2 py-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${config?.progressColor || "bg-gray-500"}`} />
                      <span className={`text-xs font-bold uppercase tracking-[0.15em] ${config?.bgClass || "text-gray-300"}`}>{line.text}</span>
                    </div>
                  );
                }
                if (line.isDirective) {
                  return (
                    <div key={i} className="flex items-start gap-1.5 py-0.5">
                      <Eye className="w-3 h-3 text-yellow-400/40 mt-0.5 shrink-0" />
                      <span className="text-yellow-200/40 italic" style={{ fontSize: fontSize * 0.75 }}>{line.text}</span>
                    </div>
                  );
                }
                return (
                  <p key={i} className={`leading-[1.8] font-semibold ${highlightUpTo >= 0 ? "" : "text-white"}`} style={{ fontSize: fontSize + 4, textShadow: "0 2px 6px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.9)" }}>
                    {renderLineWithHighlights(line, i)}
                  </p>
                );
              })}
            </div>
          </div>
          {isRecording && (
            <div className="flex items-center justify-center gap-3 px-4 py-1.5 pointer-events-auto" style={{ background: "rgba(0,0,0,0.7)" }}>
              <span className="text-[9px] text-green-400/70 font-medium tracking-wide">PLAY</span>
              <span className="text-[7px] text-white/20">|</span>
              <span className="text-[9px] text-yellow-400/70 font-medium tracking-wide">STOP</span>
              <span className="text-[7px] text-white/20">|</span>
              <span className="text-[9px] text-red-400/70 font-medium tracking-wide">RESET</span>
              <span className="text-[7px] text-white/20">|</span>
              <span className="text-[9px] text-orange-400/70 font-medium tracking-wide">TRY OUT</span>
              <span className="text-[7px] text-white/20">|</span>
              <span className="text-[9px] text-blue-400/70 font-medium tracking-wide">GO TO DRIVE</span>
            </div>
          )}
        </div>
      )}

      {hasScript && teleprompterMode === "cerca" && (
        <div className="relative z-[10]">
          <div className="bg-black/85">
            <div ref={scrollRef} className="overflow-y-auto px-5 py-3" style={{ maxHeight: "28dvh" }}>
              <div className="space-y-2 max-w-md mx-auto pb-2">
                {allLines.map((line, i) => {
                  if (line.isSectionHeader) {
                    const config = SECTION_CONFIG[line.type];
                    return (
                      <div key={i} className="flex items-center gap-2 py-1">
                        <div className={`w-2 h-2 rounded-full ${config?.progressColor || "bg-gray-500"}`} />
                        <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${config?.bgClass || "text-gray-300"}`}>{line.text}</span>
                      </div>
                    );
                  }
                  if (line.isDirective) {
                    return (
                      <div key={i} className="flex items-start gap-1.5 py-0.5">
                        <Eye className="w-3 h-3 text-yellow-400/30 mt-0.5 shrink-0" />
                        <span className="text-yellow-200/30 italic" style={{ fontSize: fontSize * 0.7 }}>{line.text}</span>
                      </div>
                    );
                  }
                  return (
                    <p key={i} className={`leading-[1.7] font-normal ${highlightUpTo >= 0 ? "" : "text-white/90"}`} style={{ fontSize }}>
                      {renderLineWithHighlights(line, i)}
                    </p>
                  );
                })}
              </div>
            </div>
            {isRecording && (
              <div className="flex items-center justify-center gap-3 px-4 py-1.5 border-t border-white/5">
                <span className="text-[9px] text-green-400/70 font-medium tracking-wide">PLAY</span>
                <span className="text-[7px] text-white/20">|</span>
                <span className="text-[9px] text-yellow-400/70 font-medium tracking-wide">STOP</span>
                <span className="text-[7px] text-white/20">|</span>
                <span className="text-[9px] text-red-400/70 font-medium tracking-wide">RESET</span>
                <span className="text-[7px] text-white/20">|</span>
                <span className="text-[9px] text-orange-400/70 font-medium tracking-wide">TRY OUT</span>
                <span className="text-[7px] text-white/20">|</span>
                <span className="text-[9px] text-blue-400/70 font-medium tracking-wide">GO TO DRIVE</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1" />

      {isRecording && clipMarks.length > 0 && (
        <div className="relative z-[20] flex items-center gap-1 px-4 py-1">
          {clipMarks.map((m, i) => (
            <div key={i} className="h-1 flex-1 rounded-full bg-green-500/70" />
          ))}
          {!isPaused && <div className="h-1 flex-1 rounded-full bg-red-500 animate-pulse" />}
        </div>
      )}

      <div className="relative z-[20] bg-black/80 backdrop-blur-sm px-6 py-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}>
        <div className="max-w-sm mx-auto">
          {hasScript && (
            <div className="flex items-center justify-center gap-2 mb-2">
              <button
                onClick={() => setTeleprompterMode("cerca")}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all touch-manipulation ${teleprompterMode === "cerca" ? "bg-white/20 text-white border border-white/30" : "bg-white/5 text-white/40 border border-white/10"}`}
                data-testid="button-mode-cerca"
              >
                Cerca
              </button>
              <button
                onClick={() => setTeleprompterMode("lejos")}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all touch-manipulation ${teleprompterMode === "lejos" ? "bg-white/20 text-white border border-white/30" : "bg-white/5 text-white/40 border border-white/10"}`}
                data-testid="button-mode-lejos"
              >
                Lejos
              </button>
            </div>
          )}
          <div className="flex items-center justify-center gap-4 mb-3">
            <button onClick={() => setFontSize(Math.max(12, fontSize - 2))}
              className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/50 active:scale-90 transition-transform text-xs font-bold touch-manipulation"
              data-testid="button-font-decrease">A-</button>
            <span className="text-[10px] text-white/30 w-10 text-center">{fontSize}px</span>
            <button onClick={() => setFontSize(Math.min(32, fontSize + 2))}
              className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-white/50 active:scale-90 transition-transform text-xs font-bold touch-manipulation"
              data-testid="button-font-increase">A+</button>
          </div>
          <div className="flex items-center justify-center gap-6">
            {!isRecording ? (
              <button onClick={startRecording} disabled={!cameraReady}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30 touch-manipulation"
                data-testid="button-start-recording">
                <div className="w-14 h-14 rounded-full bg-red-500" />
              </button>
            ) : (
              <>
                {isPaused && clipMarks.length > 0 && (
                  <button onClick={handleDeleteLastClip}
                    className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
                    data-testid="button-delete-last-clip">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </button>
                )}

                {!isPaused ? (
                  <button onClick={handlePause}
                    className="w-20 h-20 rounded-full border-4 border-yellow-500 flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
                    data-testid="button-pause-recording">
                    <Pause className="w-8 h-8 text-yellow-500 fill-yellow-500" />
                  </button>
                ) : (
                  <button onClick={handleResume}
                    className="w-20 h-20 rounded-full border-4 border-green-500 flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
                    data-testid="button-resume-recording">
                    <Play className="w-8 h-8 text-green-500 fill-green-500 ml-1" />
                  </button>
                )}

                <button onClick={handleStopToEdit}
                  className="w-12 h-12 rounded-full bg-white/10 border border-red-500/50 flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
                  data-testid="button-stop-recording">
                  <Square className="w-5 h-5 text-red-500 fill-red-500" />
                </button>
              </>
            )}
          </div>
          {isRecording && (
            <div className="text-center mt-2">
              <span className="text-[10px] text-white/40">
                {clipMarks.length + (isPaused ? 0 : 1)} clip{clipMarks.length + (isPaused ? 0 : 1) !== 1 ? "s" : ""}
                {isPaused ? " - En pausa" : ""}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type RecordingStats = { weeklyCount: number; monthlyCount: number; totalCount: number; streak: number };

export default function RecordingStudio() {
  const { t } = useLang();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIdea, setSelectedIdea] = useState<AiVideoIdea | null>(null);
  const [cameraIdea, setCameraIdea] = useState<AiVideoIdea | null>(null);
  const [freeRecording, setFreeRecording] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [showRecorded, setShowRecorded] = useState(false);
  const [celebrateId, setCelebrateId] = useState<number | null>(null);
  const [studioTab, setStudioTab] = useState<"estudio" | "ideas">("estudio");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [targetDay, setTargetDay] = useState<string>("auto");
  const [targetTime, setTargetTime] = useState<string>("");

  const [bgUploads, setBgUploads] = useState<BgUpload[]>([]);
  const studioMountedRef = useRef(true);
  useEffect(() => { studioMountedRef.current = true; return () => { studioMountedRef.current = false; }; }, []);

  const updateBgUpload = useCallback((id: string, updates: Partial<BgUpload>) => {
    if (!studioMountedRef.current) return;
    setBgUploads(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  }, []);

  const removeBgUpload = useCallback((id: string) => {
    setBgUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  const addBgUpload = useCallback((upload: BgUpload) => {
    setBgUploads(prev => [...prev, upload]);
  }, []);

  const targetDayRef = useRef(targetDay);
  targetDayRef.current = targetDay;
  const targetTimeRef = useRef(targetTime);
  targetTimeRef.current = targetTime;

  const runBgUploadFn = useCallback(async (blob: Blob, bgId: string, uploadTitle: string, uploadIdeaId: number | null, uploadIdeaGuion: string, uploadMimeType: string, uploadWaMessage: string, uploadSegs: Array<{start: number, end: number}> | null, uploadAutoEdit: boolean, uploadEnableSubtitles: boolean = true) => {
    const resolvedDay = targetDayRef.current === "auto" ? undefined : targetDayRef.current;
    const resolvedTime = targetTimeRef.current || undefined;
    const safeUpdate = (updates: Partial<BgUpload>) => {
      if (studioMountedRef.current) setBgUploads(prev => prev.map(u => u.id === bgId ? { ...u, ...updates } : u));
    };
    try {
      const CHUNK_SIZE = 4.5 * 1024 * 1024;
      const totalSize = blob.size;
      const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
      const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunk = blob.slice(start, end);
        const chunkForm = new FormData();
        chunkForm.append("chunk", chunk, `chunk-${i}`);
        chunkForm.append("uploadId", uploadId);
        chunkForm.append("chunkIndex", String(i));
        chunkForm.append("totalChunks", String(totalChunks));

        let retries = 0;
        while (retries < 3) {
          try {
            const cRes = await fetch("/api/studio/upload-chunk", { method: "POST", body: chunkForm, credentials: "include" });
            if (!cRes.ok) throw new Error("Chunk upload failed");
            break;
          } catch (e: any) {
            retries++;
            if (retries >= 3) throw new Error(`Error parte ${i + 1}/${totalChunks}`);
            await new Promise(r => setTimeout(r, 1000 * retries));
          }
        }
        safeUpdate({ progress: Math.round(((i + 1) / totalChunks) * 80), message: `Subiendo ${i + 1}/${totalChunks}...` });
      }

      safeUpdate({ status: "processing", progress: 85, message: t.studioProcessingDrive });

      const finalRes = await fetch("/api/studio/finalize-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          uploadId,
          ideaId: uploadIdeaId,
          ideaTitle: uploadTitle,
          ideaGuion: uploadIdeaGuion,
          videoMimeType: uploadMimeType,
          waMessage: uploadWaMessage || undefined,
          segments: uploadSegs,
          autoEdit: uploadAutoEdit,
          enableSubtitles: uploadEnableSubtitles,
          targetDay: resolvedDay,
          targetTime: resolvedTime,
        }),
      });

      const ct = finalRes.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error("Error del servidor");
      const data = await finalRes.json();
      if (!finalRes.ok) throw new Error(data.error || "Upload failed");

      const dayMsg = data.dayName ? ` → ${data.dayName}` : "";
      safeUpdate({
        status: "done",
        progress: 100,
        message: data.driveVerified ? t.studioUploadedToDrive(uploadTitle, dayMsg) : t.studioUploadErrorDrive(uploadTitle),
        driveVerified: !!data.driveVerified,
        driveLink: data.driveVerified ? (data.driveLink || "") : (data.backupLink || ""),
      });
      if (studioMountedRef.current) {
        toast({ title: data.driveVerified ? t.studioUploadedToDrive(uploadTitle, dayMsg) : t.studioUploadErrorDrive(uploadTitle), variant: data.driveVerified ? "default" : "destructive" });
        queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
        queryClient.invalidateQueries({ queryKey: ["/api/studio/recording-stats"] });
      }
    } catch (err: any) {
      console.error("BG Upload error:", err);
      safeUpdate({ status: "error", progress: 0, message: err.message || "Error" });
      if (studioMountedRef.current) toast({ title: `Error subiendo "${uploadTitle}"`, variant: "destructive" });
    }
  }, [toast, queryClient]);

  const { data: videoIdeas = [], isLoading } = useQuery<AiVideoIdea[]>({
    queryKey: ["/api/studio/ideas"],
    queryFn: async () => {
      const res = await apiFetch("/api/studio/ideas");
      if (!res.ok) throw new Error("Error al cargar ideas");
      return res.json();
    },
  });

  const { data: stats } = useQuery<RecordingStats>({
    queryKey: ["/api/studio/recording-stats"],
    queryFn: async () => {
      const res = await apiFetch("/api/studio/recording-stats");
      if (!res.ok) throw new Error("Error al cargar stats");
      return res.json();
    },
  });

  const { data: suggestedDayData } = useQuery<{ suggestedDay: string; currentDay: string; hour: number; availableDays: string[] }>({
    queryKey: ["/api/studio/suggested-day"],
    queryFn: async () => {
      const res = await apiFetch("/api/studio/suggested-day");
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const recordMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/studio/ideas/${id}/record`, { method: "PATCH" });
      if (!res.ok) throw new Error("Error al marcar grabado");
      return res.json();
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/studio/ideas"] });
      const previous = queryClient.getQueryData<AiVideoIdea[]>(["/api/studio/ideas"]);
      if (previous) {
        const now = new Date().toISOString();
        queryClient.setQueryData<AiVideoIdea[]>(
          ["/api/studio/ideas"],
          previous.map((i) => (i.id === id ? { ...i, recordedAt: now } : i)),
        );
      }
      return { previous };
    },
    onSuccess: (_data, id) => {
      setSelectedIdea(null);
      setCelebrateId(id);
      queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/recording-stats"] });
      setTimeout(() => {
        setCelebrateId(null);
        toast({ title: t.studioVideoMarkedTitle });
      }, 2200);
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/studio/ideas"], ctx.previous);
      toast({ title: t.toastMarkRecordedError, variant: "destructive" });
    },
  });

  const deleteIdeaMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/studio/ideas/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Error al eliminar");
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/studio/ideas"] });
      const previous = queryClient.getQueryData<AiVideoIdea[]>(["/api/studio/ideas"]);
      if (previous) {
        queryClient.setQueryData<AiVideoIdea[]>(
          ["/api/studio/ideas"],
          previous.filter((i) => i.id !== id),
        );
      }
      return { previous };
    },
    onSuccess: () => {
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
      toast({ title: t.studioIdeaDeleted });
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/studio/ideas"], ctx.previous);
      toast({ title: t.toastDeleteIdeaError, variant: "destructive" });
    },
  });

  const unrecordMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/studio/ideas/${id}/unrecord`, { method: "PATCH" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/studio/ideas"] });
      const previous = queryClient.getQueryData<AiVideoIdea[]>(["/api/studio/ideas"]);
      if (previous) {
        queryClient.setQueryData<AiVideoIdea[]>(
          ["/api/studio/ideas"],
          previous.map((i) => (i.id === id ? { ...i, recordedAt: null } : i)),
        );
      }
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/recording-stats"] });
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["/api/studio/ideas"], ctx.previous);
      toast({ title: t.toastUndoError, variant: "destructive" });
    },
  });

  const readyIdeas = useMemo(
    () => videoIdeas.filter((i) => i.saved && !i.recordedAt),
    [videoIdeas]
  );

  const recordedIdeas = useMemo(
    () => videoIdeas.filter((i) => i.recordedAt).sort((a, b) =>
      new Date(b.recordedAt!).getTime() - new Date(a.recordedAt!).getTime()
    ),
    [videoIdeas]
  );

  const motivationalMsg = useMemo(
    () => t.studioMotivational[Math.floor(Math.random() * t.studioMotivational.length)],
    [t]
  );

  const copyScript = async (idea: AiVideoIdea) => {
    const text = `${cleanText(idea.titulo)}\n\n${cleanText(idea.guion)}\n\n${(idea.hashtags || []).join(" ")}`;
    await navigator.clipboard.writeText(text);
    setCopied(idea.id);
    toast({ title: t.studioScriptCopied });
    setTimeout(() => setCopied(null), 2000);
  };

  if (celebrateId) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#050505] flex items-center justify-center" onClick={() => setCelebrateId(null)}>
        <div className="flex flex-col items-center gap-8 animate-in zoom-in-50 fade-in duration-700">
          <div className="relative">
            <div className="absolute inset-0 bg-green-500/20 rounded-full blur-3xl scale-150 animate-pulse" />
            <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-2xl shadow-green-900/50">
              <Trophy className="w-14 h-14 text-white" />
            </div>
          </div>
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold text-white tracking-tight">{t.studioExcellent}</h2>
            <p className="text-white/40 text-sm">{t.studioVideoMarkedMsg}</p>
          </div>
          {stats && (
            <div className="flex items-center gap-3 mt-2">
              <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/25 text-xs px-4 py-1">
                {t.studioStreak(stats.streak + 1)}
              </Badge>
              <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/25 text-xs px-4 py-1">
                Total: {stats.totalCount + 1}
              </Badge>
            </div>
          )}
          <p className="text-white/20 text-[10px] mt-4 animate-in fade-in duration-1000">Toca para continuar</p>
        </div>
      </div>
    );
  }

  if (freeRecording) {
    return (
      <CameraErrorBoundary onBack={() => setFreeRecording(false)} errorTitle={t.studioCameraError} retryLabel={t.studioCameraRetry} backLabel={t.studioCameraBack}>
        <CameraRecordingView
          idea={null}
          onBack={() => setFreeRecording(false)}
          onComplete={() => {
            setFreeRecording(false);
            queryClient.invalidateQueries({ queryKey: ["/api/studio/recording-stats"] });
          }}
          bgUploads={bgUploads}
          addBgUpload={addBgUpload}
          runBgUploadFn={runBgUploadFn}
        />
      </CameraErrorBoundary>
    );
  }

  if (cameraIdea) {
    return (
      <CameraErrorBoundary onBack={() => setCameraIdea(null)} errorTitle={t.studioCameraError} retryLabel={t.studioCameraRetry} backLabel={t.studioCameraBack}>
        <CameraRecordingView
          idea={cameraIdea}
          onBack={() => setCameraIdea(null)}
          onComplete={() => {
            setCameraIdea(null);
            queryClient.invalidateQueries({ queryKey: ["/api/studio/ideas"] });
            queryClient.invalidateQueries({ queryKey: ["/api/studio/recording-stats"] });
          }}
          bgUploads={bgUploads}
          addBgUpload={addBgUpload}
          runBgUploadFn={runBgUploadFn}
        />
      </CameraErrorBoundary>
    );
  }

  if (selectedIdea) {
    return (
      <TeleprompterView
        idea={selectedIdea}
        onBack={() => setSelectedIdea(null)}
        onMarkRecorded={(id) => recordMutation.mutate(id)}
        isRecording={recordMutation.isPending}
      />
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-600/15 via-pink-600/8 to-purple-600/10 border border-orange-500/15 p-5">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-orange-500/5 rounded-full blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-lg shadow-orange-900/30 shrink-0">
              <Clapperboard className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-foreground" data-testid="text-studio-title">Estudio</h1>
              <p className="text-[11px] text-muted-foreground/70">{motivationalMsg}</p>
            </div>
            {readyIdeas.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                <Zap className="w-3.5 h-3.5 text-green-400" />
                <span className="text-xs font-bold text-green-400" data-testid="text-ready-count">{readyIdeas.length}</span>
              </div>
            )}
          </div>
        </div>

        {bgUploads.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {bgUploads.map(bg => (
              <div key={bg.id} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border ${bg.status === "done" ? "bg-green-500/8 border-green-500/20" : bg.status === "error" ? "bg-red-500/8 border-red-500/20" : "bg-orange-500/5 border-orange-500/15"}`}>
                {bg.status === "uploading" || bg.status === "processing" ? (
                  <Loader2 className="w-4 h-4 text-orange-400 animate-spin shrink-0" />
                ) : bg.status === "done" ? (
                  <Check className="w-4 h-4 text-green-400 shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-foreground/80 font-medium truncate">{bg.title}</div>
                  <div className="text-[10px] text-muted-foreground/60">{bg.message}</div>
                </div>
                {(bg.status === "uploading" || bg.status === "processing") && (
                  <div className="w-12 h-1.5 rounded-full bg-white/5 overflow-hidden shrink-0">
                    <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${bg.progress}%` }} />
                  </div>
                )}
                {bg.status === "done" && bg.driveLink && (
                  <a href={bg.driveLink} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 underline shrink-0" onClick={e => e.stopPropagation()} data-testid={`link-bg-drive-${bg.id}`}>
                    Drive
                  </a>
                )}
                {(bg.status === "done" || bg.status === "error") && (
                  <button onClick={() => removeBgUpload(bg.id)} className="text-muted-foreground/30 hover:text-muted-foreground/60 touch-manipulation shrink-0" data-testid={`button-dismiss-bg-${bg.id}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1.5">
          <button
            onClick={() => setStudioTab("estudio")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
              studioTab === "estudio"
                ? "bg-orange-500/15 text-orange-400 border border-orange-500/25"
                : "text-muted-foreground/50 hover:text-muted-foreground/70 hover:bg-muted/20"
            }`}
            data-testid="tab-estudio"
          >
            <Clapperboard className="w-3.5 h-3.5" />
            Estudio
          </button>
          <button
            onClick={() => setStudioTab("ideas")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
              studioTab === "ideas"
                ? "bg-orange-500/15 text-orange-400 border border-orange-500/25"
                : "text-muted-foreground/50 hover:text-muted-foreground/70 hover:bg-muted/20"
            }`}
            data-testid="tab-ideas-ia"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {t.studioIdeasTab}
          </button>
        </div>

        {studioTab === "ideas" && (
          <AiVideoIdeasTab />
        )}

        {studioTab === "estudio" && <>
        <button
          onClick={() => setFreeRecording(true)}
          className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl bg-gradient-to-r from-blue-600/15 to-cyan-600/10 border border-blue-500/20 hover:border-blue-500/35 active:scale-[0.98] transition-all duration-200"
          data-testid="button-free-recording">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-900/30 shrink-0">
            <Camera className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-foreground">{t.studioFreeRecord}</p>
            <p className="text-[10px] text-muted-foreground/60">{t.studioNoScript}</p>
          </div>
          <Play className="w-4 h-4 text-blue-400/60" />
        </button>

        <div className="px-4 py-3 rounded-xl bg-card/40 border border-border/50 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-indigo-500/20 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">{t.studioDayDest}</p>
              {suggestedDayData && (
                <p className="text-[10px] text-muted-foreground/60">
                  {t.studioTodayHint(suggestedDayData.currentDay, suggestedDayData.hour)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={targetDay}
              onChange={(e) => setTargetDay(e.target.value)}
              className="flex-1 bg-background/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all cursor-pointer"
            >
              <option value="auto">{t.studioDayAuto}</option>
              <option value="Lunes">{t.studioDayLunes}</option>
              <option value="Martes">{t.studioDayMartes}</option>
              <option value="Miercoles">{t.studioDayMiercoles}</option>
              <option value="Jueves">{t.studioDayJueves}</option>
              <option value="Viernes">{t.studioDayViernes}</option>
              <option value="Sabado">{t.studioDaySabado}</option>
              <option value="Domingo">{t.studioDayDomingo}</option>
            </select>
            <select
              value={targetTime ? targetTime.split(":")[0] : ""}
              onChange={(e) => {
                const h = e.target.value;
                if (!h) { setTargetTime(""); return; }
                const currentMin = targetTime ? targetTime.split(":")[1] : "00";
                setTargetTime(`${h}:${currentMin}`);
              }}
              className="w-[60px] bg-background/60 border border-white/10 rounded-lg px-2 py-2 text-xs text-foreground focus:border-primary outline-none appearance-none cursor-pointer text-center"
            >
              <option value="">HH</option>
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <span className="text-muted-foreground font-bold text-xs">:</span>
            <select
              value={targetTime ? targetTime.split(":")[1] : ""}
              onChange={(e) => {
                const m = e.target.value;
                const currentH = targetTime ? targetTime.split(":")[0] : "12";
                setTargetTime(`${currentH}:${m}`);
              }}
              className="w-[60px] bg-background/60 border border-white/10 rounded-lg px-2 py-2 text-xs text-foreground focus:border-primary outline-none appearance-none cursor-pointer text-center"
            >
              <option value="">MM</option>
              {["00", "15", "30", "45"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {targetTime && (
              <button
                onClick={() => setTargetTime("")}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center transition-colors shrink-0"
                title="Quitar hora"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          {targetTime && (
            <p className="text-[10px] text-purple-400/80 px-1">
              {t.studioPublishTime(targetTime)}
            </p>
          )}
        </div>

        {stats && (stats.totalCount > 0 || stats.streak > 0) && (
          <div className="flex items-center justify-around py-3 rounded-xl bg-card/30 border border-border/50">
            <StatsRing value={stats.streak} max={7} label={t.studioRacha} color="#f97316" />
            <StatsRing value={stats.weeklyCount} max={7} label={t.studioSemana} color="#3b82f6" />
            <StatsRing value={stats.monthlyCount} max={30} label={t.studioMes} color="#10b981" />
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-[68px] h-[68px] rounded-full flex items-center justify-center bg-purple-500/5 border border-purple-500/15">
                <span className="text-lg font-bold text-foreground">{stats.totalCount}</span>
              </div>
              <span className="text-[10px] text-muted-foreground/70 font-medium">Total</span>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
          </div>
        ) : readyIdeas.length === 0 && recordedIdeas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center mb-4">
              <Video className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1.5">{t.studioEmptyTitle}</h3>
            <p className="text-xs text-muted-foreground/60 max-w-xs leading-relaxed">
              {t.studioEmptyDesc}
            </p>
          </div>
        ) : (
          <>
            {readyIdeas.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 px-1">
                  <Target className="w-3.5 h-3.5 text-orange-400/70" />
                  <span className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider">{t.studioReadyToRecord}</span>
                </div>
                {readyIdeas.map((idea) => {
                  const sections2 = parseGuion(idea.guion);
                  const platformClass = PLATFORM_COLORS[idea.plataforma] || "bg-gray-500/20 text-gray-400";
                  return (
                    <div key={idea.id}
                      className="group relative overflow-hidden rounded-xl bg-card/60 border border-border/50 hover:border-orange-500/20 transition-all duration-300 active:scale-[0.98]"
                      data-testid={`card-ready-idea-${idea.id}`}>
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-orange-500 to-pink-600 rounded-full" />
                      <div className="p-3.5 pl-4">
                        <div className="flex items-start gap-3">
                          <button onClick={() => setSelectedIdea(idea)}
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shrink-0 shadow-md shadow-orange-900/20 active:scale-90 transition-transform"
                            data-testid={`button-start-teleprompter-${idea.id}`}>
                            <Play className="w-4 h-4 text-white ml-0.5" />
                          </button>
                          <div className="flex-1 min-w-0" onClick={() => setSelectedIdea(idea)}>
                            <h3 className="font-semibold text-sm text-foreground leading-tight mb-1">{cleanText(idea.titulo)}</h3>
                            <div className="flex flex-wrap items-center gap-1 mb-2">
                              <Badge className={`text-[9px] border ${platformClass} py-0 px-1.5`}>{idea.plataforma}</Badge>
                              {idea.duracionSugerida && <span className="text-[9px] text-muted-foreground/50">{idea.duracionSugerida}</span>}
                            </div>
                            <div className="flex items-center gap-1 h-1">
                              {sections2.map((section, i) => (
                                <div key={i} className={`h-1 flex-1 rounded-full ${SECTION_CONFIG[section.type]?.progressColor || "bg-gray-500"} opacity-60`} />
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <button onClick={() => setCameraIdea(idea)}
                              className="p-2 rounded-lg text-muted-foreground/40 hover:text-foreground/60 hover:bg-muted/30 transition-colors"
                              data-testid={`button-camera-${idea.id}`}>
                              <Camera className="w-4 h-4" />
                            </button>
                            <button onClick={() => copyScript(idea)}
                              className="p-2 rounded-lg text-muted-foreground/40 hover:text-foreground/60 hover:bg-muted/30 transition-colors"
                              data-testid={`button-copy-script-${idea.id}`}>
                              {copied === idea.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setDeleteConfirmId(idea.id)}
                              className="p-2 rounded-lg text-muted-foreground/40 hover:text-red-400/70 hover:bg-red-500/10 transition-colors"
                              data-testid={`button-delete-ready-${idea.id}`}>
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {recordedIdeas.length > 0 && (
              <div className="space-y-2">
                <button onClick={() => setShowRecorded(!showRecorded)} className="flex items-center gap-2 w-full px-1 py-1" data-testid="button-toggle-recorded">
                  <Trophy className="w-3.5 h-3.5 text-green-500/60" />
                  <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">{t.studioRecordedCount(recordedIdeas.length)}</span>
                  <div className="ml-auto">
                    {showRecorded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/40" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />}
                  </div>
                </button>
                {showRecorded && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                    {recordedIdeas.map((idea) => (
                      <div key={idea.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-green-500/5 border border-green-500/8" data-testid={`card-recorded-idea-${idea.id}`}>
                        <div className="w-6 h-6 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 text-green-400/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground/60 truncate">{cleanText(idea.titulo)}</p>
                          <p className="text-[9px] text-muted-foreground/40">
                            {idea.recordedAt ? new Date(idea.recordedAt).toLocaleDateString("es-CL", { day: "numeric", month: "short" }) : ""}
                          </p>
                        </div>
                        <button onClick={() => unrecordMutation.mutate(idea.id)}
                          className="p-1.5 rounded text-muted-foreground/30 hover:text-red-400/60 transition-colors"
                          data-testid={`button-unrecord-${idea.id}`}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        </>}

        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
            <div className="bg-card border border-border rounded-2xl p-5 max-w-xs w-full shadow-2xl animate-in zoom-in-95 fade-in duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{t.studioDeleteIdeaTitle}</h3>
                  <p className="text-[11px] text-muted-foreground/60">{t.studioDeleteIdeaDesc}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground/70 mb-4">
                {cleanText(videoIdeas.find(i => i.id === deleteConfirmId)?.titulo || "")}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 h-9 rounded-xl bg-muted/30 border border-border/50 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  data-testid="button-cancel-delete"
                >
                  {t.btnCancel}
                </button>
                <button
                  onClick={() => deleteConfirmId && deleteIdeaMutation.mutate(deleteConfirmId)}
                  disabled={deleteIdeaMutation.isPending}
                  className="flex-1 h-9 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                  data-testid="button-confirm-delete"
                >
                  {deleteIdeaMutation.isPending ? t.studioDeleting : t.studioDelete}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
