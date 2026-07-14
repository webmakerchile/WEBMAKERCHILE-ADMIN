import { useCallback, useRef, useState } from "react";
import { AudioLines, Upload, Copy, Download, RotateCcw, Trash2, Check, Loader2, FileAudio, Archive } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type FileStatus = "pendiente" | "procesando" | "listo" | "error";

interface QueueItem {
  id: string;
  file: File;
  status: FileStatus;
  text?: string;
  error?: string;
}

const ACCEPT = ".mp3,.m4a,.ogg,.wav,.opus,.aac,.flac,.webm,.mp4";
const CONCURRENCY = 2;

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

export default function TranscriptorPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;
  const runningRef = useRef(false);

  const addFiles = useCallback((files: FileList | File[]) => {
    const nuevos: QueueItem[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pendiente",
    }));
    setItems((prev) => [...prev, ...nuevos]);
  }, []);

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const transcribeOne = async (item: QueueItem) => {
    updateItem(item.id, { status: "procesando", error: undefined });
    try {
      const form = new FormData();
      form.append("audio", item.file);
      const res = await fetch(`${API_BASE}/transcriber/transcribe`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      updateItem(item.id, { status: "listo", text: data.text || "" });
    } catch (err) {
      updateItem(item.id, { status: "error", error: (err as Error).message });
    }
  };

  const runQueue = async () => {
    // runningRef is the synchronous lock (React state alone is stale in closures)
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      // loop again after workers drain in case retries re-enqueued items mid-run
      for (;;) {
        const pending = () => itemsRef.current.filter((it) => it.status === "pendiente");
        if (pending().length === 0) break;
        const workers = Array.from({ length: CONCURRENCY }, async () => {
          for (;;) {
            const next = pending()[0];
            if (!next) break;
            // mark synchronously so the other worker doesn't grab it
            itemsRef.current = itemsRef.current.map((it) =>
              it.id === next.id ? { ...it, status: "procesando" as const } : it
            );
            updateItem(next.id, { status: "procesando" });
            await transcribeOne(next);
          }
        });
        await Promise.all(workers);
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  };

  const [copiedAll, setCopiedAll] = useState(false);
  const copyAll = async () => {
    const listos = items.filter((it) => it.status === "listo");
    if (listos.length === 0) return;
    const texto = listos
      .map((it) => `--- ${it.file.name} ---\n\n${(it.text || "").trim()}`)
      .join("\n\n\n");
    await navigator.clipboard.writeText(texto);
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
    a.download = `${baseName(item.file.name)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadZip = async () => {
    const listos = items.filter((it) => it.status === "listo");
    if (listos.length === 0) return;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    for (const it of listos) {
      zip.file(`${baseName(it.file.name)}.txt`, it.text || "");
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "transcripciones.zip";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const retry = (item: QueueItem) => {
    updateItem(item.id, { status: "pendiente", error: undefined });
    setTimeout(runQueue, 0);
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const clearAll = () => setItems((prev) => prev.filter((it) => it.status === "procesando"));

  const pendientes = items.filter((it) => it.status === "pendiente").length;
  const listos = items.filter((it) => it.status === "listo").length;

  const statusBadge = (it: QueueItem) => {
    switch (it.status) {
      case "pendiente":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Pendiente</span>;
      case "procesando":
        return (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Procesando
          </span>
        );
      case "listo":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">Listo</span>;
      case "error":
        return <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">Error</span>;
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1 flex items-center gap-3">
          <AudioLines className="w-8 h-8 text-primary" /> Transcriptor de Audios
        </h1>
        <p className="text-sm text-muted-foreground">
          Whisper large-v3-turbo vía Groq · Español · Los archivos mayores a 24MB se convierten automáticamente
        </p>
      </div>

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
        <p className="text-sm text-muted-foreground">o haz clic para seleccionar archivos — MP3, M4A, OGG, WAV, OPUS</p>
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

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          onClick={runQueue}
          disabled={running || pendientes === 0}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center gap-2"
          data-testid="button-transcribir-todo"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <AudioLines className="w-4 h-4" />}
          Transcribir todo {pendientes > 0 && `(${pendientes})`}
        </button>
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

      <div className="mt-6 space-y-3">
        {items.length === 0 && (
          <p className="text-center text-muted-foreground py-10">Aún no hay archivos.</p>
        )}
        {items.map((it) => (
          <div key={it.id} className="border border-border rounded-xl p-4 bg-card" data-testid={`card-audio-${it.id}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <FileAudio className="w-5 h-5 text-primary shrink-0" />
              <span className="font-medium truncate flex-1 min-w-[150px]">{it.file.name}</span>
              <span className="text-xs text-muted-foreground">{(it.file.size / 1048576).toFixed(1)} MB</span>
              {statusBadge(it)}
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
                {it.status === "error" && (
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
              <p className="text-sm text-red-500 mt-2">{it.error}</p>
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
  );
}
