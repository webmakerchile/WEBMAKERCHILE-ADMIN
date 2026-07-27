// Cuentas publicitarias de clientes que administra marketing.
//
// Es lo que la persona a cargo hace de verdad: llevar Google Ads, Meta Ads y
// TikTok Ads de cada cliente. El apartado mostraba un resumen de las redes
// PROPIAS de la agencia, que no le sirve para trabajar.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, X, Megaphone, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export const PLATAFORMAS = [
  { id: "google_ads", label: "Google Ads", color: "#4285F4" },
  { id: "meta_ads", label: "Meta Ads", color: "#0866FF" },
  { id: "tiktok_ads", label: "TikTok Ads", color: "#EE1D52" },
] as const;
type PlataformaId = (typeof PLATAFORMAS)[number]["id"];

const ESTADOS = [
  { id: "activa", label: "Activa", clase: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  { id: "pausada", label: "Pausada", clase: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  { id: "sin_acceso", label: "Sin acceso", clase: "text-red-400 border-red-500/30 bg-red-500/10" },
  { id: "cerrada", label: "Cerrada", clase: "text-muted-foreground border-foreground/15" },
] as const;
type EstadoId = (typeof ESTADOS)[number]["id"];

export interface CuentaAds {
  id: number;
  clientName: string;
  platform: PlataformaId;
  accountId: string;
  accountName: string;
  status: EstadoId;
  monthlyBudget: number | null;
  currency: string;
  notes: string;
  ownerId: number | null;
  ownerName: string | null;
  updatedAt: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(b?.error || `Error ${res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

const vacia = () => ({
  clientName: "",
  platform: "google_ads" as PlataformaId,
  accountId: "",
  accountName: "",
  status: "activa" as EstadoId,
  monthlyBudget: "",
  currency: "CLP",
  notes: "",
});

const fmtMoneda = (v: number, moneda: string) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(v);

export function CuentasAds() {
  const qc = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [draft, setDraft] = useState(vacia());
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-ad-accounts"],
    queryFn: () => api<{ accounts: CuentaAds[] }>("/marketing/ad-accounts"),
  });

  const cuentas = useMemo(() => data?.accounts ?? [], [data]);
  const inv = () => qc.invalidateQueries({ queryKey: ["marketing-ad-accounts"] });

  const guardar = useMutation({
    mutationFn: (p: { id?: number }) => {
      const cuerpo = {
        clientName: draft.clientName.trim(),
        platform: draft.platform,
        accountId: draft.accountId.trim(),
        accountName: draft.accountName.trim(),
        status: draft.status,
        monthlyBudget: draft.monthlyBudget ? Number(draft.monthlyBudget) : null,
        currency: draft.currency.trim() || "CLP",
        notes: draft.notes.trim(),
      };
      return p.id
        ? api(`/marketing/ad-accounts/${p.id}`, { method: "PATCH", body: JSON.stringify(cuerpo) })
        : api("/marketing/ad-accounts", { method: "POST", body: JSON.stringify(cuerpo) });
    },
    onSuccess: () => { setError(null); setCreando(false); setEditando(null); setDraft(vacia()); inv(); },
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo guardar"),
  });

  const borrar = useMutation({
    mutationFn: (id: number) => api(`/marketing/ad-accounts/${id}`, { method: "DELETE" }),
    onSuccess: inv,
    onError: (e) => setError(e instanceof Error ? e.message : "No se pudo eliminar"),
  });

  const abrirEdicion = (c: CuentaAds) => {
    setDraft({
      clientName: c.clientName,
      platform: c.platform,
      accountId: c.accountId,
      accountName: c.accountName,
      status: c.status,
      monthlyBudget: c.monthlyBudget === null ? "" : String(c.monthlyBudget),
      currency: c.currency,
      notes: c.notes,
    });
    setEditando(c.id);
    setCreando(true);
  };

  // Agrupadas por cliente: es como se trabaja la pauta, cliente por cliente.
  const porCliente = useMemo(() => {
    const m = new Map<string, CuentaAds[]>();
    for (const c of cuentas) {
      const lista = m.get(c.clientName) ?? [];
      lista.push(c);
      m.set(c.clientName, lista);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cuentas]);

  const presupuestoTotal = cuentas
    .filter((c) => c.status === "activa" && c.monthlyBudget)
    .reduce((a, c) => a + (c.monthlyBudget ?? 0), 0);

  const inputCls = "w-full h-9 rounded-lg border border-foreground/15 bg-card/60 px-2.5 text-sm";

  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" /> Cuentas publicitarias de clientes
            </p>
            <p className="text-[11px] text-muted-foreground">
              {cuentas.length === 0
                ? "Google Ads, Meta Ads y TikTok Ads que administras."
                : `${cuentas.length} cuenta${cuentas.length === 1 ? "" : "s"} · ${presupuestoTotal > 0 ? `${fmtMoneda(presupuestoTotal, cuentas[0]!.currency)}/mes en pauta activa` : "sin presupuesto cargado"}`}
            </p>
          </div>
          <Button
            size="sm"
            variant={creando ? "ghost" : "default"}
            onClick={() => { setCreando(!creando); setEditando(null); setDraft(vacia()); }}
          >
            {creando ? <X className="w-4 h-4 mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
            {creando ? "Cancelar" : "Agregar cuenta"}
          </Button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {creando && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 grid sm:grid-cols-2 gap-2.5">
            <label className="sm:col-span-2">
              <span className="text-[11px] text-muted-foreground">Cliente</span>
              <input className={`${inputCls} mt-1`} maxLength={160} value={draft.clientName}
                onChange={(e) => setDraft({ ...draft, clientName: e.target.value })}
                placeholder="Ej: Kori &amp; Glow" />
            </label>
            <label>
              <span className="text-[11px] text-muted-foreground">Plataforma</span>
              <select className={`${inputCls} mt-1`} value={draft.platform}
                onChange={(e) => setDraft({ ...draft, platform: e.target.value as PlataformaId })}>
                {PLATAFORMAS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label>
              <span className="text-[11px] text-muted-foreground">Estado</span>
              <select className={`${inputCls} mt-1`} value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as EstadoId })}>
                {ESTADOS.map((e2) => <option key={e2.id} value={e2.id}>{e2.label}</option>)}
              </select>
            </label>
            <label>
              <span className="text-[11px] text-muted-foreground">ID de la cuenta</span>
              <input className={`${inputCls} mt-1`} maxLength={80} value={draft.accountId}
                onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
                placeholder="123-456-7890" />
            </label>
            <label>
              <span className="text-[11px] text-muted-foreground">Nombre en la plataforma</span>
              <input className={`${inputCls} mt-1`} maxLength={160} value={draft.accountName}
                onChange={(e) => setDraft({ ...draft, accountName: e.target.value })} />
            </label>
            <label>
              <span className="text-[11px] text-muted-foreground">Presupuesto mensual</span>
              <input type="number" min={0} className={`${inputCls} mt-1`} value={draft.monthlyBudget}
                onChange={(e) => setDraft({ ...draft, monthlyBudget: e.target.value })}
                placeholder="Ej: 350000" />
            </label>
            <label>
              <span className="text-[11px] text-muted-foreground">Moneda</span>
              <input className={`${inputCls} mt-1`} maxLength={8} value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
            </label>
            <label className="sm:col-span-2">
              <span className="text-[11px] text-muted-foreground">Notas</span>
              <textarea rows={2} value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Objetivo de la campaña, quién da los accesos, acuerdos…"
                className="mt-1 w-full rounded-lg border border-foreground/15 bg-card/60 px-2.5 py-2 text-sm resize-y" />
            </label>
            <div className="sm:col-span-2">
              <Button
                size="sm"
                onClick={() => guardar.mutate({ id: editando ?? undefined })}
                disabled={guardar.isPending || draft.clientName.trim().length === 0}
              >
                {guardar.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                {editando ? "Guardar cambios" : "Agregar cuenta"}
              </Button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        )}

        {!isLoading && cuentas.length === 0 && !creando && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Todavía no hay cuentas cargadas. Agrega la primera para llevar la pauta de tus clientes desde aquí.
          </p>
        )}

        {porCliente.map(([cliente, lista]) => (
          <div key={cliente} className="space-y-1.5">
            <p className="text-xs font-semibold text-foreground/80">{cliente}</p>
            {lista.map((c) => {
              const plat = PLATAFORMAS.find((p) => p.id === c.platform);
              const est = ESTADOS.find((e) => e.id === c.status);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 bg-card/50 px-2.5 py-2">
                  <span className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: plat?.color }} />
                  <span className="text-sm font-medium">{plat?.label}</span>
                  {c.accountId && <span className="text-[11px] text-muted-foreground font-mono">{c.accountId}</span>}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${est?.clase}`}>{est?.label}</span>
                  <span className="flex-1" />
                  {c.monthlyBudget ? (
                    <span className="text-xs tabular-nums">{fmtMoneda(c.monthlyBudget, c.currency)}/mes</span>
                  ) : null}
                  <button onClick={() => abrirEdicion(c)} className="text-muted-foreground hover:text-primary" aria-label="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { if (window.confirm(`¿Eliminar la cuenta de ${plat?.label} de ${cliente}?`)) borrar.mutate(c.id); }}
                    className="text-muted-foreground hover:text-red-400"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
