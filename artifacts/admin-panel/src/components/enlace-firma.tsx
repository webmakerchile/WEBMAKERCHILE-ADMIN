// Enlace de aceptación de una propuesta, en la ficha del contrato — y de
// aprobación de inicio / cierre, en la ficha del proyecto.
//
// Genera el enlace que se le manda al cliente y, cuando ya lo firmó, enseña la
// constancia completa: quién, cuándo, desde qué dirección, LA FIRMA capturada
// y si los correos de confirmación salieron. Esa constancia es el motivo de
// todo esto — y un correo que falló se dice aquí, no en un log que nadie lee.
//
// `FirmaSeccion` es el cuerpo presentacional compartido por los tres casos
// (contrato, aprobación de proyecto, cierre de proyecto): mismos tres estados
// (sin enlace / pendiente / firmado), misma constancia, mismo mecanismo de
// firma del lado del cliente. Solo cambian los textos y a qué endpoint se
// genera/consulta el enlace.

import { useEffect, useState } from "react";
import { Link2, Copy, Check, Loader2, ShieldCheck, AlertCircle, Mail } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

interface Firma {
  estado: "pendiente" | "firmado" | "anulado";
  url: string | null;
  expiresAt: string | null;
  signedAt: string | null;
  signerName: string | null;
  signerEmail: string | null;
  signerIp: string | null;
  signatureKind: "dibujo" | "imagen" | "texto" | null;
  signatureData: string | null;
  userAgent: string | null;
  emailClienteEstado: string | null;
  emailEquipoEstado: string | null;
  emailDetalle: string | null;
}

