import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { isPushSupported, getCurrentSubscription, subscribeToPush } from "@/lib/push-notifications";

const DISMISS_KEY = "wm_push_banner_dismissed_v1";

/**
 * Banner "Activar notificaciones": aparece cuando el navegador soporta push,
 * el permiso no está denegado y esta sesión aún no registró una suscripción.
 * Se puede descartar (persistido en localStorage).
 */
export function PushEnableBanner({ className = "" }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!isPushSupported()) return;
        if (localStorage.getItem(DISMISS_KEY) === "1") return;
        if (Notification.permission === "denied") return;
        const sub = await getCurrentSubscription();
        if (!sub && mounted) setVisible(true);
      } catch {
        /* ignore */
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!visible) return null;

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await subscribeToPush();
      if (r.ok) {
        setVisible(false);
      } else {
        setError(r.reason || "No se pudo activar");
      }
    } catch {
      setError("No se pudo activar");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div className={`flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 ${className}`}>
      <BellRing className="w-4 h-4 text-primary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">Activa las notificaciones</p>
        <p className="text-xs text-muted-foreground leading-tight mt-0.5">
          Recibe un aviso en este dispositivo cuando te asignen tareas o venzan plazos.
        </p>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
      <button
        onClick={enable}
        disabled={busy}
        className="flex-shrink-0 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {busy ? "Activando…" : "Activar"}
      </button>
      <button
        onClick={dismiss}
        className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
        aria-label="Descartar"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
