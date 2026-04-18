// frontend/GeneradorHistorias.jsx
// Componente React para generar historias (stories) de WebMakerLatam

import { useState } from "react";

const TIPOS_HISTORIA = [
  {
    value: "tip_tech",
    label: "💡 Tip Tech",
    desc: "Tips de programación y tecnología",
  },
  {
    value: "motivacional",
    label: "🔥 Motivacional",
    desc: "Frases motivacionales para devs",
  },
  {
    value: "comunidad",
    label: "🤝 Comunidad",
    desc: "Behind scenes y comunidad",
  },
];

export default function GeneradorHistorias() {
  const [tipoHistoria, setTipoHistoria] = useState("tip_tech");
  const [concepto, setConcepto] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  const handleGenerar = async (e) => {
    e.preventDefault();
    if (!concepto.trim()) {
      setError("Debes escribir un concepto");
      return;
    }

    setLoading(true);
    setError(null);
    setResultado(null);

    try {
      const res = await fetch("/api/historias/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_historia: tipoHistoria,
          concepto: concepto.trim(),
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Error al generar");
      }

      setResultado(data.data);
    } catch (err) {
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
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-orange-500 mb-2">
          🦊 Generador de Historias
        </h1>
        <p className="text-slate-400">
          Crea historias diarias para mantener viva la comunidad WebMakerLatam
        </p>
      </div>

      <form
        onSubmit={handleGenerar}
        className="bg-slate-800 rounded-xl p-6 space-y-5 border border-slate-700"
      >
        {/* Tipo de historia */}
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-3">
            Tipo de historia
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TIPOS_HISTORIA.map((tipo) => (
              <button
                key={tipo.value}
                type="button"
                onClick={() => setTipoHistoria(tipo.value)}
                className={`p-4 rounded-lg border-2 text-left transition ${
                  tipoHistoria === tipo.value
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <div className="font-semibold text-white">{tipo.label}</div>
                <div className="text-xs text-slate-400 mt-1">{tipo.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Concepto */}
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-2">
            Concepto clave
          </label>
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: aprende git en 1 minuto, no te rindas programando..."
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
            maxLength={120}
          />
          <p className="text-xs text-slate-500 mt-1">
            {concepto.length}/120 caracteres. La IA adaptará la escena al concepto.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition"
        >
          {loading ? "🎨 Generando historia..." : "✨ Generar Historia"}
        </button>
      </form>

      {/* Resultado */}
      {resultado && (
        <div className="mt-8 bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Historia generada</h2>
            <button
              onClick={handleDescargar}
              className="bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
            >
              ⬇️ Descargar PNG
            </button>
          </div>

          <div className="flex justify-center">
            <img
              src={resultado.imagen}
              alt="Historia generada"
              className="max-w-sm rounded-lg shadow-2xl"
              style={{ aspectRatio: "9/16" }}
            />
          </div>

          <div className="mt-4 text-sm text-slate-400 space-y-1">
            <p>
              <span className="text-slate-500">Tipo:</span>{" "}
              {resultado.tipo_historia}
            </p>
            <p>
              <span className="text-slate-500">Concepto:</span>{" "}
              {resultado.concepto}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              💡 Las zonas superior e inferior quedaron limpias para que agregues
              texto overlay en Canva, Figma o la app de la red social.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
