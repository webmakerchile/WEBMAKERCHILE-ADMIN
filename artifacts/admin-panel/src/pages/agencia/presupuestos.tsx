import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FilePlus2, Plus, Search, Sparkles, Trash2 } from "lucide-react";
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
import { Aviso, BotonCopiar, Campo, Cargando, Chip, ErrorCarga, Lamina, Vacio } from "./ui";
import { useVeMontos } from "./modo";

const FILTROS = [
  { valor: "", etiqueta: "Todos" },
  { valor: "SENT", etiqueta: "Enviadas" },
  { valor: "VIEWED", etiqueta: "Vistas" },
  { valor: "APPROVED", etiqueta: "Aprobadas" },
  { valor: "DRAFT", etiqueta: "Borradores" },
  { valor: "REJECTED", etiqueta: "Rechazadas" },
  { valor: "EXPIRED", etiqueta: "Vencidas" },
];

const MODALIDADES: Array<{ valor: string; etiqueta: string }> = [
  { valor: "STANDARD", etiqueta: "50% anticipo / 50% entrega" },
  { valor: "MILESTONES", etiqueta: "40/40/20 por hitos" },
  { valor: "FULL_ADVANCE", etiqueta: "100% anticipado" },
  { valor: "INSTALLMENTS", etiqueta: "Cuotas fijas" },
  { valor: "CUSTOM", etiqueta: "Condiciones personalizadas" },
];
const CUOTAS = [2, 3, 4, 5, 6, 12];
const MANTENCIONES: Array<{ valor: string; etiqueta: string }> = [
  { valor: "NONE", etiqueta: "Sin mantención" },
  { valor: "TO_BE_DEFINED", etiqueta: "A definir después" },
  { valor: "CUSTOM", etiqueta: "Plan mensual fijo" },
];

/** Estados desde los que todavía tiene sentido editar el contenido del builder. */
const EDITABLE = new Set(["DRAFT", "SENT"]);

export default function Presupuestos({ idAbierto, accion }: { idAbierto?: string; accion?: string }) {
  const [, navegar] = useLocation();
  const [estado, setEstado] = useState("");
  const [texto, setTexto] = useState("");

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

  const filtrados = useMemo(() => {
    const base = lista.data?.datos ?? [];
    const q = texto.trim().toLowerCase();
    return q ? base.filter((p) => nombreCliente(p.clientId).toLowerCase().includes(q)) : base;
  }, [lista.data, texto, nombreCliente]);

  if (accion === "nuevo" || accion === "editar") {
    return (
      <BuilderPresupuesto
        idEditar={accion === "editar" ? idAbierto : undefined}
        alListo={(id) => navegar(`/agencia/presupuestos/${id}`)}
        alCancelar={() => navegar(idAbierto ? `/agencia/presupuestos/${idAbierto}` : "/agencia/presupuestos")}
      />
    );
  }

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
          href="/agencia/presupuestos/nuevo"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          <FilePlus2 size={14} /> Nuevo
        </Link>
      </div>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por cliente…"
          className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
        />
      </div>

      {lista.isLoading ? (
        <Cargando />
      ) : lista.isError ? (
        <ErrorCarga error={lista.error} reintentar={() => lista.refetch()} />
      ) : filtrados.length === 0 ? (
        <Vacio>No hay presupuestos con ese filtro.</Vacio>
      ) : (
        <ul className="space-y-2">
          {filtrados.map((p) => (
            <PresupuestoFila key={p.id} p={p} nombreCliente={nombreCliente} onAbrir={() => navegar(`/agencia/presupuestos/${p.id}`)} />
          ))}
        </ul>
      )}

      {idAbierto && (
        <DetallePresupuesto
          id={idAbierto}
          alCerrar={() => navegar("/agencia/presupuestos")}
          alEditar={() => navegar(`/agencia/presupuestos/${idAbierto}/editar`)}
        />
      )}
    </div>
  );
}

