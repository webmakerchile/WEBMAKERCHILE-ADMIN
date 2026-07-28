import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, Upload, Copy, Download, RotateCcw, Trash2, Check, Loader2,
  FileAudio, Archive, AlertTriangle, Search, X, Clock, Play,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { useLang } from "@/lib/lang";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type FileStatus = "pendiente" | "procesando" | "listo" | "error";

interface QueueItem {
  id: string;
  /** Ausente al restaurar de disco: el navegador no puede reconstruir un File. */
  file?: File;
  nombre: string;
  bytes: number;
  status: FileStatus;
  text?: string;
  error?: string;
  /** true cuando reintentar no sirve hasta que alguien cambie algo. */
  bloqueante?: boolean;
  /** Segundos que tardó (lo informa el servidor). */
  segundos?: number;
  /** Marca de tiempo del inicio, para el contador en vivo. */
  inicio?: number;
}

const ACCEPT = "audio/*,video/mp4,video/webm,.mp3,.m4a,.ogg,.wav,.opus,.aac,.flac,.webm,.mp4";
const CONCURRENCY = 2;
// Debe coincidir con el límite de multer en api-server/routes/transcriber.
const MAX_FILE_MB = 150;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALMACEN = "wm_transcripciones";

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function formatoDuracion(seg: number): string {
  if (seg < 60) return `${seg}s`;
  return `${Math.floor(seg / 60)}m ${String(seg % 60).padStart(2, "0")}s`;
}

