import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Sparkles, Copy, AlertCircle, Loader2, Check, Dices, Download, ChevronLeft, ChevronRight, RefreshCw, Image as ImageIcon, FileArchive, Settings, X, Pencil, Repeat, Wand2, SlidersHorizontal, ChevronDown, Upload } from "lucide-react";
import { EstiloTitularPicker } from "@/components/estilo-titular-picker";
import { TiraBorradores } from "@/components/tira-borradores";
import { FormatosInteractivosPanel } from "@/components/formatos-interactivos-panel";
import { GuardarEnVideo } from "@/components/guardar-en-video";
import {
  useSetEstudio,
  PersonalizacionSet,
  IdeaConIA,
  DIRECCION_PREDETERMINADA,
} from "@/components/personalizacion-set";
import { motion } from "framer-motion";
import JSZip from "jszip";
import { RETRY_PRESETS } from "@/lib/retry-presets";
import { EmptyState } from "@/components/empty-state";
import { HelpHint } from "@/components/help-hint";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const TIPOS_CONTENIDO = [
  { value: "tutorial", label: "Tutorial", emoji: "📚" },
  { value: "tip", label: "Tip rápido", emoji: "💡" },
  { value: "reflexion", label: "Reflexión", emoji: "🤔" },
  { value: "comunidad", label: "Comunidad", emoji: "🤝" },
  { value: "lanzamiento", label: "Lanzamiento", emoji: "🚀" },
];

const REDES = [
  { value: "tiktok", label: "TikTok", emoji: "📱" },
  { value: "instagram", label: "Instagram", emoji: "📸" },
  { value: "youtube_shorts", label: "YouTube Shorts", emoji: "▶️" },
  { value: "twitter", label: "X / Twitter", emoji: "🐦" },
] as const;

type RedKey = typeof REDES[number]["value"];

type SlideImagen = {
  numero_slide: number;
  rol: "portada" | "desarrollo" | "cta" | "unica";
  titulo: string;
  subtitulo: string;
  imagen: string | null;
  error?: string;
};

type Resultado = {
  id: number;
  fecha: string;
  tema: string;
  tipo_contenido: string;
  tipo_publicacion: "unica" | "carrusel";
  texto_en_imagen: boolean;
  estilo_titular?: string;
  /** Set con el que se generó: los reintentos lo reutilizan tal cual. */
  set?: {
    direccion_id: string;
    pose_id: string | null;
    utileria: string | null;
    estilo_extra: string | null;
  };
  imagenes: SlideImagen[];
  descripciones: Record<string, { descripcion?: string; hashtags?: string; post_completo?: string }>;
};

