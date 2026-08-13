import { useMemo, useState } from "react";
import { Adjuntos } from "@/components/adjuntos";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AsistenteRedaccion } from "@/components/asistente-redaccion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/App";
import { useToast } from "@/hooks/use-toast";
import { TICKET_AREAS, TICKET_AREA_LABELS, type TicketArea } from "@workspace/roles";
import {
  useTickets, useCreateTicket, useUpdateTicket, useCommentTicket, useTicketComments, useTicketToTask,
  TICKET_STATUSES, TICKET_PRIORITIES, STATUS_META, PRIORITY_META, fmtWhen,
  type Ticket, type TicketPriority, type TicketStatus,
} from "@/lib/tickets";
import { useHubOwner } from "@/lib/hub-owner";
import { Dictado, type ItemDictado } from "@/components/dictado";
import {
  Loader2, AlertTriangle, Plus, Inbox, MessageSquare, ListChecks, Send, X,
} from "lucide-react";

type Filter = "mios" | "asignados" | "area" | "todos";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "area", label: "De mi área" },
  { id: "asignados", label: "Asignados a mí" },
  { id: "mios", label: "Los que pedí" },
  { id: "todos", label: "Todos" },
];

/**
 * Experiencia completa de tickets: crear, ver stats, filtrar y resolver.
 *
 * Vive fuera de la página para poder montarse tanto en /tickets (con su
 * propio título de página) como dentro de una pestaña de otra pantalla
 * (Hub Ejecutivo), que ya trae su propio encabezado — de ahí `showHeader`.
 */
