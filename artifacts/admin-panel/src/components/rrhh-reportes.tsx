import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, NotebookPen, Pencil, Send, ChevronLeft, ChevronRight,
  CalendarRange, MailWarning,
} from "lucide-react";

/**
 * Reportes diarios e informe semanal de RRHH.
 *
 * - Reporte diario: fecha precargada con hoy (hora de Chile) pero editable;
 *   al EMITIRLO se avisa a la dirección y llega copia por correo. Editar un
 *   reporte ya emitido no vuelve a avisar.
 * - Informe semanal: una ficha por semana (partiendo el lunes) con las tres
 *   secciones que redacta RRHH; las semanas anteriores quedan consultables.
 *   Guardar es un borrador silencioso; Enviar a dirección avisa a los CEO y
 *   manda copia por correo (se puede repetir en la misma semana si hay
 *   novedades).
 */

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

async function jfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(b?.error || `Error ${r.status}`);
  }
  return r.json() as Promise<T>;
}

/** Hoy según Chile, como YYYY-MM-DD (en-CA formatea exactamente así). */
const hoySantiago = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

const fmtFecha = (v: string) => {
  const d = new Date(`${v}T12:00:00`);
  return isNaN(d.getTime())
    ? v
    : d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtMomento = (v: string) => {
  const d = new Date(v);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const inputClass = "mt-1 w-full h-9 rounded-lg border border-foreground/15 bg-card/60 px-2.5 text-sm";
const textareaClass = "mt-1 w-full rounded-lg border border-foreground/15 bg-card/60 px-2.5 py-2 text-sm";

/* ========================== Reportes diarios ============================= */

interface Reporte {
  id: number;
  reportDate: string;
  content: string;
  emailStatus: string;
  emailDetail: string;
  createdAt: string;
  updatedAt: string;
  authorName: string | null;
  authorEmail: string | null;
}

export function ReportesDiarios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState(hoySantiago);
  const [contenido, setContenido] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editFecha, setEditFecha] = useState("");
  const [editContenido, setEditContenido] = useState("");
  const [expandidos, setExpandidos] = useState<Record<number, boolean>>({});

  const { data: reportes = [], isLoading } = useQuery<Reporte[]>({
    queryKey: ["hr-reportes"],
    queryFn: () => jfetch("/hr/reportes"),
  });

  const emitir = useMutation({
    mutationFn: () =>
      jfetch<Reporte>("/hr/reportes", {
        method: "POST",
        body: JSON.stringify({ reportDate: fecha, content: contenido }),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["hr-reportes"] });
      setContenido("");
      setFecha(hoySantiago());
      const descripcion =
        row.emailStatus === "enviado"
          ? "Se avisó a la dirección y se envió la copia por correo."
          : row.emailStatus === "sin_configurar"
            ? "Se avisó a la dirección. El correo no está configurado, así que no salió copia."
            : "Se avisó a la dirección, pero la copia por correo no pudo enviarse.";
      toast({ title: "Reporte emitido", description: descripcion });
    },
    onError: (e: Error) => toast({ title: "No se pudo emitir el reporte", description: e.message, variant: "destructive" }),
  });

  const editar = useMutation({
    mutationFn: (p: { id: number; reportDate: string; content: string }) =>
      jfetch<Reporte>(`/hr/reportes/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ reportDate: p.reportDate, content: p.content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-reportes"] });
      setEditId(null);
      toast({ title: "Reporte actualizado" });
    },
    onError: (e: Error) => toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4">
        <p className="text-sm font-semibold mb-1 flex items-center gap-2">
          <NotebookPen className="w-4 h-4 text-primary" /> Reportes diarios
        </p>
        <p className="text-[11px] text-muted-foreground mb-3">
          El reporte del día para la dirección: al emitirlo se le avisa por notificación y llega copia al correo de la agencia.
        </p>

        <div className="rounded-xl border border-foreground/10 bg-card/40 p-3 mb-4 space-y-2">
          <div className="grid sm:grid-cols-[10rem_1fr] gap-3 items-start">
            <label className="block">
              <span className="text-[11px] text-muted-foreground">Fecha del reporte</span>
              <input type="date" className={inputClass} value={fecha}
                onChange={e => setFecha(e.target.value)} data-testid="input-reporte-fecha" />
            </label>
            <label className="block">
              <span className="text-[11px] text-muted-foreground">¿Qué pasó hoy?</span>
              <textarea rows={4} className={textareaClass} value={contenido}
                onChange={e => setContenido(e.target.value)}
                placeholder="Novedades del equipo, ausencias, entrevistas, acuerdos, pendientes…"
                data-testid="input-reporte-contenido" />
            </label>
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={emitir.isPending || !contenido.trim() || !fecha}
              onClick={() => emitir.mutate()} data-testid="button-emitir-reporte">
              {emitir.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
              Emitir reporte
            </Button>
          </div>
        </div>

        {isLoading && <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>}

        {!isLoading && reportes.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Aún no hay reportes emitidos.</p>
        )}

        {reportes.length > 0 && (
          <ul className="space-y-2">
            {reportes.map(r => {
              const editando = editId === r.id;
              const largo = r.content.length > 320;
              const abierto = Boolean(expandidos[r.id]);
              const visible = largo && !abierto ? `${r.content.slice(0, 320)}…` : r.content;
              return (
                <li key={r.id} className="rounded-lg border border-foreground/10 bg-card/40 p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-semibold">{fmtFecha(r.reportDate)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      por {r.authorName || r.authorEmail || "—"} · emitido el {fmtMomento(r.createdAt)}
                    </span>
                    {r.emailStatus && r.emailStatus !== "enviado" && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400"
                        title={r.emailDetail || "La copia por correo no pudo enviarse"}
                      >
                        <MailWarning className="w-3 h-3" /> Correo no enviado
                      </span>
                    )}
                    <span className="flex-1" />
                    <Button size="sm" variant="ghost"
                      onClick={() => {
                        if (editando) { setEditId(null); return; }
                        setEditId(r.id);
                        setEditFecha(r.reportDate);
                        setEditContenido(r.content);
                      }}
                      data-testid={`button-editar-reporte-${r.id}`}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> {editando ? "Cerrar" : "Editar"}
                    </Button>
                  </div>

                  {!editando && (
                    <>
                      <p className="text-xs mt-2 whitespace-pre-wrap">{visible}</p>
                      {largo && (
                        <button type="button" className="text-[11px] text-primary hover:underline mt-1"
                          onClick={() => setExpandidos(x => ({ ...x, [r.id]: !abierto }))}>
                          {abierto ? "Ver menos" : "Ver todo"}
                        </button>
                      )}
                    </>
                  )}

                  {editando && (
                    <div className="mt-2 space-y-2">
                      <input type="date" className={`${inputClass} sm:w-40`} value={editFecha}
                        onChange={e => setEditFecha(e.target.value)} />
                      <textarea rows={5} className={textareaClass} value={editContenido}
                        onChange={e => setEditContenido(e.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={editar.isPending || !editContenido.trim() || !editFecha}
                          onClick={() => editar.mutate({ id: r.id, reportDate: editFecha, content: editContenido })}>
                          {editar.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                          Guardar cambios
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Editar no vuelve a avisar a la dirección.</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ========================== Informe semanal ============================== */

/** Lunes de la semana a la que pertenece la fecha (civil, sin zonas). */
function lunesDe(dstr: string): string {
  const d = new Date(`${dstr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function sumarDias(dstr: string, n: number): string {
  const d = new Date(`${dstr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function rangoSemana(lunes: string): string {
  const fmt = (x: string) =>
    new Date(`${x}T12:00:00Z`).toLocaleDateString("es-CL", { day: "2-digit", month: "short", timeZone: "UTC" });
  return `${fmt(lunes)} — ${fmt(sumarDias(lunes, 6))}`;
}

interface Informe {
  weekKey: string;
  resumen: string;
  destacadas: string;
  analisis: string;
  sentAt: string | null;
  emailStatus: string;
  emailDetail: string;
  updatedAt: string;
  updatedByName: string | null;
  updatedByEmail: string | null;
}

export function InformeSemanal() {
  const semanaActual = lunesDe(hoySantiago());
  const [semana, setSemana] = useState(semanaActual);

  const { data: semanas = [] } = useQuery<{ weekKey: string; updatedAt: string }[]>({
    queryKey: ["hr-informes"],
    queryFn: () => jfetch("/hr/informes"),
  });

  const { data: informe, isLoading } = useQuery<Informe | null>({
    queryKey: ["hr-informe", semana],
    queryFn: () => jfetch(`/hr/informes/${semana}`),
  });

  // El selector junta la semana en pantalla, la actual y las que ya tienen informe.
  const opciones = Array.from(new Set([semana, semanaActual, ...semanas.map(s => s.weekKey)]))
    .sort()
    .reverse();

  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <p className="text-sm font-semibold flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-primary" /> Informe semanal
          </p>
          <span className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => setSemana(s => sumarDias(s, -7))}
            data-testid="button-semana-anterior">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <select
            className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs"
            value={semana}
            onChange={e => setSemana(e.target.value)}
            data-testid="select-semana-informe"
          >
            {opciones.map(w => (
              <option key={w} value={w}>
                Semana del {fmtFecha(w)}{w === semanaActual ? " (actual)" : ""}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={semana >= semanaActual}
            onClick={() => setSemana(s => sumarDias(s, 7))} data-testid="button-semana-siguiente">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Semana del {rangoSemana(semana)} · una ficha por semana; las anteriores quedan guardadas.
        </p>

        {isLoading && <div className="py-8 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>}

        {!isLoading && <EditorInforme key={semana} semana={semana} inicial={informe ?? null} />}
      </CardContent>
    </Card>
  );
}

function EditorInforme({ semana, inicial }: { semana: string; inicial: Informe | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resumen, setResumen] = useState(inicial?.resumen ?? "");
  const [destacadas, setDestacadas] = useState(inicial?.destacadas ?? "");
  const [analisis, setAnalisis] = useState(inicial?.analisis ?? "");

  const guardar = useMutation({
    mutationFn: () =>
      jfetch<Informe>(`/hr/informes/${semana}`, {
        method: "PUT",
        body: JSON.stringify({ resumen, destacadas, analisis }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-informe", semana] });
      queryClient.invalidateQueries({ queryKey: ["hr-informes"] });
      toast({ title: "Informe guardado" });
    },
    onError: (e: Error) => toast({ title: "No se pudo guardar el informe", description: e.message, variant: "destructive" }),
  });

  const enviar = useMutation({
    mutationFn: () =>
      jfetch<Informe>(`/hr/informes/${semana}/enviar`, {
        method: "POST",
        body: JSON.stringify({ resumen, destacadas, analisis }),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["hr-informe", semana] });
      queryClient.invalidateQueries({ queryKey: ["hr-informes"] });
      const descripcion =
        row.emailStatus === "enviado"
          ? "Se avisó a la dirección y se envió la copia por correo."
          : row.emailStatus === "sin_configurar"
            ? "Se avisó a la dirección. El correo no está configurado, así que no salió copia."
            : "Se avisó a la dirección, pero la copia por correo no pudo enviarse.";
      toast({ title: "Informe enviado a dirección", description: descripcion });
    },
    onError: (e: Error) => toast({ title: "No se pudo enviar el informe", description: e.message, variant: "destructive" }),
  });

  const seccion = (label: string, hint: string, value: string, set: (v: string) => void, testid: string) => (
    <label className="block">
      <span className="text-xs font-medium">{label}</span>
      <span className="block text-[11px] text-muted-foreground">{hint}</span>
      <textarea rows={4} className={textareaClass} value={value}
        onChange={e => set(e.target.value)} data-testid={testid} />
    </label>
  );

  return (
    <div className="space-y-3">
      {seccion(
        "Resumen semanal",
        "Actividades de todas las áreas, tareas completadas o acciones realizadas.",
        resumen, setResumen, "input-informe-resumen",
      )}
      {seccion(
        "Actividades principales a destacar",
        "Lo más relevante de la semana, con nombre y apellido.",
        destacadas, setDestacadas, "input-informe-destacadas",
      )}
      {seccion(
        "Análisis",
        "Retroalimentación de lo realizado y recomendaciones.",
        analisis, setAnalisis, "input-informe-analisis",
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={guardar.isPending} onClick={() => guardar.mutate()}
          data-testid="button-guardar-informe">
          {guardar.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
          Guardar borrador
        </Button>
        <Button size="sm" disabled={enviar.isPending || (!resumen.trim() && !destacadas.trim() && !analisis.trim())}
          onClick={() => enviar.mutate()} data-testid="button-enviar-informe">
          {enviar.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
          Enviar a dirección
        </Button>
        {inicial?.emailStatus && inicial.emailStatus !== "enviado" && (
          <span
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400"
            title={inicial.emailDetail || "La copia por correo no pudo enviarse"}
          >
            <MailWarning className="w-3 h-3" /> Correo no enviado
          </span>
        )}
      </div>
      {inicial && (
        <p className="text-[11px] text-muted-foreground">
          {inicial.sentAt
            ? `Enviado a dirección el ${fmtMomento(inicial.sentAt)}. `
            : "Aún no se ha enviado a dirección. "}
          Última edición: {fmtMomento(inicial.updatedAt)} por {inicial.updatedByName || inicial.updatedByEmail || "—"}
        </p>
      )}
    </div>
  );
}
