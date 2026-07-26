import { useState, useEffect, useRef } from "react";
import { useGenerateCover, useGetCoverOptions, useImproveCoverIdea } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { fileToBase64 } from "@/lib/utils";
import { 
  Sparkles, Image as ImageIcon, Upload, Loader2, Download, X, AlertTriangle, RefreshCw, Settings, Wand2, SlidersHorizontal, ChevronDown
} from "lucide-react";
import { motion } from "framer-motion";
import { RETRY_PRESETS } from "@/lib/retry-presets";

const DEFAULT_REFERENCE_URL = `${import.meta.env.BASE_URL}images/fox-reference-default.png?v=2`;

export default function CoverGeneratorPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("");
  const [direccionId, setDireccionId] = useState<string | null>(null);
  const [poseId, setPoseId] = useState<string | null>(null);
  const [utileria, setUtileria] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(DEFAULT_REFERENCE_URL);
  const [isDefaultRef, setIsDefaultRef] = useState(true);
  const [customRefBase64, setCustomRefBase64] = useState<string | null>(null);
  const [defaultRefBase64, setDefaultRefBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modalAjuste, setModalAjuste] = useState(false);
  const [ajusteTexto, setAjusteTexto] = useState("");
  const [intentos, setIntentos] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const generateCover = useGenerateCover();
  const coverOptions = useGetCoverOptions();
  const improveIdea = useImproveCoverIdea();
  const direccionSeleccionada = coverOptions.data?.direcciones.find((d) => d.id === direccionId) ?? null;
  const ajustesActivos = [direccionId, poseId, utileria.trim() || null, style.trim() || null, !isDefaultRef ? "ref" : null].filter(Boolean).length;

  // Refs espejo para leer el valor MÁS RECIENTE cuando vuelve la respuesta de
  // la IA: si el usuario siguió escribiendo mientras tanto, no se le pisa el
  // texto; y un contador de secuencia descarta respuestas viejas fuera de orden.
  const titleRef = useRef(title);
  titleRef.current = title;
  const descriptionRef = useRef(description);
  descriptionRef.current = description;
  const improveSeqRef = useRef(0);
  const improvingRef = useRef(false);

  const handleImproveIdea = () => {
    if (improvingRef.current || improveIdea.isPending) return;
    const sentTitle = title.trim();
    const sentIdea = description.trim();
    if (!sentTitle && !sentIdea) return;
    const seq = ++improveSeqRef.current;
    improvingRef.current = true;
    improveIdea.mutate(
      { data: { title: sentTitle || undefined, idea: sentIdea || undefined } },
      {
        onSettled: () => {
          if (seq === improveSeqRef.current) improvingRef.current = false;
        },
        onSuccess: (r) => {
          if (seq !== improveSeqRef.current) return; // respuesta vieja: ignorar
          const ideaUntouched = descriptionRef.current.trim() === sentIdea;
          const applied = Boolean(r.idea) && ideaUntouched;
          if (applied) setDescription(r.idea);
          if (r.title && !titleRef.current.trim()) setTitle(r.title);
          setToast(applied ? "✨ Listo — la IA redactó tu idea" : "Seguiste escribiendo — mantuve tu versión");
          setTimeout(() => setToast(null), 3500);
        },
      }
    );
  };

  // Si el catálogo cambia y una selección ya no existe, volver a automático.
  useEffect(() => {
    if (!coverOptions.data) return;
    if (direccionId && !coverOptions.data.direcciones.some((d) => d.id === direccionId)) setDireccionId(null);
    if (poseId && !coverOptions.data.poses.some((p) => p.id === poseId)) setPoseId(null);
  }, [coverOptions.data, direccionId, poseId]);

  useEffect(() => {
    fetch(DEFAULT_REFERENCE_URL)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          setDefaultRefBase64(result.split(",")[1]);
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {});
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
      setIsDefaultRef(false);
      fileToBase64(file).then(b64 => {
        setCustomRefBase64(b64.split(",")[1]);
      });
    }
  };

  const handleRemoveRef = () => {
    setPreviewUrl(null);
    setIsDefaultRef(false);
    setCustomRefBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRestoreDefault = () => {
    setPreviewUrl(DEFAULT_REFERENCE_URL);
    setIsDefaultRef(true);
    setCustomRefBase64(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleGenerate = async (ajuste?: string) => {
    if (!title) return alert("El título es requerido");

    let base64: string | undefined = undefined;
    if (isDefaultRef && defaultRefBase64) {
      base64 = defaultRefBase64;
    } else if (!isDefaultRef && customRefBase64) {
      base64 = customRefBase64;
    }

    const descripcionExtendida = ajuste
      ? `${description || ""}\n\nAJUSTE EXPLÍCITO DEL USUARIO (alta prioridad): ${ajuste}`.trim()
      : description;

    generateCover.mutate(
      {
        data: {
          title,
          description: descripcionExtendida,
          style: style.trim() || undefined,
          referenceImageBase64: base64,
          direccionId: direccionId ?? undefined,
          poseId: poseId ?? undefined,
          utileria: utileria.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setIntentos((n) => n + 1);
          if (ajuste) {
            setToast(`✅ Portada regenerada con ajuste`);
            setTimeout(() => setToast(null), 3500);
          }
        },
      }
    );
  };

  const confirmarAjusteCustom = () => {
    if (!ajusteTexto.trim()) return;
    const txt = ajusteTexto.trim();
    setModalAjuste(false);
    setAjusteTexto("");
    handleGenerate(txt);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8">
        <header>
          <h1 className="text-4xl font-display font-bold text-gradient mb-2">Generador AI de Portadas</h1>
          <p className="text-muted-foreground text-lg">Cuenta tu idea con tus palabras y aprieta "Escribir con IA" — el estilo "Estudio Spotlight" de la marca se aplica solo.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            <div className="glass-card p-6 rounded-3xl space-y-5 border border-foreground/10">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Título Principal</label>
                <input 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder="Texto destacado en la miniatura..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tu idea</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[110px]"
                  placeholder="Cuéntala con tus palabras: qué quieres mostrar, qué emoción, qué elementos…"
                />
                <button
                  type="button"
                  onClick={handleImproveIdea}
                  disabled={improveIdea.isPending || (!title.trim() && !description.trim())}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {improveIdea.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {improveIdea.isPending ? "Redactando tu idea..." : "Escribir con IA"}
                </button>
                <p className="text-xs text-muted-foreground/70">
                  Escríbela a lo bruto — la IA la redacta mejor y te sugiere un título si falta.
                </p>
                {improveIdea.isError && (
                  <p className="text-xs text-red-400">
                    {(improveIdea.error as any)?.message || "No se pudo redactar la idea. Intenta de nuevo."}
                  </p>
                )}
              </div>

              <div className="border border-foreground/10 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-background/40 hover:bg-background/60 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                    Personalización del set
                    {ajustesActivos > 0 ? (
                      <span className="text-[10px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                        {ajustesActivos} activo{ajustesActivos > 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
                    )}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </button>

                {showAdvanced && (
                  <div className="p-4 space-y-5 border-t border-foreground/10">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Iluminación del estudio</label>
                      {coverOptions.isError && (
                        <p className="text-xs text-amber-400/80">No se pudieron cargar las opciones — la portada usará rotación automática.</p>
                      )}
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDireccionId(null)}
                          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition ${direccionId === null ? "border-primary bg-primary/15 text-foreground" : "border-foreground/10 bg-background/40 text-muted-foreground hover:border-foreground/30"}`}
                        >
                          <Sparkles className="w-3 h-3 shrink-0" />
                          Automática
                        </button>
                        {coverOptions.data?.direcciones.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setDireccionId(direccionId === d.id ? null : d.id)}
                            title={d.descripcion}
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition ${direccionId === d.id ? "border-primary bg-primary/15 text-foreground" : "border-foreground/10 bg-background/40 text-muted-foreground hover:border-foreground/30"}`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20" style={{ backgroundColor: d.colorAcento }} />
                            <span className="truncate">{d.nombre.replace(/^Estudio /, "")}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground/70">
                        {direccionSeleccionada ? direccionSeleccionada.descripcion : "Rota sola entre las 8 luces del estudio para que ninguna portada se repita."}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Pose de Webi</label>
                      <select
                        value={poseId ?? ""}
                        onChange={(e) => setPoseId(e.target.value || null)}
                        className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-all"
                      >
                        <option value="">Automática (según el tema)</option>
                        {coverOptions.data?.poses.map((p) => (
                          <option key={p.id} value={p.id}>{p.etiqueta}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Utilería del set</label>
                      <input
                        value={utileria}
                        onChange={(e) => setUtileria(e.target.value)}
                        className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none transition-all"
                        placeholder="Ej: un notebook abierto, una taza de café, cajas de cartón"
                      />
                      <p className="text-xs text-muted-foreground/70">
                        Se dibujan como objetos reales apoyados en el set e iluminados por el foco — nunca stickers.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Toque de estilo extra</label>
                      <input
                        value={style}
                        onChange={(e) => setStyle(e.target.value)}
                        className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none transition-all"
                        placeholder="Ej: tono más dramático, ambiente festivo…"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Imagen de referencia <span className="text-xs text-muted-foreground font-normal">(el zorro va por defecto)</span>
                      </label>
                      {previewUrl ? (
                        <div className="relative rounded-xl overflow-hidden border border-foreground/10">
                          <img src={previewUrl} alt="Referencia" className="w-full h-24 object-cover" />
                          <button
                            type="button"
                            onClick={handleRemoveRef}
                            className="absolute top-2 right-2 w-7 h-7 bg-black/70 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                          {isDefaultRef && (
                            <div className="absolute bottom-2 left-2 bg-black/60 text-xs text-white/80 px-2 py-0.5 rounded-full">
                              Zorro predeterminado
                            </div>
                          )}
                          <label className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity">
                            <span className="text-sm text-white font-medium">Cambiar imagen</span>
                            <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                          </label>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-foreground/20 hover:border-primary/50 hover:bg-primary/5 rounded-xl cursor-pointer transition-all group">
                            <Upload className="w-6 h-6 text-muted-foreground group-hover:text-primary mb-1.5 transition-colors" />
                            <span className="text-sm text-muted-foreground font-medium">Subir foto o captura</span>
                            <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                          </label>
                          <button
                            type="button"
                            onClick={handleRestoreDefault}
                            className="w-full text-xs text-primary hover:text-orange-400 transition-colors py-1"
                          >
                            Restaurar imagen del zorro predeterminada
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleGenerate()}
                disabled={generateCover.isPending || !title}
                className="w-full flex items-center justify-center px-6 py-4 bg-gradient-to-r from-primary to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl font-bold shadow-xl shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 hover:-translate-y-0.5 transition-all duration-300"
              >
                {generateCover.isPending ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5 mr-2" />
                )}
                {generateCover.isPending ? "Generando Magia..." : "Generar Portada"}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="glass-card rounded-3xl h-full min-h-[500px] border border-foreground/10 flex flex-col items-center justify-center p-8 relative overflow-hidden">
              {!generateCover.data && !generateCover.isPending && (
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none flex items-center justify-center">
                  <img src={`${import.meta.env.BASE_URL}images/auth-bg.png`} alt="Background" className="w-full h-full object-cover" />
                </div>
              )}

              {generateCover.isPending ? (
                <div className="flex flex-col items-center relative z-10">
                  <div className="w-20 h-20 relative">
                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <p className="mt-6 text-lg font-medium text-foreground animate-pulse">Gemini está creando tu portada...</p>
                  <p className="mt-2 text-sm text-muted-foreground/60">Esto puede tomar hasta 30 segundos</p>
                </div>
              ) : generateCover.isError ? (
                <div className="flex flex-col items-center relative z-10 text-center px-4">
                  <AlertTriangle className="w-16 h-16 text-orange-400 mb-4" />
                  <h3 className="text-xl font-medium text-foreground mb-2">Error al generar</h3>
                  <p className="text-sm text-muted-foreground/80 mb-6 max-w-sm">
                    {(generateCover.error as any)?.message || "No se pudo generar la portada. Intenta de nuevo."}
                  </p>
                  <button
                    onClick={() => handleGenerate()}
                    className="flex items-center px-6 py-3 bg-gradient-to-r from-primary to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <RefreshCw className="w-5 h-5 mr-2" />
                    Reintentar
                  </button>
                </div>
              ) : generateCover.data ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full relative z-10 space-y-4"
                >
                  <div className="rounded-2xl overflow-hidden shadow-2xl border border-foreground/10">
                    <img 
                      src={`data:${generateCover.data.mimeType};base64,${generateCover.data.b64_json}`} 
                      alt="Generated Cover" 
                      className="w-full h-auto aspect-video object-cover"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <a 
                      href={`data:${generateCover.data.mimeType};base64,${generateCover.data.b64_json}`} 
                      download={`portada-${title || "webmakerchile"}.png`}
                      className="flex items-center justify-center px-4 py-3 bg-gradient-to-r from-primary to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all duration-300"
                    >
                      <Download className="w-5 h-5 mr-2" />
                      Descargar
                    </a>
                    <button
                      onClick={() => handleGenerate()}
                      disabled={generateCover.isPending}
                      className="flex items-center justify-center px-4 py-3 bg-amber-500/90 hover:bg-amber-500 disabled:bg-amber-500/40 text-slate-900 rounded-xl font-bold transition-all"
                    >
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Reintentar
                    </button>
                    <button
                      onClick={() => { setModalAjuste(true); setAjusteTexto(""); }}
                      disabled={generateCover.isPending}
                      className="flex items-center justify-center px-4 py-3 bg-foreground/10 hover:bg-foreground/20 disabled:bg-foreground/5 text-foreground rounded-xl font-bold transition-all"
                    >
                      <Settings className="w-5 h-5 mr-2" />
                      Ajustar
                    </button>
                  </div>
                  {/* Ajustes rápidos predefinidos */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5 flex items-center gap-1.5">
                      <Wand2 className="w-3 h-3" />Ajustes rápidos
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {RETRY_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handleGenerate(preset.prompt)}
                          disabled={generateCover.isPending}
                          title={preset.prompt.slice(0, 140) + "…"}
                          className="bg-foreground/5 hover:bg-primary hover:text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed text-foreground text-[11px] font-medium px-2 py-1 rounded-md border border-foreground/10 transition flex items-center gap-1"
                        >
                          <span>{preset.emoji}</span>{preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {intentos >= 5 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-lg px-3 py-2">
                      Has reintentado {intentos} veces. Prueba con un ajuste personalizado para guiar mejor al modelo.
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="text-center relative z-10">
                  <ImageIcon className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-muted-foreground">Tu portada aparecerá aquí</h3>
                  <p className="text-sm text-muted-foreground/60 mt-2 max-w-sm mx-auto">
                    Completa los detalles a la izquierda y presiona generar para ver el resultado de la IA.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {modalAjuste && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setModalAjuste(false)}
          >
            <div
              className="glass-card w-full max-w-md rounded-2xl border border-foreground/10 p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                Ajustar portada
              </h3>
              <p className="text-sm text-muted-foreground">
                Describe qué quieres cambiar y se regenera con tu indicación como máxima prioridad.
              </p>
              <textarea
                value={ajusteTexto}
                onChange={(e) => setAjusteTexto(e.target.value)}
                autoFocus
                className="w-full bg-background/50 border border-foreground/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary outline-none min-h-[90px]"
                placeholder="Ej: que el zorro mire de frente, menos objetos en la mesa…"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setModalAjuste(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-foreground/10 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarAjusteCustom}
                  disabled={!ajusteTexto.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-orange-500 text-white disabled:opacity-40 transition"
                >
                  Regenerar
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background/90 border border-primary/30 text-foreground text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl backdrop-blur">
            {toast}
          </div>
        )}
      </div>
    </Layout>
  );
}
