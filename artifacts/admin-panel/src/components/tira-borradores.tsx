// Tira de borradores para Historias y Posts IA.
//
// Las generaciones ya se guardaban en el servidor, pero nada las volvía a
// mostrar: salir de la página se sentía exactamente igual que perderlo todo.
// Portadas sí tenía esta tira y por eso ahí nadie perdía trabajo.
//
// Compartida entre las dos secciones a propósito: duplicarla es lo que hizo
// que se separaran la última vez.

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Loader2, Trash2, Clock, Image as ImageIcon } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export interface BorradorResumen {
  id: number;
  titulo: string;
  subtipo: string | null;
  thumb: string;
  piezas: number;
  creado: string;
  /** "Se borra mañana", etc. Solo cuando quedan 3 días o menos. */
  caducidad: string | null;
  dias_restantes: number;
}

export function TiraBorradores({
  tipo,
  recargar,
  onCargar,
  onError,
}: {
  tipo: "historia" | "post";
  /** Cambia este número tras generar para refrescar la lista. */
  recargar?: number;
  onCargar: (datos: any) => void;
  onError?: (mensaje: string) => void;
}) {
  const [lista, setLista] = useState<BorradorResumen[]>([]);
  const [dias, setDias] = useState(14);
  const [cargando, setCargando] = useState(true);
  const [abriendo, setAbriendo] = useState<number | null>(null);
  const [abierto, setAbierto] = useState(false);

  const cargarLista = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/community/borradores?tipo=${tipo}`, { credentials: "include" });
      const d = await r.json();
      if (d?.success) {
        setLista(d.data.borradores ?? []);
        setDias(d.data.dias_retencion ?? 14);
      }
    } catch {
      /* sin lista la página sigue funcionando: no es un error que valga interrumpir */
    } finally {
      setCargando(false);
    }
  }, [tipo]);

  useEffect(() => { void cargarLista(); }, [cargarLista, recargar]);

  const abrir = async (id: number) => {
    if (abriendo !== null) return;
    setAbriendo(id);
    try {
      const r = await fetch(`${API_BASE}/community/borradores/${id}`, { credentials: "include" });
      const d = await r.json();
      if (!d?.success) throw new Error(d?.error || "No se pudo abrir el borrador");
      onCargar(d.data);
    } catch (e: any) {
      onError?.(e?.message || "No se pudo abrir el borrador");
    } finally {
      setAbriendo(null);
    }
  };

  const borrar = async (id: number) => {
    setLista((prev) => prev.filter((b) => b.id !== id));
    try {
      await fetch(`${API_BASE}/community/borradores/${id}`, { method: "DELETE", credentials: "include" });
    } catch {
      void cargarLista(); // si falló, que la lista vuelva a decir la verdad
    }
  };

  if (cargando) return null;
  if (lista.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl border border-foreground/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-foreground/[0.03] transition-colors"
      >
        <FolderOpen className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Tus borradores</span>
        <span className="text-[10px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
          {lista.length}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {abierto ? "Ocultar" : `Se guardan solos · se limpian a los ${dias} días`}
        </span>
      </button>

      {abierto && (
        <div className="px-4 pb-4 flex gap-3 overflow-x-auto">
          {lista.map((b) => (
            <div key={b.id} className="relative shrink-0 w-28 group">
              <button
                type="button"
                onClick={() => abrir(b.id)}
                disabled={abriendo !== null}
                title={b.titulo}
                className="block w-full rounded-xl overflow-hidden border border-foreground/10 hover:border-primary/50 transition disabled:opacity-50 bg-foreground/5"
              >
                <span className="block relative" style={{ aspectRatio: tipo === "historia" ? "9/16" : "4/5" }}>
                  {b.thumb ? (
                    <img src={b.thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
                    </span>
                  )}
                  {abriendo === b.id && (
                    <span className="absolute inset-0 bg-background/80 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    </span>
                  )}
                  {b.piezas > 1 && (
                    <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                      {b.piezas}
                    </span>
                  )}
                </span>
              </button>
              <p className="text-[10px] text-foreground/80 mt-1 line-clamp-2 leading-tight">{b.titulo}</p>
              {b.caducidad && (
                <p className="text-[9px] text-amber-400 flex items-center gap-0.5 mt-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {b.caducidad}
                </p>
              )}
              <button
                type="button"
                onClick={() => borrar(b.id)}
                aria-label={`Borrar ${b.titulo}`}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
              >
                <Trash2 className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
