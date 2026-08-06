import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/hub-kit";
import { X, FileText, FileCheck2 } from "lucide-react";
import type { Contract, ContractStatus, HubServiceTier, HubState } from "../shared";
import { contractExpired, fmtDate, hlText } from "../shared";

export const CONTRACT_STATUSES: Record<ContractStatus, { label: string; color: string }> = {
  borrador: { label: "Borrador", color: "var(--faint)" },
  activo:   { label: "Activo",   color: "var(--done)" },
  vencido:  { label: "Vencido",  color: "#e0795a" },
  cancelado:{ label: "Cancelado",color: "var(--disc)" },
  perdido:  { label: "Perdido",  color: "#8a6a6a" },
};

export function ContractsView({ state, onOpen, onNew }: { state: HubState; onOpen: (id: string) => void; onNew: () => void }) {
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  // Rango de montos, como texto para poder dejarlo vacío sin que valga 0.
  const [minTxt, setMinTxt] = useState("");
  const [maxTxt, setMaxTxt] = useState("");
  // Estado efectivo: "vencido" derivado de la fecha real de vencimiento (salvo cancelados)
  // Ni un cancelado ni un perdido "vencen": ya terminaron por otro motivo.
  const effStatus = (c: Contract): ContractStatus =>
    (c.status !== "cancelado" && c.status !== "perdido" && contractExpired(c)) ? "vencido" : c.status;
  const all = state.contracts;
  const counts: Record<string, number> = {};
  all.forEach(c => { const s = effStatus(c); counts[s] = (counts[s] || 0) + 1; });

  // Quien no ve montos tampoco filtra por ellos: el servidor le borra `value`,
  // así que el filtro le dejaría la lista vacía sin explicar por qué.
  const verMontos = !all.some(c => c.moneyRedacted);
  const num = (v: string) => { const n = Number(v.replace(/[^\d]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
  const min = verMontos ? num(minTxt) : null;
  const max = verMontos ? num(maxTxt) : null;
  const dentroDelRango = (c: Contract) => {
    if (min === null && max === null) return true;
    const v = Number(c.value) || 0;
    // Un contrato sin monto no entra en un filtro por monto: colarlo mezclaría
    // "vale menos de X" con "no sabemos cuánto vale".
    if (v <= 0) return false;
    return (min === null || v >= min) && (max === null || v <= max);
  };

  const list = all
    .filter(c => (!fStatus || effStatus(c) === fStatus) && dentroDelRango(c) && (!q || (c.title + " " + (c.client || "") + " " + (c.value || "") + " " + (c.notes || "")).toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt - a.createdAt);
  const totalFiltrado = list.reduce((a, c) => a + (Number(c.value) || 0), 0);
  return (
    <div className="wrap">
      {all.length > 0 && (
        <div className="toolbar">
          <div className="tsearch"><span>🔍</span><input value={q} onChange={e => setQ(e.target.value.toLowerCase())} placeholder="Buscar contrato…" aria-label="Buscar contrato" /></div>
          <div className="fchips" role="group" aria-label="Filtrar por estado">
            <button className={`fchip${!fStatus ? " on" : ""}`} aria-pressed={!fStatus} onClick={() => setFStatus("")}>Todos <span className="fn">{all.length}</span></button>
            {(Object.entries(CONTRACT_STATUSES) as [ContractStatus, { label: string; color: string }][]).map(([k, v]) => {
              if (!counts[k]) return null;
              return (
                <button key={k} className={`fchip${fStatus === k ? " on" : ""}`} aria-pressed={fStatus === k} onClick={() => setFStatus(fStatus === k ? "" : k)}>
                  <span className="fdot" style={{ background: v.color }} />{v.label} <span className="fn">{counts[k]}</span>
                </button>
              );
            })}
          </div>
          {verMontos && (
            <div className="fchips" role="group" aria-label="Filtrar por monto">
              <input
                value={minTxt}
                onChange={e => setMinTxt(e.target.value)}
                placeholder="Monto desde"
                inputMode="numeric"
                aria-label="Monto mínimo"
                style={{ width: 120, fontSize: "0.78em" }}
              />
              <input
                value={maxTxt}
                onChange={e => setMaxTxt(e.target.value)}
                placeholder="hasta"
                inputMode="numeric"
                aria-label="Monto máximo"
                style={{ width: 110, fontSize: "0.78em" }}
              />
              {(min !== null || max !== null) && (
                <>
                  <button className="fchip" onClick={() => { setMinTxt(""); setMaxTxt(""); }}>Quitar</button>
                  {/* El total de lo filtrado: filtrar por monto sin ver la suma
                      obliga a sumarlo a mano, que es para lo que se filtra. */}
                  <span className="fn" style={{ marginLeft: 4 }}>
                    {list.length} · ${Math.round(totalFiltrado).toLocaleString("es-CL")}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {all.length === 0 ? (
        <EmptyState title="Sin contratos aún" hint="Con + Nuevo puedes generar una cotización, extraer desde una reunión o subir un PDF existente." icon={<FileText />} action={<button className="add-btn" style={{ width: "auto", padding: "8px 16px" }} onClick={onNew}>+ Nuevo</button>} />
      ) : list.length === 0 ? (
        <EmptyState title="Sin resultados" hint="Nada coincide con tu búsqueda o filtro actual." icon={<FileCheck2 />} />
      ) : (
        <div className="cardlist">
          {list.map(c => {
            const st = effStatus(c);
            const expired = c.status !== "cancelado" && c.status !== "perdido" && contractExpired(c);
            const s = CONTRACT_STATUSES[st] || CONTRACT_STATUSES.borrador;
            const nproj = state.projects.filter(p => p.contractId === c.id).length;
            const dleft = c.expiresAt ? Math.ceil((new Date(c.expiresAt + "T23:59:59").getTime() - Date.now()) / 86400000) : null;
            return (
              <div key={c.id} className="gcard ccard" style={{ "--cc": s.color } as React.CSSProperties} onClick={() => onOpen(c.id)}>
                <div className="gt">{hlText(c.title, q || undefined, "ct")}</div>
                <div className="gsub">{c.client ? hlText(c.client, q || undefined, "cl") : "—"}</div>
                <div className="meta" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                  <span className="chip" style={{ color: s.color, borderColor: s.color + "55", background: s.color + "18" }}>{s.label}</span>
                  {c.value && <span className="chip">{c.value}</span>}
                  {c.expiresAt && (
                    <span className="chip" style={expired ? { color: "#e0795a", borderColor: "rgba(224,121,90,.4)" } : dleft != null && dleft <= 30 ? { color: "var(--gold)", borderColor: "rgba(201,164,74,.45)" } : undefined}>
                      {expired ? `Venció ${c.expiresAt}` : dleft != null && dleft <= 30 ? `Vence en ${dleft} día${dleft !== 1 ? "s" : ""}` : `Vence: ${c.expiresAt}`}
                    </span>
                  )}
                  {nproj > 0 && <span className="chip">🗂 {nproj} proyecto{nproj !== 1 ? "s" : ""}</span>}
                  {c.pdfUrl && (
                    <a className="chip pdf-badge" href={c.pdfUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                      📄 {c.pdfTitle || "PDF"}{c.pdfUploadedAt ? ` · ${new Date(c.pdfUploadedAt).toLocaleDateString("es-CL")}` : ""}
                    </a>
                  )}
                </div>
                {(c.notes || "").trim() !== "" && <div className="gbody" style={{ marginTop: "8px" }}>{hlText(c.notes, q || undefined, "cn")}</div>}
                <div className="gfoot"><span className="gdate">{fmtDate(c.createdAt)}</span></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
