// Cambiar la carpeta de Drive que abre cada explorador.
//
// Antes esto era una constante en el código: para apuntar a otra carpeta había
// que editar tres archivos y volver a desplegar. Y como los ids eran de una
// cuenta concreta, cualquiera que no tuviera acceso a esa carpeta veía el
// explorador vacío — indistinguible de una carpeta que de verdad no tiene nada.

import { useState } from "react";
import { useRaicesDrive, useGuardarRaices, urlDeRaiz, type RaicesDrive } from "@/lib/raices-drive";
import { FolderCog, Loader2, Check, AlertTriangle, ExternalLink, ChevronDown } from "lucide-react";

const CAMPOS: Array<{ clave: keyof RaicesDrive; label: string; ayuda: string }> = [
  {
    clave: "equipo",
    label: "Drive del equipo",
    ayuda: "La que abre /drive y el selector de videos.",
  },
  {
    clave: "hub",
    label: "Carpetas de cliente",
    ayuda: "La que abre el explorador del Hub Ejecutivo.",
  },
];

export function ConfigRaicesDrive() {
  const { data, isLoading, error } = useRaicesDrive();
  const guardar = useGuardarRaices();
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<RaicesDrive | null>(null);

  if (isLoading) return null;
  if (error) {
    return (
      <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78em", color: "#e0795a" }}>
        <AlertTriangle style={{ width: 14, height: 14 }} /> No se pudieron cargar las carpetas raíz.
      </p>
    );
  }
  if (!data) return null;

  const actual = borrador ?? data.raices;
  const cambiado = JSON.stringify(actual) !== JSON.stringify(data.raices);

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text)", padding: 0,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82em", fontWeight: 600 }}>
          <FolderCog style={{ width: 15, height: 15 }} /> Carpetas de Drive
        </span>
        <ChevronDown style={{ width: 15, height: 15, color: "var(--dim)", transform: abierto ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>

      {abierto && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
          {CAMPOS.map((c) => (
            <div key={c.clave}>
              <label style={{ display: "block", fontSize: "0.76em", fontWeight: 500, marginBottom: 4 }}>{c.label}</label>
              <input
                type="text"
                value={actual[c.clave]}
                disabled={!data.puedeEditar}
                onChange={(e) => setBorrador({ ...actual, [c.clave]: e.target.value })}
                placeholder="Pega aquí el enlace de la carpeta"
                style={{
                  width: "100%", height: 34, padding: "0 10px", fontSize: "0.8em",
                  border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)",
                  color: "var(--text)", opacity: data.puedeEditar ? 1 : 0.6,
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: "0.72em", color: "var(--faint)" }}>{c.ayuda}</span>
                {/* Enlace para comprobar a ojo que es la carpeta correcta ANTES
                    de guardarla: es la única forma de saber que no está vacía
                    porque el id esté mal. */}
                {data.raices[c.clave] && (
                  <a
                    href={urlDeRaiz(data.raices[c.clave])}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "0.72em", color: "var(--orange2)" }}
                  >
                    abrirla <ExternalLink style={{ width: 10, height: 10 }} />
                  </a>
                )}
              </div>
            </div>
          ))}

          <p style={{ fontSize: "0.72em", color: "var(--faint)", margin: 0 }}>
            Se acepta el enlace completo de Drive, no hace falta sacar el id. La carpeta tiene que estar
            compartida con las cuentas del equipo: si no, cada quien la verá vacía.
          </p>

          {data.puedeEditar ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                className="add-btn"
                disabled={!cambiado || guardar.isPending}
                onClick={() => guardar.mutate(actual, { onSuccess: () => setBorrador(null) })}
                style={{ opacity: cambiado ? 1 : 0.5 }}
              >
                {guardar.isPending
                  ? <Loader2 className="animate-spin" style={{ width: 13, height: 13 }} />
                  : <><Check style={{ width: 13, height: 13, display: "inline", verticalAlign: "-2px", marginRight: 4 }} />Guardar</>}
              </button>
              {cambiado && (
                <button type="button" onClick={() => setBorrador(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.75em", color: "var(--dim)" }}>
                  Descartar
                </button>
              )}
              <button
                type="button"
                onClick={() => setBorrador({ ...data.porDefecto })}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.72em", color: "var(--dim)", textDecoration: "underline" }}
              >
                Volver a las de siempre
              </button>
            </div>
          ) : (
            <p style={{ fontSize: "0.72em", color: "var(--faint)", margin: 0 }}>
              Las cambia la dirección o Programación.
            </p>
          )}

          {guardar.error && (
            <p style={{ display: "flex", alignItems: "flex-start", gap: 5, fontSize: "0.74em", color: "#e0795a", margin: 0 }}>
              <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
              {(guardar.error as Error).message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
