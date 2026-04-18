import { useState } from "react";
import { Layout } from "@/components/layout";
import { Sparkles, Download, AlertCircle, Loader2, Dices, Copy, Check, RefreshCw, Pencil, Repeat, Settings, X, Image as ImageIcon } from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const TIPOS_HISTORIA = [
  { value: "tip_tech", label: "Tip Tech", desc: "Tips de programación y tecnología", emoji: "💡" },
  { value: "motivacional", label: "Motivacional", desc: "Frases motivacionales para devs", emoji: "🔥" },
  { value: "comunidad", label: "Comunidad", desc: "Behind scenes y comunidad", emoji: "🤝" },
];

type TextoHistoria = {
  copy_principal: string;
  sub_copy: string;
  cta: string;
  hashtags: string;
};

type Resultado = {
  id: number;
  imagen: string;
  tipo_historia: string;
  concepto: string;
  texto: TextoHistoria;
  texto_en_imagen: boolean;
  fecha: string;
};

export default function HistoriasPage() {
  const [tipoHistoria, setTipoHistoria] = useState("tip_tech");
  const [concepto, setConcepto] = useState("");
  const [textoEnImagen, setTextoEnImagen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sorpresa, setSorpresa] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [reintentando, setReintentando] = useState<string | null>(null);
  const [modalAjuste, setModalAjuste] = useState<{ modo: "imagen" | "ambos" } | null>(null);
  const [ajusteTexto, setAjusteTexto] = useState("");
  const [intentos, setIntentos] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const handleSorprendeme = async () => {
    setSorpresa(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/community/sorprendeme`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contexto: concepto.trim() || undefined,
          tipo_seccion: "historia",
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      setConcepto(data.data.tema);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSorpresa(false);
    }
  };

  const handleGenerar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concepto.trim()) {
      setError("Debes escribir un concepto o usar Sorpréndeme");
      return;
    }
    setLoading(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch(`${API_BASE}/community/historias/generar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_historia: tipoHistoria,
          concepto: concepto.trim(),
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleReintentar = async (
    modo: "imagen" | "texto" | "ambos" | "personalizado",
    promptPersonalizado?: string,
  ) => {
    if (!resultado) return;
    setReintentando(modo);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/community/historias/reintentar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_historia: resultado.tipo_historia,
          concepto: resultado.concepto,
          texto_actual: resultado.texto,
          texto_en_imagen: resultado.texto_en_imagen,
          modo,
          prompt_personalizado: promptPersonalizado,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falló reintento");
      setResultado((prev) => prev ? {
        ...prev,
        imagen: data.data.imagen ?? prev.imagen,
        texto: data.data.texto ?? prev.texto,
      } : prev);
      setIntentos((n) => n + 1);
      showToast(`✅ Historia regenerada (${modo})`);
    } catch (err: any) {
      setError(`No se pudo regenerar: ${err.message}. La versión anterior se mantiene.`);
    } finally {
      setReintentando(null);
    }
  };

  const confirmarAjusteCustom = async () => {
    if (!modalAjuste || !ajusteTexto.trim()) return;
    const modo = modalAjuste.modo === "ambos" ? "ambos" : "personalizado";
    setModalAjuste(null);
    await handleReintentar(modo, ajusteTexto.trim());
    setAjusteTexto("");
  };

  const handleDescargar = () => {
    if (!resultado?.imagen) return;
    const link = document.createElement("a");
    link.href = resultado.imagen;
    link.download = `historia_${resultado.tipo_historia}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copiar = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  };

  return (
    <Layout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Generador de Historias</h1>
          <p className="text-muted-foreground text-sm sm:text-lg">
            Crea historias diarias 9:16 con texto listo para publicar.
          </p>
        </header>

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleGenerar}
          className="glass-card rounded-2xl p-6 space-y-6 border border-white/5"
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
                      : "border-white/10 bg-white/5 hover:border-white/20"
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
                placeholder="Ej: aprende git en 1 minuto, no te rindas programando..."
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
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

          <div className="flex items-center justify-between bg-white/5 rounded-xl p-4 border border-white/10">
            <div>
              <div className="text-sm font-semibold text-foreground">Texto en imagen</div>
              <div className="text-xs text-muted-foreground">
                {textoEnImagen ? "La imagen se entregará con el texto ya quemado encima." : "La imagen vendrá limpia. Te entregamos el texto aparte para que lo agregues en Canva/IG."}
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
            className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Generando historia...</>
            ) : (
              <><Sparkles className="w-5 h-5" />Generar Historia</>
            )}
          </button>
        </motion.form>

        {resultado && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <div className="glass-card rounded-2xl p-6 border border-white/5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-lg font-display font-bold">Imagen</h2>
                <button
                  onClick={handleDescargar}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-3 py-2 rounded-lg text-sm transition flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />PNG
                </button>
              </div>
              <div className="relative max-w-xs w-full mx-auto">
                <img
                  src={resultado.imagen}
                  alt="Historia generada"
                  className="w-full rounded-xl shadow-2xl"
                  style={{ aspectRatio: "9/16" }}
                />
                {reintentando && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 z-10">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-foreground font-semibold text-sm">Regenerando...</p>
                    <p className="text-muted-foreground text-xs">~10-30s</p>
                  </div>
                )}
              </div>

              {/* Barra de acciones de reintento */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleReintentar("imagen")}
                  disabled={!!reintentando}
                  className="bg-amber-500/90 hover:bg-amber-500 disabled:bg-amber-500/40 text-slate-900 font-bold px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />Reintentar imagen
                </button>
                <button
                  onClick={() => handleReintentar("texto")}
                  disabled={!!reintentando}
                  className="bg-blue-500/90 hover:bg-blue-500 disabled:bg-blue-500/40 text-white font-bold px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center justify-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />Reintentar texto
                </button>
                <button
                  onClick={() => handleReintentar("ambos")}
                  disabled={!!reintentando}
                  className="bg-emerald-500/90 hover:bg-emerald-500 disabled:bg-emerald-500/40 text-white font-bold px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center justify-center gap-1.5"
                >
                  <Repeat className="w-3.5 h-3.5" />Reintentar todo
                </button>
                <button
                  onClick={() => { setModalAjuste({ modo: "imagen" }); setAjusteTexto(""); }}
                  disabled={!!reintentando}
                  className="bg-primary/90 hover:bg-primary disabled:bg-primary/40 text-primary-foreground font-bold px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center justify-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />Ajuste personalizado
                </button>
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

            <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-4">
              <h2 className="text-lg font-display font-bold">Texto</h2>

              {[
                { id: "copy", label: "Copy principal", value: resultado.texto.copy_principal, accent: "text-foreground font-bold text-base" },
                { id: "sub", label: "Sub-copy", value: resultado.texto.sub_copy, accent: "text-foreground/80 text-sm" },
                { id: "cta", label: "CTA", value: resultado.texto.cta, accent: "text-primary font-semibold" },
                { id: "hash", label: "Hashtags", value: resultado.texto.hashtags, accent: "text-amber-400 text-sm" },
              ].map((b) => (
                <div key={b.id} className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{b.label}</span>
                    <button
                      onClick={() => copiar(b.value, b.id)}
                      className="bg-white/5 hover:bg-white/10 text-foreground text-xs font-semibold px-2 py-1 rounded-md transition flex items-center gap-1"
                    >
                      {copiado === b.id ? <><Check className="w-3 h-3 text-emerald-400" />Copiado</> : <><Copy className="w-3 h-3" />Copiar</>}
                    </button>
                  </div>
                  <p className={`whitespace-pre-wrap ${b.accent}`}>{b.value || <span className="text-muted-foreground italic">(vacío)</span>}</p>
                </div>
              ))}

              <button
                onClick={() => {
                  const all = `${resultado.texto.copy_principal}\n\n${resultado.texto.sub_copy}\n\n${resultado.texto.cta}\n\n${resultado.texto.hashtags}`;
                  copiar(all, "todo");
                }}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-foreground text-sm font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
              >
                {copiado === "todo" ? <><Check className="w-4 h-4 text-emerald-400" />Todo copiado</> : <><Copy className="w-4 h-4" />Copiar TODO el texto</>}
              </button>
            </div>
          </motion.div>
        )}

        {/* Modal de ajuste personalizado */}
        {modalAjuste && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModalAjuste(null)}>
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-lg w-full space-y-4" onClick={(e) => e.stopPropagation()}>
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
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary min-h-[100px]"
                maxLength={400}
                autoFocus
              />
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalAjuste.modo === "ambos"}
                    onChange={(e) => setModalAjuste({ modo: e.target.checked ? "ambos" : "imagen" })}
                    className="w-4 h-4 accent-primary"
                  />
                  Aplicar también al texto
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setModalAjuste(null)} className="bg-white/5 hover:bg-white/10 text-foreground font-semibold px-4 py-2 rounded-lg text-sm">Cancelar</button>
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