export default function DescripcionesPage() {
  const [tema, setTema] = useState("");
  const [tipoContenido, setTipoContenido] = useState("tip");
  const [redes, setRedes] = useState<RedKey[]>(["tiktok", "instagram", "youtube_shorts", "twitter"]);
  const [tipoPublicacion, setTipoPublicacion] = useState<"unica" | "carrusel">("unica");
  const [cantidadSlides, setCantidadSlides] = useState(5);
  const [cantidadAuto, setCantidadAuto] = useState(true);
  const [autoInfo, setAutoInfo] = useState<{ cantidad: number; razon: string } | null>(null);
  // Encendido por defecto: el motor de tipografía de Portadas es el estándar
  // de la marca. Apagado, el carrusel salía sin texto y el selector de estilos
  // ni se mostraba, así que el estilo nuevo no llegaba a usarse.
  const [textoEnImagen, setTextoEnImagen] = useState(true);
  // Estilo tipográfico del título de las slides (motor de impacto de portadas).
  const [estiloTitular, setEstiloTitular] = useState<string | null>(null);

  // Idea en bruto + "Escribir con IA", igual que en Portadas: contar la idea
  // con tus palabras y que la IA la redacte y proponga el set.
  const [idea, setIdea] = useState("");
  const [redactando, setRedactando] = useState(false);

  // Personalización del set: hook COMPARTIDO con Historias y Portadas. Estaba
  // duplicado por sección y por eso se separaban.
  const set = useSetEstudio();

  const [loading, setLoading] = useState(false);
  const [sorpresa, setSorpresa] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<number | null>(null);

  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [slideActual, setSlideActual] = useState(0);
  const [reintentando, setReintentando] = useState<Record<number, boolean>>({});
  const [zippeando, setZippeando] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [modalAjuste, setModalAjuste] = useState<{ slide: SlideImagen; modo: "imagen" | "ambos" } | null>(null);
  const [ajusteTexto, setAjusteTexto] = useState("");
  const [intentos, setIntentos] = useState<Record<number, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  // Dos modos: la pieza de siempre y el contenido interactivo.
  const [modo, setModo] = useState<"clasico" | "interactivo">("interactivo");
  // Sube tras cada generación para que la tira de borradores se refresque.
  const [versionBorradores, setVersionBorradores] = useState(0);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      const start = Date.now();
      elapsedRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 500);
    } else if (elapsedRef.current) {
      window.clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
    return () => {
      if (elapsedRef.current) window.clearInterval(elapsedRef.current);
    };
  }, [loading]);

  const toggleRed = (red: RedKey) => {
    setRedes((prev) => (prev.includes(red) ? prev.filter((r) => r !== red) : [...prev, red]));
  };

  // "Escribir con IA": redacta la idea en bruto y propone el set. Cada campo se
  // aplica solo si el usuario no lo tocó mientras la IA respondía.
  const handleRedactarIdea = async () => {
    if (redactando) return;
    if (!tema.trim() && !idea.trim()) {
      setError("Escribe tu idea (aunque sea a lo bruto) para que la IA la redacte");
      return;
    }
    const temaEnviado = tema;
    const ideaEnviada = idea;
    setRedactando(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/community/descripciones/redactar-idea`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tema: tema.trim() || undefined,
          idea: idea.trim() || undefined,
          tipo_contenido: tipoContenido,
          tipo_publicacion: tipoPublicacion,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "No se pudo redactar la idea");
      const d = data.data;

      if (d.idea && idea === ideaEnviada) setIdea(d.idea);
      if (d.tema && tema === temaEnviado) setTema(d.tema);
      if (d.estilo_titular) setEstiloTitular(d.estilo_titular);
      const cambioSet = set.aplicarSugerencia(d);
      showToast(cambioSet ? "✨ Idea redactada y set sugerido (revísalo abajo)" : "✨ Idea redactada");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRedactando(false);
    }
  };

  const SORPRENDEME_HISTORY_KEY = "wm_sorprendeme_descripcion_history";
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
          contexto: tema.trim() || undefined,
          tipo_seccion: "descripcion",
          temas_recientes: recientes.slice(0, 12),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      setTema(data.data.tema);
      const nuevo = [data.data.tema, ...recientes.filter((t) => t !== data.data.tema)].slice(0, 20);
      try { localStorage.setItem(SORPRENDEME_HISTORY_KEY, JSON.stringify(nuevo)); } catch {}
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSorpresa(false);
    }
  };

  const handleGenerar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tema.trim()) return setError("Debes escribir un tema o usar Sorpréndeme");
    if (redes.length === 0) return setError("Selecciona al menos una red social");

    setLoading(true);
    setError(null);
    setResultado(null);
    setSlideActual(0);
    try {
      let cantidadFinal = tipoPublicacion === "carrusel" ? cantidadSlides : 1;
      if (tipoPublicacion === "carrusel" && cantidadAuto) {
        try {
          const calc = await fetch(`${API_BASE}/community/descripciones/calcular-slides`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tema: tema.trim() }),
          });
          const calcData = await calc.json();
          if (calcData.success) {
            cantidadFinal = calcData.data.cantidad_recomendada;
            setAutoInfo({ cantidad: cantidadFinal, razon: calcData.data.razon });
          }
        } catch (e) { console.warn("auto-cantidad falló", e); }
      } else {
        setAutoInfo(null);
      }

      const res = await fetch(`${API_BASE}/community/descripciones/generar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tema: tema.trim(),
          tipo_contenido: tipoContenido,
          redes,
          tipo_publicacion: tipoPublicacion,
          cantidad_slides: cantidadFinal,
          texto_en_imagen: textoEnImagen,
          estilo_titular: estiloTitular ?? undefined,
          idea: idea.trim() || undefined,
          ...set.payload(),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error al generar");
      setResultado(data.data);
      setVersionBorradores((v) => v + 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleReintentarSlide = async (
    slide: SlideImagen,
    modo: "imagen" | "texto" | "ambos" | "personalizado" | "auto-diagnose" = "imagen",
    promptPersonalizado?: string,
  ) => {
    if (!resultado) return;
    if (reintentando[slide.numero_slide]) return; // ya está en curso, ignorar dobles clicks
    setReintentando((prev) => ({ ...prev, [slide.numero_slide]: true }));
    setMenuOpen(null);
    setError(null);
    try {
      let imagenActualBase64: string | undefined;
      if (modo === "auto-diagnose" && slide.imagen) {
        const m = slide.imagen.match(/^data:[^;]+;base64,(.+)$/);
        if (m) imagenActualBase64 = m[1];
      }
      const res = await fetch(`${API_BASE}/community/descripciones/reintentar-slide`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tema: resultado.tema,
          tipo_contenido: resultado.tipo_contenido,
          numero_slide: slide.numero_slide,
          rol: slide.rol,
          titulo: slide.titulo,
          subtitulo: slide.subtitulo,
          formato: resultado.tipo_publicacion === "carrusel" ? "4:5" : "1:1",
          texto_en_imagen: resultado.texto_en_imagen,
          estilo_titular: resultado.estilo_titular ?? undefined,
          // El set del carrusel original: sin esto la slide regenerada salía
          // con otra luz y desentonaba con el resto de la serie.
          direccion_id: resultado.set?.direccion_id ?? DIRECCION_PREDETERMINADA,
          pose_id: resultado.set?.pose_id ?? undefined,
          utileria: resultado.set?.utileria ?? undefined,
          estilo_extra: resultado.set?.estilo_extra ?? undefined,
          total_slides: resultado.imagenes.length,
          modo,
          prompt_personalizado: promptPersonalizado,
          imagen_actual_base64: imagenActualBase64,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falló reintento");
      setResultado((prev) => prev ? {
        ...prev,
        imagenes: prev.imagenes.map((i) => i.numero_slide === slide.numero_slide ? {
          ...i,
          // si vino imagen nueva la usamos, si no conservamos la actual (modo "texto")
          imagen: data.data.imagen ?? i.imagen,
          titulo: data.data.titulo ?? i.titulo,
          subtitulo: data.data.subtitulo ?? i.subtitulo,
          error: undefined,
        } : i),
      } : prev);
      setIntentos((prev) => ({ ...prev, [slide.numero_slide]: (prev[slide.numero_slide] || 1) + 1 }));
      showToast(`✅ Slide ${slide.numero_slide} regenerada (${modo})`);
    } catch (err: any) {
      setError(`No se pudo regenerar slide ${slide.numero_slide}: ${err.message}. La versión anterior se mantiene.`);
    } finally {
      setReintentando((prev) => {
        const next = { ...prev };
        delete next[slide.numero_slide];
        return next;
      });
    }
  };

  const abrirModalAjuste = (slide: SlideImagen, modo: "imagen" | "ambos" = "imagen") => {
    setModalAjuste({ slide, modo });
    setAjusteTexto("");
    setMenuOpen(null);
  };

  const confirmarAjusteCustom = async () => {
    if (!modalAjuste || !ajusteTexto.trim()) return;
    const { slide, modo } = modalAjuste;
    const modoFinal = modo === "ambos" ? "ambos" : "personalizado";
    setModalAjuste(null);
    await handleReintentarSlide(slide, modoFinal, ajusteTexto.trim());
  };

  const copiar = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  };

  const obtenerTextoCompleto = (red: string, contenido: any) => {
    if (red === "twitter") return contenido.post_completo || "";
    return `${contenido.descripcion || ""}\n\n${contenido.hashtags || ""}`;
  };

  const descargarSlide = (slide: SlideImagen) => {
    if (!slide.imagen) return;
    const link = document.createElement("a");
    link.href = slide.imagen;
    // La extensión sale del data URL: un borrador restaurado vuelve en webp y
    // llamarlo .png haría que algunos editores lo rechacen.
    const ext = slide.imagen.startsWith("data:image/webp") ? "webp" : "png";
    link.download = `slide_${slide.numero_slide}_${Date.now()}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const descargarZip = async () => {
    if (!resultado) return;
    setZippeando(true);
    try {
      const zip = new JSZip();
      const slug = resultado.tema.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "carrusel";
      for (const slide of resultado.imagenes) {
        if (!slide.imagen) continue;
        const base64 = slide.imagen.split(",")[1];
        if (!base64) continue;
        const ext = slide.imagen.startsWith("data:image/webp") ? "webp" : "png";
        zip.file(`slide_${String(slide.numero_slide).padStart(2, "0")}_${slide.rol}.${ext}`, base64, { base64: true });
      }
      const txt = REDES
        .filter((r) => resultado.descripciones[r.value])
        .map((r) => {
          const c = resultado.descripciones[r.value]!;
          return `=== ${r.label} ===\n${r.value === "twitter" ? c.post_completo : `${c.descripcion}\n\n${c.hashtags}`}`;
        }).join("\n\n");
      zip.file("descripciones.txt", txt);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug}_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setZippeando(false);
    }
  };

  const aspecto = resultado?.tipo_publicacion === "carrusel" ? "4 / 5" : "1 / 1";
  const slidesRender: SlideImagen[] = resultado?.imagenes || [];
  const slideShown = slidesRender[slideActual];

  // En modo auto usamos la cantidad detectada por el backend (autoInfo se
  // actualiza justo antes de lanzar la generación); 5 solo como fallback.
  const slidesEsperadas = cantidadAuto ? (autoInfo?.cantidad ?? 5) : cantidadSlides;
  const skeletonCount = tipoPublicacion === "carrusel" ? slidesEsperadas : 1;

  return (
    <Layout>
      <div className="space-y-8 max-w-6xl mx-auto">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1 flex items-center gap-2">
            Generador de Publicaciones
            <HelpHint
              text="La IA crea imagen(es) y descripciones por red social a partir de un tema. 'Sorpréndeme' propone un tema o lo ajusta al contexto que ya escribiste. Si eliges Carrusel, recibirás varias slides 4:5 listas para Instagram."
              side="bottom"
            />
          </h1>
          <p className="text-muted-foreground text-sm sm:text-lg">
            Imagen + copy listos para publicar en TikTok, Instagram, YouTube Shorts y X.
          </p>
        </header>

        {/* El contenido interactivo va PRIMERO y viene marcado por defecto: es
            lo que la gente responde. La pieza clásica sigue estando para lo
            que de verdad solo se lee. */}
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: "interactivo" as const, t: "Interactivo", d: "Encuestas, quiz, retos" },
            { id: "clasico" as const, t: "Publicación clásica", d: "Imagen + copy por red" },
          ]).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModo(m.id)}
              aria-pressed={modo === m.id}
              className={`px-4 py-3 rounded-xl border-2 text-left transition ${
                modo === m.id ? "border-primary bg-primary/10" : "border-foreground/10 bg-foreground/5 hover:border-foreground/25"
              }`}
            >
              <span className="block font-semibold text-sm text-foreground">{m.t}</span>
              <span className="block text-xs text-muted-foreground">{m.d}</span>
            </button>
          ))}
        </div>

        {modo === "interactivo" && <FormatosInteractivosPanel />}

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleGenerar}
          hidden={modo !== "clasico"}
          className="glass-card rounded-2xl p-6 space-y-6 border border-foreground/10"
        >
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Tema del día</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                placeholder="Ej: 5 señales de que tu pyme necesita una tienda online"
                className="flex-1 px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleSorprendeme}
                disabled={sorpresa}
                title={tema.trim() ? "Generar idea alineada con el contexto escrito" : "Generar tema random"}
                className="bg-amber-500/90 hover:bg-amber-500 disabled:bg-amber-500/40 text-slate-900 font-bold px-4 py-3 rounded-xl transition flex items-center gap-2 whitespace-nowrap"
              >
                {sorpresa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Dices className="w-4 h-4" />}
                ¡Sorpréndeme!
              </button>
            </div>
            {tema.trim() && (
              <p className="text-xs text-muted-foreground mt-1">Sorpréndeme respetará tu contexto.</p>
            )}
          </div>

          <IdeaConIA
            valor={idea}
            onChange={setIdea}
            onRedactar={handleRedactarIdea}
            redactando={redactando}
            deshabilitado={!tema.trim() && !idea.trim()}
          />

          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">Tipo de contenido</label>
            <div className="flex flex-wrap gap-2">
              {TIPOS_CONTENIDO.map((tipo) => (
                <button
                  key={tipo.value}
                  type="button"
                  onClick={() => setTipoContenido(tipo.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    tipoContenido === tipo.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-foreground/5 text-foreground/70 hover:bg-foreground/10 border border-foreground/10"
                  }`}
                >
                  {tipo.emoji} {tipo.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">Tipo de publicación</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTipoPublicacion("unica")}
                className={`p-4 rounded-xl border-2 text-left transition ${
                  tipoPublicacion === "unica" ? "border-primary bg-primary/10" : "border-foreground/10 bg-foreground/5 hover:border-foreground/20"
                }`}
              >
                <div className="text-2xl mb-1">📄</div>
                <div className="font-semibold text-foreground">Única</div>
                <div className="text-xs text-muted-foreground mt-1">1 imagen cuadrada 1:1 (1080×1080)</div>
              </button>
              <button
                type="button"
                onClick={() => setTipoPublicacion("carrusel")}
                className={`p-4 rounded-xl border-2 text-left transition ${
                  tipoPublicacion === "carrusel" ? "border-primary bg-primary/10" : "border-foreground/10 bg-foreground/5 hover:border-foreground/20"
                }`}
              >
                <div className="text-2xl mb-1">🎠</div>
                <div className="font-semibold text-foreground">Carrusel</div>
                <div className="text-xs text-muted-foreground mt-1">3-10 slides 4:5 (1080×1350) — IG</div>
              </button>
            </div>
          </div>

          {tipoPublicacion === "carrusel" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-foreground/5 rounded-xl p-4 border border-foreground/10">
                <div>
                  <div className="text-sm font-semibold text-foreground">🤖 Cantidad automática (recomendado)</div>
                  <div className="text-xs text-muted-foreground">
                    Detecta números en el tema ("5 señales", "3 razones") y calcula portada + N + CTA.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCantidadAuto(!cantidadAuto)}
                  className={`relative w-14 h-8 rounded-full transition flex-shrink-0 ${cantidadAuto ? "bg-primary" : "bg-foreground/20"}`}
                >
                  <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${cantidadAuto ? "left-7" : "left-1"}`} />
                </button>
              </div>

              {!cantidadAuto && (
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-3">Cantidad de slides (3 a 10)</label>
                  <div className="flex flex-wrap gap-2">
                    {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCantidadSlides(n)}
                        className={`px-5 py-2 rounded-lg text-sm font-bold transition ${
                          cantidadSlides === n
                            ? "bg-primary text-primary-foreground"
                            : "bg-foreground/5 text-foreground/70 hover:bg-foreground/10 border border-foreground/10"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cantidadAuto && autoInfo && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg p-3 text-xs">
                  📊 Última detección: <strong>{autoInfo.cantidad} slides</strong> — {autoInfo.razon}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">Redes sociales</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {REDES.map((red) => (
                <button
                  key={red.value}
                  type="button"
                  onClick={() => toggleRed(red.value)}
                  className={`p-3 rounded-xl border-2 transition text-center ${
                    redes.includes(red.value) ? "border-primary bg-primary/10" : "border-foreground/10 bg-foreground/5 hover:border-foreground/20"
                  }`}
                >
                  <div className="text-2xl mb-1">{red.emoji}</div>
                  <div className="text-sm font-medium text-foreground">{red.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between bg-foreground/5 rounded-xl p-4 border border-foreground/10">
            <div>
              <div className="text-sm font-semibold text-foreground">Texto en imagen</div>
              <div className="text-xs text-muted-foreground">
                {textoEnImagen ? "Las imágenes vienen con título y subtítulo quemados encima." : "Las imágenes vienen limpias. El texto va aparte para que lo agregues en Canva/IG."}
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

          {/* Siempre visible, como en Portadas: escondido tras el interruptor,
              el estilo tipográfico de la marca era invisible. */}
          <div className={`bg-foreground/5 rounded-xl p-4 border border-foreground/10 transition-opacity ${textoEnImagen ? "" : "opacity-50"}`}>
            <EstiloTitularPicker
                estilos={set.opciones?.estilosTitular ?? null}
                value={estiloTitular}
                onChange={setEstiloTitular}
                descripcionAuto="Los títulos de las slides usan el motor de tipografía de las portadas — en automático rota entre los estilos impactantes."
              />
            {!textoEnImagen && (
              <p className="text-xs text-amber-400 mt-3">
                Enciende “Texto en imagen” para que los títulos se compongan con este estilo.
              </p>
            )}
          </div>

          <PersonalizacionSet set={set} />

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Generando contenido completo... ({elapsed}s)</>
            ) : (
              <><Sparkles className="w-5 h-5" />Generar Contenido</>
            )}
          </button>
        </motion.form>

        <TiraBorradores
          tipo="post"
          recargar={versionBorradores}
          onError={setError}
          onCargar={(d) => {
            // El borrador vuelve como resultado activo: se puede seguir
            // reintentando slides y descargando desde donde se dejó.
            setResultado({
              id: d.id,
              fecha: d.creado,
              tema: d.tema,
              tipo_contenido: d.tipo_contenido,
              tipo_publicacion: d.tipo_publicacion,
              texto_en_imagen: d.texto_en_imagen,
              estilo_titular: d.estilo_titular,
              set: d.set,
              imagenes: (d.piezas ?? d.slides_textos ?? []).map((sl: any, i: number) => ({
                numero_slide: sl.numero ?? i + 1,
                rol: sl.rol,
                titulo: sl.titulo,
                subtitulo: sl.subtitulo,
                imagen: sl.imagen ?? null,
              })),
              descripciones: d.descripciones ?? {},
            });
            setSlideActual(0);
            showToast("📂 Borrador abierto");
          }}
        />

        {!loading && !resultado && !error && (
          <EmptyState
            icon={Sparkles}
            title="Aún no has generado ninguna descripción"
            description="Escribe un tema, elige tipo de contenido y formato, y la IA generará imagen(es) + textos por red social. Tarda unos segundos."
            size="md"
          />
        )}

        {loading && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground text-center">
              Generando {tipoPublicacion === "carrusel" ? `${slidesEsperadas} slides en paralelo` : "imagen"} + descripciones... ({elapsed}s)
            </div>
            <div className={`grid gap-3 ${tipoPublicacion === "carrusel" ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-1 max-w-sm mx-auto"}`}>
              {Array.from({ length: skeletonCount }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-foreground/5 border border-foreground/10 animate-pulse flex items-center justify-center text-muted-foreground/40"
                  style={{ aspectRatio: tipoPublicacion === "carrusel" ? "4/5" : "1/1" }}
                >
                  <ImageIcon className="w-8 h-8" />
                </div>
              ))}
            </div>
          </div>
        )}

        {resultado && (
          <div className="space-y-6">
            {/* CARRUSEL / IMAGEN */}
            <div className="glass-card rounded-2xl p-6 border border-foreground/10">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-lg font-display font-bold">
                  {resultado.tipo_publicacion === "carrusel" ? `Carrusel (${slidesRender.length} slides)` : "Imagen"}
                </h2>
                <div className="flex gap-2">
                  {resultado.tipo_publicacion === "carrusel" && slidesRender.some((s) => s.imagen) && (
                    <button
                      onClick={descargarZip}
                      disabled={zippeando}
                      className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/40 text-white font-semibold px-3 py-2 rounded-lg text-sm transition flex items-center gap-2"
                    >
                      {zippeando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                      ZIP completo
                    </button>
                  )}
                </div>
              </div>

              {/* Pill global persistente: muestra TODAS las slides en regen aunque navegues */}
              {Object.keys(reintentando).length > 0 && (
                <div className="mb-3 bg-amber-500/15 border border-amber-500/40 rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap">
                  <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                  <span className="text-sm font-semibold text-amber-200">
                    Regenerando {Object.keys(reintentando).length === 1 ? "slide" : "slides"}:
                  </span>
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.keys(reintentando).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          const idx = slidesRender.findIndex((s) => s.numero_slide === Number(n));
                          if (idx >= 0) setSlideActual(idx);
                        }}
                        className="bg-amber-500/30 hover:bg-amber-500/50 text-amber-100 text-xs font-bold px-2 py-0.5 rounded-md transition"
                        title={`Ver slide ${n} mientras se regenera`}
                      >
                        #{n}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-amber-200/80 ml-auto">~10-30s c/u</span>
                </div>
              )}

              {/* Visor principal */}
              {slideShown && (
                <div className="relative max-w-md mx-auto">
                  {slideShown.imagen ? (
                    <img
                      src={slideShown.imagen}
                      alt={`Slide ${slideShown.numero_slide}`}
                      className="w-full rounded-xl shadow-2xl"
                      style={{ aspectRatio: aspecto }}
                    />
                  ) : (
                    <div
                      className="w-full rounded-xl bg-red-500/10 border-2 border-red-500/30 flex flex-col items-center justify-center gap-3 p-6 text-center"
                      style={{ aspectRatio: aspecto }}
                    >
                      <AlertCircle className="w-10 h-10 text-red-400" />
                      <p className="text-sm text-red-400">{slideShown.error || "Falló la generación"}</p>
                      <button
                        onClick={() => handleReintentarSlide(slideShown)}
                        disabled={!!reintentando[slideShown.numero_slide]}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-4 py-2 rounded-lg text-sm transition flex items-center gap-2"
                      >
                        {!!reintentando[slideShown.numero_slide] ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Reintentar slide
                      </button>
                    </div>
                  )}

                  {/* Botones de reintento overlay (esquina superior derecha) */}
                  {slideShown.imagen && (
                    <div className="absolute top-3 left-3 flex gap-1.5 z-20">
                      <button
                        type="button"
                        onClick={() => handleReintentarSlide(slideShown, "imagen")}
                        disabled={!!reintentando[slideShown.numero_slide]}
                        title="Reintentar SOLO imagen (mantiene texto)"
                        className="bg-black/70 backdrop-blur hover:bg-amber-500 hover:text-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reintentar
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMenuOpen(menuOpen === slideShown.numero_slide ? null : slideShown.numero_slide)}
                          disabled={!!reintentando[slideShown.numero_slide]}
                          title="Más opciones de reintento"
                          className="bg-black/70 backdrop-blur hover:bg-foreground/20 text-white p-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        {menuOpen === slideShown.numero_slide && (
                          <div className="absolute top-full left-0 mt-1 bg-popover text-popover-foreground border border-foreground/15 rounded-xl shadow-2xl py-1 min-w-[220px] z-30">
                            <button
                              type="button"
                              onClick={() => handleReintentarSlide(slideShown, "imagen")}
                              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-foreground/10 flex items-center gap-2"
                            >
                              <ImageIcon className="w-4 h-4 text-amber-400" />Reintentar solo imagen
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReintentarSlide(slideShown, "texto")}
                              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-foreground/10 flex items-center gap-2"
                            >
                              <Pencil className="w-4 h-4 text-blue-400" />Reintentar solo texto
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReintentarSlide(slideShown, "ambos")}
                              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-foreground/10 flex items-center gap-2"
                            >
                              <Repeat className="w-4 h-4 text-emerald-400" />Reintentar todo
                            </button>
                            <div className="border-t border-foreground/10 my-1" />
                            <button
                              type="button"
                              onClick={() => handleReintentarSlide(slideShown, "auto-diagnose")}
                              disabled={!slideShown.imagen}
                              title="Gemini Vision compara la imagen actual vs la master del zorro y aplica las correcciones automáticamente"
                              className="w-full text-left px-3 py-2 text-sm text-white bg-gradient-to-r from-emerald-600/80 to-teal-600/80 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 font-bold"
                            >
                              <Wand2 className="w-4 h-4" />Auto-diagnosticar y reintentar (IA)
                            </button>
                            <div className="border-t border-foreground/10 my-1" />
                            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Ajustes rápidos</div>
                            {RETRY_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleReintentarSlide(slideShown, "personalizado", preset.prompt)}
                                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-foreground/10 flex items-center gap-2"
                                title={preset.prompt.slice(0, 140) + "…"}
                              >
                                <span>{preset.emoji}</span>
                                <span>{preset.label}</span>
                              </button>
                            ))}
                            <div className="border-t border-foreground/10 my-1" />
                            <button
                              type="button"
                              onClick={() => abrirModalAjuste(slideShown, "imagen")}
                              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-foreground/10 flex items-center gap-2"
                            >
                              <Wand2 className="w-4 h-4 text-primary" />Escribir ajuste propio…
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Loading overlay sobre la slide en regeneración */}
                  {!!reintentando[slideShown.numero_slide] && (
                    <div className="absolute inset-0 bg-background/85 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 z-30">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <p className="text-foreground font-semibold text-sm">Regenerando slide {slideShown.numero_slide}...</p>
                      <p className="text-muted-foreground text-xs">~10-30s</p>
                    </div>
                  )}

                  {/* Aviso tras 5 intentos */}
                  {(intentos[slideShown.numero_slide] || 0) >= 5 && !reintentando[slideShown.numero_slide] && (
                    <div className="absolute bottom-3 left-3 right-3 bg-amber-500/95 text-slate-900 text-xs font-semibold px-3 py-2 rounded-lg z-20">
                      Has reintentado {intentos[slideShown.numero_slide]} veces. Prueba con un ajuste personalizado para guiar mejor al modelo.
                    </div>
                  )}

                  {slidesRender.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSlideActual((s) => Math.max(0, s - 1))}
                        disabled={slideActual === 0}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 disabled:opacity-30 text-white p-2 rounded-full transition"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSlideActual((s) => Math.min(slidesRender.length - 1, s + 1))}
                        disabled={slideActual === slidesRender.length - 1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 disabled:opacity-30 text-white p-2 rounded-full transition"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      <div className="absolute top-3 right-3 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full">
                        {slideActual + 1} / {slidesRender.length}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Info de la slide */}
              {slideShown && (
                <div className="mt-4 max-w-md mx-auto space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                      {slideShown.rol === "portada" && "🎯 Portada"}
                      {slideShown.rol === "desarrollo" && "📍 Desarrollo"}
                      {slideShown.rol === "cta" && "📣 CTA"}
                      {slideShown.rol === "unica" && "📄 Publicación única"}
                    </div>
                    {slideShown.imagen && (
                      <button
                        onClick={() => descargarSlide(slideShown)}
                        className="bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />Descargar PNG
                      </button>
                    )}
                  </div>
                  <div className="bg-foreground/5 rounded-xl p-3 border border-foreground/10 space-y-1">
                    <div className="text-foreground font-bold text-sm">{slideShown.titulo}</div>
                    <div className="text-foreground/70 text-sm">{slideShown.subtitulo}</div>
                  </div>
                </div>
              )}

              {/* Tira de miniaturas (solo carrusel) */}
              {resultado.tipo_publicacion === "carrusel" && slidesRender.length > 1 && (
                <div className="mt-4 flex gap-2 justify-center flex-wrap">
                  {slidesRender.map((slide, i) => (
                    <button
                      key={slide.numero_slide}
                      type="button"
                      onClick={() => setSlideActual(i)}
                      className={`relative rounded-lg overflow-hidden border-2 transition ${
                        i === slideActual ? "border-primary" : "border-foreground/10 hover:border-foreground/25"
                      }`}
                      style={{ width: 64, aspectRatio: "4/5" }}
                    >
                      {slide.imagen ? (
                        <img src={slide.imagen} alt="" className={`w-full h-full object-cover transition ${reintentando[slide.numero_slide] ? "opacity-30 blur-sm" : ""}`} />
                      ) : (
                        <div className="w-full h-full bg-red-500/20 flex items-center justify-center">
                          {reintentando[slide.numero_slide] ? (
                            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-400" />
                          )}
                        </div>
                      )}
                      {reintentando[slide.numero_slide] && slide.imagen && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40">
                          <Loader2 className="w-5 h-5 text-amber-400 animate-spin drop-shadow-lg" />
                        </div>
                      )}
                      <div className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] font-bold px-1 leading-tight">
                        {slide.numero_slide}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* DESCRIPCIONES */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-display font-bold">Descripciones</h2>
                <span className="text-xs text-muted-foreground">{new Date(resultado.fecha).toLocaleString("es-CL")}</span>
              </div>

              {/* El copy se generaba bien y no llegaba a ninguna parte: había que
                  bajar el ZIP, abrir el .txt y pegar red por red en el asistente
                  de videos. Aquí va directo a la publicación. */}
              <GuardarEnVideo
                textos={REDES
                  .filter((r) => resultado.descripciones[r.value])
                  .map((r) => ({
                    red: r.value,
                    texto: obtenerTextoCompleto(r.value, resultado.descripciones[r.value]!),
                  }))}
              />

              {REDES.filter((r) => resultado.descripciones[r.value]).map((red) => {
                const contenido = resultado.descripciones[red.value]!;
                const textoCompleto = obtenerTextoCompleto(red.value, contenido);
                return (
                  <motion.div
                    key={red.value}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card rounded-xl p-5 border border-foreground/10"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{red.emoji}</span>
                        <h3 className="font-bold text-foreground">{red.label}</h3>
                      </div>
                      <button
                        onClick={() => copiar(textoCompleto, red.value)}
                        className="bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                      >
                        {copiado === red.value ? <><Check className="w-3.5 h-3.5 text-emerald-400" />Copiado</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
                      </button>
                    </div>

                    {red.value === "twitter" ? (
                      <div>
                        <p className="text-foreground whitespace-pre-wrap">{contenido.post_completo}</p>
                        <p className={`text-xs mt-2 ${(contenido.post_completo || "").length > 280 ? "text-red-400 font-semibold" : "text-muted-foreground"}`}>
                          {(contenido.post_completo || "").length}/280 caracteres
                          {(contenido.post_completo || "").length > 280 && " — se pasa del límite de X"}
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-foreground whitespace-pre-wrap mb-3">{contenido.descripcion}</p>
                        <p className="text-primary text-sm font-medium">{contenido.hashtags}</p>
                      </>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal de ajuste personalizado */}
        {modalAjuste && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModalAjuste(null)}>
            <div className="bg-card text-card-foreground border border-foreground/10 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-display font-bold">Ajuste personalizado — Slide {modalAjuste.slide.numero_slide}</h3>
                <button onClick={() => setModalAjuste(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="text-xs text-muted-foreground">
                Escribe una instrucción específica. Ejemplos:
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>"Hacer el zorro más pequeño"</li>
                  <li>"Usar colores más oscuros / fondo más oscuro"</li>
                  <li>"Agregar un icono de WhatsApp"</li>
                  <li>"Pose más alegre y dinámica"</li>
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
                    onChange={(e) => setModalAjuste((prev) => prev ? { ...prev, modo: e.target.checked ? "ambos" : "imagen" } : prev)}
                    className="w-4 h-4 accent-primary"
                  />
                  Aplicar también al copy/texto
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalAjuste(null)}
                    className="bg-foreground/5 hover:bg-foreground/10 text-foreground font-semibold px-4 py-2 rounded-lg text-sm"
                  >Cancelar</button>
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

        {/* Toast feedback */}
        {toast && (
          <div className="fixed bottom-6 right-6 bg-emerald-500 text-white font-semibold px-4 py-3 rounded-xl shadow-2xl z-50 animate-in slide-in-from-bottom-4">
            {toast}
          </div>
        )}
      </div>
    </Layout>
  );
}
