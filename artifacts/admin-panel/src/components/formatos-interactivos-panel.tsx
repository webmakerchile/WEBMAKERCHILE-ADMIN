// Selector y generador de contenido interactivo.
//
// El "tipo de contenido" de antes (tutorial / tip / reflexión / comunidad /
// lanzamiento) no cambiaba nada: los cinco producían la misma pieza con otro
// texto, y elegir uno u otro daba igual. Aquí cada formato produce una pieza
// con una FORMA distinta — y se ve antes de elegirla, en su portada.

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Download, AlertCircle, Instagram, Check } from "lucide-react";
import { PortadaFormato, type FormatoPortada } from "@/components/portada-formato";
import { useSetEstudio, PersonalizacionSet, IdeaConIA } from "@/components/personalizacion-set";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

interface Formato extends FormatoPortada {
  id: string;
  nombre: string;
  gancho: string;
  descripcion: string;
  stickerIg: string | null;
}

interface Resultado {
  id: number;
  formato: string;
  formato_nombre: string;
  sticker_ig: string | null;
  tema: string;
  relacion: string;
  imagen: string;
  contenido: Record<string, unknown>;
}

const RELACIONES = [
  { id: "9:16", etiqueta: "Historia", detalle: "9:16 · IG/TikTok", ratio: "9/16" },
  { id: "1:1", etiqueta: "Publicación", detalle: "1:1 cuadrada", ratio: "1/1" },
  { id: "4:5", etiqueta: "Feed", detalle: "4:5 vertical", ratio: "4/5" },
] as const;

