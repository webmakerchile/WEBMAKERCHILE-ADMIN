import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agenciaApi, CLAVE } from "./api";
import { haceCuanto } from "./formato";
import { Aviso } from "./ui";
import { useModoAgencia } from "./modo";

const PESTANAS = [
  { ruta: "/agencia", etiqueta: "Resumen" },
  { ruta: "/agencia/clientes", etiqueta: "Clientes" },
  { ruta: "/agencia/presupuestos", etiqueta: "Presupuestos" },
  { ruta: "/agencia/contratos", etiqueta: "Contratos" },
  { ruta: "/agencia/proyectos", etiqueta: "Proyectos" },
  { ruta: "/agencia/mantenimiento", etiqueta: "Mantención" },
  { ruta: "/agencia/finanzas", etiqueta: "Finanzas" },
];

export default function AgenciaShell({ children }: { children: ReactNode }) {
  const [ubicacion] = useLocation();
  const qc = useQueryClient();
  const esCompleto = useModoAgencia() === "completo";

  const estado = useQuery({
    queryKey: [CLAVE, "estado"],
    queryFn: agenciaApi.estado,
    refetchInterval: 60_000,
  });

  const sync = useMutation({
    mutationFn: agenciaApi.sync,
    onSettled: () => qc.invalidateQueries({ queryKey: [CLAVE] }),
  });

  const activa = (ruta: string) =>
    ruta === "/agencia"
      ? ubicacion === "/agencia" || ubicacion === "/agencia/"
      : ubicacion.startsWith(ruta);

  const e = estado.data;
  const syncFallando =
    !!e?.ultimoError &&
    (!e.ultimoExito || (e.ultimaCorrida ? new Date(e.ultimaCorrida) > new Date(e.ultimoExito) : false));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 lg:px-8 lg:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Agencia</h1>
          <p className="text-sm text-muted-foreground">
            Espejo del panel webmakerlatam.com — allá vive la verdad, acá la ves y operás.
          </p>
        </div>
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw size={15} className={sync.isPending ? "animate-spin" : ""} />
          {sync.isPending
            ? "Sincronizando…"
            : e?.ultimoExito
              ? `Sync ${haceCuanto(e.ultimoExito)}`
              : "Sincronizar"}
        </button>
      </div>

      {e && !e.configurado && (
        <div className="mt-3">
          <Aviso tono="error">Falta configurar la llave del panel en el servidor: la sección no puede sincronizar.</Aviso>
        </div>
      )}
      {syncFallando && (
        <div className="mt-3">
          <Aviso tono="info">La última sincronización tuvo problemas: {String(e?.ultimoError)}. Estás viendo los últimos datos que sí llegaron.</Aviso>
        </div>
      )}
      {sync.isError && (
        <div className="mt-3">
          <Aviso tono="error">{(sync.error as Error).message}</Aviso>
        </div>
      )}

      <nav className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 py-3 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PESTANAS.filter((p) => esCompleto || p.ruta !== "/agencia/finanzas").map((p) => (
          <Link
            key={p.ruta}
            href={p.ruta}
            className={`inline-flex shrink-0 items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              activa(p.ruta)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground/80 hover:bg-muted"
            }`}
          >
            {p.etiqueta}
          </Link>
        ))}
      </nav>

      <div className="mt-2">{children}</div>
    </div>
  );
}
