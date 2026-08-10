import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FolderOpen, Share2 } from "lucide-react";
import { agenciaApi, CLAVE, type Cliente, type Proyecto, type Registro, type Tarea } from "./api";
import { estadoDe, fmtCLP, fmtFecha } from "./formato";
import { Cargando, Chip, ErrorCarga, Lamina, Vacio } from "./ui";
import { useModoAgencia, useVeMontos } from "./modo";

const FILTROS = [
  { valor: "curso", etiqueta: "En curso" },
  { valor: "", etiqueta: "Todos" },
  { valor: "listos", etiqueta: "Terminados" },
];

/** Mismos estados finales que usa el servidor para esconderle proyectos al equipo. */
const ESTADOS_FINALES = ["COMPLETED", "CANCELLED", "DELIVERED", "ARCHIVED"];
const esFinal = (status: unknown) => ESTADOS_FINALES.includes(String(status));

/**
 * El panel documenta el estado de tarea en minúscula (pending|in_progress|
 * completed); no hay "DONE" en ese contrato. Se compara sin distinguir
 * mayúsculas para no depender de qué variante mande el origen, y
 * completedAt manda igual aunque el status no calce.
 */
const tareaHecha = (t: Tarea) => {
  const s = String(t.status ?? "").toLowerCase();
  return s === "done" || s === "completed" || Boolean(t.completedAt);
};

export default function Proyectos({ idAbierto }: { idAbierto?: string }) {
  const [, navegar] = useLocation();
  const [filtro, setFiltro] = useState("curso");
  const esCompleto = useModoAgencia() === "completo";
  const veMontos = useVeMontos();
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

  const clientePor = useMemo(() => {
    const m = new Map<string, Cliente>();
    for (const c of clientes.data?.datos ?? []) m.set(c.id, c);
    return m;
  }, [clientes.data]);
  const nombreCliente = (id: string) => clientePor.get(id)?.companyName ?? "";

  const tareasPor = useMemo(() => {
    const m = new Map<string, Tarea[]>();
    for (const t of tareas.data?.datos ?? []) {
      const l = m.get(t.projectId) ?? [];
      l.push(t);
      m.set(t.projectId, l);
    }
    return m;
  }, [tareas.data]);

  const avanceDe = (lista: Tarea[]) => {
    let hechas = 0;
    let total = 0;
    for (const t of lista) {
      const peso = Number(t.weight) > 0 ? Number(t.weight) : 1;
      total += peso;
      if (tareaHecha(t)) hechas += peso;
    }
    return total > 0 ? { hechas, total, pct: Math.round((hechas / total) * 100) } : null;
  };

  const avancePor = useMemo(() => {
    const por = new Map<string, ReturnType<typeof avanceDe>>();
    for (const [id, lista] of tareasPor) por.set(id, avanceDe(lista));
    return por;
  }, [tareasPor]);

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
            const avance = avancePor.get(p.id) ?? null;
            const entrega =
              p.deadlineStartDate && Number(p.deadlineDays) > 0
                ? new Date(new Date(p.deadlineStartDate).getTime() + Number(p.deadlineDays) * 86400000)
                : null;
            return (
              <li key={p.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <button onClick={() => navegar(`/agencia/proyectos/${p.id}`)} className="block w-full text-left">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[nombreCliente(p.clientId), veMontos ? fmtCLP(p.totalValue) : ""].filter(Boolean).join(" · ")}
                        {entrega && ` · entrega ~ ${fmtFecha(entrega.toISOString())}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {p.driveFolderUrl && (
                        <a
                          href={p.driveFolderUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Carpeta Drive"
                          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
                        >
                          <FolderOpen size={14} />
                        </a>
                      )}
                      <Chip {...estadoDe(p.status)} />
                    </div>
                  </div>
                  {avance ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${avance.pct}%` }} />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{avance.pct}%</span>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Sin tareas cargadas en el panel.</p>
                  )}
                </button>
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

      {idAbierto && <DetalleProyecto id={idAbierto} alCerrar={() => navegar("/agencia/proyectos")} />}
    </div>
  );
}

/** Texto de una entrada de bitácora: el recurso es jsonb libre, así que se
 * intenta con los nombres de campo más plausibles sin asumir un único shape. */
function textoBitacora(e: Registro): string {
  return e.note ?? e.text ?? e.content ?? e.description ?? e.title ?? "Entrada sin descripción";
}
function autorBitacora(e: Registro): string | undefined {
  return e.authorName ?? e.author ?? e.userName ?? e.createdByName ?? e.createdBy ?? undefined;
}
function fechaBitacora(e: Registro): string | undefined {
  return e.createdAt ?? e.date ?? e.occurredAt ?? undefined;
}

/**
 * Detalle de proyecto: solo lectura, armado con lo que ya está sincronizado
 * (proyectos + clientes + tareas + bitácora). WMC tiene ahí acciones de
 * escritura (cambiar estado, asignar dev, pagos, adicionales) que viven en
 * SUS rutas propias -- no hay proxy de escritura para eso en el espejo, así
 * que acá se replican los datos/links/estado, no los botones de edición.
 */
