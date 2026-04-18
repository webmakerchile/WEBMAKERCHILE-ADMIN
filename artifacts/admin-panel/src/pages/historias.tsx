import { useState } from "react";
import { Layout } from "@/components/layout";
import { Sparkles, Download, AlertCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const TIPOS_HISTORIA = [
  { value: "tip_tech", label: "Tip Tech", desc: "Tips de programación y tecnología", emoji: "💡" },
  { value: "motivacional", label: "Motivacional", desc: "Frases motivacionales para devs", emoji: "🔥" },
  { value: "comunidad", label: "Comunidad", desc: "Behind scenes y comunidad", emoji: "🤝" },
];

type Resultado = {
  id: number;
  imagen: string;
  tipo_historia: string;
  concepto: string;
  fecha: string;
};

export default function HistoriasPage() {
  const [tipoHistoria, setTipoHistoria] = useState("tip_tech");
  const [concepto, setConcepto] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concepto.trim()) {
      setError("Debes escribir un concepto");
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
        body: JSON.stringify({ tipo_historia: tipoHistoria, concepto: concepto.trim() }),
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

  const handleDescargar = () => {
    if (!resultado?.imagen) return;
    const link = document.createElement("a");
    link.href = resultado.imagen;
    link.download = `historia_${resultado.tipo_historia}_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Layout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Generador de Historias</h1>
          <p className="text-muted-foreground text-sm sm:text-lg">
            Crea historias diarias 9:16 para mantener viva la comunidad.
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
            <input
              type="text"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej: aprende git en 1 minuto, no te rindas programando..."
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {concepto.length}/120 caracteres. La IA adaptará la escena al concepto.
            </p>
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
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generando historia...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generar Historia
              </>
            )}
          </button>
        </motion.form>

        {resultado && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl p-6 border border-white/5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-bold">Historia generada</h2>
              <button
                onClick={handleDescargar}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Descargar PNG
              </button>
            </div>

            <div className="flex justify-center">
              <img
                src={resultado.imagen}
                alt="Historia generada"
                className="max-w-sm w-full rounded-xl shadow-2xl"
                style={{ aspectRatio: "9/16" }}
              />
            </div>

            <div className="mt-4 text-sm text-muted-foreground space-y-1">
              <p><span className="text-foreground/60">Tipo:</span> {resultado.tipo_historia}</p>
              <p><span className="text-foreground/60">Concepto:</span> {resultado.concepto}</p>
              <p className="text-xs mt-3 italic">
                Las zonas superior e inferior quedaron limpias para overlay de texto en Canva, Figma o la app de la red social.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
