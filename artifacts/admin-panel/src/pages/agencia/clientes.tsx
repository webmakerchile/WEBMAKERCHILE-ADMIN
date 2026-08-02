import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Mail, Phone, Search } from "lucide-react";
import {
  agenciaApi,
  CLAVE,
  enlacePropuesta,
  type Cliente,
  type ContratoMantenimiento,
  type ContratoServicio,
  type Presupuesto,
  type Proyecto,
} from "./api";
import { estadoDe, fmtCLP, fmtFecha, tipoMant } from "./formato";
import { BotonCopiar, Cargando, Chip, ErrorCarga, Lamina, Vacio } from "./ui";

export default function Clientes({ idAbierto }: { idAbierto?: string }) {
  const [, navegar] = useLocation();
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setFiltro(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const lista = useQuery({
    queryKey: [CLAVE, "espejo", "clientes", filtro],
    queryFn: () => agenciaApi.espejo<Cliente>("clientes", { q: filtro || undefined, limite: 300 }),
  });

  const abierto = useMemo(
    () => (idAbierto ? lista.data?.datos.find((c) => c.id === idAbierto) : undefined),
    [idAbierto, lista.data]
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por empresa, contacto, RUT…"
          className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
        />
      </div>

      {lista.isLoading ? (
        <Cargando />
      ) : lista.isError ? (
        <ErrorCarga error={lista.error} reintentar={() => lista.refetch()} />
      ) : lista.data!.datos.length === 0 ? (
        <Vacio>No hay clientes {filtro ? `para “${filtro}”` : "en el espejo todavía — probá sincronizar"}.</Vacio>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {lista.data!.total} cliente{lista.data!.total === 1 ? "" : "s"}
          </p>
          <ul className="space-y-2">
            {lista.data!.datos.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/agencia/clientes/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.companyName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[c.contactName, c.contactEmail].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-xs text-muted-foreground sm:block">{fmtFecha(c.createdAt)}</span>
                    <ChevronRight size={16} className="text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {idAbierto && (
        <Detalle360
          id={idAbierto}
          precargado={abierto}
          alCerrar={() => navegar("/agencia/clientes")}
        />
      )}
    </div>
  );
}

function Detalle360({ id, precargado, alCerrar }: { id: string; precargado?: Cliente; alCerrar: () => void }) {
  const registro = useQuery({
    queryKey: [CLAVE, "cliente", id],
    queryFn: () => agenciaApi.registro<Cliente>("clientes", id),
    enabled: !precargado,
  });
  const cliente = precargado ?? registro.data?.datos;

  const presupuestos = useQuery({
    queryKey: [CLAVE, "espejo", "presupuestos", { clientId: id }],
    queryFn: () => agenciaApi.espejo<Presupuesto>("presupuestos", { clientId: id, limite: 100 }),
  });
  const proyectos = useQuery({
    queryKey: [CLAVE, "espejo", "proyectos", { clientId: id }],
    queryFn: () => agenciaApi.espejo<Proyecto>("proyectos", { clientId: id, limite: 100 }),
  });
  const mantenciones = useQuery({
    queryKey: [CLAVE, "espejo", "contratos-mantenimiento", { clientId: id }],
    queryFn: () => agenciaApi.espejo<ContratoMantenimiento>("contratos-mantenimiento", { clientId: id, limite: 100 }),
  });
  const contratos = useQuery({
    queryKey: [CLAVE, "espejo", "contratos-servicio", "todos"],
    queryFn: () => agenciaApi.espejo<ContratoServicio>("contratos-servicio", { limite: 500 }),
  });

  const idsPresupuestos = new Set((presupuestos.data?.datos ?? []).map((p) => p.id));
  const contratosCliente = (contratos.data?.datos ?? []).filter((c) => idsPresupuestos.has(c.proposalId));

  return (
    <Lamina titulo={cliente?.companyName ?? "Cliente"} alCerrar={alCerrar}>
      {!cliente ? (
        <Cargando filas={3} />
      ) : (
        <div className="space-y-5">
          <div className="space-y-1.5 text-sm">
            {cliente.rut && <p className="text-muted-foreground">RUT {cliente.rut}</p>}
            {cliente.contactName && <p>{cliente.contactName}</p>}
            <div className="flex flex-wrap gap-2">
              {cliente.contactEmail && (
                <a
                  href={`mailto:${cliente.contactEmail}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                  <Mail size={13} /> {cliente.contactEmail}
                </a>
              )}
              {cliente.contactPhone && (
                <a
                  href={`tel:${cliente.contactPhone}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                  <Phone size={13} /> {cliente.contactPhone}
                </a>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Cliente desde {fmtFecha(cliente.createdAt)}</p>
          </div>

          <Link
            href={`/agencia/contratos/nuevo?cliente=${cliente.id}`}
            className="block rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Nuevo presupuesto / contrato
          </Link>

          <Bloque titulo={`Presupuestos (${presupuestos.data?.datos.length ?? "…"})`}>
            {(presupuestos.data?.datos ?? []).map((p) => {
              const enlace = enlacePropuesta(p);
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{fmtCLP(p.total)}</p>
                    <p className="text-xs text-muted-foreground">{fmtFecha(p.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Chip {...estadoDe(p.status)} />
                    {enlace && <BotonCopiar texto={enlace} etiqueta="Link" />}
                  </div>
                </div>
              );
            })}
            {presupuestos.data && presupuestos.data.datos.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin presupuestos.</p>
            )}
          </Bloque>

          <Bloque titulo={`Proyectos (${proyectos.data?.datos.length ?? "…"})`}>
            {(proyectos.data?.datos ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{fmtCLP(p.totalValue)}</p>
                </div>
                <Chip {...estadoDe(p.status)} />
              </div>
            ))}
            {proyectos.data && proyectos.data.datos.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin proyectos.</p>
            )}
          </Bloque>

          <Bloque titulo="Contratos">
            {contratosCliente.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{fmtFecha(c.createdAt)}</p>
                  {c.signedAt && <p className="text-xs text-muted-foreground">Firmado {fmtFecha(c.signedAt)}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Chip {...estadoDe(c.status)} />
                  {c._enlaces?.contrato && <BotonCopiar texto={c._enlaces.contrato} etiqueta="Firma" />}
                </div>
              </div>
            ))}
            {contratos.data && contratosCliente.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin contratos.</p>
            )}
          </Bloque>

          <Bloque titulo="Mantención">
            {(mantenciones.data?.datos ?? []).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{tipoMant(m.serviceType)}</p>
                  <p className="text-xs text-muted-foreground">{fmtCLP(m.monthlyPrice)}/mes</p>
                </div>
                <Chip {...estadoDe(m.status)} />
              </div>
            ))}
            {mantenciones.data && mantenciones.data.datos.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin contrato de mantención.</p>
            )}
          </Bloque>
        </div>
      )}
    </Lamina>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
