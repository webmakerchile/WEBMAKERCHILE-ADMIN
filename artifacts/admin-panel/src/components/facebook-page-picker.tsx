// Selector de la página de Facebook en la que se publica.
//
// Antes el servidor tomaba la primera página que devolvía Meta. Para una
// agencia que administra la suya y las de sus clientes eso significa publicar
// en la cuenta equivocada, que es peor que no publicar. Y cuando no había
// ninguna página, la conexión igual se daba por buena: el fallo solo aparecía
// al publicar, con el (#200) crudo de Meta.

import { useEffect, useState } from "react";
import { Loader2, Check, RefreshCw, AlertTriangle } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

interface PaginaFb {
  id: string;
  name: string;
  picture: string | null;
  selected: boolean;
}

export function FacebookPagePicker({ onCerrar }: { onCerrar?: () => void }) {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [paginas, setPaginas] = useState<PaginaFb[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`${API}/facebook/pages`, { credentials: "include" });
      const data = (await res.json().catch(() => null)) as
        | { pages?: PaginaFb[]; hint?: string | null; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error || "No se pudieron cargar tus páginas");
      setPaginas(data?.pages ?? []);
      setHint(data?.hint ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar tus páginas");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void cargar(); }, []);

  const elegir = async (p: PaginaFb) => {
    setGuardando(p.id);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`${API}/facebook/select-page`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: p.id }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; pageName?: string } | null;
      if (!res.ok) throw new Error(data?.error || "No se pudo fijar la página");
      setOk(`Se publicará en "${data?.pageName || p.name}".`);
      setPaginas(prev => prev.map(x => ({ ...x, selected: x.id === p.id })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo fijar la página");
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">¿En qué página de Facebook se publica?</p>
          <p className="text-[11px] text-muted-foreground">
            Se elige una sola. Puedes cambiarla cuando quieras.
          </p>
        </div>
        <button onClick={() => void cargar()} className="text-muted-foreground hover:text-foreground" aria-label="Recargar">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {cargando && (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      {ok && <p className="text-xs text-emerald-400">{ok}</p>}

      {!cargando && paginas.length === 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p>{hint || "Tu usuario no administra ninguna página que la app pueda usar."}</p>
            <p className="text-muted-foreground">
              Esto se arregla en Facebook, no aquí: al volver a conectar, en la pantalla de
              autorización hay que <strong>marcar la página</strong> y aceptar los permisos de
              publicación. Si la página es de un cliente, tienes que ser administrador de ella.
            </p>
          </div>
        </div>
      )}

      {!cargando && paginas.length > 0 && (
        <ul className="space-y-1.5">
          {paginas.map(p => (
            <li key={p.id}>
              <button
                onClick={() => void elegir(p)}
                disabled={guardando !== null}
                className={`w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-50 ${
                  p.selected
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-foreground/10 hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                {p.picture
                  ? <img src={p.picture} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                  : <div className="w-7 h-7 rounded-full bg-foreground/10" />}
                <span className="flex-1 min-w-0 text-sm truncate">{p.name}</span>
                {guardando === p.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : p.selected && <Check className="w-4 h-4 text-emerald-400" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {onCerrar && (
        <button onClick={onCerrar} className="text-[11px] text-muted-foreground hover:text-foreground">
          Cerrar
        </button>
      )}
    </div>
  );
}
