// Cuándo avisa el panel de que algo lleva parado demasiado.
//
// Hasta ahora había una sola señal y estaba escrita a mano en dos sitios que no
// se hablaban: la tarjeta "Sin moverse (+3 días)" de esta misma página, y el
// recordatorio de vencimiento del scheduler. Cambiar el criterio significaba
// tocar código.
//
// Estas reglas las lee el job que manda los avisos Y la tarjeta de arriba, así
// que lo que dice la pantalla y lo que llega por notificación no pueden
// discrepar. Si discreparan, nadie se fiaría de ninguno de los dos.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BellRing, Loader2, Check, AlertTriangle, ChevronDown } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export interface ReglasRecordatorio {
  diasTareaEstancada: number;
  diasEnCola: number;
  diasVencida: number;
  diasProyectoParado: number;
  prioridadMinima: string;
}

interface Respuesta {
  reglas: ReglasRecordatorio;
  porDefecto: ReglasRecordatorio;
  maxPorPersona: number;
  puedeEditar: boolean;
}

/**
 * Reglas vigentes. Las usa también la tarjeta de "sin moverse" para que el
 * número que enseña sea el mismo por el que se manda el aviso.
 */
export function useReglasRecordatorio() {
  return useQuery<Respuesta>({
    queryKey: ["recordatorios"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/hub/recordatorios`, { credentials: "include" });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error || "No se pudieron cargar los recordatorios");
      }
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
}

const CAMPOS: Array<{ clave: keyof Omit<ReglasRecordatorio, "prioridadMinima">; label: string; ayuda: string }> = [
  {
    clave: "diasTareaEstancada",
    label: "Tarea sin avanzar",
    ayuda: "Días en la misma etapa antes de avisar. No cuenta el backlog.",
  },
  {
    clave: "diasVencida",
    label: "Tarea atrasada",
    ayuda: "Días pasados de su fecha. Hoy el panel deja de avisar en cuanto la fecha pasa.",
  },
  {
    clave: "diasEnCola",
    label: "Tarea aparcada en backlog",
    ayuda: "El backlog es una lista de pendientes, por eso su plazo es mucho más largo.",
  },
  {
    clave: "diasProyectoParado",
    label: "Proyecto sin movimiento",
    ayuda: "Días sin ningún cambio en el panel. Solo avisa a quien lo tenga asignado.",
  },
];

const PRIORIDADES = ["baja", "media", "alta", "crítica"] as const;

export function ConfigRecordatorios() {
  const { data, isLoading, error } = useReglasRecordatorio();
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<ReglasRecordatorio | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const guardar = useMutation({
    mutationFn: async (reglas: ReglasRecordatorio) => {
      const r = await fetch(`${API_BASE}/hub/recordatorios`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reglas),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(cuerpo.error || `El servidor respondió ${r.status}`);
      return cuerpo;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recordatorios"] });
      setBorrador(null);
      toast({ title: "Recordatorios actualizados" });
    },
    onError: (e: unknown) =>
      toast({ title: "No se pudo guardar", description: (e as Error).message, variant: "destructive" }),
  });

  if (isLoading) return null;
  if (error) {
    // Se dice que falló en vez de esconder la sección: una sección ausente es
    // indistinguible de una que nunca existió.
    return (
      <p className="flex items-center gap-1.5 text-xs text-amber-400">
        <AlertTriangle className="w-3.5 h-3.5" /> No se pudieron cargar los recordatorios.
      </p>
    );
  }
  if (!data) return null;

  const actual = borrador ?? data.reglas;
  const cambiado = JSON.stringify(actual) !== JSON.stringify(data.reglas);
  const editar = (parcial: Partial<ReglasRecordatorio>) => setBorrador({ ...actual, ...parcial });

  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4 space-y-3">
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          className="w-full flex items-center justify-between gap-2 text-left"
          aria-expanded={abierto}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <BellRing className="w-4 h-4 text-orange-400" /> Cuándo avisarme
          </span>
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {actual.diasTareaEstancada} d sin avanzar · {actual.diasVencida} d de atraso
            <ChevronDown className={`w-4 h-4 transition ${abierto ? "rotate-180" : ""}`} />
          </span>
        </button>

        {abierto && (
          <div className="space-y-3 pt-1">
            <div className="grid sm:grid-cols-2 gap-3">
              {CAMPOS.map((c) => (
                <label key={c.clave} className="block">
                  <span className="block text-xs font-medium mb-1">{c.label}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={actual[c.clave]}
                      disabled={!data.puedeEditar}
                      onChange={(e) => editar({ [c.clave]: Number(e.target.value) } as Partial<ReglasRecordatorio>)}
                      className="h-9 w-20 rounded-lg border border-foreground/15 bg-card/60 px-2 text-sm disabled:opacity-50"
                    />
                    <span className="text-xs text-muted-foreground">días</span>
                  </div>
                  <span className="block text-[11px] text-muted-foreground/80 mt-1">{c.ayuda}</span>
                </label>
              ))}
            </div>

            <label className="block">
              <span className="block text-xs font-medium mb-1">Solo avisar desde prioridad</span>
              <select
                value={actual.prioridadMinima}
                disabled={!data.puedeEditar}
                onChange={(e) => editar({ prioridadMinima: e.target.value })}
                className="h-9 rounded-lg border border-foreground/15 bg-card/60 px-3 text-sm disabled:opacity-50"
              >
                {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            {/* El tope importa más que los plazos: sin él, volver de vacaciones
                con treinta tareas paradas significa treinta notificaciones de
                golpe y silenciar el canal para siempre. */}
            <p className="text-[11px] text-muted-foreground/80">
              Como máximo {data.maxPorPersona} avisos por persona al día, empezando por lo que lleve más
              tiempo parado. Si algo sigue igual, se vuelve a avisar a los 7, 14 y 30 días, no cada día.
            </p>

            {data.puedeEditar ? (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => guardar.mutate(actual)} disabled={!cambiado || guardar.isPending}>
                  {guardar.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><Check className="w-4 h-4 mr-1.5" /> Guardar</>}
                </Button>
                {cambiado && (
                  <Button size="sm" variant="ghost" onClick={() => setBorrador(null)}>Descartar</Button>
                )}
                <button
                  type="button"
                  onClick={() => setBorrador({ ...data.porDefecto })}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  Volver a los valores por defecto
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Los plazos los ajusta la dirección o Programación.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
