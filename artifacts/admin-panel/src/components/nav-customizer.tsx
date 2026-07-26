import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, Check, Loader2, RotateCcw } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export interface NavOption { href: string; label: string }

/**
 * Preferencia de menú de cada persona.
 *
 * Ocultar una sección es cosmética: no cambia permisos ni bloquea la ruta.
 * Sirve para que quien solo hace gestión no tenga que mirar diez herramientas
 * de producción cada vez que abre el panel.
 */
export function useHiddenNav() {
  const { data } = useQuery<{ hidden: string[] }>({
    queryKey: ["nav-hidden"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/me/nav`, { credentials: "include" });
      if (!r.ok) return { hidden: [] };
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
  return data?.hidden ?? [];
}

export function NavCustomizer({ options }: { options: NavOption[] }) {
  const hidden = useHiddenNav();
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<string[]>(hidden);

  // Al abrir, partimos de lo que está guardado.
  useEffect(() => { if (abierto) setSeleccion(hidden); }, [abierto, hidden]);

  const guardar = useMutation({
    mutationFn: async (lista: string[]) => {
      const r = await fetch(`${API_BASE}/me/nav`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: lista }),
      });
      if (!r.ok) throw new Error("No se pudo guardar");
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["nav-hidden"] });
      setAbierto(false);
    },
  });

  const alternar = (href: string) => {
    setSeleccion(prev => prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-base"
        title="Elegir qué secciones ver en el menú"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Personalizar menú</span>
        {hidden.length > 0 && <span className="ml-auto opacity-70">{hidden.length} ocultas</span>}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAbierto(false)} />
          <div className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border border-foreground/15 bg-card p-5 shadow-2xl">
            <p className="text-base font-semibold mb-1">Personalizar menú</p>
            <p className="text-xs text-muted-foreground mb-4">
              Desmarca lo que no quieras ver. Solo cambia tu menú: las secciones siguen
              disponibles y nadie más se ve afectado.
            </p>

            <ul className="space-y-1 mb-4">
              {options.map(o => {
                const oculta = seleccion.includes(o.href);
                return (
                  <li key={o.href}>
                    <button
                      type="button"
                      onClick={() => alternar(o.href)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-foreground/5 transition-base text-left"
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        oculta ? "border-foreground/25" : "bg-primary/20 border-primary/40 text-primary"
                      }`}>
                        {!oculta && <Check className="w-2.5 h-2.5" />}
                      </span>
                      <span className={`text-sm flex-1 ${oculta ? "text-muted-foreground line-through" : ""}`}>{o.label}</span>
                      <code className="text-[10px] text-muted-foreground/60">{o.href}</code>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center gap-2">
              <button
                onClick={() => guardar.mutate(seleccion)}
                disabled={guardar.isPending}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-base disabled:opacity-60"
              >
                {guardar.isPending ? <Loader2 className="w-4 h-4 mx-auto animate-spin" /> : "Guardar"}
              </button>
              <button
                onClick={() => setSeleccion([])}
                className="px-3 py-2 rounded-lg border border-foreground/15 text-sm text-muted-foreground hover:text-foreground transition-base inline-flex items-center gap-1.5"
                title="Volver a mostrar todo"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Todo
              </button>
              <button
                onClick={() => setAbierto(false)}
                className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-base"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
