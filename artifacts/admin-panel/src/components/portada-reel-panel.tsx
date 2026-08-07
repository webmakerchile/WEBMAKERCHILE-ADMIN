// Generador de portadas para Reels dentro de Posts IA.
//
// Versión mínima del generador de Portadas (2 campos: título del video +
// descripción de la portada) para quien solo necesita una imagen vertical
// rápida, sin abrir el generador avanzado de /cover. Usa el MISMO pipeline
// de generación (por eso el resultado nunca se ve "distinto" del resto del
// sitio) a través de /community/portada-reel/generar, que además guarda el
// resultado como borrador de post — aparece en la misma tira de abajo.

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Download, AlertCircle, ImageIcon } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export interface PortadaReelResultado {
  id: number;
  titulo: string;
  descripcion: string;
  imagen: string | null;
}

interface PortadaReelPanelProps {
  /** Borrador abierto desde la tira de abajo: se muestra tal cual, sin regenerar. */
  cargada?: PortadaReelResultado | null;
  /** Avisa al padre tras generar con éxito, para refrescar la tira de borradores. */
  onGenerado?: () => void;
}

export function PortadaReelPanel({ cargada, onGenerado }: PortadaReelPanelProps) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<PortadaReelResultado | null>(null);

  // El borrador cargado reemplaza el resultado activo; se puede seguir
  // editando el título/descripción y generar una versión nueva desde ahí.
  useEffect(() => {
    if (!cargada) return;
    setResultado(cargada);
    setTitulo(cargada.titulo);
    setDescripcion(cargada.descripcion);
    setError(null);
  }, [cargada]);

  const generar = async () => {
    if (!titulo.trim() || !descripcion.trim()) {
      setError("Escribe el título del video y describe qué debe verse en la portada.");
      return;
    }
    setGenerando(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/community/portada-reel/generar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: titulo.trim(), descripcion: descripcion.trim() }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "No se pudo generar la portada");
      setResultado(d.data);
      onGenerado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar la portada");
    } finally {
      setGenerando(false);
    }
  };

  const descargar = () => {
    if (!resultado?.imagen) return;
    const a = document.createElement("a");
    a.href = resultado.imagen;
    a.download = `portada-reel-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-display font-bold mb-1">Portada para Reel</h2>
        <p className="text-sm text-muted-foreground">
          Describe qué debe verse en la portada y el título del video: la IA genera una portada
          vertical lista para Reels, con el mismo estilo visual del sitio.
        </p>
      </div>

      <div className="glass-card rounded-2xl p-5 border border-foreground/10 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Título del video</label>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={120}
            placeholder="Ej: 5 errores que matan tus ventas online"
            className="w-full px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Qué debe verse en la portada</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Ej: Webi sorprendido señalando una gráfica de ventas cayendo en una pantalla"
            className="w-full px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary resize-none"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={generar}
          disabled={generando || !titulo.trim() || !descripcion.trim()}
          className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
        >
          {generando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          {generando ? "Creando la portada…" : "Crear portada"}
        </button>
      </div>

      {resultado?.imagen && (
        <div className="glass-card rounded-2xl p-5 border border-foreground/10 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-display font-bold flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-primary" />
              {resultado.titulo}
            </h3>
            <button
              onClick={descargar}
              className="bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Descargar PNG
            </button>
          </div>

          <img
            src={resultado.imagen}
            alt={`Portada para ${resultado.titulo}`}
            className="w-full max-w-sm mx-auto rounded-xl shadow-2xl"
            style={{ aspectRatio: "9 / 16" }}
          />
        </div>
      )}
    </div>
  );
}
