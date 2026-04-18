// frontend/GeneradorDescripciones.jsx
// Componente React para generar descripciones diarias con hashtags para 4 redes

import { useState } from "react";

const TIPOS_CONTENIDO = [
  { value: "tutorial", label: "📚 Tutorial" },
  { value: "tip", label: "💡 Tip rápido" },
  { value: "reflexion", label: "🤔 Reflexión" },
  { value: "comunidad", label: "🤝 Comunidad" },
  { value: "lanzamiento", label: "🚀 Lanzamiento" },
];

const REDES_DISPONIBLES = [
  { value: "tiktok", label: "TikTok", icon: "📱", color: "bg-pink-500" },
  { value: "instagram", label: "Instagram", icon: "📸", color: "bg-purple-500" },
  {
    value: "youtube_shorts",
    label: "YouTube Shorts",
    icon: "▶️",
    color: "bg-red-500",
  },
  { value: "twitter", label: "X / Twitter", icon: "🐦", color: "bg-slate-700" },
];

export default function GeneradorDescripciones() {
  const [tema, setTema] = useState("");
  const [tipoContenido, setTipoContenido] = useState("tip");
  const [redesSeleccionadas, setRedesSeleccionadas] = useState([
    "tiktok",
    "instagram",
    "youtube_shorts",
    "twitter",
  ]);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [copiado, setCopiado] = useState(null);

  const toggleRed = (red) => {
    setRedesSeleccionadas((prev) =>
      prev.includes(red) ? prev.filter((r) => r !== red) : [...prev, red]
    );
  };

  const handleGenerar = async (e) => {
    e.preventDefault();
    if (!tema.trim()) {
      setError("Debes escribir un tema");
      return;
    }
    if (redesSeleccionadas.length === 0) {
      setError("Selecciona al menos una red social");
      return;
    }

    setLoading(true);
    setError(null);
    setResultado(null);

    try {
      const res = await fetch("/api/descripciones/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tema: tema.trim(),
          tipo_contenido: tipoContenido,
          redes: redesSeleccionadas,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error al generar");

      setResultado(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copiarTexto = (texto, id) => {
    navigator.clipboard.writeText(texto);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  };

  const obtenerTextoCompleto = (red, contenido) => {
    if (red === "twitter") return contenido.post_completo;
    return `${contenido.descripcion}\n\n${contenido.hashtags}`;
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-orange-500 mb-2">
          📝 Generador de Descripciones Diarias
        </h1>
        <p className="text-slate-400">
          Descripciones optimizadas con hashtags para mantener viva la comunidad
        </p>
      </div>

      <form
        onSubmit={handleGenerar}
        className="bg-slate-800 rounded-xl p-6 space-y-5 border border-slate-700"
      >
        {/* Tema */}
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-2">
            Tema del día
          </label>
          <input
            type="text"
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="Ej: Cómo usar async/await en JavaScript"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>

        {/* Tipo de contenido */}
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-3">
            Tipo de contenido
          </label>
          <div className="flex flex-wrap gap-2">
            {TIPOS_CONTENIDO.map((tipo) => (
              <button
                key={tipo.value}
                type="button"
                onClick={() => setTipoContenido(tipo.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tipoContenido === tipo.value
                    ? "bg-orange-500 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {tipo.label}
              </button>
            ))}
          </div>
        </div>

        {/* Redes */}
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-3">
            Redes sociales
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {REDES_DISPONIBLES.map((red) => (
              <button
                key={red.value}
                type="button"
                onClick={() => toggleRed(red.value)}
                className={`p-3 rounded-lg border-2 transition ${
                  redesSeleccionadas.includes(red.value)
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <div className="text-2xl mb-1">{red.icon}</div>
                <div className="text-sm font-medium text-white">
                  {red.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition"
        >
          {loading ? "✍️ Generando descripciones..." : "✨ Generar Descripciones"}
        </button>
      </form>

      {/* Resultados */}
      {resultado && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">
              Descripciones generadas
            </h2>
            <span className="text-xs text-slate-500">
              {new Date(resultado.fecha).toLocaleString("es-CL")}
            </span>
          </div>

          {REDES_DISPONIBLES.filter((r) =>
            resultado.contenido[r.value]
          ).map((red) => {
            const contenido = resultado.contenido[red.value];
            const textoCompleto = obtenerTextoCompleto(red.value, contenido);

            return (
              <div
                key={red.value}
                className="bg-slate-800 rounded-xl p-5 border border-slate-700"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{red.icon}</span>
                    <h3 className="font-bold text-white">{red.label}</h3>
                  </div>
                  <button
                    onClick={() => copiarTexto(textoCompleto, red.value)}
                    className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                  >
                    {copiado === red.value ? "✅ Copiado" : "📋 Copiar"}
                  </button>
                </div>

                {red.value === "twitter" ? (
                  <div>
                    <p className="text-slate-200 whitespace-pre-wrap">
                      {contenido.post_completo}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      {contenido.post_completo.length}/280 caracteres
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-slate-200 whitespace-pre-wrap mb-3">
                      {contenido.descripcion}
                    </p>
                    <p className="text-orange-400 text-sm font-medium">
                      {contenido.hashtags}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
