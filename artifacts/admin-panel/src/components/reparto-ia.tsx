// Reparto de un objetivo entre el equipo, asistido por IA.
//
// Resuelve el caso que se pidió tal cual: quien lidera sabe QUÉ hay que lograr
// pero no cómo repartirlo ni cómo redactarlo. Aquí describe el objetivo con sus
// palabras, elige a quiénes involucra y la IA propone qué le toca a cada quien,
// ya escrito.
//
// La propuesta NO se guarda sola: se revisa, se puede quitar lo que sobre y
// recién entonces se crea. Repartir trabajo real sobre personas reales sin que
// nadie lo confirme sería exactamente el tipo de automatismo que nadie quiere.

import { useState } from "react";
import { Loader2, Sparkles, Users, Check, X, Trash2 } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export interface PersonaReparto {
  id: number;
  nombre: string;
  rol?: string;
}

export interface TareaPropuesta {
  persona: string;
  titulo: string;
  detalle: string;
}

export interface RepartoIAProps {
  personas: PersonaReparto[];
  /** Se llama con lo que quedó aprobado, ya emparejado con el id de cada persona. */
  onAplicar: (tareas: { personaId: number; titulo: string; detalle: string }[]) => Promise<void> | void;
  /** Texto del botón de aplicar; la página dice qué se crea realmente. */
  etiquetaAplicar?: string;
  contexto?: string;
}

export function RepartoIA({ personas, onAplicar, etiquetaAplicar = "Crear todo", contexto }: RepartoIAProps) {
  const [abierto, setAbierto] = useState(false);
  const [objetivo, setObjetivo] = useState("");
  const [seleccion, setSeleccion] = useState<number[]>(personas.map((p) => p.id));
  const [porPersona, setPorPersona] = useState(2);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<TareaPropuesta[] | null>(null);

  const elegidas = personas.filter((p) => seleccion.includes(p.id));

  const pedir = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`${API}/redactar/reparto`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objetivo,
          contexto,
          porPersona,
          personas: elegidas.map((p) => ({ nombre: p.nombre, rol: p.rol ?? "" })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { tareas?: TareaPropuesta[]; error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "No se pudo repartir");
      setPropuesta(data?.tareas ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo repartir");
    } finally {
      setCargando(false);
    }
  };

  const aplicar = async () => {
    if (!propuesta) return;
    setAplicando(true);
    setError(null);
    try {
      const conId = propuesta
        .map((t) => {
          const p = personas.find((x) => x.nombre === t.persona);
          return p ? { personaId: p.id, titulo: t.titulo, detalle: t.detalle } : null;
        })
        .filter((x): x is { personaId: number; titulo: string; detalle: string } => x !== null);
      await onAplicar(conId);
      setPropuesta(null);
      setObjetivo("");
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setAplicando(false);
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
      >
        <Users className="w-3.5 h-3.5" /> Repartir un objetivo con IA
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Repartir un objetivo</p>
          <p className="text-[11px] text-muted-foreground">
            Cuéntalo con tus palabras. La IA propone qué le toca a cada quien; tú revisas antes de crear nada.
          </p>
        </div>
        <button type="button" onClick={() => { setAbierto(false); setPropuesta(null); }} aria-label="Cerrar">
          <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>

      <textarea
        rows={3}
        value={objetivo}
        onChange={(e) => setObjetivo(e.target.value)}
        maxLength={2000}
        placeholder="Ej: esta semana hay que dejar lista la campaña de Kori & Glow: piezas, textos y programación"
        className="w-full rounded-lg border border-foreground/15 bg-card/60 px-2.5 py-2 text-sm resize-y"
      />

      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground">¿Entre quiénes?</p>
        <div className="flex flex-wrap gap-1.5">
          {personas.map((p) => {
            const on = seleccion.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setSeleccion((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                }
                className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                  on
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "border-foreground/10 text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.nombre}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-muted-foreground">
          Máximo por persona
          <select
            value={porPersona}
            onChange={(e) => setPorPersona(Number(e.target.value))}
            className="ml-1.5 rounded-lg border border-foreground/15 bg-card/60 px-2 py-1 text-xs"
          >
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={pedir}
          disabled={cargando || objetivo.trim().length < 5 || elegidas.length === 0}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {propuesta ? "Proponer de nuevo" : "Proponer reparto"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {propuesta && (
        <div className="space-y-2 pt-1">
          {propuesta.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No salió nada aprovechable. Prueba dando más contexto sobre el objetivo.
            </p>
          )}
          {propuesta.map((t, i) => (
            <div key={i} className="rounded-lg border border-foreground/10 bg-card/50 p-2.5 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-primary font-semibold">{t.persona}</p>
                <p className="text-sm">{t.titulo}</p>
                {t.detalle && <p className="text-[11px] text-muted-foreground mt-0.5">{t.detalle}</p>}
              </div>
              <button
                type="button"
                onClick={() => setPropuesta((prev) => prev!.filter((_, j) => j !== i))}
                aria-label="Quitar esta tarea"
                className="text-muted-foreground hover:text-red-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {propuesta.length > 0 && (
            <button
              type="button"
              onClick={aplicar}
              disabled={aplicando}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {aplicando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {etiquetaAplicar} ({propuesta.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