interface FirmaProyecto extends Firma {
  motivo: "aprobacion_proyecto" | "cierre_proyecto";
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" }) : "";

const METODO_LABEL: Record<string, string> = {
  dibujo: "dibujada a mano",
  imagen: "imagen subida",
  texto: "escrita a máquina",
};

/** Cómo se cuenta cada estado de correo. El color hace el trabajo de alerta. */
const CORREO_ESTADO: Record<string, { texto: string; color: string }> = {
  enviado: { texto: "enviado ✓", color: "#34d399" },
  fallido: { texto: "falló ✗", color: "#f87171" },
  sin_configurar: { texto: "servicio de correo sin configurar", color: "#fbbf24" },
  sin_correo: { texto: "no dejó correo", color: "var(--dim)" },
};

function EstadoCorreo({ etiqueta, estado, testid }: { etiqueta: string; estado: string; testid: string }) {
  const e = CORREO_ESTADO[estado] ?? { texto: estado, color: "var(--dim)" };
  return (
    <div data-testid={testid}>
      <span style={{ color: "var(--dim)" }}>{etiqueta}:</span>{" "}
      <span style={{ color: e.color, fontWeight: 600 }}>{e.texto}</span>
    </div>
  );
}

function FirmaSeccion({
  titulo,
  etiquetaFirmado,
  textoBoton,
  descBoton,
  descPendiente,
  firmado,
  pendiente,
  generando,
  copiado,
  error,
  onGenerar,
  onCopiar,
}: {
  titulo: string;
  etiquetaFirmado: string;
  textoBoton: string;
  descBoton: string;
  descPendiente: string;
  firmado: Firma | null;
  pendiente: Firma | null;
  generando: boolean;
  copiado: boolean;
  error: string | null;
  onGenerar: () => void;
  onCopiar: (url: string) => void;
}) {
  // Las firmas anteriores a esta función no registraron correos: no se inventa.
  const conCorreos = Boolean(firmado && (firmado.emailClienteEstado || firmado.emailEquipoEstado));

  return (
    <div className="sheet-sec">
      <h4>{titulo}</h4>

      {firmado ? (
        // La constancia completa: es el motivo de existir de esta función.
        <div className="field" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <ShieldCheck className="w-4 h-4" style={{ color: "#34d399", flex: "none", marginTop: 2 }} />
          <div style={{ fontSize: "0.82em", lineHeight: 1.6, minWidth: 0 }}>
            <div style={{ color: "#34d399", fontWeight: 700 }}>{etiquetaFirmado}</div>
            <div><span style={{ color: "var(--dim)" }}>Por:</span> {firmado.signerName || "—"}</div>
            {firmado.signerEmail && <div><span style={{ color: "var(--dim)" }}>Correo:</span> {firmado.signerEmail}</div>}
            <div><span style={{ color: "var(--dim)" }}>Cuándo:</span> {fecha(firmado.signedAt)}</div>
            {firmado.signerIp && <div><span style={{ color: "var(--dim)" }}>Desde:</span> {firmado.signerIp}</div>}
            {firmado.signatureKind && (
              <div><span style={{ color: "var(--dim)" }}>Firma:</span> {METODO_LABEL[firmado.signatureKind] ?? firmado.signatureKind}</div>
            )}

            {firmado.signatureData && (
              firmado.signatureKind === "texto" ? (
                <div
                  data-testid="text-firma-texto"
                  style={{
                    background: "#fff", borderRadius: 8, padding: "4px 16px", marginTop: 8,
                    display: "inline-block", color: "#16130f", fontSize: "1.5em",
                    fontFamily: "'Segoe Script','Bradley Hand',cursive",
                  }}
                >
                  {firmado.signatureData}
                </div>
              ) : (
                <div style={{ background: "#fff", borderRadius: 8, padding: 6, marginTop: 8, display: "inline-block", maxWidth: "100%" }}>
                  <img
                    data-testid="img-firma"
                    src={firmado.signatureData}
                    alt={`Firma de ${firmado.signerName || "cliente"}`}
                    style={{ display: "block", maxWidth: 230, maxHeight: 95 }}
                  />
                </div>
              )
            )}

            {conCorreos && (
              <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Mail className="w-3.5 h-3.5" style={{ color: "var(--dim)", flex: "none", marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  {firmado.emailClienteEstado && (
                    <EstadoCorreo etiqueta="Correo al cliente" estado={firmado.emailClienteEstado} testid="text-correo-cliente" />
                  )}
                  {firmado.emailEquipoEstado && (
                    <EstadoCorreo etiqueta="Correo al equipo" estado={firmado.emailEquipoEstado} testid="text-correo-equipo" />
                  )}
                  {firmado.emailDetalle && (
                    <div data-testid="text-correo-detalle" style={{ color: "#f87171", fontSize: "0.92em", overflowWrap: "anywhere" }}>
                      {firmado.emailDetalle}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : pendiente ? (
        <div className="field">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              readOnly
              value={pendiente.url ?? ""}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1, fontSize: "0.78em" }}
              aria-label="Enlace de aceptación"
            />
            <button type="button" onClick={() => onCopiar(pendiente.url!)} className="save" style={{ flex: "none" }}>
              {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div style={{ fontSize: "0.72em", color: "var(--faint)", marginTop: 6 }}>
            {descPendiente}
            {pendiente.expiresAt && ` Vence el ${fecha(pendiente.expiresAt)}.`}
          </div>
        </div>
      ) : (
        <div className="field">
          <button type="button" className="add-btn" disabled={generando} onClick={onGenerar}>
            {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {generando ? " Generando…" : ` ${textoBoton}`}
          </button>
          <div style={{ fontSize: "0.72em", color: "var(--faint)", marginTop: 6 }}>{descBoton}</div>
        </div>
      )}

      {error && (
        <div className="field" style={{ display: "flex", gap: 6, alignItems: "center", color: "#f87171", fontSize: "0.78em" }}>
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </div>
      )}
    </div>
  );
}

export function EnlaceFirma({ contractId }: { contractId: string }) {
  const [firmas, setFirmas] = useState<Firma[] | null>(null);
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = () => {
    fetch(`${API_BASE}/hub/contracts/${encodeURIComponent(contractId)}/firma`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFirmas(d?.firmas ?? []))
      .catch(() => setFirmas([]));
  };

  useEffect(cargar, [contractId]);

  const generar = async () => {
    setGenerando(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/hub/contracts/${encodeURIComponent(contractId)}/firma`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "No se pudo generar el enlace");
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el enlace");
    } finally {
      setGenerando(false);
    }
  };

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles el enlace sigue siendo seleccionable a mano.
      setError("No se pudo copiar. Selecciona el enlace y cópialo tú.");
    }
  };

  const firmado = firmas?.find((f) => f.estado === "firmado") ?? null;
  const pendiente = firmas?.find((f) => f.estado === "pendiente" && f.url) ?? null;

  return (
    <FirmaSeccion
      titulo="Aceptación del cliente"
      etiquetaFirmado="Aceptada y firmada"
      textoBoton="Generar enlace de aceptación"
      descBoton="El cliente ve el contrato con la marca WebMaker y firma en línea.
            No es firma electrónica avanzada: es constancia de quién aceptó, cuándo y desde dónde."
      descPendiente="Mándaselo al cliente: verá el contrato completo y podrá firmarlo (dibujo, imagen o texto).
            Al firmar se registra su nombre, la firma, la fecha y desde dónde lo hizo."
      firmado={firmado}
      pendiente={pendiente}
      generando={generando}
      copiado={copiado}
      error={error}
      onGenerar={generar}
      onCopiar={copiar}
    />
  );
}

const MOTIVO_CONFIG = {
  aprobacion_proyecto: {
    titulo: "Aprobación de inicio",
    etiquetaFirmado: "Aprobado y firmado",
    textoBoton: "Generar enlace de aprobación",
    descBoton: "El cliente aprueba el inicio del proyecto y firma en línea. No es firma electrónica avanzada: es constancia de quién aprobó, cuándo y desde dónde.",
    descPendiente: "Mándaselo al cliente para que apruebe el inicio del proyecto (dibujo, imagen o texto). Al firmar se registra su nombre, la firma, la fecha y desde dónde lo hizo.",
  },
  cierre_proyecto: {
    titulo: "Cierre del proyecto",
    etiquetaFirmado: "Cerrado y confirmado",
    textoBoton: "Generar enlace de cierre",
    descBoton: "El cliente confirma que el proyecto quedó a su conformidad y firma en línea. No es firma electrónica avanzada: es constancia de quién confirmó, cuándo y desde dónde.",
    descPendiente: "Mándaselo al cliente para que confirme la conformidad del proyecto (dibujo, imagen o texto). Al firmar se registra su nombre, la firma, la fecha y desde dónde lo hizo.",
  },
} as const;

/**
 * Las dos firmas de un proyecto — aprobación de inicio y cierre — en una sola
 * ficha. Un solo fetch trae ambas (`GET /hub/projects/:id/firma` no filtra
 * por motivo) y cada sección genera/copia la suya de forma independiente,
 * porque pueden vivir en momentos completamente distintos del proyecto.
 */
export function EnlaceFirmaProyecto({ projectId }: { projectId: string }) {
  const [firmas, setFirmas] = useState<FirmaProyecto[] | null>(null);
  const [generando, setGenerando] = useState<Partial<Record<"aprobacion_proyecto" | "cierre_proyecto", boolean>>>({});
  const [copiadoMotivo, setCopiadoMotivo] = useState<string | null>(null);
  const [errores, setErrores] = useState<Partial<Record<"aprobacion_proyecto" | "cierre_proyecto", string | null>>>({});

  const cargar = () => {
    fetch(`${API_BASE}/hub/projects/${encodeURIComponent(projectId)}/firma`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFirmas(d?.firmas ?? []))
      .catch(() => setFirmas([]));
  };

  useEffect(cargar, [projectId]);

  const generar = async (motivo: "aprobacion_proyecto" | "cierre_proyecto") => {
    setGenerando((g) => ({ ...g, [motivo]: true }));
    setErrores((e) => ({ ...e, [motivo]: null }));
    try {
      const r = await fetch(`${API_BASE}/hub/projects/${encodeURIComponent(projectId)}/firma`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "No se pudo generar el enlace");
      cargar();
    } catch (e) {
      setErrores((er) => ({ ...er, [motivo]: e instanceof Error ? e.message : "No se pudo generar el enlace" }));
    } finally {
      setGenerando((g) => ({ ...g, [motivo]: false }));
    }
  };

  const copiar = async (motivo: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiadoMotivo(motivo);
      setTimeout(() => setCopiadoMotivo((m) => (m === motivo ? null : m)), 2000);
    } catch {
      setErrores((er) => ({ ...er, [motivo as "aprobacion_proyecto" | "cierre_proyecto"]: "No se pudo copiar. Selecciona el enlace y cópialo tú." }));
    }
  };

  return (
    <>
      {(["aprobacion_proyecto", "cierre_proyecto"] as const).map((motivo) => {
        const cfg = MOTIVO_CONFIG[motivo];
        const propias = firmas?.filter((f) => f.motivo === motivo) ?? null;
        const firmado = propias?.find((f) => f.estado === "firmado") ?? null;
        const pendiente = propias?.find((f) => f.estado === "pendiente" && f.url) ?? null;
        return (
          <FirmaSeccion
            key={motivo}
            titulo={cfg.titulo}
            etiquetaFirmado={cfg.etiquetaFirmado}
            textoBoton={cfg.textoBoton}
            descBoton={cfg.descBoton}
            descPendiente={cfg.descPendiente}
            firmado={firmado}
            pendiente={pendiente}
            generando={Boolean(generando[motivo])}
            copiado={copiadoMotivo === motivo}
            error={errores[motivo] ?? null}
            onGenerar={() => generar(motivo)}
            onCopiar={(url) => copiar(motivo, url)}
          />
        );
      })}
    </>
  );
}
