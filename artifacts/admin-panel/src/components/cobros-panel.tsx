// Cobros: la caja de la agencia.
//
// Antes de este panel, saber cuánto debía cada cliente era abrir contrato por
// contrato y hacer la cuenta a mano; los datos de la cuenta bancaria se
// dictaban por WhatsApp cada vez (con el RUT bailado más de una vez). Aquí
// vive todo junto: los proyectos activos con su total (IVA incluido), los
// pagos que van llegando, la cuenta para transferir —copiable, no dictable—
// y los papeles de la empresa (e-RUT, escritura) que piden los clientes.
//
// El monto de un pago va en pesos ENTEROS e IVA incluido: es la plata que
// entró a la cuenta. El servidor recalcula todo; aquí solo se muestra.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Landmark, Loader2, Plus, Trash2, X } from "lucide-react";
import { Adjuntos } from "@/components/adjuntos";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");
const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

interface PagoDTO {
  id: number;
  fecha: string;
  monto: number;
  nota: string;
  createdById: number | null;
  creadoPor: string | null;
}

interface ProyectoCobro {
  id: string;
  title: string;
  client: string;
  status: string;
  signedAt: string | null;
  expiresAt: string | null;
  cobro: { estado: string; factura: string; fechaPago: string; nota: string } | null;
  neto: number;
  iva: number;
  total: number;
  pagado: number;
  saldo: number;
  estadoPago: "pendiente" | "parcial" | "pagado";
  pagos: PagoDTO[];
}

interface CobrosDTO {
  cuenta: { banco: string; tipo: string; numero: string; rut: string; rutFormateado: string; textoCopiar: string };
  proyectos: ProyectoCobro[];
  totales: { proyectos: number; total: number; pagado: number; saldo: number };
  miId: number;
  esDireccion: boolean;
}

async function req(method: string, path: string, body?: unknown): Promise<Record<string, any>> {
  const r = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, any>;
  if (!r.ok) throw new Error(data.error || `El servidor respondió ${r.status}`);
  return data;
}

const CHIP_PAGO: Record<ProyectoCobro["estadoPago"], [string, string]> = {
  pendiente: ["Pendiente", "bg-amber-500/15 text-amber-400 border-amber-500/30"],
  parcial: ["Abonado", "bg-sky-500/15 text-sky-400 border-sky-500/30"],
  pagado: ["Pagado", "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"],
};

/** Copia con degradado elegante: si el navegador no deja, se avisa. */
async function copiar(texto: string, showToast: (m: string) => void, que: string) {
  try {
    await navigator.clipboard.writeText(texto);
    showToast(`${que} copiado`);
  } catch {
    showToast("No se pudo copiar; selecciónalo a mano");
  }
}

function FilaCuenta({ etiqueta, mostrar, copiarValor, showToast }: {
  etiqueta: string;
  mostrar: string;
  copiarValor: string;
  showToast: (m: string) => void;
}) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs opacity-60 flex-shrink-0">{etiqueta}</span>
      <span className="text-sm font-medium truncate" style={{ fontFamily: "IBM Plex Mono, monospace" }}>{mostrar}</span>
      <button
        type="button"
        onClick={async () => {
          await copiar(copiarValor, showToast, etiqueta);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        }}
        className="p-1.5 rounded-lg hover:bg-foreground/10 transition-colors flex-shrink-0"
        aria-label={`Copiar ${etiqueta}`}
        data-testid={`button-copiar-${etiqueta.toLowerCase().replace(/[^a-z]/g, "")}`}
      >
        {ok ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
      </button>
    </div>
  );
}

function FormPago({ proyecto, showToast, onListo }: {
  proyecto: ProyectoCobro;
  showToast: (m: string) => void;
  onListo: () => void;
}) {
  const qc = useQueryClient();
  const [fecha, setFecha] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");

  const agregar = useMutation({
    mutationFn: () => req("POST", `/hub/cobros/${proyecto.id}/pagos`, { fecha, monto: Number(monto), nota }),
    onSuccess: (d) => {
      showToast(d.cobroActualizado ? "Pago registrado — el proyecto quedó PAGADO al completo" : "Pago registrado");
      qc.invalidateQueries({ queryKey: ["hub-cobros"] });
      onListo();
    },
    onError: (e) => showToast(e instanceof Error ? e.message : "No se pudo registrar el pago"),
  });

  const enviar = () => {
    const n = Number(monto);
    if (!Number.isInteger(n) || n <= 0) { showToast("El monto va en pesos enteros, sin puntos ni decimales"); return; }
    if (!fecha) { showToast("Falta la fecha del pago"); return; }
    agregar.mutate();
  };

  return (
    <div className="mt-2 rounded-lg border border-foreground/10 bg-foreground/5 p-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-[11px] opacity-70">
          Fecha
          <input type="date" value={fecha} max={new Date().toLocaleDateString("en-CA")}
            onChange={(e) => setFecha(e.target.value)}
            className="bg-transparent border border-foreground/15 rounded px-2 py-1 text-sm text-foreground"
            data-testid="input-pago-fecha" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] opacity-70 flex-1 min-w-[130px]">
          Monto (CLP, IVA incluido)
          <input type="number" min={1} step={1} placeholder="Ej: 595000" value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="bg-transparent border border-foreground/15 rounded px-2 py-1 text-sm text-foreground"
            data-testid="input-pago-monto" />
        </label>
      </div>
      <input type="text" maxLength={300} placeholder="Nota (opcional): transferencia, N° de operación…" value={nota}
        onChange={(e) => setNota(e.target.value)}
        className="w-full bg-transparent border border-foreground/15 rounded px-2 py-1 text-sm text-foreground"
        data-testid="input-pago-nota" />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onListo}
          className="px-3 py-1.5 rounded-lg text-xs border border-foreground/15 hover:bg-foreground/10 transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={enviar} disabled={agregar.isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center gap-1.5"
          data-testid="button-guardar-pago">
          {agregar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Guardar pago
        </button>
      </div>
    </div>
  );
}