function DetalleProyecto({ id, alCerrar }: { id: string; alCerrar: () => void }) {
  const veMontos = useVeMontos();

  const proyecto = useQuery({
    queryKey: [CLAVE, "espejo", "proyectos", "uno", id],
    queryFn: () => agenciaApi.registro<Proyecto>("proyectos", id),
  });
  const p = proyecto.data?.datos;

  const cliente = useQuery({
    queryKey: [CLAVE, "espejo", "clientes", "uno", p?.clientId],
    queryFn: () => agenciaApi.registro<Cliente>("clientes", p!.clientId),
    enabled: !!p?.clientId,
  });
  const tareas = useQuery({
    queryKey: [CLAVE, "espejo", "tareas", "proyecto", id],
    queryFn: () => agenciaApi.espejo<Tarea>("tareas", { projectId: id, limite: 200 }),
  });
  const bitacora = useQuery({
    queryKey: [CLAVE, "espejo", "bitacora", "proyecto", id],
    queryFn: () => agenciaApi.espejo<Registro>("bitacora", { projectId: id, limite: 100 }),
  });

  const lista = tareas.data?.datos ?? [];
  let hechas = 0;
  let total = 0;
  for (const t of lista) {
    const peso = Number(t.weight) > 0 ? Number(t.weight) : 1;
    total += peso;
    if (tareaHecha(t)) hechas += peso;
  }
  const pct = total > 0 ? Math.round((hechas / total) * 100) : null;

  const entrega =
    p?.deadlineStartDate && Number(p.deadlineDays) > 0
      ? new Date(new Date(p.deadlineStartDate).getTime() + Number(p.deadlineDays) * 86400000)
      : null;

  return (
    <Lamina titulo={p?.name ?? "Proyecto"} alCerrar={alCerrar}>
      {proyecto.isLoading ? (
        <Cargando filas={3} />
      ) : proyecto.isError ? (
        <ErrorCarga error={proyecto.error} reintentar={() => proyecto.refetch()} />
      ) : !p ? (
        <Vacio>No se encontró el proyecto.</Vacio>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip {...estadoDe(p.status)} />
            {p.createdAt && <span className="text-xs text-muted-foreground">creado {fmtFecha(p.createdAt)}</span>}
            {entrega && <span className="text-xs text-muted-foreground">· entrega ~ {fmtFecha(entrega.toISOString())}</span>}
          </div>

          <div className="rounded-xl border border-border bg-card p-3 text-sm">
            <p className="font-medium">{cliente.data?.datos?.companyName ?? "Cliente"}</p>
            <p className="text-xs text-muted-foreground">
              {[cliente.data?.datos?.contactName, cliente.data?.datos?.contactEmail, cliente.data?.datos?.contactPhone]
                .filter(Boolean)
                .join(" · ") || "Sin datos de contacto"}
            </p>
          </div>

          {veMontos && (Number(p.totalValue) > 0 || Number(p.monthlyMaintenance) > 0) && (
            <div className="rounded-xl border border-border bg-card p-3 text-sm">
              {Number(p.totalValue) > 0 && (
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-muted-foreground">Valor del proyecto</span>
                  <span className="font-semibold">{fmtCLP(p.totalValue)}</span>
                </div>
              )}
              {Number(p.monthlyMaintenance) > 0 && (
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-muted-foreground">Mantención mensual</span>
                  <span className="font-semibold">{fmtCLP(p.monthlyMaintenance)}</span>
                </div>
              )}
            </div>
          )}

          {(p.driveFolderUrl || p.repositoryUrl) && (
            <div className="flex flex-wrap gap-2">
              {p.driveFolderUrl && (
                <a
                  href={p.driveFolderUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <FolderOpen size={13} /> Carpeta Drive
                </a>
              )}
              {p.repositoryUrl && (
                <a
                  href={p.repositoryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <ExternalLink size={13} /> Repositorio
                </a>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tareas</h3>
              {pct !== null && <span className="text-xs font-medium text-muted-foreground">{pct}%</span>}
            </div>
            {pct !== null && (
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            )}
            {tareas.isLoading ? (
              <Cargando filas={2} />
            ) : lista.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin tareas cargadas en el panel.</p>
            ) : (
              <ul className="space-y-1.5">
                {lista.map((t) => {
                  const hecha = tareaHecha(t);
                  return (
                    <li key={t.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${hecha ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                      <span className={`min-w-0 flex-1 truncate ${hecha ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
                      {t.phase && <span className="shrink-0 text-xs text-muted-foreground">{t.phase}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bitácora</h3>
            {bitacora.isLoading ? (
              <Cargando filas={2} />
            ) : (bitacora.data?.datos.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">Sin entradas de bitácora.</p>
            ) : (
              <ul className="space-y-1.5">
                {bitacora.data!.datos.map((e) => (
                  <li key={e.id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <p>{textoBitacora(e)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[autorBitacora(e), fechaBitacora(e) ? fmtFecha(fechaBitacora(e)!) : undefined].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Lamina>
  );
}
