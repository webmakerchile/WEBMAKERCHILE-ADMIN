import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Smartphone } from "lucide-react";

const VISITS_KEY = "wma.visits.count";
const DISMISSED_KEY = "wma.install.dismissed";
const VISITS_THRESHOLD = 2;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS legacy flag
  return Boolean((navigator as unknown as { standalone?: boolean }).standalone);
}

export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // Track visits (per-day to avoid inflating counts on SPAs that re-mount).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInstalled()) return;
    const today = new Date().toISOString().slice(0, 10);
    let raw: { count: number; lastDay: string };
    try {
      raw = JSON.parse(localStorage.getItem(VISITS_KEY) || "") as typeof raw;
      if (!raw || typeof raw.count !== "number") throw new Error();
    } catch {
      raw = { count: 0, lastDay: "" };
    }
    if (raw.lastDay !== today) {
      raw = { count: raw.count + 1, lastDay: today };
      localStorage.setItem(VISITS_KEY, JSON.stringify(raw));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInstalled()) return;
    if (!isMobileViewport()) return;
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;

    const visits = (() => {
      try {
        return JSON.parse(localStorage.getItem(VISITS_KEY) || "{}").count || 0;
      } catch {
        return 0;
      }
    })();

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (visits >= VISITS_THRESHOLD) setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // iOS Safari has no beforeinstallprompt — show a hint after the threshold.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (deferred) return;
    if (isInstalled()) return;
    if (!isMobileViewport()) return;
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream;
    if (!isIOS) return;
    const visits = (() => {
      try {
        return JSON.parse(localStorage.getItem(VISITS_KEY) || "{}").count || 0;
      } catch {
        return 0;
      }
    })();
    if (visits >= VISITS_THRESHOLD) setVisible(true);
  }, [deferred]);

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== "undefined") localStorage.setItem(DISMISSED_KEY, "1");
  };

  const install = async () => {
    if (!deferred) {
      // iOS fallback: just dismiss after the user reads the hint.
      dismiss();
      return;
    }
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted" || choice.outcome === "dismissed") {
        dismiss();
      }
    } catch {
      dismiss();
    }
  };

  const isIOSHint = !deferred;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
          className="lg:hidden fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-50 bg-card border border-foreground/10 rounded-2xl shadow-2xl p-4 backdrop-blur-xl"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0))" }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm">Instala WebMakerAdmin</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isIOSHint
                  ? "Toca el botón Compartir y elige “Agregar a inicio”."
                  : "Acceso directo desde tu pantalla de inicio."}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={install}
                  className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-xs flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isIOSHint ? "Entendido" : "Instalar"}
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/10 text-xs"
                >
                  Más tarde
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="p-1 rounded-md text-muted-foreground/70 hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
