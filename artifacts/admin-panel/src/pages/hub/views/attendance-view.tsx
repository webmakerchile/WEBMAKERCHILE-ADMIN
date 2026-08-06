import { useState } from "react";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, ChevronLeft, Clock3, ChevronRight, Headphones } from "lucide-react";
import { HUB_API_BASE } from "../shared";

export function attToday(): string { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }); }
export function attAddDays(dateStr: string, n: number): string { const d = new Date(dateStr + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function attFmtMin(min: number): string { const h = Math.floor(min / 60); const m = Math.round(min % 60); return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`; }
export function attHHMM(iso: string | null): string { return iso ? new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }) : "—"; }
export function attFmtLong(dateStr: string): string { const s = new Date(dateStr + "T12:00:00Z").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); return s.charAt(0).toUpperCase() + s.slice(1); }
export const ATT_DAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

/** Un tramo del día: trabajo, pausa, o tiempo sin marcar entre sesiones. */
export interface AttTramo {
  tipo: "trabajo" | "pausa" | "fuera";
  desde: string;
  hasta: string | null;
  minutos: number;
  motivo?: string;
}
export interface AttDesgloseData {
  tramos: AttTramo[];
  trabajado: number;
  pausado: number;
  fuera: number;
  abarcado: number;
  entrada: string | null;
  salida: string | null;
  abierta: boolean;
}

export const ATT_TRAMO: Record<AttTramo["tipo"], string> = {
  trabajo: "Trabajando",
  pausa: "En pausa",
  fuera: "Sin marcar",
};

/**
 * En qué se fue el día entre la entrada y la salida.
 *
 * La franja mostraba "08:12 → 22:34" con "6h 37m" al lado y no había forma de
 * saber dónde estaban las otras ocho horas: parte eran pausas y parte huecos
 * entre sesiones, que no aparecían en ninguna cifra. Aquí los tramos suman
 * exactamente lo que abarca la franja, así que la resta siempre cuadra.
 */
export function AttDesglose({ d }: { d: AttDesgloseData }) {
  if (d.tramos.length === 0) return null;
  const total = Math.max(1, d.abarcado);
  return (
    <div className="att-desg">
      <div className="att-desg-bar">
        {d.tramos.map((t, i) => (
          <span
            key={i}
            className={cn("att-desg-seg", t.tipo)}
            style={{ width: `${(t.minutos / total) * 100}%` }}
            title={`${ATT_TRAMO[t.tipo]} · ${attFmtMin(t.minutos)}`}
          />
        ))}
      </div>
      <div className="att-desg-tot">
        <span className="trabajo">{attFmtMin(d.trabajado)} trabajados</span>
        {d.pausado > 0 && <span className="pausa">{attFmtMin(d.pausado)} en pausa</span>}
        {d.fuera > 0 && (
          <span className="fuera" title="Entre una salida y la siguiente entrada">
            {attFmtMin(d.fuera)} sin marcar
          </span>
        )}
        <span className="span">{attFmtMin(d.abarcado)} de punta a punta</span>
      </div>
      <div className="att-desg-list">
        {d.tramos.map((t, i) => (
          <div key={i} className="att-desg-row">
            <span className={cn("att-desg-dot", t.tipo)} />
            <span className="hora">{attHHMM(t.desde)} → {t.hasta ? attHHMM(t.hasta) : "ahora"}</span>
            <span className={cn("tipo", t.tipo)}>{ATT_TRAMO[t.tipo]}</span>
            <span className="dur">{attFmtMin(t.minutos)}</span>
            {t.motivo && <span className="motivo">· {t.motivo}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export interface AttMember {
  id: number; name: string | null; email: string; picture: string | null; teamRole: string | null;
  discordUserId: string | null; discordTag: string | null;
  today: {
    checkIn: string; checkOut: string | null; onDiscord: boolean; minutes: number; open: boolean;
    /** Minutos en pausa del día: ya descontados de `minutes`. */
    pausedMinutes: number;
    /** Pausa en curso, o null si el reloj está corriendo. */
    pausa: { id: number; startedAt: string; motivo: string } | null;
    /** Id de quien cerró la jornada, si no fue la propia persona. */
    cerradaPor?: number | null;
    desglose?: AttDesgloseData;
  } | null;
  discord: {
    linked: boolean; tag: string | null; checkin: boolean | null;
    pct: number | null; lastSeenMin: number | null; inVoiceNow: boolean | null;
  } | null;
  weekByDay: { date: string; minutes: number; pausedMinutes: number }[];
  weekTotal: number;
  logs: { id: number; text: string; done: boolean }[];
}
export interface AttDiscordStatus {
  configured: boolean;
  app: { id: string; name: string } | null;
  guild: { id: string; name: string | null } | null;
  inviteUrl: string | null;
  membersAccess: "ok" | "unconfigured" | "noguild" | "intent" | "error";
  linked: number;
  total: number;
}
export interface AttDiscordMember { id: string; name: string; username: string; avatarUrl: string | null }
export interface AttOverview {
  date: string; today: string; weekStart: string; days: string[];
  members: AttMember[];
  summary: { working: number; finished: number; absent: number; totalMinutes: number };
}
export interface AttHistDay {
  date: string; minutes: number;
  sessions: { id: number; checkIn: string; checkOut: string | null; onDiscord: boolean; discordPct: number | null; minutes: number }[];
  logs: { id: number; text: string; done: boolean }[];
}

export function AttendanceView() {
  const [selDate, setSelDate] = useState<string>(attToday());
  const [histUser, setHistUser] = useState<{ id: number; name: string | null; email: string } | null>(null);
  const [desgloseAbierto, setDesgloseAbierto] = useState<number | null>(null);
  const [histDays, setHistDays] = useState<7 | 30 | 92>(7);
  const [showDc, setShowDc] = useState(false);
  const [mapErr, setMapErr] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const qc = useQueryClient();
  const isToday = selDate === attToday();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["jornada-overview", selDate],
    queryFn: async () => {
      const res = await fetch(`${HUB_API_BASE}/jornada/overview?date=${selDate}`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo cargar la asistencia");
      return res.json() as Promise<AttOverview>;
    },
    refetchInterval: isToday ? 60000 : false,
    staleTime: 30000,
  });

  const { data: hist, isFetching: histLoading } = useQuery({
    queryKey: ["jornada-history", histUser?.id, histDays],
    enabled: !!histUser,
    queryFn: async () => {
      const to = attToday();
      const from = attAddDays(to, -(histDays - 1));
      const res = await fetch(`${HUB_API_BASE}/jornada/history?userId=${histUser!.id}&from=${from}&to=${to}`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo cargar el historial");
      return res.json() as Promise<{ days: AttHistDay[]; totalMinutes: number }>;
    },
    staleTime: 30000,
  });

  const { data: dc } = useQuery({
    queryKey: ["jornada-discord-status"],
    queryFn: async () => {
      const res = await fetch(`${HUB_API_BASE}/jornada/discord/status`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudo consultar Discord");
      return res.json() as Promise<AttDiscordStatus>;
    },
    staleTime: 60000,
  });

  const { data: dcMembers, isLoading: dcMembersLoading } = useQuery({
    queryKey: ["jornada-discord-members"],
    enabled: dc?.membersAccess === "ok",
    queryFn: async () => {
      const res = await fetch(`${HUB_API_BASE}/jornada/discord/members`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudieron cargar los miembros");
      return res.json() as Promise<{ ok: boolean; members: AttDiscordMember[] }>;
    },
    staleTime: 60000,
  });

  const renameMut = useMutation({
    mutationFn: async ({ userId, name }: { userId: number; name: string }) => {
      const res = await fetch(`${HUB_API_BASE}/jornada/user/${userId}/name`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo renombrar");
      }
    },
    onSuccess: () => {
      setEditingName(null);
      setNameDraft("");
      qc.invalidateQueries({ queryKey: ["jornada-overview"] });
    },
  });

  // Pausar/reanudar la jornada de OTRA persona. El servidor solo lo permite a
  // dirección, ventas y RRHH; aquí el control simplemente no se pinta para el
  // resto porque esta vista ya está gateada por rol.
  const pausaMut = useMutation({
    mutationFn: async (p: { userId: number; pausar: boolean; motivo?: string }) => {
      const res = await fetch(`${HUB_API_BASE}/jornada/${p.pausar ? "pausa" : "reanudar"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: p.userId, motivo: p.motivo ?? "" }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo cambiar la pausa");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jornada-overview"] }),
    onError: (e) => setMapErr(e instanceof Error ? e.message : "Error al pausar"),
  });

  // Marcar la entrada de OTRA persona: respaldo manual cuando el bot de
  // Discord no la detecto (o la persona no esta en voz). Mismo gate de rol
  // en el servidor que las pausas.
  const startMut = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`${HUB_API_BASE}/jornada/check-in`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo iniciar la jornada");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jornada-overview"] }),
    onError: (e) => setMapErr(e instanceof Error ? e.message : "Error al iniciar la jornada"),
  });

  // Cerrar la jornada de otra persona: una pausa no es una salida, y sin esto
  // una jornada que quedó encendida no había forma de apagarla desde aquí.
  //
  // Es la contraparte de `startMut`, que se añadió en paralelo: una abre la
  // jornada a mano y la otra la cierra. Hacían falta las dos.
  const cerrarMut = useMutation({
    mutationFn: async (p: { userId: number }) => {
      const res = await fetch(`${HUB_API_BASE}/jornada/check-out`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: p.userId }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo cerrar la jornada");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jornada-overview"] }),
    onError: (e) => setMapErr(e instanceof Error ? e.message : "Error al cerrar la jornada"),
  });

  const mapMut = useMutation({
    mutationFn: async (p: { userId: number; discordUserId: string | null; discordTag: string | null }) => {
      const res = await fetch(`${HUB_API_BASE}/jornada/discord/map`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error || "No se pudo emparejar");
      }
      return res.json();
    },
    onSuccess: () => {
      setMapErr(null);
      qc.invalidateQueries({ queryKey: ["jornada-overview"] });
      qc.invalidateQueries({ queryKey: ["jornada-discord-status"] });
    },
    onError: (e) => setMapErr(e instanceof Error ? e.message : "Error al emparejar"),
  });

  const members = data?.members ?? [];
  const sum = data?.summary;

  return (
    <div className="wrap">
      {/* Navegación por día */}
      <div className="att-bar">
        <button className="att-nav" onClick={() => setSelDate(attAddDays(selDate, -1))} aria-label="Día anterior"><ChevronLeft className="w-4 h-4" /></button>
        <button className={cn("att-nav att-hoy", isToday && "on")} onClick={() => setSelDate(attToday())}>Hoy</button>
        <button className="att-nav" onClick={() => setSelDate(attAddDays(selDate, 1))} disabled={isToday} aria-label="Día siguiente"><ChevronRight className="w-4 h-4" /></button>
        <button className={cn("att-nav att-dcbtn", showDc && "on")} onClick={() => setShowDc((v) => !v)}>
          <Headphones className="w-3.5 h-3.5" /> Discord
          <span className={cn("att-dot", dc?.configured && dc?.guild ? "ok" : dc?.configured ? "warn" : "off")} />
        </button>
        <span className="att-date">{attFmtLong(selDate)}</span>
      </div>

      {/* Panel de configuración de Discord (verificación por canal de voz) */}
      {showDc && (
        <div className="gcard att-dc">
          <div className="att-dc-head">Verificación automática · canal de voz</div>
          {!dc && <div className="att-empty">Cargando estado…</div>}
          {dc && !dc.configured && (
            <p className="att-dc-txt warn">Falta el token del bot. Pídemelo por el chat del agente y te guío paso a paso.</p>
          )}
          {dc?.configured && !dc.app && (
            <p className="att-dc-txt warn">
              El token guardado no es válido. En el portal de Discord (pestaña Bot) usa "Reset Token" y entrégame el nuevo.
            </p>
          )}
          {dc?.app && !dc.guild && dc.inviteUrl && (
            <p className="att-dc-txt">
              El bot <b>{dc.app.name}</b> aún no está en tu servidor.{" "}
              <a className="att-dc-link" href={dc.inviteUrl} target="_blank" rel="noreferrer">Invitar al servidor →</a>
              {" "}Luego vuelve y recarga.
            </p>
          )}
          {dc?.guild && (
            <>
              <p className="att-dc-txt">
                Bot <b>{dc.app?.name ?? "—"}</b> conectado a <b>{dc.guild.name ?? `servidor ${dc.guild.id}`}</b> · {dc.linked}/{dc.total} integrantes emparejados
              </p>
              {dc.membersAccess === "intent" && (
                <p className="att-dc-txt warn">
                  Falta activar "Server Members Intent" en el portal de Discord (pestaña Bot → Privileged Gateway Intents) para elegir miembros de la lista.
                </p>
              )}
              {dc.membersAccess === "ok" && (
                <div className="att-dc-map">
                  {members.map((m) => (
                    <div key={m.id} className="att-dc-row">
                      {editingName === m.id ? (
                        <form
                          className="att-dc-rename"
                          onSubmit={(e) => { e.preventDefault(); if (nameDraft.trim()) renameMut.mutate({ userId: m.id, name: nameDraft.trim() }); }}
                        >
                          <input
                            className="att-dc-rename-input"
                            value={nameDraft}
                            autoFocus
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Escape") { setEditingName(null); setNameDraft(""); } }}
                            disabled={renameMut.isPending}
                          />
                          <button type="submit" className="att-dc-rename-ok" disabled={renameMut.isPending || !nameDraft.trim()}>✓</button>
                          <button type="button" className="att-dc-rename-cancel" onClick={() => { setEditingName(null); setNameDraft(""); }}>✕</button>
                        </form>
                      ) : (
                        <span className="att-dc-name">
                          {m.name || m.email}
                          <button
                            className="att-dc-edit"
                            title="Cambiar nombre"
                            onClick={() => { setEditingName(m.id); setNameDraft(m.name || ""); }}
                          >✏️</button>
                        </span>
                      )}
                      <select
                        className="att-dc-sel"
                        value={m.discordUserId ?? ""}
                        disabled={mapMut.isPending || editingName === m.id}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          const gm = dcMembers?.members.find((x) => x.id === v);
                          mapMut.mutate({ userId: m.id, discordUserId: v, discordTag: gm ? gm.name : null });
                        }}
                      >
                        <option value="">— Sin emparejar —</option>
                        {dcMembersLoading
                          ? <option disabled>Cargando miembros…</option>
                          : (dcMembers?.members ?? []).map((gm) => (
                            <option key={gm.id} value={gm.id}>{gm.name} (@{gm.username})</option>
                          ))
                        }
                      </select>
                      {m.discordUserId ? <span className="att-dc-ok">✓</span> : <span className="att-dc-ok off">·</span>}
                    </div>
                  ))}
                  {mapErr && <p className="att-dc-txt warn">{mapErr}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Resumen del día */}
      {sum && (
        <div className="att-sum">
          <div className="att-as work"><b>{sum.working}</b><span>Trabajando</span></div>
          <div className="att-as done"><b>{sum.finished}</b><span>Terminaron</span></div>
          <div className="att-as abs"><b>{sum.absent}</b><span>Sin marcar</span></div>
          <div className="att-as tot"><b>{attFmtMin(sum.totalMinutes)}</b><span>Horas del día</span></div>
        </div>
      )}

      {isLoading && <div className="att-empty">Cargando asistencia…</div>}
      {isError && <div className="att-empty">No se pudo cargar la asistencia. Reintenta en unos segundos.</div>}

      {/* Pase de lista */}
      {!isLoading && !isError && (
        <div className="att-list">
          {members.map((m) => {
            const enPausa = !!m.today?.pausa;
            const st = m.today ? (m.today.open ? (enPausa ? "pause" : "work") : "done") : "abs";
            return (
              <div key={m.id} className="gcard att-card" onClick={() => setHistUser(m)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") setHistUser(m); }}>
                <div className="att-row">
                  {m.picture
                    ? <img src={m.picture} alt="" className="att-ava" referrerPolicy="no-referrer" />
                    : <div className="att-ava att-ava-f">{(m.name || m.email)[0].toUpperCase()}</div>}
                  <div className="att-who">
                    <strong>
                      {m.name || m.email}
                      <button
                        className="att-dc-edit"
                        title="Cambiar nombre"
                        onClick={(e) => { e.stopPropagation(); setEditingName(m.id); setNameDraft(m.name || ""); setShowDc(true); }}
                      >✏️</button>
                    </strong>
                    <small>{m.teamRole || "—"}</small>
                  </div>
                  {/* La franja sola no explica nada: entre la entrada y la
                      salida hay pausas y huecos sin marcar, y por eso el total
                      de al lado siempre parecía estar mal. Se abre y se ve. */}
                  <button
                    className={cn("att-times", m.today?.desglose && "clickable", desgloseAbierto === m.id && "on")}
                    title={m.today?.desglose ? "Ver en qué se fue el día" : "Llegada → salida"}
                    aria-expanded={desgloseAbierto === m.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (m.today?.desglose) setDesgloseAbierto(desgloseAbierto === m.id ? null : m.id);
                    }}
                  >
                    <span>{m.today ? attHHMM(m.today.checkIn) : "—"}</span>
                    <span className="att-arw">→</span>
                    <span>{m.today ? (m.today.open ? "…" : attHHMM(m.today.checkOut)) : "—"}</span>
                  </button>
                  <span className="att-min">{m.today ? attFmtMin(m.today.minutes) : "0m"}</span>
                  {(() => {
                    const d = m.discord;
                    if (d?.inVoiceNow)
                      return <Headphones className="w-3.5 h-3.5 att-disc" aria-label="En canal de voz ahora" />;
                    if (d?.linked && m.today && d.pct !== null)
                      return (
                        <span
                          className={cn("att-dpct", d.pct >= 70 ? "hi" : d.pct >= 30 ? "mid" : "lo")}
                          title={`${d.pct}% de la jornada en canal de voz${d.lastSeenMin !== null ? ` · visto hace ${d.lastSeenMin} min` : ""}`}
                        >
                          🎧{d.pct}%
                        </span>
                      );
                    if (!d?.linked && m.today?.onDiscord)
                      return <Headphones className="w-3.5 h-3.5 att-disc dim" aria-label="Autodeclarado en Discord" />;
                    return null;
                  })()}
                  {isToday && !m.today?.open && (
                    <button
                      className="att-pause"
                      title="Iniciar su jornada (respaldo manual)"
                      disabled={startMut.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        startMut.mutate(m.id);
                      }}
                    >
                      ▶
                    </button>
                  )}
                  {isToday && m.today?.open && (
                    <button
                      className="att-pause"
                      title={enPausa ? "Reanudar su jornada" : "Pausar su jornada"}
                      disabled={pausaMut.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        pausaMut.mutate({ userId: m.id, pausar: !enPausa });
                      }}
                    >
                      {enPausa ? "▶" : "⏸"}
                    </button>
                  )}
                  {/* Apagar el reloj. Pausar deja a la persona figurando en su
                      turno: una jornada olvidada seguía sin poder cerrarse. */}
                  {isToday && m.today?.open && (
                    <button
                      className="att-pause off"
                      title="Terminar su jornada"
                      disabled={pausaMut.isPending || cerrarMut.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        const quien = m.name || m.email;
                        if (!window.confirm(`¿Cerrar la jornada de ${quien}? Dejará de contar horas desde ahora.`)) return;
                        cerrarMut.mutate({ userId: m.id });
                      }}
                    >
                      ⏹
                    </button>
                  )}
                  <span
                    className={cn("att-st", st)}
                    title={m.today && m.today.pausedMinutes > 0 ? `${attFmtMin(m.today.pausedMinutes)} en pausas (ya descontados)` : undefined}
                  >
                    {st === "work" ? "Trabajando" : st === "pause" ? "En pausa" : st === "done" ? "Terminó" : "Sin marcar"}
                  </span>
                </div>
                {desgloseAbierto === m.id && m.today?.desglose && (
                  <AttDesglose d={m.today.desglose} />
                )}
                {m.logs.length > 0 && (
                  <div className="att-logs">
                    {m.logs.slice(0, 3).map((l) => (
                      <span key={l.id} className={cn("att-log", l.done && "ok")}>{l.done ? "✓" : "○"} {l.text}</span>
                    ))}
                    {m.logs.length > 3 && <span className="att-log more">+{m.logs.length - 3} más</span>}
                  </div>
                )}
              </div>
            );
          })}
          {members.length === 0 && <div className="att-empty">No hay integrantes aprobados.</div>}
        </div>
      )}

      {/* Matriz semanal */}
      {data && members.length > 0 && (
        <>
          <div className="subhead" style={{ marginTop: 40 }}><Clock3 className="w-3.5 h-3.5" /> Horas de la semana <span className="n">(lun → dom)</span></div>
          <div className="att-mx-wrap">
            <table className="att-mx">
              <thead>
                <tr>
                  <th>Integrante</th>
                  {data.days.map((d, i) => (
                    <th key={d} className={cn(d === data.today && "today")}>{ATT_DAY_LETTERS[i]}<small>{d.slice(8)}</small></th>
                  ))}
                  <th className="tot">Total</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="who">{m.name || m.email}</td>
                    {m.weekByDay.map((d) => (
                      <td key={d.date} className={cn(d.date === data.today && "today", d.minutes === 0 && "z")}>
                        {d.minutes > 0 ? attFmtMin(d.minutes) : "—"}
                      </td>
                    ))}
                    <td className="tot">{attFmtMin(m.weekTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Historial por integrante */}
      {histUser && (
        <>
          <div className="subhead" style={{ marginTop: 24 }}>
            Historial · <span className="n">{histUser.name || histUser.email}</span>
            <span className="grow" />
            {([7, 30, 92] as const).map((n) => (
              <button key={n} className={cn("att-nav sm", histDays === n && "on")} onClick={() => setHistDays(n)}>
                {n === 7 ? "7 días" : n === 30 ? "30 días" : "3 meses"}
              </button>
            ))}
            <button className="att-nav sm" onClick={() => setHistUser(null)} aria-label="Cerrar historial"><X className="w-3 h-3" /></button>
          </div>
          {histLoading && <div className="att-empty">Cargando historial…</div>}
          {hist && !histLoading && (
            hist.days.length === 0
              ? <div className="att-empty">Sin registros en este rango.</div>
              : (
                <>
                  <div className="att-htot">Total del rango: <b>{attFmtMin(hist.totalMinutes)}</b></div>
                  <div className="att-hlist">
                    {hist.days.map((d) => (
                      <div key={d.date} className="gcard att-hday">
                        <div className="att-hhead">
                          <strong>{attFmtLong(d.date)}</strong>
                          <span className="att-min">{attFmtMin(d.minutes)}</span>
                        </div>
                        <div className="att-hsess">
                          {d.sessions.map((s) => (
                            <span key={s.id} className="att-sess">
                              {attHHMM(s.checkIn)} → {s.checkOut ? attHHMM(s.checkOut) : "…"}
                              {s.discordPct !== null ? ` · 🎧${s.discordPct}%` : s.onDiscord ? " 🎧" : ""}
                            </span>
                          ))}
                          {d.sessions.length === 0 && <span className="att-sess none">Sin jornada marcada</span>}
                        </div>
                        {d.logs.length > 0 && (
                          <ul className="att-hlogs">
                            {d.logs.map((l) => (
                              <li key={l.id} className={cn(l.done && "ok")}>{l.done ? "✓" : "○"} {l.text}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )
          )}
        </>
      )}
    </div>
  );
}

