// A quién le toca un proyecto.
//
// El campo "Dueño" era un input de texto: se escribía "Josué" y eso no se podía
// comparar con ningún usuario. Por eso /mis-tareas listaba TODOS los proyectos
// activos de la agencia a cualquiera, y no existía la idea de "mis proyectos".
//
// El texto se conserva —hay proyectos con nombres escritos ahí— pero lo que
// manda para filtrar son estos ids.

import { useEffect, useState } from "react";
import { Users2, Check, Loader2 } from "lucide-react";
import { alternarAsignado, asignadosDe } from "@/lib/proyecto-asignacion";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

interface Miembro {
  id: number;
  name: string | null;
  email: string;
  teamRole?: string | null;
}

const nombreCorto = (m: Miembro) => (m.name || m.email.split("@")[0] || `#${m.id}`).trim();

export function AsignarProyecto({
  asignados,
  onChange,
  soloLectura,
}: {
  asignados: number[] | undefined;
  onChange: (ids: number[]) => void;
  soloLectura?: boolean;
}) {
  const [equipo, setEquipo] = useState<Miembro[] | null>(null);

  useEffect(() => {
    let vivo = true;
    // Misma lista que usa el selector de tareas: quien puede recibir una tarea
    // puede recibir un proyecto, y tener dos listas distintas sería confuso.
    fetch(`${API_BASE}/hub/tasks/team-members`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo) setEquipo(Array.isArray(d) ? d : (d?.members ?? [])); })
      .catch(() => { if (vivo) setEquipo([]); });
    return () => { vivo = false; };
  }, []);

  const ids = asignadosDe({ id: "", assigneeIds: asignados });

  if (equipo === null) {
    return (
      <div className="field">
        <label>Asignado a</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--dim)", fontSize: "0.78em" }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando equipo…
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Users2 className="w-3.5 h-3.5" /> Asignado a
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {equipo.map((m) => {
          const activo = ids.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              disabled={soloLectura}
              aria-pressed={activo}
              onClick={() => onChange(alternarAsignado(ids, m.id))}
              title={m.email}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "5px 10px", borderRadius: 8, cursor: soloLectura ? "default" : "pointer",
                fontSize: "0.76em", transition: "all .15s",
                border: `1px solid ${activo ? "rgba(251,146,60,.55)" : "var(--line)"}`,
                background: activo ? "rgba(251,146,60,.14)" : "transparent",
                color: activo ? "#FB923C" : "var(--dim)",
                opacity: soloLectura ? 0.6 : 1,
              }}
            >
              {activo && <Check className="w-3 h-3" />}
              {nombreCorto(m)}
            </button>
          );
        })}
        {equipo.length === 0 && (
          <span style={{ fontSize: "0.76em", color: "var(--faint)" }}>No hay nadie a quien asignar.</span>
        )}
      </div>
      {/* Se dice qué pasa si no se asigna a nadie: si no, parece que el
          proyecto queda oculto para todos, que es lo contrario de lo que hace. */}
      <div style={{ fontSize: "0.72em", color: "var(--faint)", marginTop: 6 }}>
        {ids.length === 0
          ? "Sin asignar: lo ve todo el equipo en sus proyectos."
          : `Solo ${ids.length === 1 ? "esta persona lo verá" : "estas personas lo verán"} en "los míos".`}
      </div>
    </div>
  );
}
