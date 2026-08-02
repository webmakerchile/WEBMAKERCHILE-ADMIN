import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FilePlus2, MessageCircle } from "lucide-react";
import { agenciaApi, CLAVE, ErrorPanel, type ContratoServicio } from "./api";
import { estadoDe, fmtFecha } from "./formato";
import { Aviso, BotonCopiar, Cargando, Chip, ErrorCarga, Lamina, Vacio } from "./ui";
import CrearContrato from "./crear-contrato";

const FILTROS = [
  { valor: "", etiqueta: "Todos" },
  { valor: "PENDING_SIGNATURE", etiqueta: "Por firmar" },
  { valor: "SIGNED", etiqueta: "Firmados" },
  { valor: "DRAFT", etiqueta: "Borradores" },
  { valor: "EXPIRED", etiqueta: "Vencidos" },
];

export default function Contratos({ accion }: { accion?: string }) {
  const [, navegar] = useLocation();
  const [estado, setEstado] = useState("");
  const [abierto, setAbierto] = useState<ContratoServicio | null>(null);

  const lista = useQuery({
    queryKey: [CLAVE, "espejo", "contratos-servicio", estado],
    queryFn: () =>
      agenciaApi.espejo<ContratoServicio>("contratos-servicio", { status: estado || undefined, limite: 300 }),
  });

  if (accion === "nuevo") return <CrearContrato />;

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
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <FilePlus2 size={14} /> Nuevo contrato
        </Link>
      </div>

      {lista.isLoading ? (
        <Cargando />
      ) : lista.isError ? (
        <ErrorCarga error={lista.error} reintentar={() => lista.refetch()} />
      ) : lista.data!.datos.length === 0 ? (
        <Vacio>No hay contratos con ese filtro.</Vacio>
      ) : (
        <ul className="space-y-2">
          {lista.data!.datos.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setAbierto(c)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{c.clientCompanyName || "Contrato"}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.signedAt ? `Firmado ${fmtFecha(c.signedAt)}${c.signedByName ? ` por ${c.signedByName}` : ""}` : `Creado ${fmtFecha(c.createdAt)}`}
                  </p>
                </div>
                <Chip {...estadoDe(c.status)} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <DetalleContrato
          contrato={abierto}
          alCerrar={() => setAbierto(null)}
          alIrPresupuesto={(pid) => navegar(`/agencia/presupuestos/${pid}`)}
        />
      )}
    </div>
  );
}

function DetalleContrato({
  contrato,
  alCerrar,
  alIrPresupuesto,
}: {
  contrato: ContratoServicio;
  alCerrar: () => void;
  alIrPresupuesto: (pid: string) => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // El detalle en vivo trae los _enlaces exactos del panel (firma y PDF).
  const vista = useQuery({
    queryKey: [CLAVE, "vista", "contratos-servicio", contrato.id],
    queryFn: () => agenciaApi.vista<any>("contratos-servicio", contrato.id),
  });

  const cambiar = useMutation({
    mutationFn: (estado: string) => agenciaApi.patchContrato(contrato.id, { estado }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: [CLAVE] });
      alCerrar();
    },
    onError: (e) => setError(e instanceof ErrorPanel ? e.message : "No se pudo cambiar el estado."),
  });

  const enVivo = vista.data?.datos?.contrato ?? vista.data?.datos ?? {};
  const enlaces = (enVivo?._enlaces ?? contrato._enlaces ?? {}) as { contrato?: string; pdf?: string };
  const linkFirma = enlaces.contrato;
  const linkPdf = enlaces.pdf;
  const estado = String(enVivo?.status ?? contrato.status);

  return (
    <Lamina titulo={contrato.clientCompanyName || "Contrato"} alCerrar={alCerrar}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip {...estadoDe(estado)} />
          <span className="text-xs text-muted-foreground">creado {fmtFecha(contrato.createdAt)}</span>
          {contrato.signedAt && (
            <span className="text-xs text-muted-foreground">· firmado {fmtFecha(contrato.signedAt)}</span>
          )}
        </div>

        {error && <Aviso tono="error">{error}</Aviso>}
        {vista.isLoading && <p className="text-xs text-muted-foreground">Cargando links del panel…</p>}

        {estado !== "SIGNED" && linkFirma && (
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Link de firma</p>
            <p className="break-all rounded-lg bg-muted px-2 py-1.5 font-mono text-xs">{linkFirma}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <BotonCopiar texto={linkFirma} />
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Hola! Te dejo el contrato para revisar y firmar: ${linkFirma}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <MessageCircle size={13} /> WhatsApp
              </a>
              <a
                href={linkFirma}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <ExternalLink size={13} /> Abrir
              </a>
            </div>
          </div>
        )}

        {linkPdf && (
          <a
            href={linkPdf}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ExternalLink size={14} /> Ver PDF
          </a>
        )}

        <div className="flex flex-wrap gap-2">
          {estado === "DRAFT" && (
            <button
              disabled={cambiar.isPending}
              onClick={() => cambiar.mutate("PENDING_SIGNATURE")}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              Enviar a firma
            </button>
          )}
          {estado === "PENDING_SIGNATURE" && (
            <button
              disabled={cambiar.isPending}
              onClick={() => {
                if (window.confirm("¿Marcar este contrato como vencido? El link de firma dejará de servir.")) {
                  cambiar.mutate("EXPIRED");
                }
              }}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              Marcar vencido
            </button>
          )}
          <button
            onClick={() => alIrPresupuesto(contrato.proposalId)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Ver presupuesto
          </button>
        </div>

        {estado === "SIGNED" && (
          <Aviso tono="ok">Contrato firmado — los cambios de estado quedan bloqueados desde acá.</Aviso>
        )}
      </div>
    </Lamina>
  );
}
