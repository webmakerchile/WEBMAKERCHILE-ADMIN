import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Share2 } from "lucide-react";
import { agenciaApi, CLAVE, type Cliente, type Proyecto, type Tarea } from "./api";
import { estadoDe, fmtCLP, fmtFecha } from "./formato";
import { Cargando, Chip, ErrorCarga, Vacio } from "./ui";
import { useModoAgencia } from "./modo";

const FILTROS = [
  { valor: "curso", etiqueta: "En curso" },
  { valor: "", etiqueta: "Todos" },
  { valor: "listos", etiqueta: "Terminados" },
];

/** Mismos estados finales que usa el servidor para esconderle proyectos al equipo. */
const ESTADOS_FINALES = ["COMPLETED", "CANCELLED", "DELIVERED", "ARCHIVED"];
const esFinal = (status: unknown) => ESTADOS_FINALES.includes(String(status));

export default function Proyectos() {
  const [filtro, setFiltro] = useState("curso");
  const esCompleto = useModoAgencia() === "completo";
  const qc = useQueryClient();

  const proyectos = useQuery({
    queryKey: [CLAVE, "espejo", "proyectos", "todos"],
    queryFn: () => agenciaApi.espejo<Proyecto>("proyectos", { limite: 300 }),
  });
  const tareas = useQuery({
    queryKey: [CLAVE, "espejo", "tareas", "todas"],
    queryFn: () => agenciaApi.espejo<Tarea>("tareas", { limite: 500 }),
  });
  const clientes = useQuery({
    queryKey: [CLAVE, "espejo", "clientes", ""],
    queryFn: () => agenciaApi.espejo<Cliente>("clientes", { limite: 300 }),
  });

  // Toggles de visibilidad para el equipo (solo dirección los ve y los usa).
  const compartidos = useQuery({
    queryKey: [CLAVE, "compartidos"],
    queryFn: agenciaApi.compartidos,
    enabled: esCompleto,
  });
  const fijarGlobal = useMutation({
    mutationFn: (compartido: boolean) => agenciaApi.fijarCompartidoGlobal(compartido),
    onSettled: () => qc.invalidateQueries({ queryKey: [CLAVE, "compartidos"] }),
  });
  const fijarUno = useMutation({
    mutationFn: (v: { id: string; compartido: boolean }) => agenciaApi.fijarCompartido(v.id, v.compartido),
    onSettled: () => qc.invalidateQueries({ queryKey: [CLAVE, "compartidos"] }),
  });
  const compTodos = compartidos.data?.todos ?? false;
  const compIds = useMemo(() => new Set(compartidos.data?.ids ?? []), [compartidos.data]);

  const nombreCliente = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clientes.data?.datos ?? []) m.set(c.id, c.companyName);
    return (id: string) => m.get(id) ?? "";
  }, [clientes.data]);

  const avancePor = useMemo(() => {
    const por = new Map<string, { hechas: number; total: number }>();
    for (const t of tareas.data?.datos ?? []) {
      const peso = Number(t.weight) > 0 ? Number(t.weight) : 1;
      const acc = por.get(t.projectId) ?? { hechas: 0, total: 0 };
      acc.total += peso;
      const hecha = ["DONE", "COMPLETED"].includes(String(t.status)) || !!t.completedAt;
      if (hecha) acc.hechas += peso;
      por.set(t.projectId, acc);
    }
    return por;
  }, [tareas.data]);

  const visibles = (proyectos.data?.datos ?? []).filter((p) => {
    if (filtro === "curso") return !esFinal(p.status);
    if (filtro === "listos") return esFinal(p.status);
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
              filtro === f.valor
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {esCompleto && filtro === "listos" && (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Visibilidad para el equipo</p>
              <p className="text-xs text-muted-foreground">
                Los proyectos terminados no aparecen para el equipo, salvo los que compartas.
              </p>
            </div>
            <button
              onClick={() => fijarGlobal.mutate(!compTodos)}
              disabled={fijarGlobal.isPending || compartidos.isLoading}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
                compTodos
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {compTodos ? "Compartiendo todos" : "Compartir todos"}
            </button>
          </div>
        </div>
      )}

      {proyectos.isLoading ? (
        <Cargando />
      ) : proyectos.isError ? (
        <ErrorCarga error={proyectos.error} reintentar={() => proyectos.refetch()} />
      ) : visibles.length === 0 ? (
        <Vacio>No hay proyectos con ese filtro.</Vacio>
      ) : (
        <ul className="space-y-2">
          {visibles.map((p) => {
            const avance = avancePor.get(p.id);
            const pct = avance && avance.total > 0 ? Math.round((avance.hechas / avance.total) * 100) : null;
            const entrega =
              p.deadlineStartDate && Number(p.deadlineDays) > 0
                ? new Date(new Date(p.deadlineStartDate).getTime() + Number(p.deadlineDays) * 86400000)
                : null;
            return (
              <li key={p.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[nombreCliente(p.clientId), esCompleto ? fmtCLP(p.totalValue) : ""].filter(Boolean).join(" · ")}
                      {entrega && ` · entrega ~ ${fmtFecha(entrega.toISOString())}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.driveFolderUrl && (
                      <a
                        href={p.driveFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Carpeta Drive"
                        className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
                      >
                        <FolderOpen size={14} />
                      </a>
                    )}
                    <Chip {...estadoDe(p.status)} />
                  </div>
                </div>
                {pct !== null ? (
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Sin tareas cargadas en el panel.</p>
                )}
                {esCompleto && esFinal(p.status) && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Share2 size={12} />
                      {compTodos || compIds.has(p.id) ? "El equipo lo ve" : "Oculto para el equipo"}
                    </span>
                    {!compTodos && (
                      <button
                        onClick={() => fijarUno.mutate({ id: p.id, compartido: !compIds.has(p.id) })}
                        disabled={fijarUno.isPending}
                        className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                      >
                        {compIds.has(p.id) ? "Dejar de compartir" : "Compartir"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
