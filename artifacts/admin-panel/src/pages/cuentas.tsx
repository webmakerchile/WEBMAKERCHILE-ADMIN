import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { CheckCircle2, Loader2, Link2, Unlink, Info } from "lucide-react";
import { motion } from "framer-motion";
import { NETWORK_BG, NETWORK_LABELS, NetworkIcon, type Network } from "@/components/social-icons";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type AccountInfo = {
  loading: boolean;
  connected: boolean;
  message?: string;
  displayName?: string;
  handle?: string;
  picture?: string;
  meta?: string;
};

type Endpoints = {
  status: string;
  authUrl: string;
  disconnect: string | null;
};

type NetworkConfig = {
  network: Network;
  endpoints: Endpoints;
  description: string;
  serverManaged?: boolean;
  serverManagedNote?: string;
};

const NETWORKS: NetworkConfig[] = [
  {
    network: "facebook",
    endpoints: { status: "/facebook/status", authUrl: "/facebook/auth", disconnect: "/facebook/disconnect" },
    description: "Publica en tu Página de Facebook",
  },
  {
    network: "instagram",
    endpoints: { status: "/instagram/status", authUrl: "", disconnect: null },
    description: "Cuenta de Instagram Business vinculada a la Página",
    serverManaged: true,
    serverManagedNote:
      "Instagram requiere credenciales de Meta a nivel de servidor (INSTAGRAM_ACCESS_TOKEN). Pídele al administrador que las configure en los secretos del proyecto.",
  },
  {
    network: "linkedin",
    endpoints: { status: "/linkedin/status", authUrl: "/linkedin/auth", disconnect: "/linkedin/disconnect" },
    description: "Personal o Página de empresa",
  },
  {
    network: "x",
    endpoints: { status: "/x/status", authUrl: "/x/auth", disconnect: "/x/disconnect" },
    description: "Cuenta de X (Twitter)",
  },
  {
    network: "tiktok",
    endpoints: { status: "/tiktok/status", authUrl: "/tiktok/auth", disconnect: "/tiktok/disconnect" },
    description: "Modo sandbox: el video llega como borrador",
  },
  {
    network: "youtube",
    endpoints: { status: "/youtube/channel", authUrl: "/auth/google", disconnect: "/youtube/disconnect" },
    description: "Canal vinculado a tu cuenta de Google",
  },
];

type StatusPayload = {
  connected?: boolean;
  message?: string;
  channel?: {
    title?: string;
    thumbnail?: string;
    subscriberCount?: number | string;
    videoCount?: number | string;
  };
  user?: {
    displayName?: string;
    avatar?: string;
    name?: string;
    username?: string;
    picture?: string;
    orgUrn?: string;
  };
  account?: {
    name?: string;
    username?: string;
    profilePicture?: string;
    followersCount?: number;
    mediaCount?: number;
  };
  pageName?: string;
  pagePicture?: string;
};

function normalizeStatus(network: Network, raw: StatusPayload | null | undefined): AccountInfo {
  const base: AccountInfo = { loading: false, connected: !!raw?.connected, message: raw?.message };
  if (!raw || !base.connected) return base;
  if (network === "youtube" && raw.channel) {
    return {
      ...base,
      displayName: raw.channel.title,
      picture: raw.channel.thumbnail,
      meta: `${raw.channel.subscriberCount ?? 0} subs · ${raw.channel.videoCount ?? 0} videos`,
    };
  }
  if (network === "tiktok" && raw.user) {
    return {
      ...base,
      displayName: raw.user.displayName,
      picture: raw.user.avatar,
      meta: "Conectado (sandbox)",
    };
  }
  if (network === "instagram" && raw.account) {
    return {
      ...base,
      displayName: raw.account.name || raw.account.username,
      handle: raw.account.username ? `@${raw.account.username}` : undefined,
      picture: raw.account.profilePicture,
      meta: `${raw.account.followersCount ?? 0} seguidores · ${raw.account.mediaCount ?? 0} posts`,
    };
  }
  if (network === "linkedin" && raw.user) {
    return {
      ...base,
      displayName: raw.user.name,
      picture: raw.user.picture,
      meta: raw.user.orgUrn ? "Página de empresa" : "Perfil personal",
    };
  }
  if (network === "x" && raw.user) {
    return {
      ...base,
      displayName: raw.user.username ? `@${raw.user.username}` : raw.user.name,
      picture: raw.user.picture,
      meta: "Cuenta de X conectada",
    };
  }
  if (network === "facebook") {
    return {
      ...base,
      displayName: raw.pageName,
      picture: raw.pagePicture,
      meta: "Página de Facebook conectada",
    };
  }
  return base;
}

