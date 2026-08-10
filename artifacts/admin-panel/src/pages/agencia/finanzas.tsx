import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  agenciaApi,
  CLAVE,
  ErrorPanel,
  type CategoriaGasto,
  type DocumentoSii,
  type FinanzasPeriodo,
  type MovimientoManual,
  type MovimientoMp,
  type PeriodoFinanzas,
} from "./api";
import { estadoDe, fmtCLP, fmtFecha } from "./formato";
import { Aviso, Campo, Cargando, Chip, ErrorCarga, Ficha, Lamina, Panel, Vacio } from "./ui";

const PERIODOS: Array<{ valor: PeriodoFinanzas; etiqueta: string }> = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Semana" },
  { valor: "mes", etiqueta: "Mes" },
  { valor: "rango", etiqueta: "Rango" },
];

const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function Finanzas() {
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState<PeriodoFinanzas>("mes");
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [formulario, setFormulario] = useState<"gasto" | "ingreso" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtros = useMemo(
    () => (periodo === "rango" ? { periodo, desde, hasta } : { periodo }),
    [periodo, desde, hasta]
  );
  const claveFin = useMemo(() => [CLAVE, "finanzas", "periodo", filtros] as const, [filtros]);

  const fin = useQuery({
    queryKey: claveFin,
    queryFn: () => agenciaApi.finanzasPeriodo(filtros),
    staleTime: 30_000,
  });

  const categorias = useQuery({
    queryKey: [CLAVE, "espejo", "categorias-gasto"],
    queryFn: () => agenciaApi.espejo<CategoriaGasto>("categorias-gasto", { limite: 200 }),
  });
  const nombreCategoria = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categorias.data?.datos ?? []) m.set(c.id, c.name);
    return (id?: string | null) => (id ? m.get(id) ?? id : undefined);
  }, [categorias.data]);

  const invalidar = () => qc.invalidateQueries({ queryKey: [CLAVE, "finanzas"] });

  const registrarGasto = useMutation({
    mutationFn: (b: { description: string; amount: number; categoryId?: string; date?: string; notes?: string }) =>
      agenciaApi.registrarGasto(b),
    onMutate: async (b) => {
      await qc.cancelQueries({ queryKey: claveFin });
      const anterior = qc.getQueryData<FinanzasPeriodo>(claveFin);
      if (anterior) {
        qc.setQueryData<FinanzasPeriodo>(claveFin, {
          ...anterior,
          gastos: [
            ...(anterior.gastos ?? []),
            { id: `optimista-${Date.now()}`, description: b.description, amount: b.amount, date: b.date, categoryId: b.categoryId },
          ],
        });
      }
      return { anterior };
    },
    onError: (e, _b, ctx) => {
      if (ctx?.anterior) qc.setQueryData(claveFin, ctx.anterior);
      setError(e instanceof ErrorPanel ? e.message : "No se pudo registrar el gasto.");
    },
    onSuccess: () => {
      setError(null);
      setFormulario(null);
    },
    onSettled: invalidar,
  });

  const registrarIngreso = useMutation({
    mutationFn: (b: { description: string; amount: number; date?: string; notes?: string }) => agenciaApi.registrarIngreso(b),
    onMutate: async (b) => {
      await qc.cancelQueries({ queryKey: claveFin });
      const anterior = qc.getQueryData<FinanzasPeriodo>(claveFin);
      if (anterior) {
        qc.setQueryData<FinanzasPeriodo>(claveFin, {
          ...anterior,
          ingresos: [...(anterior.ingresos ?? []), { id: `optimista-${Date.now()}`, description: b.description, amount: b.amount, date: b.date }],
        });
      }
      return { anterior };
    },
    onError: (e, _b, ctx) => {
      if (ctx?.anterior) qc.setQueryData(claveFin, ctx.anterior);
      setError(e instanceof ErrorPanel ? e.message : "No se pudo registrar el ingreso.");
    },
    onSuccess: () => {
      setError(null);
      setFormulario(null);
    },
    onSettled: invalidar,
  });

  const categorizar = useMutation({
    mutationFn: (v: { id: string; categoryId: string }) => agenciaApi.categorizarMovimientoMp(v.id, v.categoryId),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: claveFin });
      const anterior = qc.getQueryData<FinanzasPeriodo>(claveFin);
      if (anterior) {
        qc.setQueryData<FinanzasPeriodo>(claveFin, {
          ...anterior,
          movimientosMp: (anterior.movimientosMp ?? []).map((m) =>
            m.id === v.id ? { ...m, categoryId: v.categoryId, categoryName: nombreCategoria(v.categoryId) } : m
          ),
        });
      }
      return { anterior };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(claveFin, ctx.anterior);
      setError(e instanceof ErrorPanel ? e.message : "No se pudo categorizar el movimiento.");
    },
    onSuccess: () => setError(null),
    onSettled: invalidar,
  });

  const sincronizarMp = useMutation({
    mutationFn: agenciaApi.sincronizarMp,
    onError: (e) => setError(e instanceof ErrorPanel ? e.message : "No se pudo sincronizar Mercado Pago."),
    onSuccess: () => setError(null),
    onSettled: invalidar,
  });

  const noDisponible = fin.error instanceof ErrorPanel && fin.error.codigo === "finanzas_no_disponible";
  const d = fin.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              onClick={() => setPeriodo(p.valor)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                periodo === p.valor
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
        {periodo === "rango" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">a</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setFormulario("ingreso")}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            + Ingreso
          </button>
          <button
            onClick={() => setFormulario("gasto")}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            + Gasto
          </button>
        </div>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      {fin.isLoading ? (
        <Cargando filas={4} />
      ) : noDisponible ? (
        <Aviso tono="info">{fin.error!.message}</Aviso>
      ) : fin.isError ? (
        <ErrorCarga error={fin.error} reintentar={() => fin.refetch()} />
      ) : d ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Ficha etiqueta="Utilidad neta" valor={fmtCLP(d.kpis.utilidadNeta)} tono={typeof d.kpis.utilidadNeta === "number" ? (d.kpis.utilidadNeta >= 0 ? "bien" : "mal") : undefined} />
            <Ficha etiqueta="Ventas netas" valor={fmtCLP(d.kpis.ventasNetas)} />
            <Ficha etiqueta="Gastos operativos" valor={fmtCLP(d.kpis.gastosOperativos)} />
            <Ficha etiqueta="Egresos Mercado Pago" valor={fmtCLP(d.kpis.egresosMp)} />
            <Ficha etiqueta="Mantenciones" valor={fmtCLP(d.kpis.mantenimientos)} />
            <Ficha etiqueta="IVA débito" valor={fmtCLP(d.kpis.ivaDebito)} detalle={d.kpis.notaF29 ?? undefined} />
          </div>

          <Panel titulo="Ingresos del período">
            {(d.ingresos?.length ?? 0) === 0 ? (
              <Vacio>Sin ingresos manuales en este período.</Vacio>
            ) : (
              <ul className="space-y-1.5">
                {d.ingresos!.map((m) => (
                  <MovimientoFila key={m.id} m={m} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel titulo="Gastos del período">
            {(d.gastos?.length ?? 0) === 0 ? (
              <Vacio>Sin gastos registrados en este período.</Vacio>
            ) : (
              <ul className="space-y-1.5">
                {d.gastos!.map((m) => (
                  <MovimientoFila key={m.id} m={m} categoria={nombreCategoria(m.categoryId)} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel titulo="Por cobrar por proyecto">
            {(d.porCobrar?.length ?? 0) === 0 ? (
              <Vacio>No hay saldos pendientes en este período.</Vacio>
            ) : (
              <ul className="space-y-2.5">
                {d.porCobrar!.map((c) => (
                  <li key={c.proyectoId}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{c.nombre}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.pagado !== undefined && c.total !== undefined ? `${fmtCLP(c.pagado)} de ${fmtCLP(c.total)}` : "—"}
                      </span>
                    </div>
                    {c.porcentajePagado !== undefined ? (
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, c.porcentajePagado))}%` }} />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">{Math.round(c.porcentajePagado)}%</span>
                      </div>
                    ) : (
                      <div className="mt-1 h-1.5 rounded-full bg-muted" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            titulo="Movimientos Mercado Pago"
            accion={
              <button
                onClick={() => sincronizarMp.mutate()}
                disabled={sincronizarMp.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                <RefreshCw size={13} className={sincronizarMp.isPending ? "animate-spin" : ""} />
                {sincronizarMp.isPending ? "Sincronizando…" : "Sincronizar MP"}
              </button>
            }
          >
            {(d.resumenPorCategoriaMp?.length ?? 0) > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {d.resumenPorCategoriaMp!.map((r) => (
                  <span key={r.categoryId ?? "sin-categoria"} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                    {r.categoryName} · {r.cantidad} · {fmtCLP(r.total)}
                  </span>
                ))}
              </div>
            )}
            {(d.movimientosMp?.length ?? 0) === 0 ? (
              <Vacio>Sin movimientos de Mercado Pago en este período.</Vacio>
            ) : (
              <ul className="space-y-1.5">
                {d.movimientosMp!.map((m) => (
                  <MovimientoMpFila
                    key={m.id}
                    m={m}
                    categorias={categorias.data?.datos ?? []}
                    onCategorizar={(categoryId) => categorizar.mutate({ id: m.id, categoryId })}
                  />
                ))}
              </ul>
            )}
          </Panel>

          {(d.documentosSii?.length ?? 0) > 0 && (
            <Panel titulo="Documentos SII">
              <ul className="space-y-1.5">
                {d.documentosSii!.map((doc) => (
                  <DocumentoFila key={doc.id} doc={doc} />
                ))}
              </ul>
            </Panel>
          )}
        </>
      ) : null}

      {formulario === "gasto" && (
        <FormularioGasto
          categorias={categorias.data?.datos ?? []}
          enviando={registrarGasto.isPending}
          onCancelar={() => setFormulario(null)}
          onEnviar={(b) => registrarGasto.mutate(b)}
        />
      )}
      {formulario === "ingreso" && (
        <FormularioIngreso enviando={registrarIngreso.isPending} onCancelar={() => setFormulario(null)} onEnviar={(b) => registrarIngreso.mutate(b)} />
      )}
    </div>
  );
}

function MovimientoFila({ m, categoria }: { m: MovimientoManual; categoria?: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{m.description}</p>
        <p className="text-xs text-muted-foreground">
          {[fmtFecha(m.date), categoria].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className="shrink-0 font-semibold">{fmtCLP(m.amount)}</span>
    </li>
  );
}

function MovimientoMpFila({
  m,
  categorias,
  onCategorizar,
}: {
  m: MovimientoMp;
  categorias: CategoriaGasto[];
  onCategorizar: (categoryId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{m.description ?? "Movimiento MP"}</p>
        <p className="text-xs text-muted-foreground">{fmtFecha(m.date)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-semibold">{fmtCLP(m.amount)}</span>
        <select
          value={m.categoryId ?? ""}
          onChange={(e) => e.target.value && onCategorizar(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
        >
          <option value="" disabled>
            {m.categoryName ?? "Sin categoría"}
          </option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </li>
  );
}

function DocumentoFila({ doc }: { doc: DocumentoSii }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {doc.type ?? "Documento"} {doc.folio ? `#${doc.folio}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">{fmtFecha(doc.date)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-semibold">{fmtCLP(doc.amount)}</span>
        {doc.status && <Chip {...estadoDe(doc.status)} />}
        {doc.url && (
          <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline">
            Ver
          </a>
        )}
      </div>
    </li>
  );
}

function FormularioGasto({
  categorias,
  enviando,
  onCancelar,
  onEnviar,
}: {
  categorias: CategoriaGasto[];
  enviando: boolean;
  onCancelar: () => void;
  onEnviar: (b: { description: string; amount: number; categoryId?: string; date?: string; notes?: string }) => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(hoyISO());
  const [notes, setNotes] = useState("");
  const valido = description.trim().length > 0 && Number(amount) > 0;

  return (
    <Lamina titulo="Registrar gasto" alCerrar={onCancelar}>
      <div className="space-y-3">
        <Campo etiqueta="Descripción" valor={description} onCambio={setDescription} requerido placeholder="Ej: Arriendo oficina" />
        <Campo etiqueta="Monto (CLP)" valor={amount} onCambio={setAmount} tipo="number" requerido placeholder="0" />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Categoría (opcional)</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Campo etiqueta="Fecha" valor={date} onCambio={setDate} tipo="date" />
        <Campo etiqueta="Notas (opcional)" valor={notes} onCambio={setNotes} />
        <button
          disabled={!valido || enviando}
          onClick={() =>
            onEnviar({ description: description.trim(), amount: Number(amount), categoryId: categoryId || undefined, date, notes: notes.trim() || undefined })
          }
          className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Guardando…" : "Registrar gasto"}
        </button>
      </div>
    </Lamina>
  );
}

function FormularioIngreso({
  enviando,
  onCancelar,
  onEnviar,
}: {
  enviando: boolean;
  onCancelar: () => void;
  onEnviar: (b: { description: string; amount: number; date?: string; notes?: string }) => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(hoyISO());
  const [notes, setNotes] = useState("");
  const valido = description.trim().length > 0 && Number(amount) > 0;

  return (
    <Lamina titulo="Registrar ingreso" alCerrar={onCancelar}>
      <div className="space-y-3">
        <Campo etiqueta="Descripción" valor={description} onCambio={setDescription} requerido placeholder="Ej: Venta de dominio" />
        <Campo etiqueta="Monto (CLP)" valor={amount} onCambio={setAmount} tipo="number" requerido placeholder="0" />
        <Campo etiqueta="Fecha" valor={date} onCambio={setDate} tipo="date" />
        <Campo etiqueta="Notas (opcional)" valor={notes} onCambio={setNotes} />
        <button
          disabled={!valido || enviando}
          onClick={() => onEnviar({ description: description.trim(), amount: Number(amount), date, notes: notes.trim() || undefined })}
          className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Guardando…" : "Registrar ingreso"}
        </button>
      </div>
    </Lamina>
  );
}
