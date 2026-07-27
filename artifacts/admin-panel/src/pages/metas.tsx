import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AsistenteRedaccion } from "@/components/asistente-redaccion";
import { RepartoIA } from "@/components/reparto-ia";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/App";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import {
  useGoals, useCreateGoal, useUpdateGoal, useDeleteGoal, goalPercent,
  PERIODS, PERIOD_LABELS, PERIOD_STYLE, type Goal, type Period,
} from "@/lib/metas";
import { RoleBadge } from "@/components/role-controls";
import { Loader2, AlertTriangle, Target, Plus, X, Check, Trash2, Minus } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

interface Miembro { id: number; name: string | null; email: string; teamRole: string }

/**
 * Metas por período.
 *
 * Son compromisos de gestión, no tareas de proyecto: se miden por ventana
 * (hoy / esta semana / este mes) y las pone dirección, ventas o RRHH. Cada
 * persona ve las suyas y las va marcando.
 */
export default function MetasPage() {
  const me = useAuth();
  const { toast } = useToast();
  const [vista, setVista] = useState<"mias" | "team">("mias");
  const [creando, setCreando] = useState(false);

  const { data, isLoading, error } = useGoals(vista);
  const crear = useCreateGoal();
  const actualizar = useUpdateGoal();
  const borrar = useDeleteGoal();

  const puedeAsignar = !!data?.canAssign;

  const { data: miembros = [] } = useQuery<Miembro[]>({
    queryKey: ["team-members"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/team/members`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: puedeAsignar,
  });

  const [draft, setDraft] = useState<{ title: string; description: string; period: Period; assignedTo: number; target: string }>({
    title: "", description: "", period: "semanal", assignedTo: 0, target: "",
  });

  const metas = data?.goals ?? [];
  const porPeriodo = useMemo(() => {
    return PERIODS.map(p => ({
      period: p,
      lista: metas.filter(g => g.period === p),
    }));
  }, [metas]);

  const resumen = useMemo(() => {
    const total = metas.length;
    const cumplidas = metas.filter(g => g.status === "cumplida").length;
    return { total, cumplidas, pct: total > 0 ? Math.round((cumplidas / total) * 100) : 0 };
  }, [metas]);

  const enviar = () => {
    if (draft.title.trim().length < 3) { toast({ title: "Ponle un título a la meta", variant: "destructive" }); return; }
    const destino = draft.assignedTo || me?.id || 0;
    if (!destino) { toast({ title: "Elige a quién se la asignas", variant: "destructive" }); return; }
    crear.mutate(
      {
        title: draft.title.trim(),
        description: draft.description.trim(),
        period: draft.period,
        assignedTo: destino,
        target: draft.target ? Number(draft.target) : null,
      },
      {
        onSuccess: () => {
          toast({ title: "Meta asignada" });
          setCreando(false);
          setDraft(d => ({ ...d, title: "", description: "", target: "" }));
        },
        onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
      },
    );
  };

  const inputClass = "w-full h-9 rounded-lg border border-foreground/15 bg-card/60 px-2.5 text-sm";

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Metas</h1>
            <p className="text-muted-foreground text-xs sm:text-base">
              Compromisos por período: hoy, esta semana y este mes.
            </p>
          </div>
          {puedeAsignar && (
            <Button onClick={() => setCreando(v => !v)}>
              {creando ? <X className="w-4 h-4 mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
              {creando ? "Cancelar" : "Nueva meta"}
            </Button>
          )}
        </header>

        {puedeAsignar && (
          <div className="flex gap-2">
            {[
              { id: "mias" as const, label: "Mis metas" },
              { id: "team" as const, label: "Las del equipo" },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setVista(v.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-base ${
                  vista === v.id
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "border-foreground/10 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}
              >{v.label}</button>
            ))}
          </div>
        )}

        {puedeAsignar && vista === "team" && (
          <RepartoIA
            personas={miembros.map(m => ({ id: m.id, nombre: m.name || m.email, rol: m.teamRole }))}
            contexto={`Se van a crear metas del período "${PERIOD_LABELS[draft.period]}" en el panel de WebMakerLatam.`}
            etiquetaAplicar="Crear las metas"
            onAplicar={async (tareas) => {
              // Secuencial a propósito: si una falla, las anteriores ya
              // quedaron creadas y se ve cuál se cayó, en vez de perderlas
              // todas o duplicarlas al reintentar.
              for (const t of tareas) {
                await crear.mutateAsync({
                  title: t.titulo.slice(0, 200),
                  description: t.detalle,
                  period: draft.period,
                  assignedTo: t.personaId,
                  target: null,
                });
              }
              toast({ title: `${tareas.length} meta${tareas.length !== 1 ? "s" : ""} creada${tareas.length !== 1 ? "s" : ""}` });
            }}
          />
        )}

        {creando && puedeAsignar && (
          <Card className="bg-card/40 border-primary/20">
            <CardContent className="p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">¿Qué hay que lograr?</span>
                    <input className={`${inputClass} mt-1`} maxLength={200} value={draft.title}
                      onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                      placeholder="Escríbelo como te salga: la IA lo deja presentable" />
                  </label>
                  <AsistenteRedaccion
                    tipo="meta"
                    valor={draft.title}
                    contexto={`Meta ${PERIOD_LABELS[draft.period].toLowerCase()} para ${
                      miembros.find(m => m.id === (draft.assignedTo || me?.id))?.name || "el equipo"
                    }.`}
                    onAceptar={(texto) => setDraft(d => ({ ...d, title: texto.split("\n")[0]!.slice(0, 200) }))}
                    etiqueta="Mejorar la meta"
                  />
                </div>
                <label className="sm:col-span-2">
                  <span className="text-[11px] text-muted-foreground">Detalle (opcional)</span>
                  <textarea rows={2} className="mt-1 w-full rounded-lg border border-foreground/15 bg-card/60 px-2.5 py-2 text-sm"
                    value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
                </label>
                <label>
                  <span className="text-[11px] text-muted-foreground">Período</span>
                  <select className={`${inputClass} mt-1`} value={draft.period}
                    onChange={e => setDraft(d => ({ ...d, period: e.target.value as Period }))}>
                    {PERIODS.map(p => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
                  </select>
                </label>
                <label>
                  <span className="text-[11px] text-muted-foreground">Para quién</span>
                  <select className={`${inputClass} mt-1`} value={draft.assignedTo || me?.id || 0}
                    onChange={e => setDraft(d => ({ ...d, assignedTo: Number(e.target.value) }))}>
                    {miembros.map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
                  </select>
                </label>
                <label>
                  <span className="text-[11px] text-muted-foreground">Cantidad a alcanzar (opcional)</span>
                  <input type="number" min={1} className={`${inputClass} mt-1`} value={draft.target}
                    onChange={e => setDraft(d => ({ ...d, target: e.target.value }))}
                    placeholder="Ej: 8 publicaciones" />
                </label>
              </div>
              <Button onClick={enviar} disabled={crear.isPending}>
                {crear.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Target className="w-4 h-4 mr-1.5" />}
                Asignar meta
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading && <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{(error as Error).message}</span>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {metas.length > 0 && (
              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-sm font-semibold">Avance del período</p>
                    <span className="text-xs text-muted-foreground">{resumen.cumplidas} de {resumen.total} cumplidas</span>
                  </div>
                  <div className="h-2 rounded-full bg-foreground/5 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-orange-500" style={{ width: `${resumen.pct}%` }} />
                  </div>
                </CardContent>
              </Card>
            )}

            {porPeriodo.map(({ period, lista }) => (
              <Card key={period} className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className={PERIOD_STYLE[period]}>{PERIOD_LABELS[period]}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {lista.length} meta{lista.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {lista.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Sin metas para este período.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {lista.map(g => (
                        <MetaFila
                          key={g.id}
                          meta={g}
                          mostrarPersona={vista === "team"}
                          puedeBorrar={puedeAsignar}
                          onPatch={(patch) => actualizar.mutate({ id: g.id, ...patch }, {
                            onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
                          })}
                          onBorrar={() => borrar.mutate(g.id, {
                            onSuccess: () => toast({ title: "Meta eliminada" }),
                            onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
                          })}
                        />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}

            <p className="text-xs text-muted-foreground">
              Las metas se archivan solas al terminar su período: aquí siempre ves las vigentes.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}

function MetaFila({ meta, mostrarPersona, puedeBorrar, onPatch, onBorrar }: {
  meta: Goal;
  mostrarPersona: boolean;
  puedeBorrar: boolean;
  onPatch: (patch: Partial<Goal>) => void;
  onBorrar: () => void;
}) {
  const pct = goalPercent(meta);
  const cumplida = meta.status === "cumplida";

  return (
    <li className={`rounded-xl border p-3 transition-base ${
      cumplida ? "border-emerald-500/25 bg-emerald-500/5" : "border-foreground/10 bg-card/40"
    }`}>
      <div className="flex flex-wrap items-start gap-3">
        <button
          onClick={() => onPatch({ status: cumplida ? "pendiente" : "cumplida" })}
          className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-base ${
            cumplida ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "border-foreground/25 hover:border-primary"
          }`}
          title={cumplida ? "Marcar como pendiente" : "Marcar como cumplida"}
        >
          {cumplida && <Check className="w-3 h-3" />}
        </button>

        <div className="flex-1 min-w-[12rem]">
          <p className={`text-sm font-medium ${cumplida ? "line-through text-muted-foreground" : ""}`}>{meta.title}</p>
          {meta.description && <p className="text-[11px] text-muted-foreground mt-0.5">{meta.description}</p>}
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            {mostrarPersona && meta.assignee && <>Para {meta.assignee.name || meta.assignee.email} · </>}
            Puso {meta.creator?.name || meta.creator?.email || "alguien"}
          </p>
        </div>

        {/* Meta con número: se avanza de a uno, sin abrir nada. */}
        {meta.target && meta.target > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPatch({ progress: Math.max(0, meta.progress - 1) })}
              className="w-6 h-6 rounded border border-foreground/15 hover:bg-foreground/5 flex items-center justify-center"
              title="Restar uno"
            ><Minus className="w-3 h-3" /></button>
            <span className="text-xs tabular-nums w-12 text-center">{meta.progress}/{meta.target}</span>
            <button
              onClick={() => {
                const next = meta.progress + 1;
                onPatch(next >= (meta.target ?? 0) ? { progress: next, status: "cumplida" } : { progress: next });
              }}
              className="w-6 h-6 rounded border border-foreground/15 hover:bg-foreground/5 flex items-center justify-center"
              title="Sumar uno"
            ><Plus className="w-3 h-3" /></button>
          </div>
        )}

        {mostrarPersona && meta.assignee && <RoleBadge role="" className="hidden" />}

        {puedeBorrar && (
          <button
            onClick={onBorrar}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 transition-base"
            title="Eliminar meta"
          ><Trash2 className="w-3.5 h-3.5" /></button>
        )}
      </div>

      {meta.target && meta.target > 0 && (
        <div className="h-1.5 rounded-full bg-foreground/5 overflow-hidden mt-2">
          <div className={`h-full ${cumplida ? "bg-emerald-400" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </li>
  );
}
