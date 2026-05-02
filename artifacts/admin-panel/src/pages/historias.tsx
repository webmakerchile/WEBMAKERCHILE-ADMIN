import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  Sparkles, Download, AlertCircle, Loader2, Dices, Copy, Check, RefreshCw,
  Pencil, Repeat, Settings, X, Wand2, Bot, Film, BookOpen, Package,
} from "lucide-react";
import { motion } from "framer-motion";
import JSZip from "jszip";
import { RETRY_PRESETS } from "@/lib/retry-presets";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const TIPOS_HISTORIA = [
  { value: "tip_tech", label: "Tip Tech", desc: "Tips de programación y tecnología", emoji: "💡" },
  { value: "motivacional", label: "Motivacional", desc: "Frases motivacionales para devs", emoji: "🔥" },
  { value: "comunidad", label: "Comunidad", desc: "Behind scenes y comunidad", emoji: "🤝" },
];

const FORMATOS = [
  { value: "unica", label: "Única", desc: "1 sola historia autocontenida con CTA", icon: BookOpen },
  { value: "serie", label: "Serie", desc: "2-5 frames conectados con narrativa", icon: Film },
  { value: "auto", label: "Auto", desc: "Recomendado: la IA decide por ti", icon: Bot },
] as const;

type Formato = "unica" | "serie" | "auto";
type RolFrame = "unica" | "hook" | "contexto" | "problema" | "desarrollo" | "solucion" | "cta";

const ROL_LABELS: Record<RolFrame, { label: string; emoji: string; color: string }> = {
  unica: { label: "Historia", emoji: "📖", color: "text-foreground" },
  hook: { label: "Hook", emoji: "🎣", color: "text-amber-300" },
  contexto: { label: "Contexto", emoji: "📊", color: "text-sky-300" },
  problema: { label: "Problema", emoji: "⚠️", color: "text-red-300" },
  desarrollo: { label: "Desarrollo", emoji: "📚", color: "text-indigo-300" },
  solucion: { label: "Solución", emoji: "💡", color: "text-emerald-300" },
  cta: { label: "CTA", emoji: "📞", color: "text-primary" },
};

type TextoHistoria = { copy_principal: string; sub_copy: string; cta: string; hashtags: string };

type Frame = {
  numero_frame: number;
  total_frames: number;
  rol: RolFrame;
  imagen: string;
  texto: TextoHistoria;
  error?: string;
};

type Resultado = {
  id: number;
  formato: "unica" | "serie";
  tipo_historia: string;
  concepto: string;
  texto_en_imagen: boolean;
  frames: Frame[];
  fecha: string;
};

type Recomendacion = {
  formato_recomendado: "unica" | "serie";
  cantidad_frames: number;
  razon: string;
  estructura: RolFrame[];
};

