import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/App";
import { TICKET_AREA_LABELS } from "@workspace/roles";
import { useTickets, STATUS_META, PRIORITY_META, fmtWhen } from "@/lib/tickets";
import { Loader2, Inbox, ArrowRight, ListChecks } from "lucide-react";

/**
 * Bandeja compacta de tickets para las páginas de área.
 *
 * Es el enganche entre paneles: cada rol ve en su propia pantalla lo que las
 * otras áreas le pidieron, sin tener que ir a buscarlo.
 */
export function TicketsInline({ title = "Solicitudes de mi área", limit = 5 }: { title?: string; limit?: number }) {
  const me = useAuth();
  const { data, isLoading } = useTickets(false);

  const tickets = (data?.tickets ?? [])
    .filter(t => (data?.myAreas ?? []).includes(t.area) || t.assignedTo === me?.id || t.createdBy === me?.id)
    .filter(t => t.status !== "cerrado")
    .slice(0, limit);

  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Inbox className="w-4 h-4 text-primary" /> {title}
          </p>
          <Link href="/tickets" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            Ver todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {isLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Sin solicitudes pendientes. <Link href="/tickets" className="text-primary hover:underline">Crear una</Link>.
          </p>
        ) : (
          <ul className="space-y-2">
            {tickets.map(t => (
              <li key={t.id}>
                <Link href="/tickets" className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 bg-card/40 px-3 py-2 hover:border-primary/30 transition-base">
                  <span className="text-[11px] font-mono text-muted-foreground">#{t.id}</span>
                  <span className="flex-1 min-w-[8rem] text-sm truncate">{t.title}</span>
                  {t.taskId && (
                    <span className="text-[10px] text-emerald-400 inline-flex items-center gap-1">
                      <ListChecks className="w-3 h-3" /> en tablero
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">{TICKET_AREA_LABELS[t.area]}</span>
                  <Badge className={PRIORITY_META[t.priority]?.className}>{PRIORITY_META[t.priority]?.label}</Badge>
                  <Badge className={STATUS_META[t.status]?.className}>{STATUS_META[t.status]?.label}</Badge>
                  <span className="text-[11px] text-muted-foreground hidden md:inline">{fmtWhen(t.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
