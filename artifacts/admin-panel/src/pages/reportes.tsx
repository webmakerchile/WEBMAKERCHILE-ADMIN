import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useHubOwner, useCobroMutation, contractTotal, splitIva, fmtCLP, fmtDate, daysUntil,
  CONTRACT_STATUS_STYLE, COBRO_STATES, COBRO_STYLE,
  type HubContract, type CobroEstado,
} from "@/lib/hub-owner";
import { Loader2, Receipt, Download, AlertTriangle, FileText, ExternalLink, Wallet, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TicketsInline } from "@/components/tickets-inline";
import { MetasInline } from "@/components/metas-inline";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Año de firma del contrato; si no está firmado, el de creación. */
function contractYear(c: HubContract): number {
  const iso = c.signedAt || "";
  const y = Number(iso.slice(0, 4));
  return Number.isFinite(y) && y > 1990 ? y : new Date(c.createdAt || Date.now()).getFullYear();
}

function contractMonth(c: HubContract): number {
  const iso = c.signedAt || "";
  const m = Number(iso.slice(5, 7));
  return m >= 1 && m <= 12 ? m - 1 : new Date(c.createdAt || Date.now()).getMonth();
}

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

/** Estado de cobranza del contrato: lo único que contabilidad puede escribir. */
function CobroEditor({ contract, onClose }: { contract: HubContract; onClose: () => void }) {
  const guardar = useCobroMutation();
  const { toast } = useToast();
  const actual = contract.cobro;
  const [estado, setEstado] = useState<CobroEstado>(actual?.estado ?? "pendiente");
  const [factura, setFactura] = useState(actual?.factura ?? "");
  const [fechaPago, setFechaPago] = useState(actual?.fechaPago ?? "");
  const [nota, setNota] = useState(actual?.nota ?? "");

  const submit = () => {
    guardar.mutate({ contractId: contract.id, cobro: { estado, factura, fechaPago, nota } }, {
      onSuccess: () => { toast({ title: "Cobranza actualizada" }); onClose(); },
      onError: e => toast({ title: "No se pudo guardar", description: (e as Error).message, variant: "destructive" }),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-foreground/15 bg-card p-5 shadow-2xl space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold truncate">{contract.title}</p>
            <p className="text-xs text-muted-foreground truncate">{contract.client || "Sin cliente"} · {fmtCLP(contractTotal(contract))}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {COBRO_STATES.map(s => (
            <button
              key={s}
              onClick={() => setEstado(s)}
              className={`px-2.5 py-1 rounded-lg text-xs border transition-base ${
                estado === s ? COBRO_STYLE[s].className : "border-foreground/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              {COBRO_STYLE[s].label}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="text-[11px] text-muted-foreground">N° de factura / boleta</span>
          <input
            value={factura}
            onChange={e => setFactura(e.target.value)}
            placeholder="Ej: F-2026-104"
            className="mt-0.5 w-full h-9 rounded-lg border border-foreground/15 bg-card/60 px-2.5 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-[11px] text-muted-foreground">Fecha de pago</span>
          <input
            type="date"
            value={fechaPago}
            onChange={e => setFechaPago(e.target.value)}
            className="mt-0.5 w-full h-9 rounded-lg border border-foreground/15 bg-card/60 px-2.5 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-[11px] text-muted-foreground">Nota interna</span>
          <textarea
            rows={2}
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Acuerdo de pago, retención, gestión de cobranza…"
            className="mt-0.5 w-full rounded-lg border border-foreground/15 bg-card/60 px-2.5 py-1.5 text-sm resize-y"
          />
        </label>

        <div className="flex items-center gap-2 pt-1">
          <Button className="flex-1" onClick={submit} disabled={guardar.isPending}>
            {guardar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
        {actual?.updatedAt && (
          <p className="text-[10px] text-muted-foreground">
            Última actualización {fmtDate(new Date(actual.updatedAt).toISOString().slice(0, 10))}
            {actual.by ? ` · ${actual.by}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ReportesPage() {
  const { data, isLoading, error } = useHubOwner();
  const contracts = useMemo(() => data?.data.contracts ?? [], [data]);
  const [cobrando, setCobrando] = useState<HubContract | null>(null);

  const years = useMemo(() => {
    const set = new Set(contracts.map(contractYear));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [contracts]);

  const [year, setYear] = useState<number | "todos">(new Date().getFullYear());

  const scoped = useMemo(
    () => (year === "todos" ? contracts : contracts.filter(c => contractYear(c) === year)),
    [contracts, year],
  );

  const stats = useMemo(() => {
    // "Cancelado" no factura; el resto sí cuenta como monto comprometido.
    const facturables = scoped.filter(c => c.status !== "cancelado");
    const activos = scoped.filter(c => c.status === "activo");
    const borradores = scoped.filter(c => c.status === "borrador");
    const sum = (list: HubContract[]) => list.reduce((a, c) => a + contractTotal(c), 0);
    const totalActivo = sum(activos);
    // Cobranza: lo que ya se facturó y sigue sin pagarse es la plata que falta
    // por entrar. Es el número que contabilidad mira todos los días.
    const porCobrar = facturables.filter(c => (c.cobro?.estado ?? "pendiente") !== "pagado" && c.cobro?.estado !== "incobrable");
    const pagados = facturables.filter(c => c.cobro?.estado === "pagado");
    return {
      totalFacturable: sum(facturables),
      totalActivo,
      ivaActivo: splitIva(totalActivo).iva,
      netoActivo: splitIva(totalActivo).neto,
      enBorrador: sum(borradores),
      countActivos: activos.length,
      countBorradores: borradores.length,
      countTotal: scoped.length,
      porCobrar: sum(porCobrar),
      countPorCobrar: porCobrar.length,
      cobrado: sum(pagados),
      countCobrado: pagados.length,
      sinGestion: facturables.filter(c => !c.cobro).length,
    };
  }, [scoped]);

  const byMonth = useMemo(() => {
    const rows = MONTHS.map((label, i) => ({ label, i, count: 0, total: 0 }));
    for (const c of scoped) {
      if (c.status === "cancelado") continue;
      const row = rows[contractMonth(c)];
      row.count += 1;
      row.total += contractTotal(c);
    }
    return rows;
  }, [scoped]);

  const maxMonth = Math.max(1, ...byMonth.map(r => r.total));

  const vencimientos = useMemo(() => {
    return contracts
      .filter(c => c.status === "activo" || c.status === "borrador")
      .map(c => ({ c, days: daysUntil(c.expiresAt) }))
      .filter((x): x is { c: HubContract; days: number } => x.days !== null && x.days <= 60)
      .sort((a, b) => a.days - b.days);
  }, [contracts]);

  const exportCsv = () => {
    const head = ["Titulo", "Cliente", "Estado", "Firma", "Vencimiento", "Neto", "IVA", "Total", "Cobranza", "Factura", "Pago"];
    const rows = scoped.map(c => {
      const total = contractTotal(c);
      const { neto, iva } = splitIva(total);
      return [
        c.title, c.client, c.status, c.signedAt || "", c.expiresAt || "", neto, iva, total,
        COBRO_STYLE[c.cobro?.estado ?? "pendiente"].label, c.cobro?.factura || "", c.cobro?.fechaPago || "",
      ];
    });
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [head, ...rows].map(r => r.map(esc).join(";")).join("\n");
    // BOM para que Excel en español abra los acentos correctamente.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reporte-contratos-${year === "todos" ? "todos" : year}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Reportes</h1>
            <p className="text-muted-foreground text-xs sm:text-base">
              Contratos, montos netos, IVA y vencimientos{data?.owner ? ` · tablero de ${data.owner.name || data.owner.email}` : ""}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={String(year)}
              onChange={e => setYear(e.target.value === "todos" ? "todos" : Number(e.target.value))}
              className="h-9 rounded-lg border border-foreground/15 bg-card/60 px-3 text-sm"
            >
              <option value="todos">Todos los años</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={scoped.length === 0}>
              <Download className="w-4 h-4 mr-1.5" /> CSV
            </Button>
          </div>
        </header>

        <MetasInline />

        <TicketsInline title="Solicitudes a finanzas" />

        {isLoading && (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{(error as Error).message}</span>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Contratos activos" value={fmtCLP(stats.totalActivo)} hint={`${stats.countActivos} contrato${stats.countActivos === 1 ? "" : "s"}`} tone="emerald" />
              <Kpi label="Neto (sin IVA)" value={fmtCLP(stats.netoActivo)} hint="Base imponible de los activos" />
              <Kpi label="IVA 19%" value={fmtCLP(stats.ivaActivo)} hint="Débito fiscal de los activos" />
              <Kpi label="En borrador" value={fmtCLP(stats.enBorrador)} hint={`${stats.countBorradores} cotización${stats.countBorradores === 1 ? "" : "es"} sin cerrar`} tone="amber" />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <Kpi label="Por cobrar" value={fmtCLP(stats.porCobrar)} hint={`${stats.countPorCobrar} contrato${stats.countPorCobrar === 1 ? "" : "s"} sin pago registrado`} tone="amber" />
              <Kpi label="Cobrado" value={fmtCLP(stats.cobrado)} hint={`${stats.countCobrado} pagado${stats.countCobrado === 1 ? "" : "s"}`} tone="emerald" />
              <Kpi label="Sin gestionar" value={String(stats.sinGestion)} hint="Todavía no les registraste cobranza" />
            </div>

            {vencimientos.length > 0 && (
              <Card className="bg-card/40 border-amber-500/20">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" /> Vencen pronto
                  </p>
                  <ul className="space-y-2">
                    {vencimientos.map(({ c, days }) => (
                      <li key={c.id} className="flex items-center gap-3 text-sm">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${days < 0 ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                          {days < 0 ? `vencido hace ${Math.abs(days)}d` : days === 0 ? "hoy" : `en ${days}d`}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{c.title}</span>
                        <span className="text-muted-foreground text-xs truncate max-w-[30%]">{c.client}</span>
                        <span className="text-xs font-semibold whitespace-nowrap">{fmtCLP(contractTotal(c))}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="bg-card/40 border-foreground/10">
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-3">Facturación por mes {year !== "todos" && <span className="text-muted-foreground font-normal">· {year}</span>}</p>
                <div className="space-y-1.5">
                  {byMonth.map(row => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-9 text-[11px] text-muted-foreground">{row.label}</span>
                      <div className="flex-1 h-4 rounded bg-foreground/5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary/80 to-orange-500/70"
                          style={{ width: `${row.total > 0 ? Math.max(3, (row.total / maxMonth) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="w-24 text-right text-[11px] tabular-nums text-muted-foreground">{row.total > 0 ? fmtCLP(row.total) : "—"}</span>
                      <span className="w-6 text-right text-[11px] text-muted-foreground/70">{row.count || ""}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/40 border-foreground/10">
              <CardContent className="p-2 sm:p-4">
                <p className="text-sm font-semibold mb-3 px-2 sm:px-0">
                  Detalle de contratos <span className="text-muted-foreground font-normal">({stats.countTotal})</span>
                </p>
                {scoped.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No hay contratos en este período.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-foreground/10">
                          <th className="text-left font-medium py-2 px-2">Contrato</th>
                          <th className="text-left font-medium py-2 px-2">Estado</th>
                          <th className="text-left font-medium py-2 px-2">Firma</th>
                          <th className="text-left font-medium py-2 px-2">Vence</th>
                          <th className="text-right font-medium py-2 px-2">Neto</th>
                          <th className="text-right font-medium py-2 px-2">IVA</th>
                          <th className="text-right font-medium py-2 px-2">Total</th>
                          <th className="text-left font-medium py-2 px-2">Cobranza</th>
                          <th className="py-2 px-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...scoped].sort((a, b) => (b.signedAt || "").localeCompare(a.signedAt || "")).map(c => {
                          const total = contractTotal(c);
                          const { neto, iva } = splitIva(total);
                          const st = CONTRACT_STATUS_STYLE[c.status] ?? CONTRACT_STATUS_STYLE.borrador;
                          return (
                            <tr key={c.id} className="border-b border-foreground/5 last:border-0">
                              <td className="py-2.5 px-2">
                                <p className="font-medium truncate max-w-[240px]">{c.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">{c.client || "—"}</p>
                              </td>
                              <td className="py-2.5 px-2"><Badge className={st.className}>{st.label}</Badge></td>
                              <td className="py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(c.signedAt)}</td>
                              <td className="py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(c.expiresAt)}</td>
                              <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">{fmtCLP(neto)}</td>
                              <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmtCLP(iva)}</td>
                              <td className="py-2.5 px-2 text-right tabular-nums font-semibold whitespace-nowrap">{fmtCLP(total)}</td>
                              <td className="py-2.5 px-2 whitespace-nowrap">
                                <button
                                  onClick={() => setCobrando(c)}
                                  title="Registrar facturación o pago"
                                  className="inline-flex items-center gap-1.5 hover:opacity-80 transition-base"
                                >
                                  <Badge className={COBRO_STYLE[c.cobro?.estado ?? "pendiente"].className}>
                                    {COBRO_STYLE[c.cobro?.estado ?? "pendiente"].label}
                                  </Badge>
                                  <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
                                </button>
                                {c.cobro?.factura && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{c.cobro.factura}</p>
                                )}
                              </td>
                              <td className="py-2.5 px-2">
                                {c.pdfUrl && (
                                  <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer" title="Abrir PDF en Drive" className="text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                                    <FileText className="w-4 h-4" /><ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
              Los montos salen de los módulos de cada cotización (netos) más IVA 19%. Los contratos cancelados no suman.
              Puedes registrar facturación y pagos desde la columna Cobranza; el contenido comercial del contrato
              (precios, módulos, alcance) se edita en el Hub Ejecutivo.
            </p>
          </>
        )}

        {cobrando && <CobroEditor contract={cobrando} onClose={() => setCobrando(null)} />}
      </div>
    </Layout>
  );
}