export function FormatosInteractivosPanel() {
  const [formatos, setFormatos] = useState<Formato[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [tema, setTema] = useState("");
  const [idea, setIdea] = useState("");
  const [relacion, setRelacion] = useState<string>("9:16");
  const [redactando, setRedactando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const set = useSetEstudio();

  useEffect(() => {
    let vivo = true;
    fetch(`${API_BASE}/community/formatos-interactivos`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d?.success) setFormatos(d.data); })
      .catch(() => { /* sin catálogo el panel no sirve, pero no rompe la página */ });
    return () => { vivo = false; };
  }, []);

  const formatoActual = formatos.find((f) => f.id === elegido) ?? null;

  const redactar = async () => {
    if (redactando || (!tema.trim() && !idea.trim())) return;
    setRedactando(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/community/redactar-idea`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tema: tema.trim() || undefined,
          idea: idea.trim() || undefined,
          tipo_contenido: formatoActual?.nombre,
          destino: relacion === "9:16" ? "historia" : "post",
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "No se pudo redactar");
      if (d.data.idea) setIdea(d.data.idea);
      if (d.data.tema && !tema.trim()) setTema(d.data.tema);
      set.aplicarSugerencia(d.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo redactar");
    } finally {
      setRedactando(false);
    }
  };

  const generar = async () => {
    if (!elegido) { setError("Elige un formato"); return; }
    if (!tema.trim()) { setError("Escribe el tema de la pieza"); return; }
    setGenerando(true);
    setError(null);
    setResultado(null);
    try {
      const r = await fetch(`${API_BASE}/community/interactivo/generar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formato: elegido,
          tema: tema.trim(),
          idea: idea.trim() || undefined,
          relacion,
          ...set.payload(),
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "No se pudo generar");
      setResultado(d.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar");
    } finally {
      setGenerando(false);
    }
  };

  const descargar = () => {
    if (!resultado) return;
    const a = document.createElement("a");
    a.href = resultado.imagen;
    a.download = `${resultado.formato}-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-display font-bold mb-1">Contenido interactivo</h2>
        <p className="text-sm text-muted-foreground">
          Piezas con las que la gente puede hacer algo: responder, elegir, marcar. Cada formato
          tiene una forma distinta — mírala en su portada antes de elegir.
        </p>
      </div>

      {/* Las portadas: se dibujan con la MISMA geometría que compone el
          servidor, así que nunca se desfasan del resultado real. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {formatos.length === 0 && (
          <div className="col-span-full py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}
        {formatos.map((f) => {
          const activo = elegido === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setElegido(activo ? null : f.id)}
              aria-pressed={activo}
              className={`text-left rounded-2xl border-2 p-2 transition ${
                activo
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                  : "border-foreground/10 bg-card/40 hover:border-primary/40"
              }`}
            >
              <span className="relative block rounded-xl overflow-hidden">
                <PortadaFormato formato={f} nombre={f.nombre} className="w-full h-auto block" />
                {activo && (
                  <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-primary-foreground" />
                  </span>
                )}
              </span>
              <span className="block mt-2 px-1">
                <span className="block text-xs font-bold text-foreground">{f.nombre}</span>
                <span className="block text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                  {f.descripcion}
                </span>
                {f.stickerIg && (
                  <span className="mt-1 inline-flex items-center gap-1 text-[9px] text-primary">
                    <Instagram className="w-2.5 h-2.5" />
                    sticker {f.stickerIg}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {formatoActual && (
        <div className="glass-card rounded-2xl p-5 border border-foreground/10 space-y-5">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm text-foreground">
              <strong>{formatoActual.nombre}:</strong>{" "}
              <span className="text-muted-foreground">{formatoActual.gancho}</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Tema de la pieza</label>
            <input
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              maxLength={300}
              placeholder="Ej: tener página web propia vs vender solo por Instagram"
              className="w-full px-4 py-3 bg-foreground/5 border border-foreground/10 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <IdeaConIA
            valor={idea}
            onChange={setIdea}
            onRedactar={redactar}
            redactando={redactando}
            deshabilitado={!tema.trim() && !idea.trim()}
            ayuda="Cuéntale el ángulo que quieres — la IA redacta la pregunta, las opciones y el set."
          />

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Dónde se publica</label>
            <div className="grid grid-cols-3 gap-2">
              {RELACIONES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRelacion(r.id)}
                  aria-pressed={relacion === r.id}
                  className={`px-3 py-2.5 rounded-xl border text-left transition ${
                    relacion === r.id
                      ? "border-primary bg-primary/10"
                      : "border-foreground/10 bg-foreground/5 hover:border-foreground/25"
                  }`}
                >
                  <span className="block text-xs font-bold text-foreground">{r.etiqueta}</span>
                  <span className="block text-[10px] text-muted-foreground">{r.detalle}</span>
                </button>
              ))}
            </div>
          </div>

          <PersonalizacionSet set={set} />

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={generar}
            disabled={generando || !tema.trim()}
            className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            {generando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {generando ? "Creando la pieza…" : `Crear ${formatoActual.nombre.toLowerCase()}`}
          </button>
        </div>
      )}

      {resultado && (
        <div className="glass-card rounded-2xl p-5 border border-foreground/10 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-display font-bold">{resultado.formato_nombre}</h3>
            <button
              onClick={descargar}
              className="bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 text-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Descargar PNG
            </button>
          </div>

          <img
            src={resultado.imagen}
            alt={`${resultado.formato_nombre} generada`}
            className="w-full max-w-sm mx-auto rounded-xl shadow-2xl"
            style={{ aspectRatio: RELACIONES.find((r) => r.id === resultado.relacion)?.ratio }}
          />

          {/* La respuesta de verdad la recoge el sticker nativo, no la imagen:
              decirlo aquí evita publicarla esperando respuestas que no llegan. */}
          {resultado.sticker_ig && (
            <div className="flex items-start gap-2 bg-primary/10 border border-primary/25 rounded-xl px-4 py-3">
              <Instagram className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-foreground">
                Al subirla a Instagram, pega encima el sticker <strong>{resultado.sticker_ig}</strong> sobre
                el recuadro. Así la respuesta queda registrada de verdad y puedes verla en las estadísticas.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
