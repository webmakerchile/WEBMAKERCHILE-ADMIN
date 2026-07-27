// Asistente de redacción reutilizable.
//
// Un solo componente para todos los campos de texto del panel (metas, tareas,
// tickets, reportes, evaluaciones). La alternativa —un botón por página— haría
// que cada apartado se comportara distinto y que arreglar algo obligue a tocar
// siete sitios.
//
// Regla de producto: NUNCA pisa lo que la persona escribió. Muestra la
// propuesta al lado y ella decide si la usa. Escribir encima sin preguntar es
// la forma más rápida de que alguien deje de confiar en el botón.

import { useState } from "react";
import { Loader2, Sparkles, Check, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export type TipoRedaccion =
  | "meta" | "tarea" | "ticket" | "reporte" | "evaluacion" | "mensaje" | "generico";

export type TonoRedaccion = "profesional" | "cercano" | "directo";

async function redactar(body: unknown): Promise<string> {
  const res = await fetch(`${API}/redactar`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { texto?: string; error?: string } | null;
  if (!res.ok) throw new Error(data?.error || "No se pudo redactar");
  return data?.texto ?? "";
}

export interface AsistenteRedaccionProps {
  /** Qué se está escribiendo: cambia las reglas de calidad del resultado. */
  tipo: TipoRedaccion;
  /** Texto actual del campo. Es el material de partida del asistente. */
  valor: string;
  /** Se llama solo si la persona acepta la propuesta. */
  onAceptar: (texto: string) => void;
  /** Contexto que la página conoce y la persona no tiene por qué repetir. */
  contexto?: string;
  tono?: TonoRedaccion;
  /** Texto del botón; por defecto "Mejorar redacción". */
  etiqueta?: string;
  className?: string;
  disabled?: boolean;
}

export function AsistenteRedaccion({
  tipo,
  valor,
  onAceptar,
  contexto,
  tono = "profesional",
  etiqueta = "Mejorar redacción",
  className,
  disabled,
}: AsistenteRedaccionProps) {
  const [cargando, setCargando] = useState(false);
  const [propuesta, setPropuesta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState("");

  const vacio = valor.trim().length === 0;

  const pedir = async (conAjuste?: string) => {
    setCargando(true);
    setError(null);
    try {
      const texto = await redactar({ tipo, borrador: valor, contexto, tono, ajuste: conAjuste ?? "" });
      setPropuesta(texto);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo redactar");
    } finally {
      setCargando(false);
    }
  };

  const cerrar = () => {
    setPropuesta(null);
    setError(null);
    setAjuste("");
  };

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={() => pedir()}
        disabled={disabled || cargando || vacio}
        title={vacio ? "Escribe primero tu idea, aunque sea a medias" : etiqueta}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors",
          "border-primary/30 text-primary hover:bg-primary/10",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
        )}
      >
        {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {etiqueta}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {propuesta !== null && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wide font-semibold text-primary">Propuesta</span>
            <button
              type="button"
              onClick={cerrar}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Descartar propuesta"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-sm whitespace-pre-wrap">{propuesta}</p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { onAceptar(propuesta); cerrar(); }}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              <Check className="w-3.5 h-3.5" /> Usar este texto
            </button>
            <input
              value={ajuste}
              onChange={(e) => setAjuste(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ajuste.trim()) {
                  e.preventDefault();
                  pedir(ajuste.trim());
                }
              }}
              placeholder="Pídele un cambio: más corto, menos formal…"
              maxLength={200}
              className="flex-1 min-w-[12rem] bg-background/60 border border-foreground/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary/60"
            />
            <button
              type="button"
              onClick={() => pedir(ajuste.trim() || undefined)}
              disabled={cargando}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-foreground/15 hover:bg-foreground/5 disabled:opacity-40"
            >
              {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Otra versión
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Nada se guarda hasta que aprietes “Usar este texto”. Lo que está entre corchetes lo tienes que completar tú.
          </p>
        </div>
      )}
    </div>
  );
}
