import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { AlertTriangle, X, ExternalLink } from "lucide-react";
import { NETWORK_LABELS, type Network } from "@/components/social-icons";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type ConnectionState = "connected" | "expiring" | "expired" | "revoked" | "disconnected" | "unknown";

type ConnectionHealth = {
  network: Network;
  connected: boolean;
  state: ConnectionState;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  message: string;
  reconnectUrl: string | null;
  serverManaged: boolean;
};

const SESSION_KEY = "dashboard.connectionHealthDismissed";

function useConnectionsHealth() {
  return useQuery<ConnectionHealth[]>({
    queryKey: ["connections-health"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/connections/health`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      return data.connections || [];
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function ConnectionHealthBanner() {
  const { data } = useConnectionsHealth();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });

  const problems = (data || []).filter((c) => c.state === "expired" || c.state === "expiring" || c.state === "revoked");

  if (dismissed || problems.length === 0) return null;

  const hasExpired = problems.some((p) => p.state === "expired" || p.state === "revoked");
  const tone = hasExpired
    ? { border: "border-rose-500/40", bg: "bg-rose-500/10", icon: "text-rose-400", title: "text-rose-300", body: "text-rose-200/80", chip: "bg-rose-500/20 hover:bg-rose-500/30 text-rose-200" }
    : { border: "border-amber-500/40", bg: "bg-amber-500/10", icon: "text-amber-400", title: "text-amber-300", body: "text-amber-200/80", chip: "bg-amber-500/20 hover:bg-amber-500/30 text-amber-200" };

  function dismiss() {
    try { window.sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border ${tone.border} ${tone.bg} px-4 py-3`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 ${tone.icon} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${tone.title}`}>
            {hasExpired
              ? `${problems.length} ${problems.length === 1 ? "conexión necesita" : "conexiones necesitan"} reconexión`
              : `${problems.length} ${problems.length === 1 ? "conexión está" : "conexiones están"} por expirar`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {problems.slice(0, 4).map((p) => (
              <li key={p.network} className={`flex items-center gap-2 text-xs ${tone.body}`}>
                <span className="font-medium truncate flex-1">
                  {NETWORK_LABELS[p.network]}
                  {p.state === "expiring" && p.daysUntilExpiry != null && (
                    <span className="opacity-70 ml-1">— caduca en {p.daysUntilExpiry}d</span>
                  )}
                  {p.state === "expired" && <span className="opacity-70 ml-1">— expirada</span>}
                  {p.state === "revoked" && <span className="opacity-70 ml-1">— revocada</span>}
                </span>
                <Link
                  to="/cuentas"
                  className={`flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded transition ${tone.chip}`}
                >
                  Reconectar <ExternalLink className="w-3 h-3" />
                </Link>
              </li>
            ))}
            {problems.length > 4 && (
              <li className={`text-[11px] ${tone.body} opacity-70`}>y {problems.length - 4} más…</li>
            )}
          </ul>
        </div>
        <button
          onClick={dismiss}
          className={`${tone.body} hover:opacity-100 opacity-70 transition flex-shrink-0`}
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