function PresupuestoFila({
  p,
  nombreCliente,
  onAbrir,
}: {
  p: Presupuesto;
  nombreCliente: (id: string) => string;
  onAbrir: () => void;
}) {
  const veMontos = useVeMontos();
  return (
    <li>
      <button
        onClick={onAbrir}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{nombreCliente(p.clientId)}</p>
          <p className="text-xs text-muted-foreground">
            {fmtFecha(p.createdAt)}
            {veMontos && Number(p.monthlyMaintenance) > 0 && ` · mantención ${fmtCLP(p.monthlyMaintenance)}/mes`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {veMontos && p.total !== undefined && <span className="text-sm font-semibold">{fmtCLP(p.total)}</span>}
          <Chip {...estadoDe(p.status)} />
        </div>
      </button>
    </li>
  );
}

function DetallePresupuesto({ id, alCerrar, alEditar }: { id: string; alCerrar: () => void; alEditar: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const veMontos = useVeMontos();

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
    // El panel puede rechazar la transición (409, p.ej. ya cambió de estado del
    // lado de allá): se muestra tal cual, nunca se inventa un mensaje genérico.
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
            {EDITABLE.has(p.status) && (
              <button
                onClick={alEditar}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Editar
              </button>
            )}
            {p.status === "DRAFT" && accion("SENT", "Marcar enviada", "¿Marcar este presupuesto como enviado?")}
            {["SENT", "VIEWED"].includes(p.status) &&
              accion("REJECTED", "Marcar rechazada", "¿Marcar como rechazada? El cliente ya no podrá aprobarla.")}
            {["SENT", "VIEWED"].includes(p.status) &&
              accion("EXPIRED", "Marcar vencida", "¿Marcar como vencida?")}
          </div>
          <p className="text-xs text-muted-foreground">
            Aprobar y firmar son pasos que solo pasan del lado del panel (el cliente los hace desde el link público) — acá no se pueden forzar.
          </p>

          {(d.items?.length ?? 0) > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ítems</h3>
              <div className="space-y-2">
                {d.items!.map((it) => (
                  <div key={it.id} className="rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{it.name}</p>
                        {it.description && <p className="text-xs text-muted-foreground">{it.description}</p>}
                      </div>
                      {veMontos && it.unitPrice !== undefined && <p className="shrink-0 text-sm">{fmtCLP(it.unitPrice)}</p>}
                    </div>
                    <p className="text-xs text-muted-foreground">cantidad: {it.quantity}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {veMontos && (
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
          )}

          {veMontos && p.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>}

          <Link
            href={`/agencia/contratos/nuevo?presupuesto=${p.id}`}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Sparkles size={14} /> Generar contrato con IA
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

/* ------------------------------- Builder ------------------------------- */

type ItemForm = { name: string; description: string; quantity: string; unitPrice: string };
const ITEM_VACIO: ItemForm = { name: "", description: "", quantity: "1", unitPrice: "" };

/**
 * Crear/editar un presupuesto desde el espejo (paridad con el builder de
 * propuestas de WMC). El panel de origen sigue siendo el único que calcula
 * subtotal/IVA/total -- acá el "estimado" que se ve mientras se escribe es
 * solo una ayuda visual (qty × precio de CADA fila), nunca el total real.
 */
function BuilderPresupuesto({
  idEditar,
  alListo,
  alCancelar,
}: {
  idEditar?: string;
  alListo: (id: string) => void;
  alCancelar: () => void;
}) {
  const esEdicion = !!idEditar;
  const qc = useQueryClient();

  const vista = useQuery({
    queryKey: [CLAVE, "vista", "presupuestos", idEditar],
    queryFn: () => agenciaApi.vista<VistaPresupuesto>("presupuestos", idEditar!),
    enabled: esEdicion,
  });

  const [clienteId, setClienteId] = useState("");
  const [clienteTexto, setClienteTexto] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null);
  const [clienteNuevo, setClienteNuevo] = useState(false);
  const [formCliente, setFormCliente] = useState({ companyName: "", rut: "", contactName: "", contactEmail: "" });

  const [items, setItems] = useState<ItemForm[]>([{ ...ITEM_VACIO }]);
  const [hasIVA, setHasIVA] = useState(true);
  const [discount, setDiscount] = useState("");
  const [paymentModality, setPaymentModality] = useState("STANDARD");
  const [installmentCount, setInstallmentCount] = useState("3");
  const [customPaymentTerms, setCustomPaymentTerms] = useState("");
  const [maintenanceType, setMaintenanceType] = useState("NONE");
  const [monthlyMaintenance, setMonthlyMaintenance] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [precargado, setPrecargado] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFiltroCliente(clienteTexto.trim()), 300);
    return () => clearTimeout(t);
  }, [clienteTexto]);

  const buscarClientes = useQuery({
    queryKey: [CLAVE, "espejo", "clientes", "builder", filtroCliente],
    queryFn: () => agenciaApi.espejo<Cliente>("clientes", { q: filtroCliente || undefined, limite: 8 }),
    enabled: !esEdicion && !clienteNuevo && !clienteId,
  });

  const crearCliente = useMutation({
    mutationFn: () =>
      agenciaApi.crearCliente({
        companyName: formCliente.companyName,
        rut: formCliente.rut || undefined,
        contactName: formCliente.contactName || undefined,
        contactEmail: formCliente.contactEmail || undefined,
      }),
    onSuccess: (r) => {
      setClienteId(r.datos.id);
      setClienteElegido(r.datos);
      setClienteNuevo(false);
    },
    onError: (e) => setError(e instanceof ErrorPanel ? e.message : "No se pudo crear el cliente."),
  });

  // Precarga en edición: una sola vez, para no pisar lo que el usuario ya tipeó.
  useEffect(() => {
    const d = vista.data?.datos;
    if (!d?.presupuesto || precargado) return;
    const p = d.presupuesto;
    setItems(
      (d.items ?? []).length
        ? d.items!.map((it) => ({
            name: it.name ?? "",
            description: it.description ?? "",
            quantity: String(it.quantity ?? 1),
            unitPrice: it.unitPrice !== undefined ? String(it.unitPrice) : "",
          }))
        : [{ ...ITEM_VACIO }]
    );
    setHasIVA(Number(p.hasIVA) !== 0);
    setDiscount(p.discount ? String(p.discount) : "");
    setPaymentModality(p.paymentModality ?? "STANDARD");
    setInstallmentCount(p.installmentCount ? String(p.installmentCount) : "3");
    setCustomPaymentTerms(p.customPaymentTerms ?? "");
    setMaintenanceType(p.maintenanceType ?? "NONE");
    setMonthlyMaintenance(p.monthlyMaintenance ? String(p.monthlyMaintenance) : "");
    setNotes(p.notes ?? "");
    setValidUntil(p.validUntil ? p.validUntil.slice(0, 10) : "");
    if (d.cliente) setClienteElegido(d.cliente);
    setPrecargado(true);
  }, [vista.data, precargado]);

  const setItem = (i: number, cambio: Partial<ItemForm>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...cambio } : it)));

  const validos = items.filter((it) => it.name.trim() && Number(it.quantity) > 0 && Number(it.unitPrice) >= 0);
  const estimado = validos.reduce((acc, it) => acc + Number(it.quantity) * Number(it.unitPrice), 0);
  const clienteListo = esEdicion || !!clienteId;

  const guardar = useMutation({
    mutationFn: (estadoEnvio: "DRAFT" | "SENT") => {
      const cuerpo: Record<string, unknown> = {
        items: validos.map((it) => ({
          name: it.name.trim(),
          description: it.description.trim() || undefined,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
        hasIVA,
        discount: discount ? Number(discount) : 0,
        paymentModality,
        installmentCount: paymentModality === "INSTALLMENTS" ? Number(installmentCount) : undefined,
        customPaymentTerms: paymentModality === "CUSTOM" ? customPaymentTerms.trim() || undefined : undefined,
        maintenanceType,
        monthlyMaintenance: maintenanceType === "CUSTOM" ? Number(monthlyMaintenance || 0) : 0,
        notes: notes.trim() || undefined,
        validUntil: validUntil || undefined,
        estado: estadoEnvio,
      };
      return esEdicion
        ? agenciaApi.patchPresupuesto(idEditar!, cuerpo)
        : agenciaApi.crearPresupuesto({ ...cuerpo, clienteId, includeContract: false });
    },
    onSuccess: (r) => {
      setError(null);
      qc.invalidateQueries({ queryKey: [CLAVE] });
      alListo(r.datos.id);
    },
    onError: (e) => setError(e instanceof ErrorPanel ? e.message : "No se pudo guardar el presupuesto."),
  });

  if (esEdicion && vista.isLoading) return <Cargando filas={4} />;
  if (esEdicion && vista.isError) return <ErrorCarga error={vista.error} reintentar={() => vista.refetch()} />;

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <button onClick={alCancelar} className="rounded-lg border border-border bg-card p-2 hover:bg-muted" aria-label="Volver">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-base font-semibold">{esEdicion ? "Editar presupuesto" : "Nuevo presupuesto"}</h2>
          <p className="text-xs text-muted-foreground">El panel calcula subtotal, IVA y total al guardar.</p>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        {esEdicion ? (
          <p className="text-sm">
            Cliente: <span className="font-semibold">{clienteElegido?.companyName ?? "—"}</span>
          </p>
        ) : clienteNuevo ? (
          <div className="space-y-3">
            <Campo etiqueta="Empresa / nombre" valor={formCliente.companyName} onCambio={(v) => setFormCliente((f) => ({ ...f, companyName: v }))} requerido />
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="RUT" valor={formCliente.rut} onCambio={(v) => setFormCliente((f) => ({ ...f, rut: v }))} placeholder="12.345.678-9" />
              <Campo etiqueta="Contacto" valor={formCliente.contactName} onCambio={(v) => setFormCliente((f) => ({ ...f, contactName: v }))} />
            </div>
            <Campo etiqueta="Correo" valor={formCliente.contactEmail} onCambio={(v) => setFormCliente((f) => ({ ...f, contactEmail: v }))} tipo="email" />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={crearCliente.isPending || !formCliente.companyName.trim()}
                onClick={() => crearCliente.mutate()}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {crearCliente.isPending ? "Creando…" : "Crear y usar"}
              </button>
              <button type="button" onClick={() => setClienteNuevo(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
                Volver
              </button>
            </div>
          </div>
        ) : clienteId && clienteElegido ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">
              Cliente: <span className="font-semibold">{clienteElegido.companyName}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setClienteId("");
                setClienteElegido(null);
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <Campo etiqueta="Cliente" valor={clienteTexto} onCambio={setClienteTexto} placeholder="Buscar empresa, contacto o RUT…" requerido />
            <ul className="space-y-1.5">
              {(buscarClientes.data?.datos ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setClienteId(c.id);
                      setClienteElegido(c);
                    }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="block font-medium">{c.companyName}</span>
                    <span className="block text-xs text-muted-foreground">{[c.contactName, c.rut].filter(Boolean).join(" · ") || "—"}</span>
                  </button>
                </li>
              ))}
              {buscarClientes.data && buscarClientes.data.datos.length === 0 && (
                <li className="px-1 text-xs text-muted-foreground">Sin resultados{filtroCliente ? ` para “${filtroCliente}”` : ""}.</li>
              )}
            </ul>
            <button type="button" onClick={() => setClienteNuevo(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <Plus size={14} /> Crear cliente nuevo
            </button>
          </>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ítems</h3>
        {items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border bg-background p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Campo etiqueta={`Ítem ${i + 1}`} valor={it.name} onCambio={(v) => setItem(i, { name: v })} placeholder="Ej: Sitio web corporativo" requerido />
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                  className="mt-5 shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"
                  aria-label="Quitar ítem"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <Campo etiqueta="Descripción (opcional)" valor={it.description} onCambio={(v) => setItem(i, { description: v })} />
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Cantidad" valor={it.quantity} onCambio={(v) => setItem(i, { quantity: v })} tipo="number" />
              <Campo etiqueta="Precio unitario (CLP neto)" valor={it.unitPrice} onCambio={(v) => setItem(i, { unitPrice: v })} tipo="number" requerido />
            </div>
            {Number(it.quantity) > 0 && it.unitPrice !== "" && Number(it.unitPrice) >= 0 && (
              <p className="text-right text-xs text-muted-foreground">fila: {fmtCLP(Number(it.quantity) * Number(it.unitPrice))}</p>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setItems((prev) => [...prev, { ...ITEM_VACIO }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <Plus size={14} /> Agregar ítem
        </button>
        {validos.length > 0 && (
          <p className="text-right text-xs text-muted-foreground">Estimado antes de IVA/descuento: {fmtCLP(estimado)} — el total real lo calcula el panel al guardar.</p>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condiciones comerciales</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hasIVA} onChange={(e) => setHasIVA(e.target.checked)} className="h-4 w-4 accent-[var(--primary,#6366f1)]" />
          Aplicar IVA 19%
        </label>
        <Campo etiqueta="Descuento (CLP)" valor={discount} onCambio={setDiscount} tipo="number" placeholder="0" />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Modalidad de pago</span>
          <select
            value={paymentModality}
            onChange={(e) => setPaymentModality(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {MODALIDADES.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </label>
        {paymentModality === "INSTALLMENTS" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Cantidad de cuotas</span>
            <select
              value={installmentCount}
              onChange={(e) => setInstallmentCount(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {CUOTAS.map((n) => (
                <option key={n} value={n}>
                  {n} cuotas
                </option>
              ))}
            </select>
          </label>
        )}
        {paymentModality === "CUSTOM" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Condiciones personalizadas</span>
            <textarea
              value={customPaymentTerms}
              onChange={(e) => setCustomPaymentTerms(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Mantención</span>
          <select
            value={maintenanceType}
            onChange={(e) => setMaintenanceType(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {MANTENCIONES.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </label>
        {maintenanceType === "CUSTOM" && (
          <Campo etiqueta="Mantención mensual (CLP)" valor={monthlyMaintenance} onCambio={setMonthlyMaintenance} tipo="number" placeholder="0" />
        )}
        <Campo etiqueta="Vigente hasta (opcional)" valor={validUntil} onCambio={setValidUntil} tipo="date" />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Notas (visibles para el cliente)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={guardar.isPending || validos.length === 0 || !clienteListo}
          onClick={() => guardar.mutate("DRAFT")}
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
        >
          {guardar.isPending && guardar.variables === "DRAFT" ? "Guardando…" : "Guardar borrador"}
        </button>
        <button
          type="button"
          disabled={guardar.isPending || validos.length === 0 || !clienteListo}
          onClick={() => guardar.mutate("SENT")}
          className="flex-1 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {guardar.isPending && guardar.variables === "SENT" ? "Guardando…" : "Guardar y enviar"}
        </button>
      </div>
    </div>
  );
}
