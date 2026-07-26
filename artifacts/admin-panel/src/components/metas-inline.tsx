import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGoals, useUpdateGoal, goalPercent, PERIOD_LABELS, PERIOD_STYLE } from "@/lib/metas";
import { Loader2, Target, ArrowRight, Check } from "lucide-react";

/**
 * Mis metas del período, incrustadas en la pantalla de cada área.
 *
 * Una meta que hay que ir a buscar a otra pantalla no se cumple: aparece donde
 * la persona ya está trabajando, y se marca ahí mismo.
 */
export function MetasInline({ title = "Mis metas", limit = 6 }: { title?: string; limit?: number }) {
  const { data, isLoading } = useGoals("mias");
  const actualizar = useUpdateGoal();

  const metas = (data?.goals ?? []).slice(0, limit);
  const cumplidas = (data?.goals ?? []).filter(g => g.status === "cumplida").length;
  const total = data?.goals.length ?? 0;

  // Sin metas asignadas, la tarjeta no aporta: no se muestra.
  if (!isLoading && total === 0) return null;

  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> {title}
            {total > 0 && (
              <span className="text-[11px] font-normal text-muted-foreground">
                {cumplidas}/{total} cumplidas
              </span>
            )}
          </p>
          <Link href="/metas" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {isLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
        ) : (
          <ul className="space-y-2">
            {metas.map(g => {
              const cumplida = g.status === "cumplida";
              const pct = goalPercent(g);
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => actualizar.mutate({ id: g.id, status: cumplida ? "pendiente" : "cumplida" })}
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-base ${
                      cumplida ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "border-foreground/25 hover:border-primary"
                    }`}
                    title={cumplida ? "Marcar como pendiente" : "Marcar como cumplida"}
                  >
                    {cumplida && <Check className="w-2.5 h-2.5" />}
                  </button>
                  <span className={`flex-1 min-w-[8rem] text-sm truncate ${cumplida ? "line-through text-muted-foreground" : ""}`}>
                    {g.title}
                  </span>
                  {g.target && g.target > 0 && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">{g.progress}/{g.target}</span>
                  )}
                  {g.target && g.target > 0 && (
                    <div className="w-16 h-1.5 rounded-full bg-foreground/5 overflow-hidden">
                      <div className={`h-full ${cumplida ? "bg-emerald-400" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <Badge className={PERIOD_STYLE[g.period]}>{PERIOD_LABELS[g.period]}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
