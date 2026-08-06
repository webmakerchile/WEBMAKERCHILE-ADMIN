import { useState, useEffect, useCallback } from "react";
import { EmptyState } from "@/components/hub-kit";
import { CalendarClock, FileText, Headphones } from "lucide-react";
import type { HubState, Meeting } from "../shared";
import { DESENLACE_REUNION_LABEL, fmtDate, HUB_API_BASE, TIPO_REUNION_LABEL } from "../shared";

/* ---- Google Calendar integration ---- */
export interface GCalEvent { id: string; title: string; start: string; end: string; allDay: boolean; meetLink: string | null; location: string | null; }

/** Mensajes claros por causa para los errores que vuelven del callback OAuth. */
export const CAL_ERR_LABELS: Record<string, string> = {
  access_denied: "Google denegó el acceso: cancelaste el permiso o la cuenta no está autorizada.",
  oauth_error: "Google rechazó la conexión.",
  csrf_mismatch: "La sesión de autorización expiró. Intenta conectar de nuevo.",
  no_code: "Google no devolvió el código de autorización.",
  token_failed: "No se pudo canjear el código por un token de acceso.",
  server_error: "Error interno al conectar. Intenta de nuevo en unos minutos.",
  not_configured: "Faltan las credenciales de Google (CLIENT_ID / CLIENT_SECRET) en el servidor.",
};

