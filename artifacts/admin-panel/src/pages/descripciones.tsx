import { useState } from "react";
import { Layout } from "@/components/layout";
import { Sparkles, Copy, AlertCircle, Loader2, Check } from "lucide-react";
import { motion } from "framer-motion";

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

type Resultado = {
  id: number;
  fecha: string;
  tema: string;
  tipo_contenido: string;
  contenido: Record<string, { descripcion?: string; hashtags?: string; post_completo?: string }>;
};

export default function DescripcionesPage() {
  const [tema, setTema] = useState("");
  const [tipoContenido, setTipoContenido] = useState("tip");
  const [redes, setRedes] = useState<RedKey[]>(["tiktok", "instagram", "youtube_shorts", "twitter"]);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const toggleRed = (red: RedKey) => {
    setRedes((prev) => (prev.includes(red) ? prev.filter((r) => r !== red) : [...prev, red]));
  };

  const handleGenerar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tema.trim()) return setError("Debes escribir un tema");
    if (redes.length === 0) return setError("Selecciona al menos una red social");

    setLoading(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch(`${API_BASE}/community/descripciones/generar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema: tema.trim(), tipo_contenido: tipoContenido, redes }),
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

  const copiarTexto = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  };

  const obtenerTextoCompleto = (red: string, contenido: any) => {
    if (red === "twitter") return contenido.post_completo || "";
    return `${contenido.descripcion || ""}\n\n${contenido.hashtags || ""}`;
  };

  return (
    <Layout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Generador de Descripciones</h1>
          <p className="text-muted-foreground text-sm sm:text-lg">
            Descripciones optimizadas con hashtags para TikTok, Instagram, YouTube Shorts y X.
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
            <input
              type="text"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="Ej: Cómo usar async/await en JavaScript"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
            />
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
            <label className="block text-sm font-semibold text-foreground mb-3">Redes sociales</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {REDES.map((red) => (
                <button
                  key={red.value}
                  type="button"
                  onClick={() => toggleRed(red.value)}
                  className={`p-3 rounded-xl border-2 transition text-center ${
                    redes.includes(red.value)
                      ? "border-primary bg-primary/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="text-2xl mb-1">{red.emoji}</div>
                  <div className="text-sm font-medium text-foreground">{red.label}</div>
                </button>
              ))}
            </div>
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
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generando descripciones...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generar Descripciones
              </>
            )}
          </button>
        </motion.form>

        {resultado && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-display font-bold">Descripciones generadas</h2>
              <span className="text-xs text-muted-foreground">
                {new Date(resultado.fecha).toLocaleString("es-CL")}
              </span>
            </div>

            {REDES.filter((r) => resultado.contenido[r.value]).map((red) => {
              const contenido = resultado.contenido[red.value]!;
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
                      onClick={() => copiarTexto(textoCompleto, red.value)}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                    >
                      {copiado === red.value ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copiar
                        </>
                      )}
                    </button>
                  </div>

                  {red.value === "twitter" ? (
                    <div>
                      <p className="text-foreground whitespace-pre-wrap">{contenido.post_completo}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {(contenido.post_completo || "").length}/280 caracteres
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
        )}
      </div>
    </Layout>
  );
}
