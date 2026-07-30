// Enlace de aceptación de una propuesta, en la ficha del contrato.
//
// Genera el enlace que se le manda al cliente y, cuando ya lo aceptó, enseña la
// constancia: quién, cuándo y desde qué dirección. Esa constancia es el motivo
// de todo esto, así que se muestra entera y no un simple "aceptado" — un "sí"
// sin nombre ni fecha no sirve para enseñárselo a nadie meses después.

import { useEffect, useState } from "react";
import { Link2, Copy, Check, Loader2, ShieldCheck, AlertCircle } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

interface Firma {
  estado: "pendiente" | "firmado" | "anulado";
  url: string | null;
  expiresAt: string | null;
  signedAt: string | null;
  signerName: string | null;
  signerEmail: string | null;
  signerIp: string | null;
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" }) : "";

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
    <div className="sheet-sec">
      <h4>Aceptación del cliente</h4>

      {firmado ? (
        // La constancia completa: es el motivo de existir de esta función.
        <div className="field" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <ShieldCheck className="w-4 h-4" style={{ color: "#34d399", flex: "none", marginTop: 2 }} />
          <div style={{ fontSize: "0.82em", lineHeight: 1.6 }}>
            <div style={{ color: "#34d399", fontWeight: 700 }}>Aceptada</div>
            <div><span style={{ color: "var(--dim)" }}>Por:</span> {firmado.signerName || "—"}</div>
            {firmado.signerEmail && <div><span style={{ color: "var(--dim)" }}>Correo:</span> {firmado.signerEmail}</div>}
            <div><span style={{ color: "var(--dim)" }}>Cuándo:</span> {fecha(firmado.signedAt)}</div>
            {firmado.signerIp && <div><span style={{ color: "var(--dim)" }}>Desde:</span> {firmado.signerIp}</div>}
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
            <button type="button" onClick={() => copiar(pendiente.url!)} className="save" style={{ flex: "none" }}>
              {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div style={{ fontSize: "0.72em", color: "var(--faint)", marginTop: 6 }}>
            Mándaselo al cliente. Al aceptarlo se registra su nombre, la fecha y desde dónde lo hizo.
            {pendiente.expiresAt && ` Vence el ${fecha(pendiente.expiresAt)}.`}
          </div>
        </div>
      ) : (
        <div className="field">
          <button type="button" className="add-btn" disabled={generando} onClick={generar}>
            {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {generando ? " Generando…" : " Generar enlace de aceptación"}
          </button>
          <div style={{ fontSize: "0.72em", color: "var(--faint)", marginTop: 6 }}>
            No es firma electrónica avanzada: es constancia de quién aceptó, cuándo y desde dónde.
          </div>
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
