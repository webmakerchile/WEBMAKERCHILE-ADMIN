import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ROLES, normalizeRole, type TeamRole } from "@workspace/roles";
import {
  Loader2, Users2, AlertTriangle, UserPlus, Check, X, Pencil,
  CalendarDays, Phone, FileText, ExternalLink, Power, TrendingUp,
} from "lucide-react";
import { Link } from "wouter";
import { TicketsInline } from "@/components/tickets-inline";
import { MetasInline } from "@/components/metas-inline";
import { useAsistencia } from "@/lib/asistencia";
import { PaseDeLista } from "@/components/pase-de-lista";
import { EvaluationsManager, LeaveManager, OnboardingManager, PersonDocuments } from "@/components/rrhh-ops";
import { DesempenoSemanal } from "@/components/desempeno-semanal";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

const CONTRACT_TYPES = [
  { id: "indefinido", label: "Indefinido" },
  { id: "plazo_fijo", label: "Plazo fijo" },
  { id: "honorarios", label: "Honorarios" },
  { id: "practica", label: "Práctica" },
] as const;

const EMPLOYMENT_STATUS = [
  { id: "activo", label: "Activo", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { id: "licencia", label: "Licencia", className: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { id: "desvinculado", label: "Desvinculado", className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
] as const;

type ContractType = (typeof CONTRACT_TYPES)[number]["id"];
type EmploymentStatus = (typeof EMPLOYMENT_STATUS)[number]["id"];

interface Profile {
  position: string;
  area: string;
  contractType: ContractType;
  employmentStatus: EmploymentStatus;
  startDate: string;
  endDate: string;
  monthlySalary: number | null;
  phone: string;
  emergencyContact: string;
  emergencyPhone: string;
  documentsUrl: string;
  notes: string;
  vacationDaysPerYear: number;
  commissionPct: number;
  hourlyCost: number | null;
}

interface Person {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  teamRole: TeamRole;
  approvalStatus: "approved" | "pending" | "rejected";
  createdAt: string;
  lastLoginAt: string;
  isOwner: boolean;
  profile: (Profile & { id: number; userId: number }) | null;
}

const emptyProfile = (): Profile => ({
  position: "", area: "", contractType: "indefinido", employmentStatus: "activo",
  startDate: "", endDate: "", monthlySalary: null, phone: "",
  emergencyContact: "", emergencyPhone: "", documentsUrl: "", notes: "",
  vacationDaysPerYear: 15, commissionPct: 0, hourlyCost: null,
});

const fmtCLP = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
};

/** Antigüedad legible desde la fecha de ingreso. */
function seniority(startDate: string): string {
  if (!startDate) return "—";
  const d = new Date(`${startDate}T12:00:00`);
  if (isNaN(d.getTime())) return "—";
  const months = Math.max(0, Math.floor((Date.now() - d.getTime()) / (30.44 * 86_400_000)));
  if (months < 1) return "recién ingresó";
  if (months < 12) return `${months} mes${months === 1 ? "" : "es"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} año${years === 1 ? "" : "s"}${rest ? ` ${rest} m` : ""}`;
}

/** Aniversario de ingreso dentro de los próximos 45 días. */
function upcomingAnniversary(startDate: string): number | null {
  if (!startDate) return null;
  const d = new Date(`${startDate}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate(), 12);
  if (next.getTime() < now.getTime()) next.setFullYear(next.getFullYear() + 1);
  const days = Math.ceil((next.getTime() - now.getTime()) / 86_400_000);
  return days <= 45 ? days : null;
}

export default function RrhhPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Profile>(emptyProfile);

  const { data: people = [], isLoading, error } = useQuery<Person[]>({
    queryKey: ["hr-people"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/hr/people`, { credentials: "include" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}) as { error?: string });
        throw new Error((e as { error?: string }).error || "No se pudo cargar el equipo");
      }
      return r.json();
    },
  });

  // Pausar/reanudar la jornada de otra persona. El servidor solo lo permite a
  // dirección, ventas y RRHH — esta pantalla es de RRHH, así que el control
  // corresponde. Estaba solo en el panel ejecutivo, o sea que RRHH veía el
  // pase de lista sin poder actuar sobre él.
  const pausaMut = useMutation({
    mutationFn: async (p: { userId: number; pausar: boolean; motivo?: string }) => {
      const r = await fetch(`${API_BASE}/jornada/${p.pausar ? "pausa" : "reanudar"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: p.userId, motivo: p.motivo ?? "" }),
      });
      if (!r.ok) {
        const b = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo cambiar la pausa");
      }
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jornada-overview"] }),
    onError: (e) => toast({ title: "No se pudo cambiar la pausa", description: (e as Error).message, variant: "destructive" }),
  });

  // Cerrar la jornada de otra persona. Pausar no era suficiente: una jornada
  // que quedó encendida y solo se pausa deja a la persona figurando como que
  // sigue en su turno, y las horas del día nunca se cierran.
  const cerrarMut = useMutation({
    mutationFn: async (p: { userId: number }) => {
      const r = await fetch(`${API_BASE}/jornada/check-out`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: p.userId }),
      });
      if (!r.ok) {
        const b = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo cerrar la jornada");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jornada-overview"] });
      toast({ title: "Jornada cerrada", description: "El reloj dejó de contar." });
    },
    onError: (e) => toast({ title: "No se pudo cerrar la jornada", description: (e as Error).message, variant: "destructive" }),
  });

  const saveProfile = useMutation({
    mutationFn: async ({ userId, profile }: { userId: number; profile: Profile }) => {
      const r = await fetch(`${API_BASE}/hr/people/${userId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error((e as { error?: string })?.error || "Error al guardar");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-people"] });
      setEditing(null);
      toast({ title: "Ficha guardada" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const setApproval = useMutation({
    mutationFn: async ({ userId, status }: { userId: number; status: "approved" | "rejected" }) => {
      const r = await fetch(`${API_BASE}/hr/people/${userId}/approval`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error((e as { error?: string })?.error || "Error al actualizar el acceso");
      }
      return r.json();
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["hr-people"] });
      toast({ title: v.status === "approved" ? "Acceso aprobado" : "Acceso rechazado" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const { data: attendance } = useAsistencia();
  const attendanceById = useMemo(
    () => new Map((attendance?.members ?? []).map(a => [a.id, a])),
    [attendance],
  );

  const pendientes = useMemo(() => people.filter(p => p.approvalStatus === "pending"), [people]);
  const equipo = useMemo(() => people.filter(p => p.approvalStatus === "approved"), [people]);

  const stats = useMemo(() => {
    const activos = equipo.filter(p => (p.profile?.employmentStatus ?? "activo") === "activo");
    const conFicha = equipo.filter(p => p.profile !== null);
    const nomina = equipo.reduce((a, p) => a + (p.profile?.monthlySalary ?? 0), 0);
    const aniversarios = equipo
      .map(p => ({ p, days: upcomingAnniversary(p.profile?.startDate ?? "") }))
      .filter((x): x is { p: Person; days: number } => x.days !== null)
      .sort((a, b) => a.days - b.days);
    return { activos: activos.length, sinFicha: equipo.length - conFicha.length, nomina, aniversarios };
  }, [equipo]);

  const startEdit = (p: Person) => {
    setEditing(p.id);
    setDraft(p.profile ? { ...emptyProfile(), ...p.profile } : emptyProfile());
  };

  const field = (label: string, node: React.ReactNode) => (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {node}
    </label>
  );

  const inputClass = "mt-1 w-full h-9 rounded-lg border border-foreground/15 bg-card/60 px-2.5 text-sm";

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Recursos Humanos</h1>
          <p className="text-muted-foreground text-xs sm:text-base">
            Fichas laborales, contratos, ingresos y solicitudes de acceso al panel.
          </p>
        </header>

        <MetasInline />

        <TicketsInline title="Solicitudes a Recursos Humanos" />

        {isLoading && <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{(error as Error).message}</span>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Personas activas", value: String(stats.activos), hint: `${equipo.length} con acceso aprobado`, tone: "text-emerald-400" },
                { label: "Nómina mensual", value: stats.nomina > 0 ? fmtCLP(stats.nomina) : "—", hint: "Suma de rentas brutas registradas", tone: "text-primary" },
                { label: "Fichas incompletas", value: String(stats.sinFicha), hint: "Personas sin datos laborales", tone: stats.sinFicha > 0 ? "text-amber-400" : "text-muted-foreground" },
                { label: "Solicitudes", value: String(pendientes.length), hint: "Esperando aprobación de acceso", tone: pendientes.length > 0 ? "text-amber-400" : "text-muted-foreground" },
              ].map(k => (
                <Card key={k.label} className="bg-card/40 border-foreground/10">
                  <CardContent className="p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{k.label}</p>
                    <p className={`text-xl sm:text-2xl font-bold ${k.tone}`}>{k.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{k.hint}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {pendientes.length > 0 && (
              <Card className="bg-card/40 border-amber-500/20">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-amber-400" /> Solicitudes de acceso
                  </p>
                  <ul className="space-y-2">
                    {pendientes.map(p => (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-foreground/10 bg-card/40 p-2.5">
                        <div className="flex-1 min-w-[12rem]">
                          <p className="text-sm font-medium truncate">{p.name || p.email}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{p.email} · solicitó el {fmtDate(p.createdAt)}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={setApproval.isPending}
                            onClick={() => setApproval.mutate({ userId: p.id, status: "approved" })}>
                            <Check className="w-3.5 h-3.5 mr-1" /> Aprobar
                          </Button>
                          <Button size="sm" variant="ghost" disabled={setApproval.isPending}
                            onClick={() => setApproval.mutate({ userId: p.id, status: "rejected" })}>
                            <X className="w-3.5 h-3.5 mr-1" /> Rechazar
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {stats.aniversarios.length > 0 && (
              <Card className="bg-card/40 border-foreground/10">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" /> Aniversarios próximos
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {stats.aniversarios.map(({ p, days }) => (
                      <li key={p.id} className="text-xs px-2.5 py-1 rounded-lg border border-foreground/10 bg-card/40">
                        <span className="font-medium">{p.name || p.email}</span>
                        <span className="text-muted-foreground"> · {days === 0 ? "hoy" : `en ${days}d`} cumple {seniority(p.profile?.startDate ?? "")}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="bg-card/40 border-foreground/10">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold">Pase de lista de hoy</p>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">
                  Las horas salen de la jornada: Discord verifica la presencia en el canal de voz.
                </p>
                <PaseDeLista
                  miembros={attendance?.members ?? []}
                  accion={(m) => {
                    // Solo tiene sentido sobre una jornada abierta: pausar a
                    // quien no ha marcado o ya terminó no significa nada.
                    if (!m.today?.open && !m.today?.pausa) return null;
                    const enPausa = Boolean(m.today?.pausa);
                    const cerrando = cerrarMut.isPending && cerrarMut.variables?.userId === m.id;
                    return (
                      <span className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pausaMut.isPending || cerrando}
                          onClick={() => pausaMut.mutate({ userId: m.id, pausar: !enPausa })}
                          className={enPausa ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}
                        >
                          {pausaMut.isPending && pausaMut.variables?.userId === m.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : enPausa ? "Reanudar" : "Pausar"}
                        </Button>
                        {/* Apagar el reloj de verdad. Una pausa no es una
                            salida: la persona sigue figurando en su turno. */}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pausaMut.isPending || cerrando}
                          onClick={() => {
                            const quien = m.name || m.email;
                            if (!window.confirm(`¿Cerrar la jornada de ${quien}? Dejará de contar horas desde ahora.`)) return;
                            cerrarMut.mutate({ userId: m.id });
                          }}
                          className="border-red-500/40 text-red-400"
                          title="Terminar la jornada"
                        >
                          {cerrando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                        </Button>
                      </span>
                    );
                  }}
                />
              </CardContent>
            </Card>

            <div className="space-y-1.5">
              <DesempenoSemanal />
              <div className="flex justify-end">
                <Link
                  href="/proyecciones"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                  data-testid="link-proyecciones"
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Ver proyecciones de horas y cumplimiento
                </Link>
              </div>
            </div>

            <LeaveManager />

            <div className="grid lg:grid-cols-2 gap-4 items-start">
              <OnboardingManager people={equipo} />
              <EvaluationsManager people={equipo} />
            </div>

            <Card className="bg-card/40 border-foreground/10">
              <CardContent className="p-2 sm:p-4">
                <p className="text-sm font-semibold mb-3 px-2 sm:px-0">Equipo ({equipo.length})</p>
                {equipo.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">
                    <Users2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Aún no hay personas con acceso aprobado.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {equipo.map(p => {
                      const role = normalizeRole(p.teamRole, p.isOwner);
                      const prof = p.profile;
                      const st = EMPLOYMENT_STATUS.find(s => s.id === (prof?.employmentStatus ?? "activo"))!;
                      const isEditing = editing === p.id;
                      return (
                        <li key={p.id} className="rounded-xl border border-foreground/10 bg-card/40 p-3">
                          <div className="flex flex-wrap items-center gap-3">
                            {p.picture ? (
                              <img src={p.picture} alt={p.name || ""} className="w-9 h-9 rounded-full border border-foreground/15" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">
                                {(p.name || p.email)[0].toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1 min-w-[12rem]">
                              <p className="text-sm font-medium truncate">{p.name || p.email}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {prof?.position || ROLES[role].label}{prof?.area ? ` · ${prof.area}` : ""} · {p.email}
                              </p>
                            </div>
                            <Badge className={st.className}>{st.label}</Badge>
                            <Button size="sm" variant="ghost" onClick={() => (isEditing ? setEditing(null) : startEdit(p))}>
                              <Pencil className="w-3.5 h-3.5 mr-1" /> {isEditing ? "Cerrar" : prof ? "Editar ficha" : "Crear ficha"}
                            </Button>
                          </div>

                          {!isEditing && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                              <span>Ingreso: {prof?.startDate ? `${fmtDate(prof.startDate)} (${seniority(prof.startDate)})` : "sin registrar"}</span>
                              <span>Contrato: {CONTRACT_TYPES.find(c => c.id === prof?.contractType)?.label ?? "—"}</span>
                              <span>Renta: {prof?.monthlySalary ? fmtCLP(prof.monthlySalary) : "—"}</span>
                              {prof?.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{prof.phone}</span>}
                              <span>Último acceso: {fmtDate(p.lastLoginAt)}</span>
                              {(() => {
                                const a = attendanceById.get(p.id);
                                if (!a) return null;
                                return a.discord?.linked
                                  ? <span className="text-emerald-400">Discord: {a.discord.tag || "vinculado"}</span>
                                  : <span className="text-amber-400">Discord sin vincular — su jornada no se verifica</span>;
                              })()}
                              {prof?.documentsUrl && (
                                <a href={prof.documentsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                  <FileText className="w-3 h-3" /> Documentos <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          )}

                          {isEditing && (
                            <div className="mt-3 pt-3 border-t border-foreground/10 space-y-3">
                              <div className="grid sm:grid-cols-2 gap-3">
                                {field("Cargo", <input className={inputClass} value={draft.position} onChange={e => setDraft(d => ({ ...d, position: e.target.value }))} placeholder="Ej: Editora de video senior" />)}
                                {field("Área", <input className={inputClass} value={draft.area} onChange={e => setDraft(d => ({ ...d, area: e.target.value }))} placeholder="Ej: Contenido" />)}
                                {field("Tipo de contrato", (
                                  <select className={inputClass} value={draft.contractType} onChange={e => setDraft(d => ({ ...d, contractType: e.target.value as ContractType }))}>
                                    {CONTRACT_TYPES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                  </select>
                                ))}
                                {field("Situación", (
                                  <select className={inputClass} value={draft.employmentStatus} onChange={e => setDraft(d => ({ ...d, employmentStatus: e.target.value as EmploymentStatus }))}>
                                    {EMPLOYMENT_STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                  </select>
                                ))}
                                {field("Fecha de ingreso", <input type="date" className={inputClass} value={draft.startDate} onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))} />)}
                                {field("Fecha de término", <input type="date" className={inputClass} value={draft.endDate} onChange={e => setDraft(d => ({ ...d, endDate: e.target.value }))} />)}
                                {field("Renta bruta mensual (CLP)", (
                                  <input type="number" min={0} className={inputClass}
                                    value={draft.monthlySalary ?? ""}
                                    onChange={e => setDraft(d => ({ ...d, monthlySalary: e.target.value === "" ? null : Number(e.target.value) }))}
                                    placeholder="Sin registrar" />
                                ))}
                                {field("Teléfono", <input className={inputClass} value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} placeholder="+56 9 ..." />)}
                                {field("Contacto de emergencia", <input className={inputClass} value={draft.emergencyContact} onChange={e => setDraft(d => ({ ...d, emergencyContact: e.target.value }))} />)}
                                {field("Teléfono de emergencia", <input className={inputClass} value={draft.emergencyPhone} onChange={e => setDraft(d => ({ ...d, emergencyPhone: e.target.value }))} />)}
                                {field("Días de vacaciones al año", (
                                  <input type="number" min={0} max={90} className={inputClass}
                                    value={draft.vacationDaysPerYear}
                                    onChange={e => setDraft(d => ({ ...d, vacationDaysPerYear: Math.max(0, Number(e.target.value) || 0) }))} />
                                ))}
                                {field("% comisión sobre lo cobrado", (
                                  <input type="number" min={0} max={100} step={0.5} className={inputClass}
                                    value={draft.commissionPct}
                                    onChange={e => setDraft(d => ({ ...d, commissionPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                                    data-testid="input-commission-pct" />
                                ))}
                                {field("Costo hora (CLP, para rentabilidad)", (
                                  <input type="number" min={0} className={inputClass}
                                    value={draft.hourlyCost ?? ""}
                                    onChange={e => setDraft(d => ({ ...d, hourlyCost: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) }))}
                                    placeholder="Sin registrar"
                                    data-testid="input-hourly-cost" />
                                ))}
                              </div>
                              {field("Carpeta de documentos (Drive)", <input className={inputClass} value={draft.documentsUrl} onChange={e => setDraft(d => ({ ...d, documentsUrl: e.target.value }))} placeholder="https://drive.google.com/..." />)}
                              {field("Notas internas", (
                                <textarea rows={3} className="mt-1 w-full rounded-lg border border-foreground/15 bg-card/60 px-2.5 py-2 text-sm"
                                  value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                                  placeholder="Vacaciones, evaluaciones, acuerdos…" />
                              ))}
                              <div className="pt-2 border-t border-foreground/10">
                                <PersonDocuments userId={p.id} />
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" disabled={saveProfile.isPending}
                                  onClick={() => saveProfile.mutate({ userId: p.id, profile: draft })}>
                                  {saveProfile.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                                  Guardar ficha
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
              Esta sección solo la ven la dirección y Recursos Humanos: incluye rentas y datos personales.
              Los roles del panel se asignan en <strong>Equipo</strong>.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
