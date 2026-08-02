import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { agenciaApi, CLAVE } from "./api";
import { fmtCLP, MESES } from "./formato";
import { Cargando, ErrorCarga, Ficha, Panel } from "./ui";

const ANIO_ACTUAL = new Date().getFullYear();

export default function Finanzas() {
  const [anio, setAnio] = useState(ANIO_ACTUAL);

  const fin = useQuery({
    queryKey: [CLAVE, "finanzas", anio],
    queryFn: () => agenciaApi.finanzas(anio),
  });

  if (fin.isLoading) return <Cargando filas={5} />;
  if (fin.isError) return <ErrorCarga error={fin.error} reintentar={() => fin.refetch()} />;

  const f = fin.data!;
  const maxNeto = Math.max(1, ...f.porMes.map((m) => Math.abs(m.neto)));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[ANIO_ACTUAL, ANIO_ACTUAL - 1].map((a) => (
          <button
            key={a}
            onClick={() => setAnio(a)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
              anio === a ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Ficha etiqueta={`Ingresos ${f.anio}`} valor={fmtCLP(f.totales.ingresos)} detalle={`proyectos ${fmtCLP(f.totales.pagosProyecto)} · otros ${fmtCLP(f.totales.ingresosManuales)}`} />
        <Ficha etiqueta="Gastos" valor={fmtCLP(f.totales.gastos)} />
        <Ficha etiqueta="Neto" valor={fmtCLP(f.totales.neto)} tono={f.totales.neto >= 0 ? "bien" : "mal"} />
        <Ficha
          etiqueta="Conversión de ventas"
          valor={`${f.pipeline.tasaConversion}%`}
          detalle={`${f.pipeline.presupuestosGanados} ganados · ${fmtCLP(f.pipeline.montoGanado)}`}
        />
      </div>

      <Panel titulo="Mes a mes">
        <div className="space-y-2">
          {f.porMes.map((m) => {
            const ancho = Math.round((Math.abs(m.neto) / maxNeto) * 100);
            return (
              <div key={m.mes} className="flex items-center gap-3">
                <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">{MESES[m.mes - 1]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${m.neto >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                    style={{ width: `${ancho}%` }}
                  />
                </div>
                <div className="w-40 shrink-0 text-right">
                  <span className={`text-sm font-semibold ${m.neto >= 0 ? "" : "text-red-500"}`}>{fmtCLP(m.neto)}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    +{fmtCLP(m.pagosProyecto)}
                    {m.ingresosManuales > 0 ? ` +${fmtCLP(m.ingresosManuales)}` : ""} · −{fmtCLP(m.gastos)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel titulo="Pipeline de ventas">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Abiertos</p>
            <p className="font-semibold">
              {f.pipeline.presupuestosAbiertos} · {fmtCLP(f.pipeline.montoCotizado)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Ganados</p>
            <p className="font-semibold">
              {f.pipeline.presupuestosGanados} · {fmtCLP(f.pipeline.montoGanado)}
            </p>
          </div>
        </div>
      </Panel>

      {(f.tienda.pedidosPagados > 0 || f.documentosTributarios.total > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {f.tienda.pedidosPagados > 0 && (
            <Ficha etiqueta="Tienda" valor={fmtCLP(f.tienda.montoPedidosPagados)} detalle={`${f.tienda.pedidosPagados} pedidos pagados`} />
          )}
          {f.documentosTributarios.total > 0 && (
            <Ficha
              etiqueta="Documentos tributarios"
              valor={f.documentosTributarios.emitidos}
              detalle={`${fmtCLP(f.documentosTributarios.montoEmitido)} emitidos${f.documentosTributarios.fallidos ? ` · ${f.documentosTributarios.fallidos} fallidos` : ""}`}
            />
          )}
        </div>
      )}
    </div>
  );
}
