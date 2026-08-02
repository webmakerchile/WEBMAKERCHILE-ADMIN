import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { agenciaApi, CLAVE, type Cliente, type ContratoMantenimiento, type PagoMantenimiento } from "./api";
import { estadoDe, fmtCLP, fmtFecha, tipoMant } from "./formato";
import { Cargando, Chip, ErrorCarga, Ficha, Panel, Vacio } from "./ui";
import { useModoAgencia } from "./modo";

export default function Mantenimiento() {
  const esCompleto = useModoAgencia() === "completo";
  const resumen = useQuery({ queryKey: [CLAVE, "mant-resumen"], queryFn: agenciaApi.mantenimiento });
  const contratos = useQuery({
    queryKey: [CLAVE, "espejo", "contratos-mantenimiento", "todos"],
    queryFn: () => agenciaApi.espejo<ContratoMantenimiento>("contratos-mantenimiento", { limite: 200 }),
  });
  const vencidas = useQuery({
    queryKey: [CLAVE, "espejo", "pagos-mantenimiento", "OVERDUE"],
    queryFn: () => agenciaApi.espejo<PagoMantenimiento>("pagos-mantenimiento", { status: "OVERDUE", limite: 200 }),
    // Las cuotas son plata: ese recurso está vetado para el equipo (403).
    enabled: esCompleto,
  });
  const clientes = useQuery({
    queryKey: [CLAVE, "espejo", "clientes", ""],
    queryFn: () => agenciaApi.espejo<Cliente>("clientes", { limite: 300 }),
  });

  const nombreCliente = useMemo(() => {
    const porId = new Map<string, string>();
    for (const c of clientes.data?.datos ?? []) porId.set(c.id, c.companyName);
    const porContrato = new Map<string, string>();
    for (const m of contratos.data?.datos ?? []) porContrato.set(m.id, porId.get(m.clientId) ?? "");
    return { deCliente: (id: string) => porId.get(id) ?? "Cliente", deContrato: (id: string) => porContrato.get(id) ?? "Cliente" };
  }, [clientes.data, contratos.data]);

  if (resumen.isLoading) return <Cargando filas={5} />;
  if (resumen.isError) return <ErrorCarga error={resumen.error} reintentar={() => resumen.refetch()} />;

  const r = resumen.data!;

  return (
    <div className="space-y-4">
      {esCompleto ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Ficha etiqueta="MRR neto" valor={fmtCLP(r.recurrencia?.mrrNeto)} detalle={`${fmtCLP(r.recurrencia?.mrrConIva)} con IVA`} />
          <Ficha etiqueta="Ticket promedio" valor={fmtCLP(r.recurrencia?.ticketPromedio)} />
          <Ficha etiqueta="Contratos activos" valor={r.contratos.activos} detalle={`${r.contratos.pausados} pausados`} />
          <Ficha
            etiqueta="Cuotas vencidas"
            valor={r.cobranza?.cuotasVencidas ?? 0}
            detalle={fmtCLP(r.cobranza?.montoVencido)}
            tono={(r.cobranza?.cuotasVencidas ?? 0) > 0 ? "mal" : "bien"}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Ficha etiqueta="Contratos activos" valor={r.contratos.activos} />
          <Ficha etiqueta="Pausados" valor={r.contratos.pausados} />
          <Ficha etiqueta="Cancelados" valor={r.contratos.cancelados} />
          <Ficha etiqueta="Próximos vencimientos" valor={r.proximosVencimientos.length} />
        </div>
      )}

      <Panel titulo="Por tipo de servicio">
        <div className="space-y-1.5 text-sm">
          {Object.entries(r.contratos.porTipo).map(([tipo, info]) => (
            <div key={tipo} className="flex items-center justify-between gap-2">
              <span>{tipoMant(tipo)}</span>
              <span className="text-muted-foreground">
                {info.contratos} contrato{info.contratos === 1 ? "" : "s"}
                {esCompleto && (
                  <>
                    {" · "}
                    <span className="font-medium text-foreground">{fmtCLP(info.mrrNeto)}/mes</span>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      {vencidas.data && vencidas.data.datos.length > 0 && (
        <Panel titulo={`Cuotas vencidas (${vencidas.data.datos.length})`}>
          <div className="space-y-2">
            {vencidas.data.datos.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{nombreCliente.deContrato(p.contractId)}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(p.month).padStart(2, "0")}/{p.year} · vencía {fmtFecha(p.dueDate)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-red-500">{fmtCLP(p.amount)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel titulo="Próximos vencimientos">
        {r.proximosVencimientos.length === 0 ? (
          <Vacio>Nada por vencer pronto.</Vacio>
        ) : (
          <div className="space-y-2">
            {r.proximosVencimientos.slice(0, 12).map((v) => (
              <div key={v.pagoId} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{v.cliente}</p>
                  <p className="text-xs text-muted-foreground">
                    {tipoMant(v.tipoServicio)} · {v.periodo} · vence {fmtFecha(v.vence)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {esCompleto && <span className="text-sm font-semibold">{fmtCLP(v.monto)}</span>}
                  <Chip {...estadoDe(v.estado)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel titulo={`Contratos de mantención (${contratos.data?.datos.length ?? "…"})`}>
        {contratos.isLoading ? (
          <Cargando filas={3} />
        ) : (
          <div className="space-y-2">
            {(contratos.data?.datos ?? []).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{nombreCliente.deCliente(m.clientId)}</p>
                  <p className="text-xs text-muted-foreground">
                    {tipoMant(m.serviceType)} · desde {fmtFecha(m.startDate)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {esCompleto && <span className="text-sm font-semibold">{fmtCLP(m.monthlyPrice)}/mes</span>}
                  <Chip {...estadoDe(m.status)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
