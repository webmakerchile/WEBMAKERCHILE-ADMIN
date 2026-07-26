import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useHubOwner, contractTotal, fmtCLP, fmtDate, daysUntil,
  CONTRACT_STATUS_STYLE, type ContractStatus, type HubContract,
} from "@/lib/hub-owner";
import { Loader2, Handshake, AlertTriangle, FileText, ExternalLink, Users2, CalendarClock, Search } from "lucide-react";
import { TicketsInline } from "@/components/tickets-inline";

type Filter = "todos" | ContractStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "borrador", label: "Cotizaciones" },
  { id: "activo", label: "Activos" },
  { id: "vencido", label: "Vencidos" },
  { id: "cancelado", label: "Cancelados" },
];

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "primary" | "emerald" | "amber" }) {
  const toneClass = tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : "text-primary";
  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
        <p className={`text-xl sm:text-2xl font-bold ${toneClass}`}>{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function VentasPage() {
  const { data, isLoading, error } = useHubOwner();
  const contracts = useMemo(() => data?.data.contracts ?? [], [data]);
  const clients = useMemo(() => data?.data.clients ?? [], [data]);
  const meetings = useMemo(() => data?.data.meetings ?? [], [data]);

  const [filter, setFilter] = useState<Filter>("todos");
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return contracts
      .filter(c => filter === "todos" || c.status === filter)
      .filter(c => !needle || `${c.title} ${c.client}`.toLowerCase().includes(needle))
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }, [contracts, filter, q]);

  const stats = useMemo(() => {
    const sum = (list: HubContract[]) => list.reduce((a, c) => a + contractTotal(c), 0);
    const activos = contracts.filter(c => c.status === "activo");
    const abiertas = contracts.filter(c => c.status === "borrador");
    const cerradas = activos.length + contracts.filter(c => c.status === "vencido").length;
    const perdidas = contracts.filter(c => c.status === "cancelado").length;
    return {
      pipeline: sum(abiertas),
      abiertas: abiertas.length,
      ganado: sum(activos),
      activos: activos.length,
      // Tasa de cierre sobre lo que ya se resolvió (ganado vs. cancelado).
      cierre: cerradas + perdidas > 0 ? Math.round((cerradas / (cerradas + perdidas)) * 100) : null,
    };
  }, [contracts]);

  const proximasReuniones = useMemo(
    () => [...meetings].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 6),
    [meetings],
  );

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Ventas</h1>
          <p className="text-muted-foreground text-xs sm:text-base">
            Cartera de clientes, reuniones y estado de cada cotización.
          </p>
        </header>

        <TicketsInline title="Solicitudes de ventas" />

        {isLoading && <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{(error as Error).message}</span>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Pipeline abierto" value={fmtCLP(stats.pipeline)} hint={`${stats.abiertas} cotización${stats.abiertas === 1 ? "" : "es"} por cerrar`} tone="amber" />
              <Kpi label="Cerrado / activo" value={fmtCLP(stats.ganado)} hint={`${stats.activos} contrato${stats.activos === 1 ? "" : "s"} vigentes`} tone="emerald" />
              <Kpi label="Tasa de cierre" value={stats.cierre === null ? "—" : `${stats.cierre}%`} hint="Cerrados vs. cancelados" />
              <Kpi label="Clientes" value={String(clients.length)} hint={`${meetings.length} reunión${meetings.length === 1 ? "" : "es"} registradas`} />
            </div>

            <Card className="bg-card/40 border-foreground/10">
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {FILTERS.map(f => (
                      <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-base ${
                          filter === f.id
                            ? "bg-primary/15 text-primary border-primary/30"
                            : "border-foreground/10 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                        }`}
                      >{f.label}</button>
                    ))}
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={q}
                      onChange={e => setQ(e.target.value)}
                      placeholder="Buscar cliente o servicio…"
                      className="h-8 w-56 rounded-lg border border-foreground/15 bg-card/60 pl-8 pr-2 text-xs"
                    />
                  </div>
                </div>

                {visible.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    <Handshake className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No hay contratos que coincidan.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {visible.map(c => {
                      const st = CONTRACT_STATUS_STYLE[c.status] ?? CONTRACT_STATUS_STYLE.borrador;
                      const days = daysUntil(c.expiresAt);
                      const mods = c.doc?.modules?.filter(m => (m?.name || "").trim() !== "") ?? [];
                      return (
                        <li key={c.id} className="rounded-xl border border-foreground/10 bg-card/40 p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{c.title}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{c.client || "Sin cliente"}</p>
                              {mods.length > 0 && (
                                <p className="text-[11px] text-muted-foreground/80 mt-1 truncate">
                                  {mods.length} módulo{mods.length === 1 ? "" : "s"}: {mods.map(m => m.name).join(" · ")}
                                </p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-semibold tabular-nums">{fmtCLP(contractTotal(c))}</p>
                              <Badge className={`${st.className} mt-1`}>{st.label}</Badge>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                            <span>Firma: {fmtDate(c.signedAt)}</span>
                            <span>
                              Vence: {fmtDate(c.expiresAt)}
                              {days !== null && (c.status === "activo" || c.status === "borrador") && (
                                <span className={days < 0 ? "text-red-400 ml-1" : days <= 15 ? "text-amber-400 ml-1" : "ml-1"}>
                                  ({days < 0 ? `hace ${Math.abs(days)}d` : days === 0 ? "hoy" : `en ${days}d`})
                                </span>
                              )}
                            </span>
                            {c.pdfUrl && (
                              <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                <FileText className="w-3 h-3" /> Ver cotización <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Users2 className="w-4 h-4 text-primary" /> Clientes</p>
                  {clients.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Aún no hay clientes registrados.</p>
                  ) : (
                    <ul className="divide-y divide-foreground/5">
                      {clients.map(cl => (
                        <li key={cl.id} className="py-2.5">
                          <p className="text-sm font-medium truncate">{cl.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {[cl.contact, cl.segment].filter(Boolean).join(" · ") || "Sin contacto"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-3 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-primary" /> Últimas reuniones</p>
                  {proximasReuniones.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">Aún no hay reuniones registradas.</p>
                  ) : (
                    <ul className="divide-y divide-foreground/5">
                      {proximasReuniones.map(m => (
                        <li key={m.id} className="py-2.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-medium truncate">{m.client || "Sin cliente"}</p>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(m.date)}</span>
                          </div>
                          {m.summary && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{m.summary}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <p className="text-xs text-muted-foreground">
              Vista de solo lectura del tablero de la dirección{data?.owner ? ` (${data.owner.name || data.owner.email})` : ""}.
              Para crear o editar contratos se usa el Hub Ejecutivo.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