export default function CuentasPage() {
  const [accounts, setAccounts] = useState<Record<Network, AccountInfo>>(() => {
    const init: Record<string, AccountInfo> = {};
    for (const n of NETWORKS) init[n.network] = { loading: true, connected: false };
    return init as Record<Network, AccountInfo>;
  });

  const fetchOne = async (network: Network, endpoint: string) => {
    setAccounts((prev) => ({ ...prev, [network]: { ...prev[network], loading: true } }));
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, { credentials: "include" });
      const data = (await res.json()) as StatusPayload;
      setAccounts((prev) => ({ ...prev, [network]: normalizeStatus(network, data) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de conexión";
      console.error(`[cuentas] ${network} status fetch failed:`, message);
      setAccounts((prev) => ({
        ...prev,
        [network]: { loading: false, connected: false, message },
      }));
    }
  };

  useEffect(() => {
    NETWORKS.forEach((n) => fetchOne(n.network, n.endpoints.status));
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("facebook") === "connected" ||
      params.get("linkedin") === "connected" ||
      params.get("tiktok") === "connected" ||
      params.get("x") === "connected"
    ) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleDisconnect = async (network: Network, endpoint: string | null, statusEndpoint: string) => {
    if (!endpoint) return;
    if (!confirm(`¿Desconectar ${NETWORK_LABELS[network]}?`)) return;
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error(`[cuentas] ${network} disconnect failed:`, res.status, txt);
        alert(`No se pudo desconectar ${NETWORK_LABELS[network]}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      console.error(`[cuentas] ${network} disconnect error:`, message);
      alert(`Error desconectando ${NETWORK_LABELS[network]}: ${message}`);
    }
    fetchOne(network, statusEndpoint);
  };

  return (
    <Layout>
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Cuentas Sociales</h1>
          <p className="text-muted-foreground text-sm sm:text-lg">
            Conecta tus redes sociales para publicar y traer estadísticas a tu Inicio.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {NETWORKS.map(({ network, endpoints, description, serverManaged, serverManagedNote }, idx) => {
            const info = accounts[network];
            const authHref = endpoints.authUrl ? `${API_BASE}${endpoints.authUrl}` : "";
            return (
              <motion.div
                key={network}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="glass-card rounded-2xl p-5 border border-white/5"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${NETWORK_BG[network]}`}>
                    <NetworkIcon network={network} className="w-5 h-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-display font-bold leading-tight">{NETWORK_LABELS[network]}</h2>
                    <p className="text-xs text-muted-foreground truncate">{description}</p>
                  </div>
                </div>

                {info.loading ? (
                  <div className="h-20 rounded-xl bg-white/5 animate-pulse flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : info.connected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                      {info.picture ? (
                        <img src={info.picture} alt="" className="w-11 h-11 rounded-full flex-shrink-0 object-cover border border-white/10" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-semibold text-sm text-foreground truncate">
                            {info.displayName || info.handle || NETWORK_LABELS[network]}
                          </h3>
                          <span className="text-[10px] uppercase tracking-wide font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            Activo
                          </span>
                        </div>
                        {info.handle && info.displayName && info.handle !== info.displayName && (
                          <p className="text-xs text-muted-foreground truncate">{info.handle}</p>
                        )}
                        {info.meta && <p className="text-xs text-muted-foreground truncate">{info.meta}</p>}
                      </div>
                    </div>

                    {endpoints.disconnect ? (
                      <button
                        onClick={() => handleDisconnect(network, endpoints.disconnect, endpoints.status)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-sm transition"
                      >
                        <Unlink className="w-4 h-4" />
                        Desconectar
                      </button>
                    ) : (
                      <button
                        onClick={() => fetchOne(network, endpoints.status)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-muted-foreground hover:bg-white/5 text-sm transition"
                      >
                        <Loader2 className="w-4 h-4" />
                        Refrescar estado
                      </button>
                    )}
                    {serverManaged && (
                      <p className="text-[11px] text-muted-foreground/70 leading-relaxed flex items-start gap-1.5">
                        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{serverManagedNote || "Gestionada por el servidor"}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Link2 className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-amber-400">No conectado</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {info.message || "Sin sesión activa"}
                        </p>
                      </div>
                    </div>

                    {authHref ? (
                      <a
                        href={authHref}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground font-medium text-sm transition"
                      >
                        <Link2 className="w-4 h-4" />
                        Conectar
                      </a>
                    ) : serverManaged ? (
                      <p className="text-[11px] text-muted-foreground/70 leading-relaxed flex items-start gap-1.5 px-2">
                        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{serverManagedNote || "Configurar credenciales en los secretos del servidor."}</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/70 text-center px-2">
                        Sin método de conexión disponible.
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
