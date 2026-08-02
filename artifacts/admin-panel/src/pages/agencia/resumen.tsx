import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FilePlus2 } from "lucide-react";
import { agenciaApi, CLAVE } from "./api";
import { fmtCLP } from "./formato";
import { Cargando, ErrorCarga, Ficha, Panel } from "./ui";
import { useModoAgencia } from "./modo";

const NOMBRES_ESPEJO: Record<string, string> = {
  clientes: "Clientes",
  presupuestos: "Presupuestos",
  proyectos: "Proyectos",
  "contratos-servicio": "Contratos",
  "contratos-mantenimiento": "Mantenciones",
  "pagos-mantenimiento": "Cuotas",
  leads: "Leads",
  servicios: "Servicios",
};

export default function Resumen() {
  const esCompleto = useModoAgencia() === "completo";
  const resumen = useQuery({ queryKey: [CLAVE, "resumen"], queryFn: agenciaApi.resumen });
  const mant = useQuery({ queryKey: [CLAVE, "mant-resumen"], queryFn: agenciaApi.mantenimiento });

  if (resumen.isLoading) return <Cargando filas={5} />;
  if (resumen.isError) return <ErrorCarga error={resumen.error} reintentar={() => resumen.refetch()} />;

  const n = resumen.data!.negocio;
  const cobranza = mant.data?.cobranza;

  return (
    <div className="space-y-4">
      {esCompleto ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Ficha etiqueta="MRR neto" valor={fmtCLP(n.mrrNeto)} detalle={`${fmtCLP(n.mrrConIva)} con IVA`} />
          <Ficha etiqueta="ARR estimado" valor={fmtCLP(n.arrEstimadoNeto)} detalle="neto anual" />
          <Ficha
            etiqueta="Proyectos activos"
            valor={n.proyectosActivos}
            detalle={`${fmtCLP(n.valorProyectosActivos)} en curso`}
          />
          <Ficha
            etiqueta="Presupuestos abiertos"
            valor={n.presupuestosAbiertos}
            detalle={`${fmtCLP(n.pipelineCotizado)} cotizados`}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Ficha etiqueta="Proyectos activos" valor={n.proyectosActivos} />
          <Ficha etiqueta="Presupuestos abiertos" valor={n.presupuestosAbiertos} />
          <Ficha etiqueta="Mantenciones activas" valor={n.contratosMantenimientoActivos} />
          <Link href="/agencia/contratos/nuevo" className="block">
            <div className="flex h-full flex-col justify-between rounded-xl border border-primary/40 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
              <FilePlus2 size={18} className="text-primary" />
              <div>
                <p className="text-sm font-semibold text-primary">Nuevo contrato</p>
                <p className="text-xs text-muted-foreground">Cliente → presupuesto → firma</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {esCompleto && cobranza && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Ficha
            etiqueta="Mantenciones activas"
            valor={resumen.data!.negocio.contratosMantenimientoActivos}
            detalle={mant.data?.recurrencia ? `ticket promedio ${fmtCLP(mant.data.recurrencia.ticketPromedio)}` : undefined}
          />
          <Ficha etiqueta="Cuotas impagas" valor={cobranza.cuotasImpagas} detalle={fmtCLP(cobranza.montoImpago)} />
          <Ficha
            etiqueta="Cuotas vencidas"
            valor={cobranza.cuotasVencidas}
            detalle={fmtCLP(cobranza.montoVencido)}
            tono={cobranza.cuotasVencidas > 0 ? "mal" : "bien"}
          />
          <Link href="/agencia/contratos/nuevo" className="block">
            <div className="flex h-full flex-col justify-between rounded-xl border border-primary/40 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
              <FilePlus2 size={18} className="text-primary" />
              <div>
                <p className="text-sm font-semibold text-primary">Nuevo contrato</p>
                <p className="text-xs text-muted-foreground">Cliente → presupuesto → firma</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      <Panel titulo="Accesos rápidos">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { ruta: "/agencia/presupuestos", titulo: "Presupuestos", detalle: "Estados, links de propuesta" },
            { ruta: "/agencia/contratos", titulo: "Contratos", detalle: "Links de firma y PDFs" },
            { ruta: "/agencia/mantenimiento", titulo: "Mantención", detalle: esCompleto ? "MRR y cobranza" : "Contratos y vencimientos" },
          ].map((a) => (
            <Link
              key={a.ruta}
              href={a.ruta}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm hover:bg-muted"
            >
              <span>
                <span className="block font-medium">{a.titulo}</span>
                <span className="block text-xs text-muted-foreground">{a.detalle}</span>
              </span>
              <ArrowRight size={15} className="shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </Panel>

      <Panel titulo="Registros en el espejo">
        <div className="flex flex-wrap gap-2">
          {Object.entries(resumen.data!.registros)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => (
              <span key={k} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {NOMBRES_ESPEJO[k] ?? k}: <span className="font-semibold text-foreground">{v}</span>
              </span>
            ))}
        </div>
      </Panel>
    </div>
  );
}