function TarjetaProyecto({ p, miId, esDireccion, showToast }: {
  p: ProyectoCobro;
  miId: number;
  esDireccion: boolean;
  showToast: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [formAbierto, setFormAbierto] = useState(false);
  const [chipPago, chipCls] = CHIP_PAGO[p.estadoPago];
  const pct = p.total > 0 ? Math.min(100, Math.round((p.pagado / p.total) * 100)) : 0;

  const quitar = useMutation({
    mutationFn: (pagoId: number) => req("DELETE", `/hub/cobros/pagos/${pagoId}`),
    onSuccess: () => {
      showToast("Pago quitado del registro");
      qc.invalidateQueries({ queryKey: ["hub-cobros"] });
    },
    onError: (e) => showToast(e instanceof Error ? e.message : "No se pudo quitar el pago"),
  });

  return (
    <div className="rounded-xl border border-foreground/10 bg-card/40 p-4 space-y-3" data-testid={`card-cobro-${p.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{p.client || p.title || "(sin nombre)"}</div>
          <div className="text-xs opacity-60 truncate">
            {p.title && p.client ? p.title : null}
            {p.signedAt ? `${p.title && p.client ? " · " : ""}Firmado el ${p.signedAt}` : null}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {p.status === "vencido" && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30">Vencido</span>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${chipCls}`} data-testid={`chip-estado-${p.id}`}>{chipPago}</span>
        </div>
      </div>

      {/* Montos: el total manda; neto e IVA son el desglose. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="opacity-60 text-xs self-center">Neto {clp(p.neto)} · IVA {clp(p.iva)}</span>
        <span className="font-semibold">Total {clp(p.total)}</span>
        <span className="text-emerald-400">Pagado {clp(p.pagado)}</span>
        <span className={p.saldo > 0 ? "text-amber-400 font-semibold" : "opacity-60"} data-testid={`text-saldo-${p.id}`}>
          Saldo {clp(p.saldo)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500/70 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Gestión existente (factura, estado manual) — sin duplicar el chip calculado. */}
      {p.cobro && (p.cobro.factura || (p.cobro.estado && p.cobro.estado !== p.estadoPago)) && (
        <div className="text-[11px] opacity-60">
          Gestión: {p.cobro.estado || "sin estado"}
          {p.cobro.factura ? ` · Factura ${p.cobro.factura}` : ""}
          {p.cobro.fechaPago ? ` · fecha ${p.cobro.fechaPago}` : ""}
        </div>
      )}

      {p.pagos.length > 0 && (
        <ul className="space-y-1">
          {p.pagos.map((pg) => (
            <li key={pg.id} className="flex items-center gap-2 text-xs rounded-lg bg-foreground/5 px-2.5 py-1.5" data-testid={`row-pago-${pg.id}`}>
              <span className="opacity-60 flex-shrink-0" style={{ fontFamily: "IBM Plex Mono, monospace" }}>{pg.fecha}</span>
              <span className="font-semibold flex-shrink-0">{clp(pg.monto)}</span>
              <span className="opacity-60 truncate flex-1">{pg.nota}</span>
              {pg.creadoPor && <span className="opacity-40 flex-shrink-0 hidden sm:inline">{pg.creadoPor}</span>}
              {(esDireccion || pg.createdById === miId) && (
                <button
                  type="button"
                  onClick={() => { if (window.confirm("¿Quitar este pago del registro? El total pagado se recalcula al momento.")) quitar.mutate(pg.id); }}
                  disabled={quitar.isPending}
                  className="p-1 rounded hover:bg-red-500/15 hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-40"
                  aria-label="Quitar pago"
                  data-testid={`button-quitar-pago-${pg.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {formAbierto ? (
        <FormPago proyecto={p} showToast={showToast} onListo={() => setFormAbierto(false)} />
      ) : (
        <button type="button" onClick={() => setFormAbierto(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
          data-testid={`button-registrar-pago-${p.id}`}>
          <Plus className="w-3.5 h-3.5" /> Registrar pago
        </button>
      )}
    </div>
  );
}

export default function CobrosPanel({ showToast }: { showToast: (m: string) => void }) {
  const q = useQuery<CobrosDTO>({
    queryKey: ["hub-cobros"],
    queryFn: () => req("GET", "/hub/cobros") as Promise<CobrosDTO>,
  });

  if (q.isLoading) return <div className="p-6 text-sm opacity-60">Cargando cobros…</div>;
  if (q.isError) return <div className="p-6 text-sm text-red-400">No se pudo cargar Cobros: {(q.error as Error).message}</div>;
  const data = q.data!;

  const activos = data.proyectos.filter((p) => p.status === "activo");
  const vencidos = data.proyectos.filter((p) => p.status !== "activo");

  return (
    <div className="p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* ---- Resumen + cuenta ---- */}
      <div className="flex flex-wrap gap-3 items-stretch">
        <div className="rounded-lg border px-4 py-2" style={{ borderColor: "rgba(128,128,128,.35)" }} data-testid="text-total-activo">
          <div className="text-[11px] uppercase tracking-wide opacity-60">Total en proyectos · {data.totales.proyectos}</div>
          <div className="text-xl font-semibold">{clp(data.totales.total)} <span className="text-xs font-normal opacity-60">c/IVA</span></div>
        </div>
        <div className="rounded-lg border px-4 py-2" style={{ borderColor: "rgba(16,185,129,.35)" }} data-testid="text-total-pagado">
          <div className="text-[11px] uppercase tracking-wide opacity-60">Cobrado</div>
          <div className="text-xl font-semibold text-emerald-400">{clp(data.totales.pagado)}</div>
        </div>
        <div className="rounded-lg border px-4 py-2" style={{ borderColor: "rgba(245,158,11,.35)" }} data-testid="text-total-saldo">
          <div className="text-[11px] uppercase tracking-wide opacity-60">Por cobrar</div>
          <div className="text-xl font-semibold text-amber-400">{clp(data.totales.saldo)}</div>
        </div>

        <div className="rounded-xl border border-foreground/10 bg-card/40 px-4 py-3 min-w-[260px] flex-1 max-w-md" data-testid="card-cuenta">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold flex-1">Cuenta para transferencias</span>
            <button
              type="button"
              onClick={() => copiar(data.cuenta.textoCopiar, showToast, "Datos de la cuenta")}
              className="text-[11px] font-semibold text-primary hover:opacity-80 transition-opacity"
              data-testid="button-copiar-cuenta"
            >
              Copiar todo
            </button>
          </div>
          <div className="divide-y divide-foreground/5">
            <FilaCuenta etiqueta="Banco" mostrar={`${data.cuenta.banco} · ${data.cuenta.tipo}`} copiarValor={data.cuenta.banco} showToast={showToast} />
            <FilaCuenta etiqueta="N° de cuenta" mostrar={data.cuenta.numero} copiarValor={data.cuenta.numero} showToast={showToast} />
            <FilaCuenta etiqueta="RUT" mostrar={data.cuenta.rutFormateado} copiarValor={data.cuenta.rut} showToast={showToast} />
          </div>
        </div>
      </div>

      {/* ---- Proyectos activos ---- */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide opacity-70">Proyectos activos</h3>
        {activos.length === 0 && (
          <div className="rounded-xl border border-dashed border-foreground/15 p-6 text-sm opacity-60 text-center">
            Sin proyectos activos todavía. Cuando el cliente firma su contrato, pasa a activo solo y aparece aquí con su total y sus pagos.
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {activos.map((p) => (
            <TarjetaProyecto key={p.id} p={p} miId={data.miId} esDireccion={data.esDireccion} showToast={showToast} />
          ))}
        </div>
      </div>

      {/* ---- Vencidos con plata pendiente ---- */}
      {vencidos.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide opacity-70">Vencidos</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {vencidos.map((p) => (
              <TarjetaProyecto key={p.id} p={p} miId={data.miId} esDireccion={data.esDireccion} showToast={showToast} />
            ))}
          </div>
        </div>
      )}

      {/* ---- Documentos de la empresa ---- */}
      <div className="max-w-2xl">
        <h3 className="text-sm font-semibold uppercase tracking-wide opacity-70">Documentos de la empresa</h3>
        <p className="text-xs opacity-60 mt-1">
          e-RUT, escritura, certificados: lo que piden los clientes para facturar o transferir. Quedan en el Drive de quien los sube.
        </p>
        <Adjuntos tipo="empresa" id="webmaker" titulo="Documentos (e-RUT, escritura, certificados)" />
      </div>
    </div>
  );
}
