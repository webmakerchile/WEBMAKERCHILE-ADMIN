// Conectar Google Drive desde donde haga falta.
//
// El permiso de Drive solo se pedía en /cuentas, y ventas no tiene acceso a esa
// página. Resultado: el ejecutivo comercial nunca ha tenido tokens de Drive y
// todo lo que toca Drive —adjuntar, subir la cotización, ver el explorador—
// fallaba con 409 desde el primer día.
//
// El aviso vive aquí y no en cada pantalla para que el texto sea el mismo en
// todas: cuando cada sitio explicaba el problema a su manera, unos decían
// "carpeta vacía" y otros "cierra sesión", y ninguno de los dos era cierto.

import { useEffect, useState } from "react";
import { HardDrive, ExternalLink, Loader2 } from "lucide-react";
import {
  estadoInicial, alComprobar, alApagar, alResponder, type EstadoDriveBase,
} from "@/lib/estado-drive";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export type EstadoDrive = EstadoDriveBase;

/**
 * ¿Esta cuenta autorizó Drive?
 *
 * Se consulta ANTES de que algo falle: así se puede ofrecer el botón en vez de
 * enseñar una lista vacía y dejar que la persona saque sus conclusiones.
 *
 * Cerrado por defecto: cada activación revalida y OLVIDA el resultado
 * anterior. Las transiciones viven en lib/estado-drive.ts (con sus tests);
 * aquí solo se conecta eso a React y a la red.
 */
export function useEstadoDrive(activo = true): EstadoDrive {
  const [estado, setEstado] = useState<EstadoDriveBase>(() => estadoInicial(activo));

  // El reset ocurre EN EL RENDER de la transición, no en un efecto: si se
  // esperara al efecto, el primer render tras reabrir aún vería el
  // `conectado` de la vez anterior y habilitaría consultas (y caché de otra
  // sesión) que quizá ya no corresponden.
  const [activoPrevio, setActivoPrevio] = useState(activo);
  if (activo !== activoPrevio) {
    setActivoPrevio(activo);
    setEstado((prev) => (activo ? alComprobar(prev) : alApagar(prev)));
  }

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    fetch(`${API_BASE}/drive/estado`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) // fallo de red = sin conexión confirmada, se ofrece el botón
      .then((d: { conectado?: unknown; conectar?: unknown } | null) => {
        if (vivo) setEstado((prev) => alResponder(prev, d));
      });
    return () => { vivo = false; };
  }, [activo]);

  return estado;
}

/**
 * Aviso + botón para autorizar Drive.
 *
 * `volverA` es la página desde la que se pide, para aterrizar de vuelta ahí y
 * no en /cuentas — que es exactamente donde la mitad del equipo no puede
 * entrar.
 */
export function ConectarDrive({
  volverA,
  motivo,
  compacto = false,
}: {
  volverA: "contratos" | "drive-hub" | "mis-tareas" | "videos" | "drive" | "cuentas";
  /** Qué se estaba intentando hacer, para que el aviso no sea genérico. */
  motivo?: string;
  compacto?: boolean;
}) {
  const [yendo, setYendo] = useState(false);
  const ir = () => {
    setYendo(true);
    // Navegación completa a propósito: es un flujo OAuth, no una ruta del SPA.
    window.location.href = `${API_BASE}/auth/drive?from=${volverA}`;
  };

  if (compacto) {
    return (
      <button
        type="button"
        onClick={ir}
        disabled={yendo}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
      >
        {yendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
        Conectar Google Drive
      </button>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <HardDrive className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="text-sm min-w-0">
        <p className="font-semibold text-amber-400">Falta autorizar Google Drive</p>
        <p className="text-muted-foreground mt-0.5">
          {motivo ? `${motivo} ` : ""}
          Tu cuenta todavía no dio el permiso. Volver a iniciar sesión no sirve: el acceso
          normal no lo pide.
        </p>
        <button
          type="button"
          onClick={ir}
          disabled={yendo}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-300 transition disabled:opacity-50"
        >
          {yendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
          Conectar Google Drive
        </button>
      </div>
    </div>
  );
}
