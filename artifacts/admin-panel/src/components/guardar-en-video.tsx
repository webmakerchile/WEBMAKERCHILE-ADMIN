// Llevar el copy generado a una publicación de verdad.
//
// `/descripciones` genera los textos por red y luego los deja en un ZIP. Ahí se
// acaba: para usarlos hay que descargar, abrir el .txt y copiar y pegar red por
// red en el asistente de videos. El copy se genera bien y no llega a ninguna
// parte, que es la queja de "sección dedicada a las descripciones de cada
// video".
//
// Esto lo guarda directamente en la publicación elegida, en la columna que le
// toca a cada red.

import { useEffect, useState } from "react";
import { Save, Check, Loader2, AlertCircle } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

interface VideoResumen {
  id: number;
  title: string;
  status: string;
  month?: string | null;
}

/**
 * A qué columna del video va cada red.
 *
 * `youtube_shorts` guarda la descripción, no el título: el título de YouTube es
 * un campo aparte y mucho más corto, y meter ahí un párrafo lo dejaría cortado.
 */
const COLUMNA: Record<string, string> = {
  tiktok: "tiktokDescription",
  instagram: "instagramDescription",
  youtube_shorts: "youtubeDescription",
  twitter: "xDescription",
};

export interface CopyPorRed {
  /** Clave de red tal como la usa /descripciones. */
  red: string;
  texto: string;
}

export function GuardarEnVideo({ textos }: { textos: CopyPorRed[] }) {
  const [videos, setVideos] = useState<VideoResumen[] | null>(null);
  const [elegido, setElegido] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`${API_BASE}/content/videos?limit=60`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        const lista: VideoResumen[] = Array.isArray(d) ? d : (d?.videos ?? []);
        // Los ya publicados no se ofrecen: cambiarles el copy no cambia nada en
        // la red y solo desincroniza el panel de lo que hay publicado.
        setVideos(lista.filter((v) => v.status !== "published" && v.status !== "uploaded"));
      })
      .catch(() => { if (vivo) setVideos([]); });
    return () => { vivo = false; };
  }, []);

  const aplicables = textos.filter((t) => COLUMNA[t.red] && t.texto.trim());

  const guardar = async () => {
    if (!elegido) return;
    setGuardando(true);
    setError(null);
    try {
      const cuerpo: Record<string, string> = {};
      for (const t of aplicables) cuerpo[COLUMNA[t.red]!] = t.texto.trim();
      const r = await fetch(`${API_BASE}/content/videos/${elegido}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(e.error || `El servidor respondió ${r.status}`);
      }
      setGuardado(true);
      setTimeout(() => setGuardado(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (aplicables.length === 0) return null;

  return (
    <div className="rounded-xl border border-foreground/10 bg-card/40 p-4 space-y-2">
      <p className="text-sm font-semibold text-foreground">Guardar en una publicación</p>
      <p className="text-xs text-muted-foreground">
        Escribe estos textos en la publicación que elijas, cada uno en su red. Así no hay que
        descargar el ZIP y copiar a mano.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={elegido ?? ""}
          onChange={(e) => setElegido(e.target.value ? Number(e.target.value) : null)}
          className="flex-1 min-w-[12rem] bg-background/50 border border-foreground/10 rounded-lg px-3 py-2 text-sm"
          aria-label="Publicación de destino"
        >
          <option value="">Elige una publicación…</option>
          {(videos ?? []).map((v) => (
            <option key={v.id} value={v.id}>{v.title || `Video #${v.id}`}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={guardar}
          disabled={!elegido || guardando}
          className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground text-sm font-semibold px-3 py-2 transition"
        >
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : guardado ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {guardado ? "Guardado" : "Guardar"}
        </button>
      </div>

      {videos !== null && videos.length === 0 && (
        <p className="text-xs text-amber-400">
          No hay publicaciones abiertas donde guardarlo. Crea una en Videos y vuelve.
        </p>
      )}
      {/* Se dice QUÉ se va a escribir: guardar en silencio sobre un copy que
          alguien ya había ajustado a mano sería peor que no ofrecerlo. */}
      <p className="text-[11px] text-muted-foreground/70">
        Se sobrescribe la descripción de: {aplicables.map((t) => t.red.replace("_", " ")).join(", ")}.
      </p>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
    </div>
  );
}
