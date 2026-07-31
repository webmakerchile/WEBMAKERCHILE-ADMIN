// Archivos adjuntos, en cualquier ficha.
//
// Antes solo se podía adjuntar un PDF y solo a un contrato. Los archivos del
// trabajo diario —el logo que manda el cliente, la captura de un bug, el
// mockup— no tenían dónde ir, así que circulaban por WhatsApp y a la semana
// nadie sabía cuál era la versión buena.
//
// El mismo componente sirve para proyectos, tareas, tickets y contratos: si
// cada ficha tuviera el suyo, tres de los cuatro acabarían sin arreglar el
// próximo fallo que aparezca aquí.

import { useEffect, useRef, useState } from "react";
import { Paperclip, Loader2, AlertTriangle, X, ExternalLink, Upload } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export type TipoAdjuntable = "project" | "task" | "ticket" | "contract";

interface Adjunto {
  id: number;
  name: string;
  mimeType: string | null;
  size: number | null;
  driveLink: string | null;
  uploadedById: number | null;
  createdAt: string;
}

function tamano(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Adjuntos({
  tipo,
  id,
  titulo = "Archivos",
}: {
  tipo: TipoAdjuntable;
  id: string;
  titulo?: string;
}) {
  const [lista, setLista] = useState<Adjunto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  // El aviso de que hay que conectar Drive es distinto de un error cualquiera:
  // tiene arreglo y el arreglo es un enlace.
  const [conectar, setConectar] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    try {
      const r = await fetch(`${API_BASE}/adjuntos?tipo=${tipo}&id=${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
      const d = (await r.json()) as { adjuntos?: Adjunto[] };
      setLista(d.adjuntos ?? []);
    } catch (e) {
      // Lista vacía y fallo se ven igual si no se dice: es el error que ya
      // tuvimos con los exploradores de Drive.
      setError(e instanceof Error ? e.message : "No se pudieron cargar los archivos");
      setLista([]);
    }
  };

  useEffect(() => { void cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tipo, id]);

  const subir = async (archivo: File) => {
    setSubiendo(true);
    setError(null);
    setConectar(null);
    try {
      const fd = new FormData();
      fd.append("file", archivo);
      fd.append("tipo", tipo);
      fd.append("id", id);
      const r = await fetch(`${API_BASE}/adjuntos`, { method: "POST", credentials: "include", body: fd });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string; conectar?: string; adjunto?: Adjunto };
      if (!r.ok) {
        if (cuerpo.conectar) setConectar(cuerpo.conectar);
        throw new Error(cuerpo.error || `El servidor respondió ${r.status}`);
      }
      setLista((prev) => [cuerpo.adjunto!, ...(prev ?? [])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const quitar = async (adjunto: Adjunto) => {
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/adjuntos/${adjunto.id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error || `El servidor respondió ${r.status}`);
      }
      setLista((prev) => (prev ?? []).filter((a) => a.id !== adjunto.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar el archivo");
    }
  };

  return (
    <div className="rounded-lg border border-foreground/10 bg-card/30 p-3 mt-2">
      <div className="flex items-center gap-2 mb-2">
        <Paperclip className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium flex-1">
          {titulo}
          {lista !== null && lista.length > 0 && (
            <span className="text-muted-foreground font-normal"> · {lista.length}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="inline-flex items-center gap-1 rounded-md border border-foreground/15 px-2 py-1 text-[11px] hover:bg-foreground/5 disabled:opacity-50"
        >
          {subiendo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {subiendo ? "Subiendo…" : "Adjuntar"}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); }}
        />
      </div>

      {lista === null && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Cargando…
        </p>
      )}

      {lista !== null && lista.length === 0 && !error && (
        <p className="text-[11px] text-muted-foreground">
          Sin archivos todavía. Se aceptan documentos, imágenes, videos y comprimidos.
        </p>
      )}

      {lista !== null && lista.length > 0 && (
        <ul className="space-y-1">
          {lista.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-[11px]">
              <a
                href={a.driveLink ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 truncate hover:text-primary inline-flex items-center gap-1"
              >
                {a.name} <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
              </a>
              {tamano(a.size) && <span className="text-muted-foreground flex-shrink-0">{tamano(a.size)}</span>}
              <button
                type="button"
                onClick={() => void quitar(a)}
                title="Quitar de esta ficha (el archivo sigue en Drive)"
                className="text-muted-foreground hover:text-red-400 flex-shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="flex items-start gap-1.5 mt-2 text-[11px] text-red-400">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>
            {error}
            {/* Sin permiso de Drive no hay nada que reintentar: hay que darlo. */}
            {conectar && (
              <>
                {" "}
                <a href={conectar} className="underline hover:text-red-300">Conectar Google Drive</a>
              </>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