export function TicketsManager({ showHeader = true }: { showHeader?: boolean } = {}) {
  const me = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("area");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isLoading, error } = useTickets(includeClosed);
  const createTicket = useCreateTicket();
  const updateTicket = useUpdateTicket();
  const toTask = useTicketToTask();

  // Para enlazar el ticket a un proyecto o contrato real cuando el rol los ve.
  const { data: board } = useHubOwner();
  const projects = board?.data.projects ?? [];
  const contracts = board?.data.contracts ?? [];

  const tickets = data?.tickets ?? [];
  const myAreas = data?.myAreas ?? [];

  const visible = useMemo(() => {
    switch (filter) {
      case "mios": return tickets.filter(t => t.createdBy === me?.id);
      case "asignados": return tickets.filter(t => t.assignedTo === me?.id);
      case "area": return tickets.filter(t => myAreas.includes(t.area) || t.assignedTo === me?.id);
      default: return tickets;
    }
  }, [tickets, filter, me?.id, myAreas]);

  const counts = useMemo(() => ({
    abiertos: tickets.filter(t => t.status === "abierto").length,
    mios: tickets.filter(t => t.assignedTo === me?.id && t.status !== "cerrado" && t.status !== "resuelto").length,
    criticos: tickets.filter(t => t.priority === "crítica" && t.status !== "cerrado" && t.status !== "resuelto").length,
  }), [tickets, me?.id]);

  const [draft, setDraft] = useState({
    title: "", description: "",
    area: (myAreas[0] ?? "desarrollo") as TicketArea,
    priority: "media" as TicketPriority,
    dueDate: "", projectId: "", contractId: "", clientName: "",
  });

  const submit = () => {
    if (draft.title.trim().length < 3) { toast({ title: "Ponle un título al ticket", variant: "destructive" }); return; }
    createTicket.mutate(
      { ...draft, title: draft.title.trim(), description: draft.description.trim() },
      {
        onSuccess: () => {
          toast({ title: `Ticket enviado a ${TICKET_AREA_LABELS[draft.area]}` });
          setCreating(false);
          setDraft(d => ({ ...d, title: "", description: "", dueDate: "", projectId: "", contractId: "", clientName: "" }));
        },
        onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
      },
    );
  };

  const inputClass = "w-full h-9 rounded-lg border border-foreground/15 bg-card/60 px-2.5 text-sm";

  return (
    <div className="space-y-6">
      <header className={`flex flex-wrap items-end gap-3 ${showHeader ? "justify-between" : "justify-end"}`}>
        {showHeader && (
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Tickets</h1>
            <p className="text-muted-foreground text-xs sm:text-base">
              Lo que un área le pide a otra: solicitudes, incidencias y encargos, con su estado a la vista.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Dictado
            tipo="tickets"
            etiquetaDestino={(item) =>
              TICKET_AREA_LABELS[item.area as TicketArea] ?? item.area ?? ""
            }
            onCrear={async (items: ItemDictado[]) => {
              // En serie: cada ticket avisa a su area al crearse, y asi
              // quedan en la bandeja en el mismo orden en que se dictaron.
              for (const item of items) {
                await createTicket.mutateAsync({
                  title: item.title,
                  description: item.description ?? "",
                  area: item.area as TicketArea,
                  priority: item.priority,
                });
              }
              toast({ title: `${items.length} ticket(s) creados y derivados` });
            }}
          />
          <Button onClick={() => setCreating(v => !v)}>
            {creating ? <X className="w-4 h-4 mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
            {creating ? "Cancelar" : "Nuevo ticket"}
          </Button>
        </div>
      </header>

      {creating && (
        <Card className="bg-card/40 border-primary/20">
          <CardContent className="p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="sm:col-span-2">
                <span className="text-[11px] text-muted-foreground">¿Qué necesitas?</span>
                <input className={`${inputClass} mt-1`} value={draft.title} maxLength={200}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  placeholder="Ej: Cambiar el checkout del cliente ACME" />
              </label>
              <div className="sm:col-span-2 space-y-1">
                <label className="block">
                  <span className="text-[11px] text-muted-foreground">Detalle</span>
                  <textarea rows={3} className="mt-1 w-full rounded-lg border border-foreground/15 bg-card/60 px-2.5 py-2 text-sm"
                    value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                    placeholder="Cuéntalo como puedas: qué pasa, dónde y desde cuándo. La IA lo ordena." />
                </label>
                <AsistenteRedaccion
                  tipo="ticket"
                  valor={draft.description}
                  contexto={draft.title ? `Título del ticket: ${draft.title}` : undefined}
                  onAceptar={(texto) => setDraft(d => ({ ...d, description: texto }))}
                  etiqueta="Ordenar el ticket"
                />
              </div>
              <label>
                <span className="text-[11px] text-muted-foreground">Área que lo resuelve</span>
                <select className={`${inputClass} mt-1`} value={draft.area}
                  onChange={e => setDraft(d => ({ ...d, area: e.target.value as TicketArea }))}>
                  {TICKET_AREAS.map(a => <option key={a} value={a}>{TICKET_AREA_LABELS[a]}</option>)}
                </select>
              </label>
              <label>
                <span className="text-[11px] text-muted-foreground">Prioridad</span>
                <select className={`${inputClass} mt-1`} value={draft.priority}
                  onChange={e => setDraft(d => ({ ...d, priority: e.target.value as TicketPriority }))}>
                  {TICKET_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                </select>
              </label>
              <label>
                <span className="text-[11px] text-muted-foreground">Fecha comprometida</span>
                <input type="date" className={`${inputClass} mt-1`} value={draft.dueDate}
                  onChange={e => setDraft(d => ({ ...d, dueDate: e.target.value }))} />
              </label>
              <label>
                <span className="text-[11px] text-muted-foreground">Cliente</span>
                <input className={`${inputClass} mt-1`} value={draft.clientName}
                  onChange={e => setDraft(d => ({ ...d, clientName: e.target.value }))} placeholder="Opcional" />
              </label>
              {projects.length > 0 && (
                <label>
                  <span className="text-[11px] text-muted-foreground">Proyecto del tablero</span>
                  <select className={`${inputClass} mt-1`} value={draft.projectId}
                    onChange={e => setDraft(d => ({ ...d, projectId: e.target.value }))}>
                    <option value="">— sin proyecto —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}
              {contracts.length > 0 && (
                <label>
                  <span className="text-[11px] text-muted-foreground">Contrato</span>
                  <select className={`${inputClass} mt-1`} value={draft.contractId}
                    onChange={e => setDraft(d => ({ ...d, contractId: e.target.value }))}>
                    <option value="">— sin contrato —</option>
                    {contracts.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </label>
              )}
            </div>
            <Button onClick={submit} disabled={createTicket.isPending}>
              {createTicket.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
              Enviar ticket
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
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Sin tomar", value: counts.abiertos, tone: "text-sky-400" },
              { label: "En mis manos", value: counts.mios, tone: "text-orange-400" },
              { label: "Críticos abiertos", value: counts.criticos, tone: counts.criticos > 0 ? "text-red-400" : "text-muted-foreground" },
            ].map(k => (
              <Card key={k.label} className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{k.label}</p>
                  <p className={`text-xl sm:text-2xl font-bold ${k.tone}`}>{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-base ${
                  filter === f.id ? "bg-primary/15 text-primary border-primary/30"
                    : "border-foreground/10 text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}>{f.label}</button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={includeClosed} onChange={e => setIncludeClosed(e.target.checked)} />
              Ver cerrados
            </label>
          </div>

          {visible.length === 0 ? (
            <Card className="bg-card/40 border-foreground/10">
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No hay tickets aquí. Cuando alguien pida algo a tu área, aparecerá en esta bandeja.
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {visible.map(t => (
                <TicketRow
                  key={t.id}
                  ticket={t}
                  meId={me?.id ?? 0}
                  canConvert={!!data?.canConvertToTask}
                  open={openId === t.id}
                  onToggle={() => setOpenId(openId === t.id ? null : t.id)}
                  onPatch={(patch) => updateTicket.mutate({ id: t.id, ...patch }, {
                    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
                  })}
                  onToTask={() => toTask.mutate(t.id, {
                    onSuccess: () => toast({ title: "Ticket convertido en tarea del tablero" }),
                    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
                  })}
                  projectName={projects.find(p => p.id === t.projectId)?.name}
                />
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            Un ticket que entra al tablero se convierte en tarea del Scrumban y sigue enlazado: al avanzar la tarea,
            quien lo pidió ve el progreso sin tener que preguntar.
          </p>
        </>
      )}
    </div>
  );
}

function TicketRow({ ticket, meId, canConvert, open, onToggle, onPatch, onToTask, projectName }: {
  ticket: Ticket;
  meId: number;
  canConvert: boolean;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<Ticket>) => void;
  onToTask: () => void;
  projectName?: string;
}) {
  const st = STATUS_META[ticket.status] ?? STATUS_META.abierto;
  const pr = PRIORITY_META[ticket.priority] ?? PRIORITY_META.media;
  const { data: comments = [], isLoading: loadingComments } = useTicketComments(open ? ticket.id : null);
  const comment = useCommentTicket();
  const [body, setBody] = useState("");

  return (
    <li className="rounded-xl border border-foreground/10 bg-card/40">
      <button onClick={onToggle} className="w-full text-left p-3 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-mono text-muted-foreground">#{ticket.id}</span>
        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm font-medium truncate">{ticket.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {TICKET_AREA_LABELS[ticket.area]} · pidió {ticket.creator?.name || ticket.creator?.email || "alguien"} {fmtWhen(ticket.createdAt)}
            {ticket.assignee && <> · lo lleva {ticket.assignee.name || ticket.assignee.email}</>}
            {ticket.clientName && <> · {ticket.clientName}</>}
            {projectName && <> · {projectName}</>}
          </p>
        </div>
        <Badge className={pr.className}>{pr.label}</Badge>
        <Badge className={st.className}>{st.label}</Badge>
        {ticket.taskId && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 inline-flex items-center gap-1">
            <ListChecks className="w-3 h-3" /> en el tablero
          </span>
        )}
        {ticket.commentCount > 0 && (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />{ticket.commentCount}
          </span>
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-foreground/10 pt-3">
          {ticket.description && <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>}

          {/* La captura del error, el mockup, el logo que manda el cliente:
              antes no había dónde ponerlos y acababan en WhatsApp. */}
          <Adjuntos tipo="ticket" id={String(ticket.id)} titulo="Archivos de la solicitud" />

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={ticket.status}
              onChange={e => onPatch({ status: e.target.value as TicketStatus })}
              className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs"
            >
              {TICKET_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
            {ticket.assignedTo !== meId && (
              <Button size="sm" variant="outline" onClick={() => onPatch({ assignedTo: meId })}>Tomarlo</Button>
            )}
            {canConvert && !ticket.taskId && (
              <Button size="sm" variant="outline" onClick={onToTask}>
                <ListChecks className="w-3.5 h-3.5 mr-1" /> Convertir en tarea
              </Button>
            )}
            {ticket.dueDate && <span className="text-[11px] text-muted-foreground">Comprometido para {ticket.dueDate}</span>}
          </div>

          <div className="space-y-2">
            {loadingComments && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            {comments.map(c => (
              <div key={c.id} className="text-xs rounded-lg border border-foreground/10 bg-card/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground mb-0.5">
                  {c.authorName || c.authorEmail} · {fmtWhen(c.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{c.body}</p>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                value={body}
                onChange={e => setBody(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && body.trim()) {
                    comment.mutate({ id: ticket.id, body: body.trim() }, { onSuccess: () => setBody("") });
                  }
                }}
                placeholder="Responder…"
                className="flex-1 h-8 rounded-lg border border-foreground/15 bg-card/60 px-2.5 text-xs"
              />
              <Button size="sm" variant="ghost" disabled={!body.trim() || comment.isPending}
                onClick={() => comment.mutate({ id: ticket.id, body: body.trim() }, { onSuccess: () => setBody("") })}>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
