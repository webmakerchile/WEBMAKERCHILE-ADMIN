import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Torre de control de Ventas: pipeline por etapa con probabilidad y proyección
 * ponderada del mes, seguimientos, renovaciones de contratos y comisiones
 * sobre lo efectivamente cobrado. Los montos solo llegan del servidor cuando
 * el rol puede verlos (canSeeMoney): aquí no se calcula ni oculta nada.
 */

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Error ${res.status}`);
  return body as T;
}

type Stage = "prospecto" | "contactado" | "propuesta" | "negociacion" | "cierre";

interface Opp {
  id: string; title: string; client: string; stage: Stage; probability: number;
  nextFollowUp: string; expectedClose: string; salesOwnerId: number | null;
  renewalOfId: string; amountNet?: number;
}
interface Renewal { id: string; title: string; client: string; expiresAt: string; expired: boolean; renewalStarted: boolean }
interface Resumen {
  month: string; sellers: { id: number; name: string }[]; stages: Stage[];
  stageDefaults: Record<Stage, number>; opportunities: Opp[]; renewals: Renewal[];
  renewalAlertDays: number; projection: number | null; canSeeMoney: boolean;
  /** Cuántas se ganan de las que se cierran. Va sin montos: es un recuento. */
  conversion?: { ganados: number; perdidos: number; tasa: number | null };
  motivosPerdida?: { motivo: string; total: number }[];
}

const MOTIVO_LABEL: Record<string, string> = {
  precio: "precio", plazo: "plazo", competencia: "se fue con otro",
  sin_respuesta: "dejó de responder", no_era_el_momento: "no era el momento",
  otro: "otro", sin_indicar: "sin indicar",
};
interface ComisionRow {
  contractId: string; title: string; client: string; salesOwnerId: number | null;
  ownerName: string | null; paidAt: string; amountNet: number; commissionPct: number; commission: number;
}
interface Comisiones { month: string; rows: ComisionRow[]; totals: { collectedNet: number; commission: number } }

const STAGE_LABEL: Record<Stage, string> = {
  prospecto: "Prospecto", contactado: "Contactado", propuesta: "Propuesta",
  negociacion: "Negociación", cierre: "Cierre",
};
const STAGE_COLOR: Record<Stage, string> = {
  prospecto: "#8a8f98", contactado: "#6aa0c0", propuesta: "#c9a44a",
  negociacion: "#e0795a", cierre: "#4faf6a",
};

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

export default function VentasPanel({ showToast }: { showToast: (msg: string) => void }) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => todayStr().slice(0, 7));

  const resumen = useQuery<Resumen>({
    queryKey: ["ventas-resumen", month],
    queryFn: () => req(`/hub/ventas/resumen?month=${month}`),
  });
  const comisiones = useQuery<Comisiones>({
    queryKey: ["ventas-comisiones", month],
    queryFn: () => req(`/hub/ventas/comisiones?month=${month}`),
    retry: false,
  });

  const patchOpp = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Opp> & { pipelineStage?: Stage } }) =>
      req(`/hub/ventas/opportunities/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ventas-resumen"] });
      qc.invalidateQueries({ queryKey: ["hub-owner"] });
    },
    onError: (e: Error) => showToast(e.message),
  });
  const renew = useMutation({
    mutationFn: (id: string) => req(`/hub/ventas/contracts/${id}/renew`, { method: "POST" }),
    onSuccess: () => {
      showToast("Renovación creada como nueva oportunidad");
      qc.invalidateQueries({ queryKey: ["ventas-resumen"] });
    },
    onError: (e: Error) => showToast(e.message),
  });
  const saveDays = useMutation({
    mutationFn: (days: number) => req(`/hub/ventas/settings`, { method: "PUT", body: JSON.stringify({ renewalAlertDays: days }) }),
    onSuccess: () => { showToast("Antelación guardada"); qc.invalidateQueries({ queryKey: ["ventas-resumen"] }); },
    onError: (e: Error) => showToast(e.message),
  });

  const data = resumen.data;
  const today = todayStr();
  const overdue = useMemo(
    () => (data?.opportunities ?? []).filter(o => o.nextFollowUp && o.nextFollowUp < today).length,
    [data, today],
  );

  if (resumen.isLoading) return <div className="p-6 text-sm opacity-60">Cargando torre de ventas…</div>;
  if (resumen.isError) return <div className="p-6 text-sm text-red-400">No se pudo cargar Ventas: {(resumen.error as Error).message}</div>;
  if (!data) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Encabezado: mes + proyección */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="bg-transparent border rounded px-2 py-1 text-sm"
          style={{ borderColor: "rgba(128,128,128,.35)" }}
          data-testid="input-ventas-month"
        />
        {data.canSeeMoney && data.projection !== null && (
          <div className="rounded-lg border px-4 py-2" style={{ borderColor: "rgba(128,128,128,.35)" }} data-testid="text-projection">
            <div className="text-[11px] uppercase tracking-wide opacity-60">Proyección ponderada · {data.month}</div>
            <div className="text-xl font-semibold">{clp(data.projection)} <span className="text-xs font-normal opacity-60">neto</span></div>
          </div>
        )}
        {/* Conversión: no se podía calcular mientras "perdido" y "cancelado"
            fueran el mismo estado. Se enseña con el recuento al lado para que
            un 100% sobre dos cierres no se lea como un 100% sobre cincuenta. */}
        {data.conversion && data.conversion.tasa !== null && (
          <div className="rounded-lg border px-4 py-2" style={{ borderColor: "rgba(128,128,128,.35)" }} data-testid="text-conversion">
            <div className="text-[11px] uppercase tracking-wide opacity-60">Conversión</div>
            <div className="text-xl font-semibold">
              {data.conversion.tasa}%{" "}
              <span className="text-xs font-normal opacity-60">
                {data.conversion.ganados} de {data.conversion.ganados + data.conversion.perdidos} cerradas
              </span>
            </div>
            {(data.motivosPerdida?.length ?? 0) > 0 && (
              <div className="text-[11px] opacity-60 mt-0.5">
                Se pierde por: {data.motivosPerdida!.slice(0, 3).map(m => `${MOTIVO_LABEL[m.motivo] ?? m.motivo} (${m.total})`).join(", ")}
              </div>
            )}
          </div>
        )}
        {overdue > 0 && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400" data-testid="text-overdue">
            {overdue} seguimiento{overdue > 1 ? "s" : ""} vencido{overdue > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Pipeline por etapa */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {data.stages.map(stage => {
          const opps = data.opportunities.filter(o => o.stage === stage);
          return (
            <div key={stage} className="rounded-lg border p-3 space-y-2" style={{ borderColor: "rgba(128,128,128,.3)" }} data-testid={`col-${stage}`}>
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
                <span style={{ color: STAGE_COLOR[stage] }}>{STAGE_LABEL[stage]}</span>
                <span className="opacity-50">{opps.length}</span>
              </div>
              {opps.length === 0 && <div className="text-xs opacity-40 py-2">Sin oportunidades</div>}
              {opps.map(o => (
                <div key={o.id} className="rounded border p-2 space-y-2 text-sm" style={{ borderColor: "rgba(128,128,128,.25)" }} data-testid={`card-opp-${o.id}`}>
                  <div className="font-medium leading-tight">{o.title || "(sin título)"}</div>
                  <div className="text-xs opacity-60">{o.client}{o.renewalOfId ? " · renovación" : ""}</div>
                  {data.canSeeMoney && o.amountNet !== undefined && o.amountNet > 0 && (
                    <div className="text-xs">{clp(o.amountNet)} neto</div>
                  )}
                  <div className="flex items-center gap-2 text-xs">
                    <select
                      value={o.stage}
                      onChange={e => patchOpp.mutate({ id: o.id, patch: { pipelineStage: e.target.value as Stage } })}
                      className="bg-transparent border rounded px-1 py-0.5 flex-1"
                      style={{ borderColor: "rgba(128,128,128,.3)" }}
                      data-testid={`select-stage-${o.id}`}
                    >
                      {data.stages.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                    </select>
                    <label className="flex items-center gap-1">
                      <input
                        type="number" min={0} max={100} defaultValue={o.probability}
                        key={`${o.id}-${o.probability}`}
                        onBlur={e => {
                          const v = Math.max(0, Math.min(100, Number(e.target.value)));
                          if (v !== o.probability) patchOpp.mutate({ id: o.id, patch: { probability: v } });
                        }}
                        className="w-14 bg-transparent border rounded px-1 py-0.5 text-right"
                        style={{ borderColor: "rgba(128,128,128,.3)" }}
                        data-testid={`input-prob-${o.id}`}
                      />%
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="space-y-0.5">
                      <span className={o.nextFollowUp && o.nextFollowUp < today ? "text-red-400" : "opacity-50"}>Seguimiento</span>
                      <input
                        type="date" defaultValue={o.nextFollowUp} key={`f-${o.id}-${o.nextFollowUp}`}
                        onBlur={e => { if (e.target.value !== o.nextFollowUp) patchOpp.mutate({ id: o.id, patch: { nextFollowUp: e.target.value } }); }}
                        className="w-full bg-transparent border rounded px-1 py-0.5"
                        style={{ borderColor: "rgba(128,128,128,.3)" }}
                        data-testid={`input-followup-${o.id}`}
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="opacity-50">Cierre esperado</span>
                      <input
                        type="date" defaultValue={o.expectedClose} key={`c-${o.id}-${o.expectedClose}`}
                        onBlur={e => { if (e.target.value !== o.expectedClose) patchOpp.mutate({ id: o.id, patch: { expectedClose: e.target.value } }); }}
                        className="w-full bg-transparent border rounded px-1 py-0.5"
                        style={{ borderColor: "rgba(128,128,128,.3)" }}
                        data-testid={`input-close-${o.id}`}
                      />
                    </label>
                  </div>
                  <select
                    value={o.salesOwnerId ?? ""}
                    onChange={e => patchOpp.mutate({ id: o.id, patch: { salesOwnerId: e.target.value ? Number(e.target.value) : null } })}
                    className="w-full bg-transparent border rounded px-1 py-0.5 text-xs"
                    style={{ borderColor: "rgba(128,128,128,.3)" }}
                    data-testid={`select-owner-${o.id}`}
                  >
                    <option value="">Sin ejecutivo asignado</option>
                    {data.sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Renovaciones */}
      <section className="rounded-lg border p-4 space-y-3" style={{ borderColor: "rgba(128,128,128,.3)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide">Renovaciones próximas</h3>
          <label className="flex items-center gap-2 text-xs opacity-80">
            Avisar con
            <input
              type="number" min={1} max={365} defaultValue={data.renewalAlertDays}
              key={data.renewalAlertDays}
              onBlur={e => {
                const v = Number(e.target.value);
                if (v >= 1 && v <= 365 && v !== data.renewalAlertDays) saveDays.mutate(v);
              }}
              className="w-16 bg-transparent border rounded px-1 py-0.5 text-right"
              style={{ borderColor: "rgba(128,128,128,.3)" }}
              data-testid="input-renewal-days"
            />
            días de antelación
          </label>
        </div>
        {data.renewals.length === 0 && <div className="text-xs opacity-50">Ningún contrato activo vence dentro del plazo configurado.</div>}
        {data.renewals.map(r => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm" style={{ borderColor: "rgba(128,128,128,.25)" }} data-testid={`row-renewal-${r.id}`}>
            <div>
              <div className="font-medium">{r.title}</div>
              <div className={`text-xs ${r.expired ? "text-red-400" : "opacity-60"}`}>
                {r.client} · vence {r.expiresAt}{r.expired ? " (vencido)" : ""}
              </div>
            </div>
            {r.renewalStarted ? (
              <span className="text-xs text-emerald-400">Renovación iniciada</span>
            ) : (
              <button
                onClick={() => renew.mutate(r.id)}
                disabled={renew.isPending}
                className="text-xs border rounded px-3 py-1 hover:opacity-80 disabled:opacity-40"
                style={{ borderColor: "rgba(128,128,128,.4)" }}
                data-testid={`button-renew-${r.id}`}
              >
                Iniciar renovación
              </button>
            )}
          </div>
        ))}
      </section>

      {/* Comisiones */}
      <section className="rounded-lg border p-4 space-y-3" style={{ borderColor: "rgba(128,128,128,.3)" }}>
        <h3 className="text-sm font-semibold uppercase tracking-wide">Comisiones · {month} <span className="font-normal normal-case opacity-50">(sobre lo efectivamente cobrado, base neta)</span></h3>
        {comisiones.isError && <div className="text-xs opacity-50">{(comisiones.error as Error).message}</div>}
        {comisiones.data && comisiones.data.rows.length === 0 && (
          <div className="text-xs opacity-50">Sin cobros pagados este mes.</div>
        )}
        {comisiones.data && comisiones.data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase opacity-50 text-left">
                <tr>
                  <th className="py-1 pr-3">Contrato</th>
                  <th className="py-1 pr-3">Ejecutivo</th>
                  <th className="py-1 pr-3">Pagado el</th>
                  <th className="py-1 pr-3 text-right">Neto cobrado</th>
                  <th className="py-1 pr-3 text-right">%</th>
                  <th className="py-1 text-right">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {comisiones.data.rows.map(r => (
                  <tr key={r.contractId} className="border-t" style={{ borderColor: "rgba(128,128,128,.2)" }} data-testid={`row-comision-${r.contractId}`}>
                    <td className="py-1.5 pr-3">{r.title}<span className="opacity-50"> · {r.client}</span></td>
                    <td className="py-1.5 pr-3">{r.ownerName ?? <span className="opacity-40">Sin asignar</span>}</td>
                    <td className="py-1.5 pr-3">{r.paidAt}</td>
                    <td className="py-1.5 pr-3 text-right">{clp(r.amountNet)}</td>
                    <td className="py-1.5 pr-3 text-right">{r.commissionPct}%</td>
                    <td className="py-1.5 text-right font-medium">{clp(r.commission)}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold" style={{ borderColor: "rgba(128,128,128,.35)" }}>
                  <td className="py-1.5 pr-3" colSpan={3}>Total</td>
                  <td className="py-1.5 pr-3 text-right" data-testid="text-total-net">{clp(comisiones.data.totals.collectedNet)}</td>
                  <td />
                  <td className="py-1.5 text-right" data-testid="text-total-commission">{clp(comisiones.data.totals.commission)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] opacity-40">El % de comisión de cada ejecutivo se define en su ficha de RRHH. Los cobros los registra contabilidad; aquí son solo lectura.</p>
      </section>
    </div>
  );
}
