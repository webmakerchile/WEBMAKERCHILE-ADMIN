// Reuniones de venta de una oportunidad, dentro de la ficha del contrato.
//
// El flujo guiado del embudo: discovery → propuesta → seguimiento(s). Cada
// reunión completada pide su desenlace (siguiente reunión, acepta ya, acepta
// a futuro o perdido) y el servidor aplica las consecuencias en el pipeline.
// Aquí no se calcula nada: se agenda, se registra y se refresca el tablero.

import { useState } from "react";
import { CalendarPlus, Loader2, AlertCircle, PauseCircle } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type Tipo = "discovery" | "propuesta" | "seguimiento";
type Desenlace = "siguiente_reunion" | "acepta_inmediato" | "acepta_futuro" | "perdido";

interface MeetingLite {
  id: string;
  client?: string;
  date?: string;
  summary?: string;
  tipo?: string;
  contractId?: string;
  desenlace?: string;
}

const TIPO_LABEL: Record<string, string> = { discovery: "Discovery", propuesta: "Propuesta", seguimiento: "Seguimiento" };
const DESENLACE_LABEL: Record<string, string> = {
  siguiente_reunion: "→ siguiente reunión",
  acepta_inmediato: "Aceptó ✓",
  acepta_futuro: "A futuro",
  perdido: "Perdido",
};
const MOTIVOS_FUTURO: Array<[string, string]> = [
  ["fondos", "Le faltan fondos"],
  ["inversionista", "Espera a un inversionista"],
  ["planificacion_pagos", "Planificación de pagos"],
  ["otro", "Otro"],
];
const MOTIVOS_PERDIDA: Array<[string, string]> = [
  ["precio", "Precio"],
  ["plazo", "Plazo"],
  ["competencia", "Se fue con otro"],
  ["sin_respuesta", "Dejó de responder"],
  ["no_era_el_momento", "No era el momento"],
  ["otro", "Otro"],
];
const FUTURO_LABEL: Record<string, string> = Object.fromEntries(MOTIVOS_FUTURO);

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
const siguiente = (tipo?: string): Tipo => (tipo === "discovery" ? "propuesta" : "seguimiento");

interface Props {
  contractId: string;
  estado: string;
  futuroFecha?: string;
  futuroMotivo?: string;
  futuroNota?: string;
  meetings: MeetingLite[];
  canManage: boolean;
  onToast: (msg: string) => void;
  /** Vuelve a traer el tablero del servidor (la reunión/desenlace se crean allá). */
  onChanged: () => void;
  /** Cierra la ficha; se usa al marcar "perdido" para que los selects
   *  no controlados de la ficha no queden mostrando un estado viejo. */
  onCloseSheet: () => void;
}

