import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useOnline } from "@/hooks/use-online";

export function ConnectionBanner() {
  const online = useOnline();
  const [showRecovered, setShowRecovered] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      setShowRecovered(false);
      return;
    }
    if (wasOffline) {
      setShowRecovered(true);
      const t = setTimeout(() => setShowRecovered(false), 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [online, wasOffline]);

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-medium shadow-lg backdrop-blur-md inline-flex items-center gap-2"
      >
        <WifiOff className="w-3.5 h-3.5" />
        <span>Sin conexión. Reconectando…</span>
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      </div>
    );
  }

  if (showRecovered) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs font-medium shadow-lg backdrop-blur-md inline-flex items-center gap-2"
      >
        <span>Conexión restablecida</span>
      </div>
    );
  }

  return null;
}
