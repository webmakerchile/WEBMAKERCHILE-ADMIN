import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { CheckCircle2, Loader2, Link2, Unlink, Info, Building2, User, ChevronDown, Search } from "lucide-react";
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
    endpoints: { status: "/facebook/status", authUrl: "", disconnect: null },
    description: "Página de Facebook conectada a nivel servidor",
    serverManaged: true,
    serverManagedNote: "Facebook usa credenciales de System User permanentes configuradas en el servidor.",
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
    orgName?: string;
    orgLogo?: string;
    personalName?: string;
    personalPicture?: string;
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
      meta: raw.user.orgUrn
        ? `Página de empresa${raw.user.orgName ? ": " + raw.user.orgName : ""}`
        : "Perfil personal",
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

type LinkedInOrg = { urn: string; name: string; vanity?: string };

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
      if (network === "linkedin") setLinkedinRawStatus(data);
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

  const [linkedinOrgs, setLinkedinOrgs] = useState<LinkedInOrg[] | null>(null);
  const [linkedinOrgLoading, setLinkedinOrgLoading] = useState(false);
  const [linkedinOrgOpen, setLinkedinOrgOpen] = useState(false);
  const [linkedinRawStatus, setLinkedinRawStatus] = useState<StatusPayload | null>(null);
  const [linkedinSearch, setLinkedinSearch] = useState("");
  const [linkedinSearchLoading, setLinkedinSearchLoading] = useState(false);
  const [linkedinSearchResult, setLinkedinSearchResult] = useState<{ found: boolean; urn?: string; name?: string } | null>(null);
  const linkedinSearchRef = useRef<HTMLInputElement>(null);

  const fetchLinkedInOrgs = async () => {
    setLinkedinOrgLoading(true);
    try {
      const res = await fetch(`${API_BASE}/linkedin/organizations`, { credentials: "include" });
      const data = await res.json();
      setLinkedinOrgs(data.organizations || []);
    } catch {
      setLinkedinOrgs([]);
    } finally {
      setLinkedinOrgLoading(false);
    }
  };

  const searchLinkedInOrg = async () => {
    if (!linkedinSearch.trim()) return;
    setLinkedinSearchLoading(true);
    setLinkedinSearchResult(null);
    try {
      const res = await fetch(`${API_BASE}/linkedin/find-org?vanityName=${encodeURIComponent(linkedinSearch.trim())}`, { credentials: "include" });
      const data = await res.json();
      setLinkedinSearchResult(data);
    } catch {
      setLinkedinSearchResult({ found: false });
    } finally {
      setLinkedinSearchLoading(false);
    }
  };

  const selectLinkedInOrg = async (urn: string | null) => {
    await fetch(`${API_BASE}/linkedin/select-org`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgUrn: urn }),
    });
    setLinkedinOrgOpen(false);
    setLinkedinOrgs(null);
    fetchOne("linkedin", "/linkedin/status");
  };

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

                    {network === "linkedin" && (
                      <div>
                        <button
                          onClick={() => {
                            setLinkedinOrgOpen((o) => !o);
                            if (!linkedinOrgs) fetchLinkedInOrgs();
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 text-sm transition mb-2"
                        >
                          <Building2 className="w-4 h-4" />
                          Cambiar identidad de publicación
                          <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${linkedinOrgOpen ? "rotate-180" : ""}`} />
                        </button>

                        {linkedinOrgOpen && (
                          <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2 mb-2">
                            {linkedinOrgLoading ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Buscando páginas...
                              </div>
                            ) : (
                              <>
                                <p className="text-[11px] text-muted-foreground mb-2">Elige cómo publicar en LinkedIn:</p>
                                <button
                                  onClick={() => selectLinkedInOrg(null)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition border ${
                                    !linkedinRawStatus?.user?.orgUrn
                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                      : "border-white/10 hover:bg-white/5 text-muted-foreground"
                                  }`}
                                >
                                  <User className="w-4 h-4 flex-shrink-0" />
                                  <span className="truncate">{linkedinRawStatus?.user?.personalName || "Perfil personal"}</span>
                                  {!linkedinRawStatus?.user?.orgUrn && <CheckCircle2 className="w-3 h-3 ml-auto text-emerald-400" />}
                                </button>

                                {linkedinOrgs && linkedinOrgs.length > 0 ? (
                                  linkedinOrgs.map((org) => (
                                    <button
                                      key={org.urn}
                                      onClick={() => selectLinkedInOrg(org.urn)}
                                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition border ${
                                        linkedinRawStatus?.user?.orgUrn === org.urn
                                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                          : "border-white/10 hover:bg-white/5 text-muted-foreground"
                                      }`}
                                    >
                                      <Building2 className="w-4 h-4 flex-shrink-0" />
                                      <span className="truncate">{org.name}</span>
                                      {linkedinRawStatus?.user?.orgUrn === org.urn && <CheckCircle2 className="w-3 h-3 ml-auto text-emerald-400" />}
                                    </button>
                                  ))
                                ) : linkedinOrgs !== null ? (
                                  <div className="space-y-2 pt-1">
                                    <p className="text-[11px] text-muted-foreground px-1 leading-relaxed">
                                      Ingresa la URL o nombre de tu Página de empresa en LinkedIn:
                                    </p>
                                    <div className="flex gap-2">
                                      <input
                                        ref={linkedinSearchRef}
                                        type="text"
                                        value={linkedinSearch}
                                        onChange={(e) => { setLinkedinSearch(e.target.value); setLinkedinSearchResult(null); }}
                                        onKeyDown={(e) => e.key === "Enter" && searchLinkedInOrg()}
                                        placeholder="webmakerchile o linkedin.com/company/..."
                                        className="flex-1 text-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-blue-500/50"
                                      />
                                      <button
                                        onClick={searchLinkedInOrg}
                                        disabled={linkedinSearchLoading || !linkedinSearch.trim()}
                                        className="px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 transition disabled:opacity-40"
                                      >
                                        {linkedinSearchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                      </button>
                                    </div>
                                    {linkedinSearchResult && (
                                      linkedinSearchResult.found && linkedinSearchResult.urn ? (
                                        <button
                                          onClick={() => selectLinkedInOrg(linkedinSearchResult.urn!)}
                                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10 transition"
                                        >
                                          <Building2 className="w-4 h-4 flex-shrink-0" />
                                          <span className="truncate">{linkedinSearchResult.name}</span>
                                          <span className="ml-auto text-[10px] text-emerald-400">Seleccionar →</span>
                                        </button>
                                      ) : (
                                        <p className="text-[11px] text-amber-400/80 px-1">
                                          No se encontró esa página. Verifica el nombre exacto en linkedin.com/company/...
                                        </p>
                                      )
                                    )}
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

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