export function GoogleCalendarSection() {
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading");
  const [reason, setReason] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState<string>("");
  const [configured, setConfigured] = useState(true);
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadStatus = useCallback(() => {
    setStatus("loading");
    fetch(`${HUB_API_BASE}/calendar/status`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setCallbackUrl(d.callbackUrl || "");
        setConfigured(d.configured !== false);
        if (d.connected) {
          setStatus("connected");
          setReason(null);
          setEventsLoading(true);
          fetch(`${HUB_API_BASE}/calendar/events`, { credentials: "include" })
            .then(r => r.json())
            .then(ev => { setEvents(ev.events || []); setEventsLoading(false); })
            .catch(() => setEventsLoading(false));
        } else {
          setStatus("disconnected");
          setReason(d.reason || "error");
          if (d.reason === "not_configured") setSetupOpen(true);
        }
      })
      .catch(() => { setStatus("disconnected"); setReason("error"); });
  }, []);

  useEffect(() => {
    // Resultado del callback OAuth: llega como ?calendar=connected|error&msg=...&detail=...
    try {
      const params = new URLSearchParams(window.location.search);
      const cal = params.get("calendar");
      if (cal) {
        const msg = params.get("msg") || "";
        const detail = (params.get("detail") || "").slice(0, 140);
        window.history.replaceState({}, "", window.location.pathname);
        if (cal === "connected") {
          setJustConnected(true);
        } else {
          const base = CAL_ERR_LABELS[msg] || `Error al conectar (${msg || "desconocido"}).`;
          setErrorMsg(detail ? `${base} Detalle técnico: ${detail}` : base);
          if (["token_failed", "oauth_error", "not_configured"].includes(msg) || detail.includes("redirect_uri")) {
            setSetupOpen(true);
          }
        }
      }
    } catch { /* ignore */ }
    loadStatus();
  }, [loadStatus]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch(`${HUB_API_BASE}/calendar/disconnect`, { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    setDisconnecting(false);
    setJustConnected(false);
    loadStatus();
  };

  const copyUri = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard no disponible */ }
  };

  const fmtEvDate = (iso: string, allDay: boolean) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (allDay) return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
    return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div className="subhead" style={{ marginTop: 18 }}>
        <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Google Calendar
        {status === "connected" && !eventsLoading && events.length > 0 && <span className="n">{events.length} evento{events.length !== 1 ? "s" : ""} · 30 días</span>}
        <span className="grow" />
        {status === "connected" && (
          <button onClick={handleDisconnect} disabled={disconnecting}
            style={{ fontSize: "11px", background: "none", border: "1px solid var(--line)", borderRadius: "6px", color: "var(--faint)", padding: "2px 8px", cursor: "pointer", textTransform: "none", letterSpacing: 0 }}>
            {disconnecting ? "…" : "Desconectar"}
          </button>
        )}
      </div>

      {justConnected && (
        <div style={{ marginBottom: "10px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "9px", padding: "10px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "#34d399", flex: 1 }}>✓ Google Calendar conectado. Tus próximos eventos aparecen abajo.</span>
          <button onClick={() => setJustConnected(false)} style={{ background: "none", border: "none", color: "#34d399", cursor: "pointer", fontSize: "13px", padding: 0 }}>✕</button>
        </div>
      )}

      {errorMsg && (
        <div style={{ marginBottom: "10px", background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: "9px", padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "#fda4af", flex: 1, lineHeight: 1.5, wordBreak: "break-word" }}>⚠ {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} style={{ background: "none", border: "none", color: "#fda4af", cursor: "pointer", fontSize: "13px", padding: 0, flexShrink: 0 }}>✕</button>
        </div>
      )}

      {status === "loading" && (
        <div style={{ padding: "12px", color: "var(--faint)", fontSize: "12px" }}>Cargando…</div>
      )}

      {status === "disconnected" && (
        <>
          <div style={{ background: "var(--card2)", border: "1px solid var(--line)", borderRadius: "11px", padding: "16px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "220px" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)", marginBottom: "4px" }}>
                {reason === "expired" ? "La conexión con Google expiró" : reason === "no_scope" ? "Falta el permiso de Calendar" : "Conecta tu Google Calendar"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--faint)", lineHeight: 1.5 }}>
                {reason === "expired"
                  ? "Google revocó o venció el acceso. Vuelve a conectar para seguir viendo tus eventos."
                  : reason === "no_scope"
                    ? "Tu cuenta está conectada pero sin el permiso de lectura del calendario. Conecta de nuevo para autorizarlo."
                    : reason === "not_configured"
                      ? "El servidor no tiene credenciales de Google configuradas. Revisa la guía de configuración."
                      : "Ve tus próximas reuniones directamente desde el hub. Solo lectura: no modifica tu calendario."}
              </div>
            </div>
            {configured ? (
              <a href={`${HUB_API_BASE}/auth/google-calendar`} style={{ background: "var(--orange)", color: "#fff", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
                Conectar Calendar
              </a>
            ) : (
              <span style={{ border: "1px solid var(--line)", color: "var(--faint)", borderRadius: "8px", padding: "8px 14px", fontSize: "12px", whiteSpace: "nowrap", flexShrink: 0 }}>
                No configurado
              </span>
            )}
          </div>

          <button onClick={() => setSetupOpen(o => !o)}
            style={{ marginTop: "8px", background: "none", border: "none", color: "var(--dim)", fontSize: "11.5px", cursor: "pointer", padding: 0, textDecoration: "underline", textUnderlineOffset: "3px" }}>
            {setupOpen ? "Ocultar configuración de Google Cloud" : "¿Google rechaza la conexión? Ver configuración requerida"}
          </button>

          {setupOpen && (
            <div style={{ marginTop: "8px", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: "11px", padding: "14px 16px", fontSize: "12px", color: "var(--dim)", lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>Configuración en Google Cloud Console</div>
              <p style={{ margin: "0 0 8px" }}>
                Si Google muestra <em>“Error 400: redirect_uri_mismatch”</em> al intentar conectar, falta registrar esta URI de redirección en el cliente OAuth:
              </p>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
                <code style={{ flex: 1, minWidth: "200px", background: "rgba(0,0,0,0.25)", border: "1px solid var(--line)", borderRadius: "7px", padding: "7px 10px", fontSize: "11px", color: "var(--text)", wordBreak: "break-all", userSelect: "all" }}>
                  {callbackUrl || "(no disponible)"}
                </code>
                <button onClick={copyUri} disabled={!callbackUrl}
                  style={{ background: copied ? "rgba(16,185,129,0.15)" : "var(--orange)", color: copied ? "#34d399" : "#fff", border: "none", borderRadius: "7px", padding: "7px 12px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {copied ? "✓ Copiada" : "Copiar URI"}
                </button>
              </div>
              <ol style={{ margin: "0 0 8px", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "3px" }}>
                <li>Abre <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: "var(--orange2)" }}>console.cloud.google.com/apis/credentials</a> con la cuenta dueña del proyecto.</li>
                <li>En <strong>IDs de cliente de OAuth 2.0</strong>, abre el cliente que usa este panel (el mismo del inicio de sesión).</li>
                <li>En <strong>URIs de redirección autorizadas</strong> agrega la URI copiada y guarda.</li>
                <li>Espera unos minutos (Google tarda en propagar el cambio) y vuelve a intentar.</li>
              </ol>
              <p style={{ margin: 0, color: "var(--faint)", fontSize: "11px" }}>
                Además, verifica que <strong>Google Calendar API</strong> esté habilitada en <em>APIs y servicios → Biblioteca</em>. Si usas el panel en producción y en desarrollo, registra la URI de cada entorno (esta tarjeta muestra la del entorno actual).
              </p>
            </div>
          )}
        </>
      )}

      {status === "connected" && (
        <>
          {eventsLoading && <div style={{ padding: "8px 0", color: "var(--faint)", fontSize: "12px" }}>Cargando eventos…</div>}
          {!eventsLoading && events.length === 0 && (
            <div style={{ padding: "8px 0", color: "var(--faint)", fontSize: "12px" }}>Sin eventos en los próximos 30 días.</div>
          )}
          {!eventsLoading && events.length > 0 && (
            <div className="gcal-list">
              {events.map(ev => (
                <div key={ev.id} style={{ background: "var(--card2)", border: "1px solid var(--line)", borderRadius: "9px", padding: "10px 12px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                    <div style={{ fontSize: "11px", color: "var(--dim)" }}>{fmtEvDate(ev.start, ev.allDay)}</div>
                    {ev.location && <div style={{ fontSize: "11px", color: "var(--faint)", marginTop: "2px" }}>📍 {ev.location}</div>}
                  </div>
                  {ev.meetLink && (
                    <a href={ev.meetLink} target="_blank" rel="noopener noreferrer"
                      style={{ flexShrink: 0, background: "var(--orange-soft)", border: "1px solid var(--orange-line)", color: "var(--orange2)", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 600, textDecoration: "none" }}>
                      Meet
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function MeetView({ state, onOpen }: { state: HubState; onOpen: (id: string) => void }) {
  // Mediodía local para evitar que la medianoche UTC retroceda un día en Chile
  const meetTs = (m: Meeting) => m.date ? new Date(m.date + "T12:00:00").getTime() : m.createdAt;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const upcoming = state.meetings.filter(m => !!m.date && meetTs(m) >= todayStart.getTime()).sort((a, b) => meetTs(a) - meetTs(b));
  const past = state.meetings.filter(m => !m.date || meetTs(m) < todayStart.getTime()).sort((a, b) => meetTs(b) - meetTs(a));
  const card = (m: Meeting, isUpcoming: boolean) => (
    <div key={m.id} className="gcard" onClick={() => onOpen(m.id)}>
      <div className="gt">{m.client || "Reunión"}</div>
      <div className="gsub">{m.date ? fmtDate(new Date(m.date + "T12:00:00").getTime()) : fmtDate(m.createdAt)}</div>
      {(m.summary || "").trim() !== "" && <div className="gbody">{m.summary}</div>}
      <div className="gfoot">
        {m.tipo && <span className="badge">{TIPO_REUNION_LABEL[m.tipo] || m.tipo}</span>}
        {m.desenlace
          ? <span className="badge">{DESENLACE_REUNION_LABEL[m.desenlace] || m.desenlace}</span>
          : (m.contractId && !isUpcoming ? <span className="badge" style={{ color: "#e0a52a" }}>Sin desenlace</span> : null)}
        {isUpcoming && <span className="badge">Próxima</span>}
        <span className="gdate">{fmtDate(m.createdAt)}</span>
      </div>
    </div>
  );
  return (
    <div className="wrap">
      <GoogleCalendarSection />
      <div className="subhead"><FileText className="w-3.5 h-3.5" />Reuniones manuales <span className="n">{state.meetings.length || ""}</span></div>
      {state.meetings.length === 0 && (
        <EmptyState title="Sin reuniones aún" hint="Registra resúmenes y acuerdos o conecta Google Calendar arriba." icon={<Headphones />} />
      )}
      {upcoming.length > 0 && (<>
        <div className="subhead"><CalendarClock className="w-3 h-3" />Próximas <span className="n">{upcoming.length}</span></div>
        <div className="cardlist">{upcoming.map(m => card(m, true))}</div>
      </>)}
      {past.length > 0 && (<>
        {upcoming.length > 0 && <div className="subhead">Anteriores <span className="n">{past.length}</span></div>}
        <div className="cardlist">{past.map(m => card(m, false))}</div>
      </>)}
    </div>
  );
}