export default function HistoriasPage() {
  const [tipoHistoria, setTipoHistoria] = useState("tip_tech");
  const [concepto, setConcepto] = useState("");
  const [textoEnImagen, setTextoEnImagen] = useState(false);
  const [formato, setFormato] = useState<Formato>("auto");
  const [cantidadFrames, setCantidadFrames] = useState<number>(3);
  const [loading, setLoading] = useState(false);
  const [sorpresa, setSorpresa] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [frameActivo, setFrameActivo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState<Record<number, string>>({});
  const [modalAjuste, setModalAjuste] = useState<{ frame: number; modo: "imagen" | "ambos" } | null>(null);
  const [ajusteTexto, setAjusteTexto] = useState("");
  const [intentos, setIntentos] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [recomendacion, setRecomendacion] = useState<Recomendacion | null>(null);
  const [detectando, setDetectando] = useState(false);
  const [zippeando, setZippeando] = useState(false);

  const SORPRENDEME_HISTORY_KEY = "wm_sorprendeme_historia_history";
  const handleSorprendeme = async () => {
    setSorpresa(true);
    setError(null);
    try {
      let recientes: string[] = [];
      try { recientes = JSON.parse(localStorage.getItem(SORPRENDEME_HISTORY_KEY) || "[]"); } catch {}
      const res = await fetch(`${API_BASE}/community/sorprendeme`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contexto: concepto.trim() || undefined,
          tipo_seccion: "historia",
          temas_recientes: recientes.slice(0, 12),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      setConcepto(data.data.tema);
      const nuevo = [data.data.tema, ...recientes.filter((t) => t !== data.data.tema)].slice(0, 20);
      try { localStorage.setItem(SORPRENDEME_HISTORY_KEY, JSON.stringify(nuevo)); } catch {}
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSorpresa(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const lanzarGeneracion = async (
    formatoFinal: "unica" | "serie",
    cantidad?: number,
  ) => {
    setLoading(true);
    setError(null);
    setResultado(null);
    setFrameActivo(0);
    try {
      const res = await fetch(`${API_BASE}/community/historias/generar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_historia: tipoHistoria,
          concepto: concepto.trim(),
          texto_en_imagen: textoEnImagen,
          formato: formatoFinal,
          ...(formatoFinal === "serie" ? { cantidad_frames: cantidad || cantidadFrames } : {}),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error al generar");
      setResultado(data.data);
      const frameError = (data.data.frames as Frame[]).find((f) => f.error);
      if (frameError) showToast(`⚠️ Frame ${frameError.numero_frame} falló — usa “Reintentar” para reintentar`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concepto.trim()) {
      setError("Debes escribir un concepto o usar Sorpréndeme");
      return;
    }

    if (formato === "auto") {
      // Pedir recomendación primero
      setDetectando(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/community/historias/detectar-formato`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ concepto: concepto.trim() }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Error al detectar formato");
        setRecomendacion(data.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setDetectando(false);
      }
      return;
    }

    await lanzarGeneracion(formato, formato === "serie" ? cantidadFrames : undefined);
  };

  const aceptarRecomendacion = async () => {
    if (!recomendacion) return;
    const reco = recomendacion;
    setRecomendacion(null);
    await lanzarGeneracion(reco.formato_recomendado, reco.cantidad_frames);
  };

  const handleReintentar = async (
    frameIndex: number,
    modo: "imagen" | "texto" | "ambos" | "personalizado" | "auto-diagnose",
    promptPersonalizado?: string,
  ) => {
    if (!resultado) return;
    const frame = resultado.frames[frameIndex];
    if (!frame) return;
    setReintentando((prev) => ({ ...prev, [frameIndex]: modo }));
    setError(null);
    try {
      let imagenActualBase64: string | undefined;
      if (modo === "auto-diagnose" && frame.imagen) {
        const m = frame.imagen.match(/^data:[^;]+;base64,(.+)$/);
        if (m) imagenActualBase64 = m[1];
      }
      const res = await fetch(`${API_BASE}/community/historias/reintentar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_historia: resultado.tipo_historia,
          concepto: resultado.concepto,
          texto_actual: frame.texto,
          texto_en_imagen: resultado.texto_en_imagen,
          modo,
          prompt_personalizado: promptPersonalizado,
          imagen_actual_base64: imagenActualBase64,
          numero_frame: frame.numero_frame,
          total_frames: frame.total_frames,
          rol: frame.rol,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falló reintento");
      setResultado((prev) => {
        if (!prev) return prev;
        const newFrames = [...prev.frames];
        const current = newFrames[frameIndex]!;
        newFrames[frameIndex] = {
          ...current,
          imagen: data.data.imagen ?? current.imagen,
          texto: data.data.texto ?? current.texto,
          error: undefined,
        };
        return { ...prev, frames: newFrames };
      });
      setIntentos((n) => n + 1);
      const label = resultado.formato === "serie" ? `frame ${frame.numero_frame}` : "historia";
      showToast(`✅ ${label} regenerada (${modo})`);
    } catch (err: any) {
      setError(`No se pudo regenerar: ${err.message}. La versión anterior se mantiene.`);
    } finally {
      setReintentando((prev) => {
        const next = { ...prev };
        delete next[frameIndex];
        return next;
      });
    }
  };

  const confirmarAjusteCustom = async () => {
    if (!modalAjuste || !ajusteTexto.trim()) return;
    const modo = modalAjuste.modo === "ambos" ? "ambos" : "personalizado";
    const idx = modalAjuste.frame;
    setModalAjuste(null);
    await handleReintentar(idx, modo, ajusteTexto.trim());
    setAjusteTexto("");
  };

  const descargarFrame = (frame: Frame) => {
    if (!frame.imagen) return;
    const link = document.createElement("a");
    link.href = frame.imagen;
    const slug = (resultado?.concepto || "historia").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32);
    link.download = `historia_${slug}_${frame.numero_frame}_${frame.rol}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const descargarSerieZip = async () => {
    if (!resultado) return;
    setZippeando(true);
    try {
      const zip = new JSZip();
      const slug = resultado.concepto.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "historia";
      for (const frame of resultado.frames) {
        if (!frame.imagen) continue;
        const base64 = frame.imagen.split(",")[1];
        if (!base64) continue;
        zip.file(
          `frame_${String(frame.numero_frame).padStart(2, "0")}_${frame.rol}.png`,
          base64,
          { base64: true },
        );
      }
      const txt = resultado.frames
        .map((f) => `=== Frame ${f.numero_frame}/${f.total_frames} — ${f.rol.toUpperCase()} ===\n${f.texto.copy_principal}\n${f.texto.sub_copy}\nCTA: ${f.texto.cta}\n${f.texto.hashtags}`)
        .join("\n\n");
      zip.file("textos.txt", txt);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug}_serie_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setZippeando(false);
    }
  };

  const copiar = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  };

  const frameActual = resultado?.frames[frameActivo];
  const esSerie = resultado?.formato === "serie";

  return (
    <Layout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Generador de Historias</h1>
          <p className="text-muted-foreground text-sm sm:text-lg">
            Crea historias 9:16 — únicas o en serie de 2-5 frames conectados.
          </p>
        </header>

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleGenerar}
          className="glass-card rounded-2xl p-6 space-y-6 border border-foreground/10"
        >
          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">Tipo de historia</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {TIPOS_HISTORIA.map((tipo) => (
                <button
                  key={tipo.value}
                  type="button"
                  onClick={() => setTipoHistoria(tipo.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    tipoHistoria === tipo.value
                      ? "border-primary bg-primary/10"
                      : "border-foreground/10 bg-foreground/5 hover:border-foreground/20"
                  }`}
                >
                  <div className="text-2xl mb-1">{tipo.emoji}</div>
                  <div className="font-semibold text-foreground">{tipo.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{tipo.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Concepto clave</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej: 3 razones para tener un chatbot, automatiza tu negocio con IA..."
                className="flex-1 px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
                maxLength={120}
              />
              <button
                type="button"
                onClick={handleSorprendeme}
                disabled={sorpresa}
                title={concepto.trim() ? "Generar idea alineada con el contexto escrito" : "Generar tema random"}
                className="bg-amber-500/90 hover:bg-amber-500 disabled:bg-amber-500/40 text-slate-900 font-bold px-4 py-3 rounded-xl transition flex items-center gap-2 whitespace-nowrap"
              >
                {sorpresa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Dices className="w-4 h-4" />}
                ¡Sorpréndeme!
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {concepto.length}/120 caracteres. {concepto.trim() && "Sorpréndeme respetará tu contexto."}
            </p>
          </div>

          {/* Selector de formato */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">Formato de historia</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {FORMATOS.map((f) => {
                const Icon = f.icon;
                const isActive = formato === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFormato(f.value)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      isActive ? "border-primary bg-primary/10" : "border-foreground/10 bg-foreground/5 hover:border-foreground/20"
                    }`}
                  >
                    <Icon className="w-6 h-6 mb-2 text-primary" />
                    <div className="font-semibold text-foreground">{f.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{f.desc}</div>
                  </button>
                );
              })}
            </div>

            {formato === "serie" && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-bold mb-2">Cantidad de frames</div>
                <div className="flex gap-2">
                  {[2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCantidadFrames(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
                        cantidadFrames === n
                          ? "bg-primary text-primary-foreground"
                          : "bg-foreground/5 hover:bg-foreground/10 text-foreground border border-foreground/10"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Estructura: {cantidadFrames === 2 && "Hook → CTA"}
                  {cantidadFrames === 3 && "Hook → Desarrollo → CTA"}
                  {cantidadFrames === 4 && "Hook → Problema → Solución → CTA"}
                  {cantidadFrames === 5 && "Hook → Contexto → Problema → Solución → CTA"}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between bg-foreground/5 rounded-xl p-4 border border-foreground/10">
            <div>
              <div className="text-sm font-semibold text-foreground">Texto en imagen</div>
              <div className="text-xs text-muted-foreground">
                {textoEnImagen ? "La imagen se entregará con el texto ya quemado encima." : "La imagen vendrá limpia. Te entregamos el texto aparte para que lo agregues en Canva/IG."}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTextoEnImagen(!textoEnImagen)}
              className={`relative w-14 h-8 rounded-full transition ${textoEnImagen ? "bg-primary" : "bg-foreground/20"}`}
            >
              <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${textoEnImagen ? "left-7" : "left-1"}`} />
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || detectando}
            className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Generando {esSerie ? "serie" : "historia"}...</>
            ) : detectando ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Analizando tema...</>
            ) : formato === "auto" ? (
              <><Bot className="w-5 h-5" />Analizar y generar</>
            ) : (
              <><Sparkles className="w-5 h-5" />Generar {formato === "serie" ? `serie (${cantidadFrames})` : "historia"}</>
            )}
          </button>
        </motion.form>

        {/* Modal de recomendación auto */}
        {recomendacion && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setRecomendacion(null)}>
            <div className="bg-slate-900 border border-foreground/10 rounded-2xl p-6 max-w-lg w-full space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <Bot className="w-7 h-7 text-primary" />
                <h3 className="text-lg font-display font-bold">Recomendación de la IA</h3>
              </div>
              <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 space-y-2">
                <div className="text-sm font-bold text-primary">
                  {recomendacion.formato_recomendado === "unica"
                    ? "📖 Historia única"
                    : `🎬 Serie de ${recomendacion.cantidad_frames} frames`}
                </div>
                <div className="text-sm text-foreground/80">{recomendacion.razon}</div>
                {recomendacion.formato_recomendado === "serie" && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {recomendacion.estructura.map((rol, i) => (
                      <span key={i} className="bg-foreground/5 border border-foreground/10 text-xs px-2 py-1 rounded-md">
                        {ROL_LABELS[rol]?.emoji} {ROL_LABELS[rol]?.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={aceptarRecomendacion}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-4 py-2 rounded-lg flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />Generar así
                </button>
                <button
                  onClick={() => {
                    // cambiar a manual con la cantidad recomendada precargada si era serie
                    if (recomendacion.formato_recomendado === "serie") {
                      setFormato("serie");
                      setCantidadFrames(recomendacion.cantidad_frames);
                    } else {
                      setFormato("unica");
                    }
                    setRecomendacion(null);
                  }}
                  className="flex-1 bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground font-semibold px-4 py-2 rounded-lg flex items-center justify-center gap-2"
                >
                  <Pencil className="w-4 h-4" />Cambiar formato
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RESULTADO */}
        {resultado && frameActual && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Tira de thumbnails — solo si es serie */}
            {esSerie && (
              <div className="glass-card rounded-2xl p-4 border border-foreground/10">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Film className="w-4 h-4 text-primary" />
                    Serie de {resultado.frames.length} frames
                  </div>
                  <button
                    onClick={descargarSerieZip}
                    disabled={zippeando}
                    className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/40 text-white font-semibold px-3 py-2 rounded-lg text-sm flex items-center gap-2"
                  >
                    {zippeando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                    Descargar serie (ZIP)
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {resultado.frames.map((f, i) => {
                    const rolMeta = ROL_LABELS[f.rol];
                    const activo = i === frameActivo;
                    return (
                      <button
                        key={i}
                        onClick={() => setFrameActivo(i)}
                        className={`flex-shrink-0 relative rounded-lg overflow-hidden border-2 transition-all ${
                          activo ? "border-primary scale-105" : "border-foreground/10 hover:border-foreground/25"
                        }`}
                        style={{ width: 80 }}
                      >
                        {f.imagen ? (
                          <img src={f.imagen} alt={`Frame ${f.numero_frame}`} className="w-full" style={{ aspectRatio: "9/16", objectFit: "cover" }} />
                        ) : (
                          <div className="bg-red-500/10 flex items-center justify-center text-red-400" style={{ aspectRatio: "9/16" }}>
                            <AlertCircle className="w-5 h-5" />
                          </div>
                        )}
                        <div className="absolute top-1 left-1 bg-slate-950/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                          {f.numero_frame}/{f.total_frames}
                        </div>
                        {reintentando[i] && (
                          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px] flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-primary animate-spin" />
                          </div>
                        )}
                        <div className={`absolute bottom-0 left-0 right-0 bg-slate-950/85 text-[10px] font-semibold py-1 text-center ${rolMeta.color}`}>
                          {rolMeta.emoji} {rolMeta.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vista del frame activo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card rounded-2xl p-6 border border-foreground/10">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <h2 className="text-lg font-display font-bold flex items-center gap-2">
                    {esSerie ? (
                      <>
                        <span className={ROL_LABELS[frameActual.rol].color}>
                          {ROL_LABELS[frameActual.rol].emoji} {ROL_LABELS[frameActual.rol].label}
                        </span>
                        <span className="text-xs text-muted-foreground font-normal">
                          (Frame {frameActual.numero_frame}/{frameActual.total_frames})
                        </span>
                      </>
                    ) : "Imagen"}
                  </h2>
                  <button
                    onClick={() => descargarFrame(frameActual)}
                    disabled={!frameActual.imagen}
                    className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/40 text-white font-semibold px-3 py-2 rounded-lg text-sm transition flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />PNG
                  </button>
                </div>
                <div className="relative max-w-xs w-full mx-auto">
                  {frameActual.imagen ? (
                    <img
                      src={frameActual.imagen}
                      alt={`Frame ${frameActual.numero_frame}`}
                      className="w-full rounded-xl shadow-2xl"
                      style={{ aspectRatio: "9/16" }}
                    />
                  ) : (
                    <div className="w-full bg-red-500/10 border border-red-500/30 rounded-xl flex flex-col items-center justify-center text-red-300 p-6 text-center" style={{ aspectRatio: "9/16" }}>
                      <AlertCircle className="w-10 h-10 mb-2" />
                      <p className="text-sm font-semibold">Este frame falló</p>
                      <p className="text-xs text-red-200/80 mt-1">{frameActual.error || "Sin detalle"}</p>
                      <p className="text-xs mt-3">Usa “Reintentar imagen” abajo.</p>
                    </div>
                  )}
                  {reintentando[frameActivo] && (
                    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 z-10">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <p className="text-foreground font-semibold text-sm">Regenerando...</p>
                      <p className="text-muted-foreground text-xs">~10-30s</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleReintentar(frameActivo, "imagen")}
                    disabled={!!reintentando[frameActivo]}
                    className="bg-amber-500/90 hover:bg-amber-500 disabled:bg-amber-500/40 text-slate-900 font-bold px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />Reintentar imagen
                  </button>
                  <button
                    onClick={() => handleReintentar(frameActivo, "texto")}
                    disabled={!!reintentando[frameActivo]}
                    className="bg-blue-500/90 hover:bg-blue-500 disabled:bg-blue-500/40 text-white font-bold px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />Reintentar texto
                  </button>
                  <button
                    onClick={() => handleReintentar(frameActivo, "ambos")}
                    disabled={!!reintentando[frameActivo]}
                    className="bg-emerald-500/90 hover:bg-emerald-500 disabled:bg-emerald-500/40 text-white font-bold px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Repeat className="w-3.5 h-3.5" />Reintentar todo
                  </button>
                  <button
                    onClick={() => { setModalAjuste({ frame: frameActivo, modo: "imagen" }); setAjusteTexto(""); }}
                    disabled={!!reintentando[frameActivo]}
                    className="bg-primary/90 hover:bg-primary disabled:bg-primary/40 text-primary-foreground font-bold px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Settings className="w-3.5 h-3.5" />Ajuste personalizado
                  </button>
                </div>
                {esSerie && Object.keys(reintentando).length > 0 && (
                  <p className="text-[11px] text-amber-300/90 mt-2 text-center">
                    Regenerando {Object.keys(reintentando).length} frame(s) en paralelo — puedes cambiar de frame y lanzar otro reintento.
                  </p>
                )}
                <div className="mt-3">
                  <button
                    onClick={() => handleReintentar(frameActivo, "auto-diagnose")}
                    disabled={!!reintentando[frameActivo] || !resultado.frames[frameActivo]?.imagen}
                    title="Gemini Vision compara la imagen actual vs la master del zorro y aplica las correcciones automáticamente"
                    className="w-full mb-3 bg-gradient-to-r from-emerald-500/90 to-teal-500/90 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {reintentando[frameActivo] === "auto-diagnose" ? "Diagnosticando con Vision…" : "Auto-diagnosticar y reintentar (IA)"}
                  </button>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5 flex items-center gap-1.5">
                    <Wand2 className="w-3 h-3" />Ajustes rápidos
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {RETRY_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handleReintentar(frameActivo, "personalizado", preset.prompt)}
                        disabled={!!reintentando[frameActivo]}
                        title={preset.prompt.slice(0, 140) + "…"}
                        className="bg-foreground/5 hover:bg-primary hover:text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed text-foreground text-[11px] font-medium px-2 py-1 rounded-md border border-foreground/10 transition flex items-center gap-1"
                      >
                        <span>{preset.emoji}</span>{preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {intentos >= 5 && (
                  <div className="mt-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg px-3 py-2">
                    Has reintentado {intentos} veces. Prueba con un ajuste personalizado para guiar mejor al modelo.
                  </div>
                )}
                {!resultado.texto_en_imagen && (
                  <p className="text-xs text-muted-foreground italic mt-3 text-center">
                    Imagen limpia: usa el texto del panel derecho como overlay en Canva/IG.
                  </p>
                )}
              </div>

              <div className="glass-card rounded-2xl p-6 border border-foreground/10 space-y-4">
                <h2 className="text-lg font-display font-bold">Texto del frame</h2>

                {[
                  { id: "copy", label: "Copy principal", value: frameActual.texto.copy_principal, accent: "text-foreground font-bold text-base" },
                  { id: "sub", label: "Sub-copy", value: frameActual.texto.sub_copy, accent: "text-foreground/80 text-sm" },
                  { id: "cta", label: "CTA", value: frameActual.texto.cta, accent: "text-primary font-semibold" },
                  { id: "hash", label: "Hashtags", value: frameActual.texto.hashtags, accent: "text-amber-400 text-sm" },
                ].map((b) => (
                  <div key={b.id} className="bg-foreground/5 rounded-xl p-3 border border-foreground/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{b.label}</span>
                      <button
                        onClick={() => copiar(b.value, `${b.id}_${frameActivo}`)}
                        className="bg-foreground/5 hover:bg-foreground/10 text-foreground text-xs font-semibold px-2 py-1 rounded-md transition flex items-center gap-1"
                      >
                        {copiado === `${b.id}_${frameActivo}` ? <><Check className="w-3 h-3 text-emerald-400" />Copiado</> : <><Copy className="w-3 h-3" />Copiar</>}
                      </button>
                    </div>
                    <p className={`whitespace-pre-wrap ${b.accent}`}>{b.value || <span className="text-muted-foreground italic">(vacío)</span>}</p>
                  </div>
                ))}

                <button
                  onClick={() => {
                    const all = `${frameActual.texto.copy_principal}\n\n${frameActual.texto.sub_copy}\n\n${frameActual.texto.cta}\n\n${frameActual.texto.hashtags}`;
                    copiar(all, `todo_${frameActivo}`);
                  }}
                  className="w-full bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground text-sm font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {copiado === `todo_${frameActivo}` ? <><Check className="w-4 h-4 text-emerald-400" />Todo copiado</> : <><Copy className="w-4 h-4" />Copiar TODO el texto</>}
                </button>

                {esSerie && (
                  <button
                    onClick={() => {
                      const all = resultado.frames
                        .map((f) => `[Frame ${f.numero_frame}/${f.total_frames} — ${ROL_LABELS[f.rol].label}]\n${f.texto.copy_principal}\n${f.texto.sub_copy}\nCTA: ${f.texto.cta}\n${f.texto.hashtags}`)
                        .join("\n\n");
                      copiar(all, "serie_completa");
                    }}
                    className="w-full bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-sm font-bold py-2 rounded-lg transition flex items-center justify-center gap-2"
                  >
                    {copiado === "serie_completa" ? <><Check className="w-4 h-4" />Serie copiada</> : <><Copy className="w-4 h-4" />Copiar TODA la serie</>}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Modal de ajuste personalizado */}
        {modalAjuste && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModalAjuste(null)}>
            <div className="bg-slate-900 border border-foreground/10 rounded-2xl p-6 max-w-lg w-full space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-display font-bold">Ajuste personalizado</h3>
                <button onClick={() => setModalAjuste(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="text-xs text-muted-foreground">
                Escribe una instrucción específica. Ejemplos:
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>"El zorro más a la izquierda"</li>
                  <li>"Menos elementos de fondo, pose más alegre"</li>
                  <li>"Cambiar el CTA a 'Agenda reunión'" (si marcas también texto)</li>
                </ul>
              </div>
              <textarea
                value={ajusteTexto}
                onChange={(e) => setAjusteTexto(e.target.value)}
                placeholder="Describe el ajuste específico..."
                className="w-full px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary min-h-[100px]"
                maxLength={400}
                autoFocus
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalAjuste.modo === "ambos"}
                    onChange={(e) => setModalAjuste({ frame: modalAjuste.frame, modo: e.target.checked ? "ambos" : "imagen" })}
                    className="w-4 h-4 accent-primary"
                  />
                  Aplicar también al texto
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setModalAjuste(null)} className="bg-foreground/5 hover:bg-foreground/10 text-foreground font-semibold px-4 py-2 rounded-lg text-sm">Cancelar</button>
                  <button
                    onClick={confirmarAjusteCustom}
                    disabled={!ajusteTexto.trim()}
                    className="bg-primary hover:bg-primary/90 disabled:bg-muted text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />Reintentar con ajuste
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-6 right-6 bg-emerald-500 text-white font-semibold px-4 py-3 rounded-xl shadow-2xl z-50">
            {toast}
          </div>
        )}
      </div>
    </Layout>
  );
}