export function ReunionesOportunidad({ contractId, estado, futuroFecha, futuroMotivo, futuroNota, meetings, canManage, onToast, onChanged, onCloseSheet }: Props) {
  const enEmbudo = estado === "borrador";
  const linked = meetings
    .filter((m) => m.contractId === contractId)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const ultima = linked[linked.length - 1];
  const tipoSugerido: Tipo = !ultima ? "discovery" : siguiente(ultima.tipo);

  const [agendando, setAgendando] = useState(false);
  const [tipoNueva, setTipoNueva] = useState<Tipo | null>(null);
  const [fechaNueva, setFechaNueva] = useState("");

  const [desenlaceDe, setDesenlaceDe] = useState<string | null>(null); // id de la reunión
  const [desenlace, setDesenlace] = useState<Desenlace>("siguiente_reunion");
  const [sigFecha, setSigFecha] = useState("");
  const [futMotivo, setFutMotivo] = useState("fondos");
  const [futFecha, setFutFecha] = useState("");
  const [futNota, setFutNota] = useState("");
  const [motivoPerdida, setMotivoPerdida] = useState("precio");

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
    return data;
  };

  const agendar = async () => {
    if (!fechaNueva) { setError("Ponle fecha a la reunión"); return; }
    setGuardando(true);
    setError(null);
    try {
      await post(`/hub/ventas/opportunities/${encodeURIComponent(contractId)}/reuniones`, { tipo: tipoNueva ?? tipoSugerido, date: fechaNueva });
      onToast("Reunión agendada — quedó también en la pestaña Reuniones");
      setAgendando(false);
      setFechaNueva("");
      setTipoNueva(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agendar");
    } finally {
      setGuardando(false);
    }
  };

  const registrar = async (meetingId: string, tipoReunion?: string) => {
    const body: Record<string, unknown> = { desenlace };
    if (desenlace === "siguiente_reunion") {
      if (!sigFecha) { setError("Indica la fecha de la siguiente reunión"); return; }
      body.siguienteFecha = sigFecha;
    }
    if (desenlace === "acepta_futuro") {
      if (!futFecha) { setError("Indica la fecha estimada para retomar"); return; }
      body.futuroMotivo = futMotivo;
      body.futuroFecha = futFecha;
      if (futNota.trim()) body.futuroNota = futNota.trim();
    }
    if (desenlace === "perdido") body.motivoPerdida = motivoPerdida;
    void tipoReunion;
    setGuardando(true);
    setError(null);
    try {
      await post(`/hub/ventas/reuniones/${encodeURIComponent(meetingId)}/desenlace`, body);
      setDesenlaceDe(null);
      setSigFecha(""); setFutFecha(""); setFutNota("");
      if (desenlace === "perdido") {
        // La ficha usa inputs no controlados: si quedara abierta tras el
        // cambio de estado en el servidor, un "Guardar cambios" posterior
        // leería el DOM viejo ("borrador") y des-perdería el contrato.
        onToast("Registrado como perdido");
        onChanged();
        onCloseSheet();
        return;
      }
      onToast(
        desenlace === "siguiente_reunion"
          ? "Desenlace guardado — la siguiente reunión quedó agendada"
          : desenlace === "acepta_inmediato"
            ? "¡Aceptó! La oportunidad pasó a cierre"
            : "Guardado como caso a futuro — te avisaremos cuando se acerque la fecha",
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el desenlace");
    } finally {
      setGuardando(false);
    }
  };

  const abrirDesenlace = (m: MeetingLite) => {
    setDesenlaceDe(m.id);
    setDesenlace("siguiente_reunion");
    setSigFecha(""); setFutFecha(""); setFutNota("");
    setError(null);
  };

  return (
    <div className="sheet-sec" data-testid="sec-reuniones-venta">
      <h4>Reuniones de venta</h4>

      {enEmbudo && (futuroFecha || "") !== "" && (
        <div className="field" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 11px", borderRadius: 8, background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.35)" }} data-testid="banner-futuro">
          <PauseCircle style={{ width: 15, height: 15, color: "#e0a52a", flex: "none", marginTop: 1 }} />
          <div style={{ fontSize: "0.8em", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 700, color: "#e0a52a" }}>Caso a futuro — retomar el {futuroFecha}</div>
            <div style={{ color: "var(--muted)" }}>
              {FUTURO_LABEL[futuroMotivo || ""] || "Motivo sin indicar"}
              {futuroNota ? ` · ${futuroNota}` : ""}. Agendar una reunión lo reactiva.
            </div>
          </div>
        </div>
      )}

      {linked.length === 0 && (
        <p style={{ fontSize: "0.78em", color: "var(--muted)", margin: "0 0 10px" }}>
          Sin reuniones registradas. El flujo parte con un <strong>discovery</strong>; al completarlo se agenda la reunión de propuesta.
        </p>
      )}

      {linked.map((m) => {
        const vencida = !m.desenlace && (m.date || "") !== "" && (m.date || "") < hoy();
        return (
          <div key={m.id} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 8, background: "var(--card-bg)", border: "1px solid var(--border)", flexWrap: "wrap" }} data-testid={`row-reunion-${m.id}`}>
              <span className="badge">{TIPO_LABEL[m.tipo || ""] || "Reunión"}</span>
              <span style={{ fontSize: "0.8em" }}>{m.date || "sin fecha"}</span>
              {m.desenlace ? (
                <span style={{ fontSize: "0.72em", fontWeight: 700, color: m.desenlace === "perdido" ? "#f87171" : m.desenlace === "acepta_inmediato" ? "#34d399" : m.desenlace === "acepta_futuro" ? "#e0a52a" : "var(--muted)" }}>
                  {DESENLACE_LABEL[m.desenlace] || m.desenlace}
                </span>
              ) : vencida ? (
                <span style={{ fontSize: "0.72em", fontWeight: 700, color: "#e0a52a" }}>Sin desenlace</span>
              ) : (
                <span style={{ fontSize: "0.72em", color: "var(--muted)" }}>Agendada</span>
              )}
              <span style={{ flex: 1 }} />
              {canManage && enEmbudo && !m.desenlace && desenlaceDe !== m.id && (
                <button type="button" className="add-btn" style={{ padding: "4px 10px", fontSize: "0.75em", width: "auto" }} onClick={() => abrirDesenlace(m)} data-testid={`button-desenlace-${m.id}`}>
                  Registrar desenlace
                </button>
              )}
            </div>

            {desenlaceDe === m.id && (
              <div style={{ marginTop: 6, padding: "10px 12px", borderRadius: 8, border: "1px dashed var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: "0.72em", color: "var(--muted)" }}>¿Cómo terminó esta reunión?</label>
                <select value={desenlace} onChange={(e) => setDesenlace(e.target.value as Desenlace)} data-testid="select-desenlace">
                  <option value="siguiente_reunion">Se agenda la siguiente reunión</option>
                  <option value="acepta_inmediato">Acepta ya — pasa a cierre</option>
                  <option value="acepta_futuro">Acepta, pero a futuro</option>
                  <option value="perdido">Se perdió</option>
                </select>

                {desenlace === "siguiente_reunion" && (
                  <>
                    <label style={{ fontSize: "0.72em", color: "var(--muted)" }}>Fecha de la reunión de {TIPO_LABEL[siguiente(m.tipo)].toLowerCase()}</label>
                    <input type="date" value={sigFecha} onChange={(e) => setSigFecha(e.target.value)} data-testid="input-siguiente-fecha" />
                  </>
                )}

                {desenlace === "acepta_futuro" && (
                  <>
                    <select value={futMotivo} onChange={(e) => setFutMotivo(e.target.value)} data-testid="select-futuro-motivo">
                      {MOTIVOS_FUTURO.map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <label style={{ fontSize: "0.72em", color: "var(--muted)" }}>¿Cuándo retomar el contacto?</label>
                    <input type="date" value={futFecha} onChange={(e) => setFutFecha(e.target.value)} data-testid="input-futuro-fecha" />
                    <input type="text" value={futNota} onChange={(e) => setFutNota(e.target.value)} placeholder="Nota (opcional): qué está esperando" data-testid="input-futuro-nota" />
                  </>
                )}

                {desenlace === "perdido" && (
                  <select value={motivoPerdida} onChange={(e) => setMotivoPerdida(e.target.value)} data-testid="select-motivo-perdida">
                    {MOTIVOS_PERDIDA.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="save" disabled={guardando} onClick={() => registrar(m.id, m.tipo)} data-testid="button-guardar-desenlace">
                    {guardando ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : "Guardar desenlace"}
                  </button>
                  <button type="button" className="add-btn" style={{ width: "auto" }} onClick={() => setDesenlaceDe(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {canManage && enEmbudo && !agendando && (
        <button type="button" className="add-btn" onClick={() => { setAgendando(true); setTipoNueva(null); setError(null); }} data-testid="button-agendar-reunion">
          <CalendarPlus style={{ width: 14, height: 14 }} /> Agendar reunión ({TIPO_LABEL[tipoSugerido].toLowerCase()})
        </button>
      )}

      {agendando && (
        <div style={{ marginTop: 6, padding: "10px 12px", borderRadius: 8, border: "1px dashed var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
          <select value={tipoNueva ?? tipoSugerido} onChange={(e) => setTipoNueva(e.target.value as Tipo)} data-testid="select-tipo-reunion">
            <option value="discovery">Discovery — entender al cliente</option>
            <option value="propuesta">Propuesta — presentar la cotización</option>
            <option value="seguimiento">Seguimiento</option>
          </select>
          <input type="date" value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)} data-testid="input-fecha-reunion" />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="save" disabled={guardando} onClick={agendar} data-testid="button-guardar-reunion">
              {guardando ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : "Agendar"}
            </button>
            <button type="button" className="add-btn" style={{ width: "auto" }} onClick={() => setAgendando(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {error && (
        <div className="field" style={{ display: "flex", gap: 6, alignItems: "center", color: "#f87171", fontSize: "0.78em", marginTop: 6 }} data-testid="text-error-reuniones">
          <AlertCircle style={{ width: 14, height: 14, flex: "none" }} /> {error}
        </div>
      )}

      <p style={{ fontSize: "0.7em", color: "var(--faint)", marginTop: 8, marginBottom: 0 }}>
        Los avisos llegan solos: si una reunión pasada queda sin desenlace o un caso a futuro se acerca a su fecha.
        (No se crea evento en Google Calendar: la conexión actual es de solo lectura.)
      </p>
    </div>
  );
}
