import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, MessageCircle, Plus, Trash2 } from "lucide-react";
import {
  agenciaApi,
  CLAVE,
  enlacePropuesta,
  ErrorPanel,
  type Cliente,
  type ContratoServicio,
  type Presupuesto,
  type Registro,
  type VistaPresupuesto,
} from "./api";
import { fmtCLP } from "./formato";
import { Aviso, BotonCopiar, Campo, Cargando } from "./ui";

/**
 * Alta guiada: Cliente → Presupuesto → Contrato → Link de firma.
 * Todo lo genera el panel de la agencia (ids, cálculo, PDF, link);
 * acá solo se juntan los datos y se muestran los resultados.
 */

type ItemForm = { name: string; quantity: string; unitPrice: string };

const ITEM_VACIO: ItemForm = { name: "", quantity: "1", unitPrice: "" };

export default function CrearContrato() {
  const busqueda = useSearch();
  const params = useMemo(() => new URLSearchParams(busqueda), [busqueda]);
  const presupuestoParam = params.get("presupuesto") ?? undefined;
  const clienteParam = params.get("cliente") ?? undefined;

  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(presupuestoParam ? 3 : 1);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null);
  const [calculo, setCalculo] = useState<{ subtotal: number; descuento: number; iva: number; total: number } | null>(null);
  const [contrato, setContrato] = useState<ContratoServicio | null>(null);
  const [avisoExistia, setAvisoExistia] = useState<string | null>(null);

  // Prefills desde la URL
  const clientePre = useQuery({
    queryKey: [CLAVE, "cliente", clienteParam],
    queryFn: () => agenciaApi.registro<Cliente>("clientes", clienteParam!),
    enabled: !!clienteParam && !cliente,
  });
  useEffect(() => {
    if (clientePre.data?.datos && !cliente) {
      setCliente(clientePre.data.datos);
      setPaso((p) => (p === 1 ? 2 : p));
    }
  }, [clientePre.data, cliente]);

  const presupuestoPre = useQuery({
    queryKey: [CLAVE, "vista", "presupuestos", presupuestoParam],
    queryFn: () => agenciaApi.vista<VistaPresupuesto>("presupuestos", presupuestoParam!),
    enabled: !!presupuestoParam && !presupuesto,
  });
  useEffect(() => {
    const d = presupuestoPre.data?.datos;
    if (d?.presupuesto && !presupuesto) {
      setPresupuesto(d.presupuesto);
      if (d.cliente) setCliente(d.cliente);
    }
  }, [presupuestoPre.data, presupuesto]);

  const pasos = ["Cliente", "Presupuesto", "Contrato"];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/agencia/contratos" className="rounded-lg border border-border bg-card p-2 hover:bg-muted" aria-label="Volver">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h2 className="text-base font-semibold">Nuevo contrato</h2>
          <p className="text-xs text-muted-foreground">El panel genera el presupuesto, el contrato y el link de firma.</p>
        </div>
      </div>

      {paso < 4 && (
        <ol className="flex items-center gap-1.5">
          {pasos.map((nombre, i) => {
            const numero = (i + 1) as 1 | 2 | 3;
            const hecho = paso > numero;
            const actual = paso === numero;
            return (
              <li key={nombre} className="flex flex-1 items-center gap-1.5">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    hecho
                      ? "bg-emerald-500 text-white"
                      : actual
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {hecho ? <Check size={13} /> : numero}
                </span>
                <span className={`text-xs ${actual ? "font-semibold" : "text-muted-foreground"}`}>{nombre}</span>
                {i < pasos.length - 1 && <span className="h-px flex-1 bg-border" />}
              </li>
            );
          })}
        </ol>
      )}

      {avisoExistia && <Aviso tono="info">{avisoExistia}</Aviso>}

      {paso === 1 && (
        <PasoCliente
          alElegir={(c, aviso) => {
            setCliente(c);
            setAvisoExistia(aviso ?? null);
            setPaso(2);
          }}
        />
      )}
      {paso === 2 && cliente && (
        <PasoPresupuesto
          cliente={cliente}
          alCrear={(p, calc) => {
            setPresupuesto(p);
            setCalculo(calc ?? null);
            setAvisoExistia(null);
            setPaso(3);
          }}
        />
      )}
      {paso === 3 &&
        (presupuesto ? (
          <PasoContrato
            presupuesto={presupuesto}
            calculo={calculo}
            cliente={cliente}
            alCrear={(c, aviso) => {
              setContrato(c);
              setAvisoExistia(aviso ?? null);
              setPaso(4);
            }}
          />
        ) : (
          <Cargando filas={3} />
        ))}
      {paso === 4 && contrato && <PasoListo contrato={contrato} presupuesto={presupuesto} />}
    </div>
  );
}

