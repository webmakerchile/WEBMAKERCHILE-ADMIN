// Desempeño semanal del equipo, para RRHH y dirección.
//
// La semana en curso se calcula en vivo sobre el tablero; las semanas
// anteriores salen de la FOTO que guarda el cierre semanal — el arrastre
// reescribe las tareas pendientes, así que la historia no puede leerse del
// tablero. El % es deliberadamente simple: listas / comprometidas, el número
// que se conversa en la reunión de los lunes.
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CalendarCheck, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

interface Desempeno {
  semana: string;
  personas: { id: number; name: string | null; picture: string | null; teamRole: string | null }[];
  actual: { assigneeId: number; total: number; done: number }[];
  atrasos: { responsibleId: number | null; atrasos: number }[];
  historial: { weekKey: string; userId: number; total: number; done: number; carried: number }[];
}

const pct = (done: number, total: number): number | null =>
  total > 0 ? Math.round((100 * done) / total) : null;

export function DesempenoSemanal() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["hub-tasks-desempeno"],
    queryFn: async (): Promise<Desempeno> => {
      const r = await fetch(`${API_BASE}/hub/tasks/desempeno`, { credentials: "include" });
      if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
      return r.json() as Promise<Desempeno>;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="bg-card/40 border-foreground/10">
        <CardContent className="p-4 flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }
  // Sin acceso o sin datos: este panel simplemente no es para quien mira.
  if (error || !data) return null;

  const actualDe = new Map(data.actual.map(a => [a.assigneeId, a]));
  const atrasosDe = new Map(
    data.atrasos.filter(a => a.responsibleId != null).map(a => [a.responsibleId as number, a.atrasos]),
  );
  const historiaDe = new Map<number, { weekKey: string; pctVal: number | null }[]>();
  for (const h of data.historial) {
    const list = historiaDe.get(h.userId) ?? [];
    list.push({ weekKey: h.weekKey, pctVal: pct(h.done, h.total) });
    historiaDe.set(h.userId, list);
  }

  const filas = data.personas
    .map(p => {
      const act = actualDe.get(p.id);
      const hist = (historiaDe.get(p.id) ?? []).sort((a, b) => a.weekKey.localeCompare(b.weekKey));
      const prev = hist.length > 0 ? hist[hist.length - 1]! : null;
      return {
        ...p,
        total: act?.total ?? 0,
        done: act?.done ?? 0,
        pctVal: pct(act?.done ?? 0, act?.total ?? 0),
        atrasos: atrasosDe.get(p.id) ?? 0,
        prev,
      };
    })
    // Sin carga esta semana y sin historia → no ensucia la tabla.
    .filter(f => f.total > 0 || f.prev);

  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <p className="text-sm font-semibold flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-primary" /> Desempeño semanal del equipo
          </p>
          <span className="text-[11px] text-muted-foreground">{data.semana}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Tareas comprometidas a la semana y % de cumplimiento. La flecha compara con la última semana cerrada; los atrasos son avisos de SLA sobre tareas de esta semana.
        </p>
        {filas.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Nadie tiene tareas comprometidas a esta semana todavía.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {filas.map(f => {
              const delta = f.pctVal !== null && f.prev?.pctVal != null ? f.pctVal - f.prev.pctVal : null;
              return (
                <li key={f.id} className="flex items-center gap-3 rounded-lg border border-foreground/10 bg-card/50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{f.name || "—"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{f.teamRole || ""}</p>
                  </div>
                  <div className="w-32 sm:w-44">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                      <span>{f.done} / {f.total}</span>
                      <span className={f.pctVal !== null && f.pctVal >= 100 ? "text-emerald-400 font-semibold" : ""}>
                        {f.pctVal === null ? "sin carga" : `${f.pctVal}%`}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${f.pctVal !== null && f.pctVal >= 100 ? "bg-emerald-400" : "bg-primary"}`}
                        style={{ width: `${f.pctVal ?? 0}%` }}
                      />
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap ${f.atrasos > 0 ? "bg-red-500/15 text-red-400" : "bg-foreground/5 text-muted-foreground"}`}
                    title="Avisos de SLA sobre tareas comprometidas a esta semana"
                  >
                    {f.atrasos > 0 ? <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" /> : null}
                    {f.atrasos} atraso{f.atrasos === 1 ? "" : "s"}
                  </span>
                  <span
                    className="w-16 text-right text-[10px] text-muted-foreground whitespace-nowrap"
                    title={f.prev ? `Última semana cerrada (${f.prev.weekKey}): ${f.prev.pctVal === null ? "sin carga" : `${f.prev.pctVal}%`}` : "Sin semanas cerradas aún"}
                  >
                    {delta === null ? (
                      <Minus className="w-3 h-3 inline opacity-40" />
                    ) : delta > 0 ? (
                      <span className="text-emerald-400"><TrendingUp className="w-3 h-3 inline" /> +{delta}</span>
                    ) : delta < 0 ? (
                      <span className="text-red-400"><TrendingDown className="w-3 h-3 inline" /> {delta}</span>
                    ) : (
                      <span>=</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
