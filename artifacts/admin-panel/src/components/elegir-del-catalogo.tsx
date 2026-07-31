// Traer un servicio del catálogo a la cotización.
//
// El catálogo (`hub_services`) existe con sus nueve servicios y sus planes, y
// hasta ahora no estaba conectado con nada: el asistente de cotizaciones pedía
// escribir el módulo a mano y, si no se ponía precio, lo estimaba la IA. Es
// decir, la agencia tenía sus precios cargados y aun así cotizaba con cifras
// inventadas.
//
// Esto los une: se elige el servicio y el plan, y el módulo entra con nombre,
// descripción y el importe del plan ya puesto.

import { useEffect, useState } from "react";
import { BookMarked, Loader2, AlertTriangle, X } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

interface Tier {
  plan: string;
  price: string;
  /** Importe numérico. Puede faltar: hay servicios "a cotizar". */
  amount?: number | null;
  detail?: string;
}

interface Servicio {
  id: number;
  name: string;
  category: string;
  description?: string;
  includes?: string;
  tiers?: Tier[];
  archived?: boolean;
}

export interface ModuloElegido {
  name: string;
  desc: string;
  /** 0 cuando el plan no tiene importe: "0" ya significa "estímalo" arriba. */
  price: number;
}

/**
 * Descripción del módulo a partir del servicio y su plan.
 *
 * Se recorta a 240 caracteres porque es el tope del campo en el esquema de la
 * cotización; pasarse hacía fallar la validación en el servidor después de
 * gastar la llamada al modelo.
 */
export function descripcionDeServicio(s: Servicio, t: Tier): string {
  const partes = [t.detail?.trim(), s.description?.trim()].filter(Boolean) as string[];
  return (partes[0] ?? "").slice(0, 240);
}

/** Nombre del módulo: el servicio, y el plan solo si hay más de uno. */
export function nombreDeServicio(s: Servicio, t: Tier, variosPlanes: boolean): string {
  const base = variosPlanes && t.plan ? `${s.name} — ${t.plan}` : s.name;
  return base.slice(0, 45);
}

export function ElegirDelCatalogo({ onElegir }: { onElegir: (m: ModuloElegido) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || servicios !== null) return;
    let vivo = true;
    fetch(`${API_BASE}/hub/services`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!vivo) return;
        const lista: Servicio[] = Array.isArray(d) ? d : (d?.services ?? []);
        setServicios(lista.filter((s) => !s.archived));
      })
      .catch((e: unknown) => {
        // Se dice que falló. Una lista vacía sería indistinguible de un catálogo
        // sin servicios, y llevaría a escribirlo todo a mano otra vez.
        if (vivo) { setError(e instanceof Error ? e.message : "No se pudo cargar"); setServicios([]); }
      });
    return () => { vivo = false; };
  }, [abierto, servicios]);

  if (!abierto) {
    return (
      <button type="button" className="wiz-add-mod-btn" onClick={() => setAbierto(true)}>
        <BookMarked style={{ width: 13, height: 13, display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
        Del catálogo
      </button>
    );
  }

  return (
    <div style={{
      border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginTop: 8,
      background: "rgba(0,0,0,.14)", gridColumn: "1 / -1",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: "0.8em", fontWeight: 600 }}>Elegir del catálogo</span>
        <button type="button" onClick={() => setAbierto(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)" }}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {servicios === null && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--dim)", fontSize: "0.78em" }}>
          <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> Cargando catálogo…
        </div>
      )}

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#e0795a", fontSize: "0.78em" }}>
          <AlertTriangle style={{ width: 14, height: 14 }} /> No se pudo cargar el catálogo: {error}
        </div>
      )}

      {servicios !== null && !error && servicios.length === 0 && (
        <p style={{ fontSize: "0.78em", color: "var(--faint)" }}>
          El catálogo está vacío. Se carga desde el Hub Ejecutivo, en Servicios.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 280, overflowY: "auto" }}>
        {(servicios ?? []).map((s) => {
          const tiers = Array.isArray(s.tiers) && s.tiers.length > 0 ? s.tiers : [{ plan: "", price: "", amount: null }];
          return (
            <div key={s.id}>
              <div style={{ fontSize: "0.76em", color: "var(--dim)", marginBottom: 3 }}>
                {s.category} · <strong style={{ color: "var(--fg)" }}>{s.name}</strong>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {tiers.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onElegir({
                        name: nombreDeServicio(s, t, tiers.length > 1),
                        desc: descripcionDeServicio(s, t),
                        price: typeof t.amount === "number" && Number.isFinite(t.amount) ? t.amount : 0,
                      });
                      setAbierto(false);
                    }}
                    style={{
                      padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontSize: "0.74em",
                      border: "1px solid var(--line)", background: "transparent", color: "var(--fg)",
                      textAlign: "left",
                    }}
                  >
                    {t.plan || "Único"}
                    <span style={{ color: "var(--dim)", marginLeft: 6 }}>
                      {/* Se dice cuándo el plan NO trae importe: si no, se elige
                          creyendo que trae precio y la IA acaba estimándolo. */}
                      {typeof t.amount === "number" && t.amount > 0
                        ? `$${t.amount.toLocaleString("es-CL")}`
                        : (t.price || "sin precio cargado")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