/* ----------------------------- Paso 1: cliente ----------------------------- */

function PasoCliente({ alElegir }: { alElegir: (c: Cliente, aviso?: string) => void }) {
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState({ companyName: "", rut: "", contactName: "", contactEmail: "", contactPhone: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setFiltro(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const lista = useQuery({
    queryKey: [CLAVE, "espejo", "clientes", filtro],
    queryFn: () => agenciaApi.espejo<Cliente>("clientes", { q: filtro || undefined, limite: 8 }),
    enabled: !nuevo,
  });

  const crear = useMutation({
    mutationFn: () =>
      agenciaApi.crearCliente({
        companyName: form.companyName,
        rut: form.rut || undefined,
        contactName: form.contactName || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
      }),
    onSuccess: (r) =>
      alElegir(
        r.datos,
        r.creado === false ? "Ese cliente ya existía en el panel (mismo RUT o correo) — seguimos con el existente." : undefined
      ),
    onError: (e) => setError(e instanceof ErrorPanel ? e.message : "No se pudo crear el cliente."),
  });

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      {!nuevo ? (
        <>
          <Campo etiqueta="Buscar cliente" valor={texto} onCambio={setTexto} placeholder="Empresa, contacto o RUT…" />
          {lista.isLoading ? (
            <Cargando filas={2} />
          ) : (
            <ul className="space-y-1.5">
              {(lista.data?.datos ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => alElegir(c)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="block font-medium">{c.companyName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[c.contactName, c.rut].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </button>
                </li>
              ))}
              {lista.data && lista.data.datos.length === 0 && (
                <li className="px-1 text-xs text-muted-foreground">Sin resultados{filtro ? ` para “${filtro}”` : ""}.</li>
              )}
            </ul>
          )}
          <button onClick={() => setNuevo(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Plus size={14} /> Crear cliente nuevo
          </button>
        </>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            crear.mutate();
          }}
        >
          <Campo etiqueta="Empresa / nombre" valor={form.companyName} onCambio={(v) => setForm({ ...form, companyName: v })} requerido />
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="RUT" valor={form.rut} onCambio={(v) => setForm({ ...form, rut: v })} placeholder="12.345.678-9" />
            <Campo etiqueta="Contacto" valor={form.contactName} onCambio={(v) => setForm({ ...form, contactName: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Correo" valor={form.contactEmail} onCambio={(v) => setForm({ ...form, contactEmail: v })} tipo="email" />
            <Campo etiqueta="Teléfono" valor={form.contactPhone} onCambio={(v) => setForm({ ...form, contactPhone: v })} tipo="tel" />
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={crear.isPending || !form.companyName.trim()}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {crear.isPending ? "Creando…" : "Crear y continuar"}
            </button>
            <button type="button" onClick={() => setNuevo(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
              Volver
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* --------------------------- Paso 2: presupuesto --------------------------- */

function PasoPresupuesto({
  cliente,
  alCrear,
}: {
  cliente: Cliente;
  alCrear: (p: Presupuesto, calc?: { subtotal: number; descuento: number; iva: number; total: number }) => void;
}) {
  const [items, setItems] = useState<ItemForm[]>([{ ...ITEM_VACIO }]);
  const [conIva, setConIva] = useState(true);
  const [descuento, setDescuento] = useState("");
  const [mantencion, setMantencion] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validos = items.filter((it) => it.name.trim() && Number(it.quantity) > 0 && Number(it.unitPrice) >= 0);

  const crear = useMutation({
    mutationFn: () =>
      agenciaApi.crearPresupuesto({
        clienteId: cliente.id,
        items: validos.map((it) => ({ name: it.name.trim(), quantity: Number(it.quantity), unitPrice: Number(it.unitPrice) })),
        hasIVA: conIva,
        discount: descuento ? Number(descuento) : 0,
        paymentModality: "STANDARD",
        monthlyMaintenance: mantencion ? Number(mantencion) : 0,
        notes: notas.trim() || undefined,
        includeContract: true,
        estado: "SENT",
      }),
    onSuccess: (r) => alCrear(r.datos, r.calculo),
    onError: (e) => setError(e instanceof ErrorPanel ? e.message : "No se pudo crear el presupuesto."),
  });

  const setItem = (i: number, cambio: Partial<ItemForm>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...cambio } : it)));

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <p className="text-sm">
        Presupuesto para <span className="font-semibold">{cliente.companyName}</span>
      </p>

      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border border-border bg-background p-3">
            <Campo etiqueta={`Ítem ${i + 1}`} valor={it.name} onCambio={(v) => setItem(i, { name: v })} placeholder="Ej: Sitio web corporativo" requerido />
            <div className="mt-2 flex items-end gap-2">
              <div className="w-24">
                <Campo etiqueta="Cantidad" valor={it.quantity} onCambio={(v) => setItem(i, { quantity: v })} tipo="number" />
              </div>
              <div className="flex-1">
                <Campo etiqueta="Precio unitario (CLP neto)" valor={it.unitPrice} onCambio={(v) => setItem(i, { unitPrice: v })} tipo="number" requerido />
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                  className="mb-0.5 rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"
                  aria-label="Quitar ítem"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, { ...ITEM_VACIO }])}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Plus size={14} /> Agregar ítem
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Descuento (CLP)" valor={descuento} onCambio={setDescuento} tipo="number" placeholder="0" />
        <Campo etiqueta="Mantención mensual (CLP)" valor={mantencion} onCambio={setMantencion} tipo="number" placeholder="0" />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={conIva} onChange={(e) => setConIva(e.target.checked)} className="h-4 w-4 accent-[var(--primary,#6366f1)]" />
        Aplicar IVA 19%
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Notas (opcional)</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>

      <p className="text-xs text-muted-foreground">Los totales exactos (subtotal, IVA, total) los calcula el panel al crear.</p>
      {error && <Aviso tono="error">{error}</Aviso>}

      <button
        onClick={() => {
          setError(null);
          crear.mutate();
        }}
        disabled={crear.isPending || validos.length === 0}
        className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {crear.isPending ? "Creando en el panel…" : "Crear presupuesto y seguir"}
      </button>
    </div>
  );
}

/* ----------------------------- Paso 3: contrato ---------------------------- */

function PasoContrato({
  presupuesto,
  calculo,
  cliente,
  alCrear,
}: {
  presupuesto: Presupuesto;
  calculo: { subtotal: number; descuento: number; iva: number; total: number } | null;
  cliente: Cliente | null;
  alCrear: (c: ContratoServicio, aviso?: string) => void;
}) {
  const [representante, setRepresentante] = useState(cliente?.contactName ?? "");
  const [plantillaId, setPlantillaId] = useState("");
  const [forzar, setForzar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plantillas = useQuery({ queryKey: [CLAVE, "plantillas"], queryFn: agenciaApi.plantillas });
  const listaPlantillas: Registro[] = (plantillas.data?.datos as Registro[] | undefined) ?? [];

  const enlaceProp = enlacePropuesta(presupuesto);
  const total = calculo?.total ?? presupuesto.total;

  const crear = useMutation({
    mutationFn: () =>
      agenciaApi.crearContrato({
        presupuestoId: presupuesto.id,
        clientRepresentativeName: representante.trim() || undefined,
        plantillaId: plantillaId || undefined,
        estado: "PENDING_SIGNATURE",
        forzarNuevo: forzar || undefined,
      }),
    onSuccess: (r) =>
      alCrear(
        r.datos,
        r.creado === false ? "Este presupuesto ya tenía un contrato vigente — te muestro el existente." : undefined
      ),
    onError: (e) => setError(e instanceof ErrorPanel ? e.message : "No se pudo crear el contrato."),
  });

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="rounded-lg border border-border bg-background p-3 text-sm">
        <p className="font-medium">Presupuesto listo · {fmtCLP(total)}</p>
        {calculo && (
          <p className="text-xs text-muted-foreground">
            subtotal {fmtCLP(calculo.subtotal)}
            {calculo.descuento > 0 && ` · desc ${fmtCLP(calculo.descuento)}`}
            {calculo.iva > 0 && ` · IVA ${fmtCLP(calculo.iva)}`}
          </p>
        )}
        {enlaceProp && (
          <div className="mt-2">
            <BotonCopiar texto={enlaceProp} etiqueta="Copiar link propuesta" />
          </div>
        )}
      </div>

      <Campo etiqueta="Representante que firma" valor={representante} onCambio={setRepresentante} placeholder="Nombre de quien firma por el cliente" />

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Plantilla</span>
        <select
          value={plantillaId}
          onChange={(e) => setPlantillaId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Plantilla por defecto del panel</option>
          {listaPlantillas.map((p) => (
            <option key={String(p.id)} value={String(p.id)}>
              {String(p.nombre ?? p.name ?? p.titulo ?? p.id)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} className="mt-0.5 h-4 w-4" />
        Generar uno nuevo aunque el presupuesto ya tenga contrato (el anterior queda de lado)
      </label>

      {error && <Aviso tono="error">{error}</Aviso>}

      <button
        onClick={() => {
          setError(null);
          crear.mutate();
        }}
        disabled={crear.isPending}
        className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {crear.isPending ? "Generando contrato…" : "Generar contrato y link de firma"}
      </button>
    </div>
  );
}

/* ------------------------------ Paso 4: listo ------------------------------ */

function PasoListo({ contrato, presupuesto }: { contrato: ContratoServicio; presupuesto: Presupuesto | null }) {
  const enlaces = contrato._enlaces ?? {};
  const linkFirma = enlaces.contrato;
  const linkPdf = enlaces.pdf;
  const enlaceProp = presupuesto ? enlacePropuesta(presupuesto) : undefined;

  return (
    <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold">Contrato listo</p>
          <p className="text-xs text-muted-foreground">Generado por el panel para {contrato.clientCompanyName ?? "el cliente"}.</p>
        </div>
      </div>

      {linkFirma ? (
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
              <MessageCircle size={13} /> Mandar por WhatsApp
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
      ) : (
        <Aviso tono="info">El panel no devolvió link de firma (puede que el contrato esté en borrador).</Aviso>
      )}

      <div className="flex flex-wrap gap-2">
        {linkPdf && (
          <a href={linkPdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted">
            <ExternalLink size={13} /> PDF del contrato
          </a>
        )}
        {enlaceProp && <BotonCopiar texto={enlaceProp} etiqueta="Link propuesta" />}
      </div>

      <Link href="/agencia/contratos" className="block rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-primary-foreground hover:opacity-90">
        Ver todos los contratos
      </Link>
    </div>
  );
}
