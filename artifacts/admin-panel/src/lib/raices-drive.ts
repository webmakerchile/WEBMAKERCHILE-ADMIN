// Qué carpeta abre cada explorador de Drive.
//
// Había tres ids escritos a fuego en tres archivos, y dos de ellos ni siquiera
// coincidían: /drive miraba una carpeta y el Hub Ejecutivo otra. Quien no
// tuviera acceso a ese id concreto lo veía todo vacío, sin ninguna pista de que
// estaba mirando la carpeta de otra persona.
//
// Ahora las decide el servidor y se configuran desde el panel. Los valores de
// arranque son los mismos ids de antes, para que nada se mueva de sitio el día
// del despliegue.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export interface RaicesDrive {
  /** Drive general del equipo: /drive y el selector de videos. */
  equipo: string;
  /** Carpetas de cliente del Hub Ejecutivo. */
  hub: string;
}

export interface RespuestaRaices {
  raices: RaicesDrive;
  porDefecto: RaicesDrive;
  puedeEditar: boolean;
}

export function useRaicesDrive() {
  return useQuery<RespuestaRaices>({
    queryKey: ["drive-raices"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/drive/raices`, { credentials: "include" });
      if (!r.ok) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error || "No se pudieron cargar las carpetas raíz");
      }
      return r.json();
    },
    // Cambian una vez al año: no tiene sentido volver a pedirlas al cambiar de
    // pestaña, y el explorador se remonta cada vez que se abre.
    staleTime: 10 * 60_000,
  });
}

export function useGuardarRaices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (raices: Partial<RaicesDrive>) => {
      const r = await fetch(`${API_BASE}/drive/raices`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raices),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string; raices?: RaicesDrive };
      if (!r.ok) throw new Error(cuerpo.error || `El servidor respondió ${r.status}`);
      return cuerpo.raices!;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drive-raices"] }); },
  });
}

export function urlDeRaiz(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}
