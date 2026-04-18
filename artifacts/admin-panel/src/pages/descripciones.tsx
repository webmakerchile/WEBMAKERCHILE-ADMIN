import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Sparkles, Copy, AlertCircle, Loader2, Check, Dices, Download, ChevronLeft, ChevronRight, RefreshCw, Image as ImageIcon, FileArchive } from "lucide-react";
import { motion } from "framer-motion";
import JSZip from "jszip";

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
  imagenes: SlideImagen[];
  descripciones: Record<string, { descripcion?: string; hashtags?: string; post_completo?: string }>;
};

export default function DescripcionesPage() {
  const [tema, setTema] = useState("");
  const [tipoContenido, setTipoContenido] = useState("tip");
  const [redes, setRedes] = useState<RedKey[]>(["tiktok", "instagram", "youtube_shorts", "twitter"]);
  const [tipoPublicacion, setTipoPublicacion] = useState<"unica" | "carrusel">("unica");
  const [cantidadSlides, setCantidadSlides] = useState(3);
  const [textoEnImagen, setTextoEnImagen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [sorpresa, setSorpresa] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<number | null>(null);

  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [slideActual, setSlideActual] = useState(0);
  const [reintentando, setReintentando] = useState<number | null>(null);
  const [zippeando, setZippeando] = useState(false);

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

  const handleSorprendeme = async () => {
    setSorpresa(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/community/sorprendeme`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contexto: tema.trim() || undefined,
          tipo_seccion: "descripcion",
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      setTema(data.data.tema);
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
      const res = await fetch(`${API_BASE}/community/descripciones/generar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tema: tema.trim(),
          tipo_contenido: tipoContenido,
          redes,
          tipo_publicacion: tipoPublicacion,
          cantidad_slides: tipoPublicacion === "carrusel" ? cantidadSlides : 1,
          texto_en_imagen: textoEnImagen,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error al generar");
      setResultado(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReintentarSlide = async (slide: SlideImagen) => {
    if (!resultado) return;
    setReintentando(slide.numero_slide);
    try {
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
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falló reintento");
      setResultado((prev) => prev ? {
        ...prev,
        imagenes: prev.imagenes.map((i) => i.numero_slide === slide.numero_slide ? { ...i, imagen: data.data.imagen, error: undefined } : i),
      } : prev);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReintentando(null);
    }
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
    link.download = `slide_${slide.numero_slide}_${Date.now()}.png`;
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
        zip.file(`slide_${String(slide.numero_slide).padStart(2, "0")}_${slide.rol}.png`, base64, { base64: true });
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

  const skeletonCount = tipoPublicacion === "carrusel" ? cantidadSlides : 1;

  return (
    <Layout>
      <div className="space-y-8 max-w-6xl mx-auto">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Generador de Descripciones</h1>
          <p className="text-muted-foreground text-sm sm:text-lg">
            Imágenes + texto listo para publicar en TikTok, Instagram, YouTube Shorts y X.
          </p>
        </header>

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleGenerar}
          className="glass-card rounded-2xl p-6 space-y-6 border border-white/5"
        >
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Tema del día</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                placeholder="Ej: Cómo usar async/await en JavaScript"
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
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
                      : "bg-white/5 text-foreground/70 hover:bg-white/10 border border-white/10"
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
                  tipoPublicacion === "unica" ? "border-primary bg-primary/10" : "border-white/10 bg-white/5 hover:border-white/20"
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
                  tipoPublicacion === "carrusel" ? "border-primary bg-primary/10" : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="text-2xl mb-1">🎠</div>
                <div className="font-semibold text-foreground">Carrusel</div>
                <div className="text-xs text-muted-foreground mt-1">3-5 slides 4:5 (1080×1350) — IG</div>
              </button>
            </div>
          </div>

          {tipoPublicacion === "carrusel" && (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-3">Cantidad de slides</label>
              <div className="flex gap-2">
                {[3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCantidadSlides(n)}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition ${
                      cantidadSlides === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/5 text-foreground/70 hover:bg-white/10 border border-white/10"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
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
                    redes.includes(red.value) ? "border-primary bg-primary/10" : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="text-2xl mb-1">{red.emoji}</div>
                  <div className="text-sm font-medium text-foreground">{red.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between bg-white/5 rounded-xl p-4 border border-white/10">
            <div>
              <div className="text-sm font-semibold text-foreground">Texto en imagen</div>
              <div className="text-xs text-muted-foreground">
                {textoEnImagen ? "Las imágenes vienen con título y subtítulo quemados encima." : "Las imágenes vienen limpias. El texto va aparte para que lo agregues en Canva/IG."}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTextoEnImagen(!textoEnImagen)}
              className={`relative w-14 h-8 rounded-full transition ${textoEnImagen ? "bg-primary" : "bg-white/20"}`}
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

        {loading && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground text-center">
              Generando {tipoPublicacion === "carrusel" ? `${cantidadSlides} slides en paralelo` : "imagen"} + descripciones... ({elapsed}s)
            </div>
            <div className={`grid gap-3 ${tipoPublicacion === "carrusel" ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-1 max-w-sm mx-auto"}`}>
              {Array.from({ length: skeletonCount }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-white/5 border border-white/10 animate-pulse flex items-center justify-center text-muted-foreground/40"
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
            <div className="glass-card rounded-2xl p-6 border border-white/5">
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
                        disabled={reintentando === slideShown.numero_slide}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-4 py-2 rounded-lg text-sm transition flex items-center gap-2"
                      >
                        {reintentando === slideShown.numero_slide ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Reintentar slide
                      </button>
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
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />Descargar PNG
                      </button>
                    )}
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
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
                        i === slideActual ? "border-primary" : "border-white/10 hover:border-white/30"
                      }`}
                      style={{ width: 64, aspectRatio: "4/5" }}
                    >
                      {slide.imagen ? (
                        <img src={slide.imagen} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-red-500/20 flex items-center justify-center">
                          <AlertCircle className="w-4 h-4 text-red-400" />
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

              {REDES.filter((r) => resultado.descripciones[r.value]).map((red) => {
                const contenido = resultado.descripciones[red.value]!;
                const textoCompleto = obtenerTextoCompleto(red.value, contenido);
                return (
                  <motion.div
                    key={red.value}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card rounded-xl p-5 border border-white/5"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{red.emoji}</span>
                        <h3 className="font-bold text-foreground">{red.label}</h3>
                      </div>
                      <button
                        onClick={() => copiar(textoCompleto, red.value)}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                      >
                        {copiado === red.value ? <><Check className="w-3.5 h-3.5 text-emerald-400" />Copiado</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
                      </button>
                    </div>

                    {red.value === "twitter" ? (
                      <div>
                        <p className="text-foreground whitespace-pre-wrap">{contenido.post_completo}</p>
                        <p className="text-xs text-muted-foreground mt-2">{(contenido.post_completo || "").length}/280 caracteres</p>
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
      </div>
    </Layout>
  );
}
