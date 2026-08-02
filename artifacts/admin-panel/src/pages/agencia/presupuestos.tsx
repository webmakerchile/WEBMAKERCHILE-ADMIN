import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FilePlus2 } from "lucide-react";
import {
  agenciaApi,
  CLAVE,
  enlacePropuesta,
  ErrorPanel,
  type Cliente,
  type Presupuesto,
  type VistaPresupuesto,
} from "./api";
import { estadoDe, fmtCLP, fmtFecha } from "./formato";
import { Aviso, BotonCopiar, Cargando, Chip, ErrorCarga, Lamina, Vacio } from "./ui";

const FILTROS = [
  { valor: "", etiqueta: "Todos" },
  { valor: "SENT", etiqueta: "Enviadas" },
  { valor: "VIEWED", etiqueta: "Vistas" },
  { valor: "APPROVED", etiqueta: "Aprobadas" },
  { valor: "DRAFT", etiqueta: "Borradores" },
  { valor: "REJECTED", etiqueta: "Rechazadas" },
  { valor: "EXPIRED", etiqueta: "Vencidas" },
];

export default function Presupuestos({ idAbierto }: { idAbierto?: string }) {
  const [, navegar] = useLocation();
  const [estado, setEstado] = useState("");

  const lista = useQuery({
    queryKey: [CLAVE, "espejo", "presupuestos", estado],
    queryFn: () => agenciaApi.espejo<Presupuesto>("presupuestos", { status: estado || undefined, limite: 300 }),
  });
  const clientes = useQuery({
    queryKey: [CLAVE, "espejo", "clientes", ""],
    queryFn: () => agenciaApi.espejo<Cliente>("clientes", { limite: 300 }),
  });

  const nombreCliente = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientes.data?.datos ?? []) m.set(c.id, c.companyName);
    return (id: string) => m.get(id) ?? "Cliente";
  }, [clientes.data]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => setEstado(f.valor)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
                estado === f.valor
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
        <Link
          href="/agencia/contratos/nuevo"
          className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 sm:inline-flex"
        >
          <FilePlus2 size={14} /> Nuevo
        </Link>
      </div>

      {lista.isLoading ? (
        <Cargando />
      ) : lista.isError ? (
        <ErrorCarga error={lista.error} reintentar={() => lista.refetch()} />
      ) : lista.data!.datos.length === 0 ? (
        <Vacio>No hay presupuestos con ese filtro.</Vacio>
      ) : (
        <ul className="space-y-2">
          {lista.data!.datos.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => navegar(`/agencia/presupuestos/${p.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{nombreCliente(p.clientId)}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtFecha(p.createdAt)}
                    {Number(p.monthlyMaintenance) > 0 && ` · mantención ${fmtCLP(p.monthlyMaintenance)}/mes`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="text-sm font-semibold">{fmtCLP(p.total)}</span>
                  <Chip {...estadoDe(p.status)} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {idAbierto && <DetallePresupuesto id={idAbierto} alCerrar={() => navegar("/agencia/presupuestos")} />}
    </div>
  );
}

function DetallePresupuesto({ id, alCerrar }: { id: string; alCerrar: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const vista = useQuery({
    queryKey: [CLAVE, "vista", "presupuestos", id],
    queryFn: () => agenciaApi.vista<VistaPresupuesto>("presupuestos", id),
  });

  const cambiar = useMutation({
    mutationFn: (estado: string) => agenciaApi.patchPresupuesto(id, { estado }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: [CLAVE] });
    },
    onError: (e) => setError(e instanceof ErrorPanel ? e.message : "No se pudo cambiar el estado."),
  });

  const d = vista.data?.datos;
  const p = d?.presupuesto;
  const enlace = p ? enlacePropuesta(p) : undefined;

  const accion = (estado: string, texto: string, confirmacion: string) => (
    <button
      key={estado}
      disabled={cambiar.isPending}
      onClick={() => {
        if (window.confirm(confirmacion)) cambiar.mutate(estado);
      }}
      className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
    >
      {texto}
    </button>
  );

  return (
    <Lamina titulo={d?.cliente?.companyName ?? "Presupuesto"} alCerrar={alCerrar}>
      {vista.isLoading ? (
        <Cargando filas={3} />
      ) : vista.isError ? (
        <ErrorCarga error={vista.error} reintentar={() => vista.refetch()} />
      ) : p ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip {...estadoDe(p.status)} />
            <span className="text-xs text-muted-foreground">creado {fmtFecha(p.createdAt)}</span>
            {p.validUntil && <span className="text-xs text-muted-foreground">· vigente hasta {fmtFecha(p.validUntil)}</span>}
          </div>

          {error && <Aviso tono="error">{error}</Aviso>}

          <div className="flex flex-wrap gap-2">
            {enlace && <BotonCopiar texto={enlace} etiqueta="Copiar link propuesta" />}
            {enlace && (
              <a
                href={enlace}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <ExternalLink size={13} /> Abrir
              </a>
            )}
            {p.status === "DRAFT" && accion("SENT", "Marcar enviada", "¿Marcar este presupuesto como enviado?")}
            {["SENT", "VIEWED"].includes(p.status) &&
              accion("REJECTED", "Marcar rechazada", "¿Marcar como rechazada? El cliente ya no podrá aprobarla.")}
            {["SENT", "VIEWED"].includes(p.status) &&
              accion("EXPIRED", "Marcar vencida", "¿Marcar como vencida?")}
          </div>

          {(d.items?.length ?? 0) > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ítems</h3>
              <div className="space-y-2">
                {d.items!.map((it) => (
                  <div key={it.id} className="rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{it.name}</p>
                      <p className="shrink-0 text-sm">{fmtCLP(it.unitPrice)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">cantidad: {it.quantity}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-3 text-sm">
            <Linea etiqueta="Subtotal" valor={fmtCLP(p.subtotal)} />
            {Number(p.discount) > 0 && <Linea etiqueta="Descuento" valor={`− ${fmtCLP(p.discount)}`} />}
            {Number(p.hasIVA) === 1 && <Linea etiqueta="IVA 19%" valor={fmtCLP(p.iva)} />}
            <div className="mt-1 border-t border-border pt-1">
              <Linea etiqueta="Total" valor={fmtCLP(p.total)} fuerte />
            </div>
            {Number(p.monthlyMaintenance) > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">+ mantención {fmtCLP(p.monthlyMaintenance)}/mes</p>
            )}
          </div>

          {p.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>}

          <Link
            href={`/agencia/contratos/nuevo?presupuesto=${p.id}`}
            className="block rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Generar contrato de este presupuesto
          </Link>
        </div>
      ) : null}
    </Lamina>
  );
}

function Linea({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={fuerte ? "font-semibold" : "text-muted-foreground"}>{etiqueta}</span>
      <span className={fuerte ? "font-semibold" : ""}>{valor}</span>
    </div>
  );
}
