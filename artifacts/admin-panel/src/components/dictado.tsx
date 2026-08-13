import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Loader2, Trash2, X } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export type PrioridadDictada = "crítica" | "alta" | "media" | "baja";

export interface ItemDictado {
  title: string;
  description?: string;
  notes?: string;
  area?: string;
  priority: PrioridadDictada;
  projectRef?: string | null;
}

interface Props {
  /** "tickets" o "tareas": define el endpoint y como se lee la propuesta. */
  tipo: "tickets" | "tareas";
  /** Etiqueta legible del destino de cada item (area o proyecto). */
  etiquetaDestino: (item: ItemDictado) => string;
  /** Crea los items confirmados. Debe resolver cuando ya estan creados. */
  onCrear: (items: ItemDictado[]) => Promise<void>;
  botonClassName?: string;
}

const PRIORIDAD_COLOR: Record<PrioridadDictada, string> = {
  "crítica": "text-red-400 border-red-400/40",
  alta: "text-orange-400 border-orange-400/40",
  media: "text-yellow-400 border-yellow-400/40",
  baja: "text-sky-400 border-sky-400/40",
};

/**
 * Dicta y crea varios items de una vez.
 *
 * Graba -> transcribe -> la IA parte el dictado en items ya derivados ->
 * se revisan (se puede editar el titulo o sacar los que sobren) -> se crean.
 */
export function Dictado({ tipo, etiquetaDestino, onCrear, botonClassName }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripcion, setTranscripcion] = useState("");
  const [items, setItems] = useState<ItemDictado[]>([]);
  const [segundos, setSegundos] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cronoRef = useRef<number | null>(null);

  const soportado =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    return () => {
      if (cronoRef.current) window.clearInterval(cronoRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function reiniciar() {
    setItems([]);
    setTranscripcion("");
    setError(null);
    setSegundos(0);
  }

  async function empezar() {
    reiniciar();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void enviar(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
      };
      recorderRef.current = rec;
      rec.start();
      setGrabando(true);
      cronoRef.current = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch {
      setError("No se pudo abrir el microfono. Revisa los permisos del navegador.");
    }
  }

  function parar() {
    if (cronoRef.current) {
      window.clearInterval(cronoRef.current);
      cronoRef.current = null;
    }
    setGrabando(false);
    recorderRef.current?.stop();
  }

  async function enviar(audio: Blob) {
    if (audio.size < 1200) {
      setError("El audio quedo demasiado corto. Manten presionado y habla un poco mas.");
      return;
    }
    setProcesando(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", audio, "dictado.webm");
      const r = await fetch(`${API_BASE}/dictado/${tipo}`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = (await r.json().catch(() => ({}))) as {
        texto?: string;
        items?: ItemDictado[];
        error?: string;
      };
      if (!r.ok) throw new Error(data.error || "No se pudo procesar el dictado.");
      setTranscripcion(data.texto ?? "");
      setItems(data.items ?? []);
      if (!data.items?.length) {
        setError("No se entendio ningun encargo concreto en el audio. Proba de nuevo.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar el dictado.");
    } finally {
      setProcesando(false);
    }
  }

  async function confirmar() {
    setCreando(true);
    setError(null);
    try {
      await onCrear(items);
      setAbierto(false);
      reiniciar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron crear.");
    } finally {
      setCreando(false);
    }
  }

  if (!soportado) return null;

  const sustantivo = tipo === "tickets" ? "ticket" : "tarea";

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={botonClassName}
        onClick={() => setAbierto(true)}
        data-testid={`button-dictar-${tipo}`}
      >
        <Mic className="w-4 h-4 mr-1.5" />
        Dictar
      </Button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Dictar {tipo}</h2>
                <p className="text-sm text-muted-foreground">
                  Habla de corrido. Cada encargo se convierte en un {sustantivo} aparte, ya derivado.
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (grabando) parar();
                  setAbierto(false);
                  reiniciar();
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              {grabando ? (
                <Button onClick={parar} variant="destructive" data-testid="button-parar-dictado">
                  <Square className="w-4 h-4 mr-2" />
                  Parar ({segundos}s)
                </Button>
              ) : (
                <Button onClick={empezar} disabled={procesando} data-testid="button-grabar-dictado">
                  {procesando ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mic className="w-4 h-4 mr-2" />
                  )}
                  {procesando ? "Procesando..." : items.length ? "Grabar de nuevo" : "Grabar"}
                </Button>
              )}
              {grabando && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Escuchando
                </span>
              )}
            </div>

            {error && (
              <p className="mb-4 rounded-md border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-300">
                {error}
              </p>
            )}

            {transcripcion && (
              <p className="mb-4 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground italic">
                "{transcripcion}"
              </p>
            )}

            {items.length > 0 && (
              <div className="space-y-2 mb-4">
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border p-3"
                    data-testid={`item-dictado-${i}`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-transparent focus:border-border"
                        value={item.title}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                          )
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="Quitar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{etiquetaDestino(item)}</Badge>
                      <Badge variant="outline" className={PRIORIDAD_COLOR[item.priority]}>
                        {item.priority}
                      </Badge>
                    </div>
                    {(item.description || item.notes) && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.description || item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <Button
                className="w-full"
                onClick={confirmar}
                disabled={creando}
                data-testid="button-confirmar-dictado"
              >
                {creando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear {items.length} {items.length === 1 ? sustantivo : `${sustantivo}s`}
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