function palabras(texto: string): number {
  const t = texto.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Contador en vivo: aislado para no re-renderizar la lista entera cada segundo. */
function Cronometro({ desde }: { desde: number }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="tabular-nums">{formatoDuracion(Math.max(0, Math.round((ahora - desde) / 1000)))}</span>;
}

export default function TranscriptorPage() {
  const { t } = useLang();
  const [items, setItems] = useState<QueueItem[]>(() => {
    // Las transcripciones sobreviven a un refresco. Antes se perdían enteras
    // al recargar, que es lo peor que puede pasar tras esperar varios minutos.
    try {
      const guardado = JSON.parse(localStorage.getItem(ALMACEN) || "[]");
      if (Array.isArray(guardado)) {
        return guardado
          .filter((g: any) => g?.status === "listo" && typeof g.text === "string")
          .slice(0, 40);
      }
    } catch { /* almacenamiento corrupto: se empieza limpio */ }
    return [];
  });
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [health, setHealth] = useState<"ok" | "no-key" | "down" | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>(items);
  itemsRef.current = items;
  const runningRef = useRef(false);
  /**
   * Ids ya tomados por un worker.
   *
   * NO puede vivir en `itemsRef`: esa referencia se reasigna en CADA render
   * (`itemsRef.current = items`), así que la marca "procesando" que ponía un
   * worker desaparecía en cuanto cualquier otra cosa provocaba un render — y
   * entonces los dos workers tomaban el mismo archivo y se transcribía dos
   * veces, gastando cuota. Un Set aparte no lo pisa nadie.
   */
  const tomados = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelado = false;
    fetch(`${API_BASE}/transcriber/health`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { groqConfigured?: boolean };
        if (!cancelado) setHealth(data.groqConfigured ? "ok" : "no-key");
      })
      .catch(() => { if (!cancelado) setHealth("down"); });
    return () => { cancelado = true; };
  }, []);

  // Persistir solo lo terminado: una cola a medias restaurada no serviría de
  // nada porque el navegador no puede reconstruir el File original.
  useEffect(() => {
    try {
      const listos = items
        .filter((it) => it.status === "listo")
        .slice(-40)
        .map(({ id, nombre, bytes, status, text, segundos }) => ({ id, nombre, bytes, status, text, segundos }));
      localStorage.setItem(ALMACEN, JSON.stringify(listos));
    } catch { /* cuota llena: no vale romper la página por el guardado */ }
  }, [items]);

  const healthWarning =
    health === "no-key" ? t.transcriberNoKey : health === "down" ? t.transcriberUnavailable : null;

  const addFiles = useCallback((files: FileList | File[]) => {
    const nuevos: QueueItem[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      nombre: file.name,
      bytes: file.size,
      ...(file.size > MAX_FILE_BYTES
        ? { status: "error" as const, error: t.transcriberFileTooBig(file.name, (file.size / 1048576).toFixed(1)) }
        : { status: "pendiente" as const }),
    }));
    setItems((prev) => [...prev, ...nuevos]);
  }, [t]);

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const transcribeOne = async (item: QueueItem) => {
    if (!item.file) {
      updateItem(item.id, { status: "error", error: "El archivo ya no está disponible. Vuelve a subirlo." });
      return;
    }
    if (item.bytes > MAX_FILE_BYTES) {
      updateItem(item.id, {
        status: "error",
        error: t.transcriberFileTooBig(item.nombre, (item.bytes / 1048576).toFixed(1)),
      });
      return;
    }
    updateItem(item.id, { status: "procesando", error: undefined, inicio: Date.now() });
    try {
      const form = new FormData();
      form.append("audio", item.file);
      const res = await fetch(`${API_BASE}/transcriber/transcribe`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const e = new Error(data.error || `Error ${res.status}`);
        (e as any).bloqueante = Boolean(data.requiereIntervencion);
        throw e;
      }
      updateItem(item.id, { status: "listo", text: data.text || "", segundos: data.segundos, inicio: undefined });
    } catch (err) {
      updateItem(item.id, {
        status: "error",
        error: (err as Error).message,
        bloqueante: Boolean((err as any)?.bloqueante),
        inicio: undefined,
      });
    } finally {
      tomados.current.delete(item.id);
    }
  };

  const runQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      for (;;) {
        const siguiente = () =>
          itemsRef.current.find((it) => it.status === "pendiente" && !tomados.current.has(it.id));
        if (!siguiente()) break;
        const workers = Array.from({ length: CONCURRENCY }, async () => {
          for (;;) {
            const next = siguiente();
            if (!next) break;
            tomados.current.add(next.id); // reserva síncrona, inmune a los renders
            await transcribeOne(next);
          }
        });
        await Promise.all(workers);
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  const retry = (item: QueueItem) => {
    updateItem(item.id, { status: "pendiente", error: undefined, bloqueante: undefined });
    // Si la cola sigue viva, su bucle exterior lo recogerá; si no, arranca.
    setTimeout(() => { void runQueue(); }, 0);
  };

  const reintentarFallidos = () => {
    setItems((prev) =>
      prev.map((it) =>
        it.status === "error" && it.file && !it.bloqueante
          ? { ...it, status: "pendiente" as const, error: undefined }
          : it,
      ),
    );
    setTimeout(() => { void runQueue(); }, 0);
  };

  const copyAll = async () => {
    const listos = items.filter((it) => it.status === "listo");
    if (listos.length === 0) return;
    await navigator.clipboard.writeText(
      listos.map((it) => `--- ${it.nombre} ---\n\n${(it.text || "").trim()}`).join("\n\n\n"),
    );
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  const copyText = async (item: QueueItem) => {
    await navigator.clipboard.writeText(item.text || "");
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const downloadTxt = (item: QueueItem) => {
    const blob = new Blob([item.text || ""], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${baseName(item.nombre)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadZip = async () => {
    const listos = items.filter((it) => it.status === "listo");
    if (listos.length === 0) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const it of listos) zip.file(`${baseName(it.nombre)}.txt`, it.text || "");
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "transcripciones.zip";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const removeItem = (id: string) => {
    tomados.current.delete(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  };
  const clearAll = () => setItems((prev) => prev.filter((it) => it.status === "procesando"));

  const pendientes = items.filter((it) => it.status === "pendiente").length;
  const listos = items.filter((it) => it.status === "listo").length;
  const fallidos = items.filter((it) => it.status === "error" && it.file && !it.bloqueante).length;
  const procesando = items.filter((it) => it.status === "procesando").length;

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) => it.nombre.toLowerCase().includes(q) || (it.text || "").toLowerCase().includes(q),
    );
  }, [items, busqueda]);

  const totalPalabras = useMemo(
    () => items.filter((it) => it.status === "listo").reduce((n, it) => n + palabras(it.text || ""), 0),
    [items],
  );

  const ESTADOS: Record<FileStatus, { texto: string; clase: string }> = {
    pendiente: { texto: "En cola", clase: "bg-foreground/10 text-muted-foreground" },
    procesando: { texto: "Transcribiendo", clase: "bg-primary/15 text-primary" },
    listo: { texto: "Listo", clase: "bg-emerald-500/15 text-emerald-500" },
    error: { texto: "Error", clase: "bg-red-500/15 text-red-500" },
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1 flex items-center gap-3">
              <AudioLines className="w-8 h-8 text-primary" /> Transcriptor de Audios
            </h1>
            <p className="text-sm text-muted-foreground">
              Whisper large-v3-turbo · español · lo que pese más de 24 MB se comprime solo antes de enviarlo
            </p>
          </div>
          {listos > 0 && (
            <div className="flex gap-4 text-right">
              <div>
                <div className="text-xl font-bold text-foreground tabular-nums">{listos}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">transcritos</div>
              </div>
              <div>
                <div className="text-xl font-bold text-foreground tabular-nums">{totalPalabras.toLocaleString("es-CL")}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">palabras</div>
              </div>
            </div>
          )}
        </header>

        {healthWarning && (
          <div
            className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400"
            data-testid="banner-transcriber-health"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{healthWarning}</p>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
          data-testid="dropzone-audios"
        >
          <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold mb-1">Arrastra tus audios aquí</p>
          <p className="text-sm text-muted-foreground">
            o haz clic para seleccionar — MP3, M4A, OGG, WAV, OPUS, AAC, FLAC, WEBM, MP4 · máx {MAX_FILE_MB} MB
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Las notas de voz sin extensión también valen: se reconocen por su tipo de archivo.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Barra de progreso global: con varios audios largos, saber cuántos
            faltan es la diferencia entre esperar tranquilo y creer que se colgó. */}
        {(procesando > 0 || pendientes > 0) && (
          <div className="rounded-xl border border-foreground/10 bg-card p-3">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-foreground">
                {procesando > 0 ? `Transcribiendo ${procesando}…` : "En cola"}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {listos} de {listos + pendientes + procesando}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.round((listos / Math.max(1, listos + pendientes + procesando)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void runQueue()}
            disabled={running || pendientes === 0}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center gap-2"
            data-testid="button-transcribir-todo"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Transcribir {pendientes > 0 && `(${pendientes})`}
          </button>
          {fallidos > 0 && (
            <button
              onClick={reintentarFallidos}
              className="px-4 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-500 font-medium hover:bg-amber-500/20 flex items-center gap-2"
              data-testid="button-reintentar-fallidos"
            >
              <RotateCcw className="w-4 h-4" /> Reintentar los {fallidos} que fallaron
            </button>
          )}
          <button
            onClick={copyAll}
            disabled={listos === 0}
            className="px-4 py-2 rounded-lg border border-border font-medium disabled:opacity-50 hover:bg-muted flex items-center gap-2"
            data-testid="button-copiar-todo"
          >
            {copiedAll ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            {copiedAll ? "¡Copiado!" : "Copiar todo"}
          </button>
          <button
            onClick={downloadZip}
            disabled={listos === 0}
            className="px-4 py-2 rounded-lg border border-border font-medium disabled:opacity-50 hover:bg-muted flex items-center gap-2"
            data-testid="button-descargar-zip"
          >
            <Archive className="w-4 h-4" /> Descargar todas (.zip)
          </button>
          <button
            onClick={clearAll}
            disabled={items.length === 0}
            className="px-4 py-2 rounded-lg border border-border font-medium disabled:opacity-50 hover:bg-muted flex items-center gap-2"
            data-testid="button-limpiar"
          >
            <Trash2 className="w-4 h-4" /> Limpiar lista
          </button>
        </div>

        {items.length > 2 && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar dentro de las transcripciones…"
              className="w-full pl-9 pr-9 py-2.5 bg-foreground/5 border border-foreground/10 rounded-xl text-sm focus:outline-none focus:border-primary"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <div className="space-y-3">
          {items.length === 0 && (
            <p className="text-center text-muted-foreground py-10">Aún no hay archivos.</p>
          )}
          {items.length > 0 && filtrados.length === 0 && (
            <p className="text-center text-muted-foreground py-10">
              Ningún audio ni transcripción contiene “{busqueda}”.
            </p>
          )}
          {filtrados.map((it) => (
            <div key={it.id} className="border border-border rounded-xl p-4 bg-card" data-testid={`card-audio-${it.id}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <FileAudio className="w-5 h-5 text-primary shrink-0" />
                <span className="font-medium truncate flex-1 min-w-[150px]">{it.nombre}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{(it.bytes / 1048576).toFixed(1)} MB</span>
                <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${ESTADOS[it.status].clase}`}>
                  {it.status === "procesando" && <Loader2 className="w-3 h-3 animate-spin" />}
                  {ESTADOS[it.status].texto}
                  {it.status === "procesando" && it.inicio && <> · <Cronometro desde={it.inicio} /></>}
                </span>
                {it.status === "listo" && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {palabras(it.text || "").toLocaleString("es-CL")} palabras
                    {it.segundos ? ` · ${formatoDuracion(it.segundos)}` : ""}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  {it.status === "listo" && (
                    <>
                      <button onClick={() => copyText(it)} title="Copiar" className="p-2 rounded-lg hover:bg-muted" data-testid={`button-copiar-${it.id}`}>
                        {copiedId === it.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button onClick={() => downloadTxt(it)} title="Descargar .txt" className="p-2 rounded-lg hover:bg-muted" data-testid={`button-txt-${it.id}`}>
                        <Download className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {it.status === "error" && it.file && !it.bloqueante && (
                    <button onClick={() => retry(it)} title="Reintentar" className="p-2 rounded-lg hover:bg-muted" data-testid={`button-reintentar-${it.id}`}>
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {it.status !== "procesando" && (
                    <button onClick={() => removeItem(it.id)} title="Quitar" className="p-2 rounded-lg hover:bg-muted" data-testid={`button-quitar-${it.id}`}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>
              {it.status === "error" && it.error && (
                <p className={`text-sm mt-2 ${it.bloqueante ? "text-amber-500" : "text-red-500"}`}>
                  {it.error}
                  {it.bloqueante && <span className="block text-xs mt-0.5 opacity-80">Reintentar no lo arregla.</span>}
                </p>
              )}
              {it.status === "listo" && (
                <textarea
                  readOnly
                  value={it.text}
                  className="mt-3 w-full h-32 text-sm bg-muted/50 border border-border rounded-lg p-3 resize-y"
                  data-testid={`text-transcripcion-${it.id}`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
