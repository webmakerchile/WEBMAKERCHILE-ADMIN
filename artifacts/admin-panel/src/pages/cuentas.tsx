import { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { CheckCircle2, Loader2, Link2, Unlink, Info, Building2, User, ChevronDown, Search, Sparkles, Save } from "lucide-react";
import { motion } from "framer-motion";
import { NETWORK_BG, NETWORK_LABELS, NetworkIcon, type Network } from "@/components/social-icons";
import { HelpHint } from "@/components/help-hint";
import { EmptyState } from "@/components/empty-state";
import { useLang } from "@/lib/lang";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type ConnectionState = "connected" | "expiring" | "expired" | "revoked" | "disconnected" | "unknown";

type AccountInfo = {
  loading: boolean;
  connected: boolean;
  message?: string;
  displayName?: string;
  handle?: string;
  picture?: string;
  meta?: string;
  state?: ConnectionState;
  expiresAt?: string | null;
  daysUntilExpiry?: number | null;
};

type HealthPayload = {
  connections: Array<{
    network: Network;
    connected: boolean;
    state: ConnectionState;
    expiresAt: string | null;
    daysUntilExpiry: number | null;
    message: string;
    reconnectUrl: string | null;
    serverManaged: boolean;
  }>;
};

type StateBadgeMap = Record<ConnectionState, { label: string; cls: string } | null>;

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

const NETWORK_ENDPOINTS: Record<Network, { status: string; authUrl: string; disconnect: string | null; serverManaged?: boolean }> = {
  facebook: { status: "/facebook/status", authUrl: "", disconnect: null, serverManaged: true },
  instagram: { status: "/instagram/status", authUrl: "", disconnect: null, serverManaged: true },
  linkedin: { status: "/linkedin/status", authUrl: "/linkedin/auth", disconnect: "/linkedin/disconnect" },
  x: { status: "/x/status", authUrl: "/x/auth", disconnect: "/x/disconnect" },
  tiktok: { status: "/tiktok/status", authUrl: "/tiktok/auth", disconnect: "/tiktok/disconnect" },
  youtube: { status: "/youtube/channel", authUrl: "/auth/google", disconnect: "/youtube/disconnect" },
};
const NETWORK_ORDER: Network[] = ["facebook", "instagram", "linkedin", "x", "tiktok", "youtube"];

type BrandToneState = {
  voice: string;
  persona: string;
  values: string;
  avoidWords: string;
  examples: string;
};

const EMPTY_TONE: BrandToneState = {
  voice: "",
  persona: "",
  values: "",
  avoidWords: "",
  examples: "",
};

function BrandToneSection() {
  const [tone, setTone] = useState<BrandToneState>(EMPTY_TONE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/settings/brand-tone`, { credentials: "include" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as Partial<BrandToneState>;
        if (cancelled) return;
        setTone({
          voice: data.voice || "",
          persona: data.persona || "",
          values: data.values || "",
          avoidWords: data.avoidWords || "",
          examples: data.examples || "",
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/settings/brand-tone`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tone),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as Partial<BrandToneState>;
      setTone({
        voice: data.voice || "",
        persona: data.persona || "",
        values: data.values || "",
        avoidWords: data.avoidWords || "",
        examples: data.examples || "",
      });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const isFilled =
    !!(tone.voice || tone.persona || tone.values || tone.avoidWords || tone.examples);

  return (
    <section className="rounded-2xl border border-foreground/10 bg-card/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-foreground/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
              Tono de marca
              {isFilled ? (
                <span className="text-[10px] uppercase tracking-wide bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded-full">
                  Activo
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wide bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded-full">
                  Sin configurar
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground line-clamp-1">
              La IA usará esta guía al generar descripciones, hashtags e insights.
            </p>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-foreground/5 pt-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : (
            <>
              <BrandToneField
                label="Voz / tono general"
                placeholder="Cercano y didáctico, sin jerga, con humor seco. Usar tuteo."
                value={tone.voice}
                onChange={(v) => setTone((s) => ({ ...s, voice: v }))}
                max={280}
              />
              <BrandToneField
                label="Persona / quién habla"
                placeholder="Una agencia chilena de desarrollo web que explica cosas como un colega senior."
                value={tone.persona}
                onChange={(v) => setTone((s) => ({ ...s, persona: v }))}
                max={280}
              />
              <BrandToneField
                label="Valores y temas que defendemos"
                placeholder="Calidad técnica, soluciones reales para PYMEs, código mantenible, sin BS."
                value={tone.values}
                onChange={(v) => setTone((s) => ({ ...s, values: v }))}
                max={500}
                rows={2}
              />
              <BrandToneField
                label="Palabras o expresiones a evitar"
                placeholder="No usar: 'sinergia', 'disruptivo', emojis exagerados, mayúsculas en todo."
                value={tone.avoidWords}
                onChange={(v) => setTone((s) => ({ ...s, avoidWords: v }))}
                max={500}
                rows={2}
              />
              <BrandToneField
                label="Ejemplos de copy aprobado (opcional)"
                placeholder={"Pega 1 o 2 descripciones tuyas que reflejen el estilo perfecto.\nLa IA imitará el tono de estos ejemplos."}
                value={tone.examples}
                onChange={(v) => setTone((s) => ({ ...s, examples: v }))}
                max={1500}
                rows={4}
              />

              {error && (
                <p className="text-xs text-rose-300">{error}</p>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-[11px] text-muted-foreground">
                  {savedAt ? `Guardado ${new Date(savedAt).toLocaleTimeString()}` : "Cambios sin guardar se perderán al recargar."}
                </p>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground text-sm font-medium transition disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar tono de marca
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function BrandToneField({
  label,
  placeholder,
  value,
  onChange,
  max,
  rows = 1,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  rows?: number;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground/60">{value.length}/{max}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-background border border-foreground/10 rounded-lg px-3 py-2 text-sm focus:border-primary outline-none resize-y leading-snug"
      />
    </label>
  );
}

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

type TT = ReturnType<typeof import("@/lib/lang").useLang>["t"];

function normalizeStatus(network: Network, raw: StatusPayload | null | undefined, t: TT): AccountInfo {
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
      meta: t.tiktokSandbox,
    };
  }
  if (network === "instagram" && raw.account) {
    return {
      ...base,
      displayName: raw.account.name || raw.account.username,
      handle: raw.account.username ? `@${raw.account.username}` : undefined,
      picture: raw.account.profilePicture,
      meta: `${raw.account.followersCount ?? 0} ${t.followers} · ${raw.account.mediaCount ?? 0} ${t.posts}`,
    };
  }
  if (network === "linkedin" && raw.user) {
    return {
      ...base,
      displayName: raw.user.name,
      picture: raw.user.picture,
      meta: raw.user.orgUrn
        ? `${t.linkedinCompanyPageMeta}${raw.user.orgName ? ": " + raw.user.orgName : ""}`
        : t.linkedinPersonalMeta,
    };
  }
  if (network === "x" && raw.user) {
    return {
      ...base,
      displayName: raw.user.username ? `@${raw.user.username}` : raw.user.name,
      picture: raw.user.picture,
      meta: t.xConnected,
    };
  }
  if (network === "facebook") {
    return {
      ...base,
      displayName: raw.pageName,
      picture: raw.pagePicture,
      meta: t.fbConnected,
    };
  }
  return base;
}

type LinkedInOrg = { urn: string; name: string; vanity?: string };

export default function CuentasPage() {
  const { t } = useLang();

  const STATE_BADGE: StateBadgeMap = {
    connected: { label: t.badgeActive, cls: "text-emerald-400 bg-emerald-500/10" },
    expiring: { label: t.badgeExpiring, cls: "text-amber-300 bg-amber-500/15" },
    expired: { label: t.badgeExpired, cls: "text-rose-300 bg-rose-500/15" },
    revoked: { label: t.badgeRevoked, cls: "text-rose-300 bg-rose-500/15" },
    disconnected: null,
    unknown: { label: t.badgeUnknown, cls: "text-muted-foreground bg-foreground/5" },
  };

  const NETWORKS_CONFIG = NETWORK_ORDER.map((network) => ({
    network,
    endpoints: NETWORK_ENDPOINTS[network],
    description: {
      facebook: t.descFacebook,
      instagram: t.descInstagram,
      linkedin: t.descLinkedin,
      x: t.descX,
      tiktok: t.descTiktok,
      youtube: t.descYoutube,
    }[network],
    serverManaged: NETWORK_ENDPOINTS[network].serverManaged,
    serverManagedNote: {
      facebook: t.noteFacebook,
      instagram: t.noteInstagram,
    }[network as "facebook" | "instagram"],
  }));

  const [accounts, setAccounts] = useState<Record<Network, AccountInfo>>(() => {
    const init: Record<string, AccountInfo> = {};
    for (const n of NETWORK_ORDER) init[n] = { loading: true, connected: false };
    return init as Record<Network, AccountInfo>;
  });

  const fetchOne = async (network: Network, endpoint: string) => {
    setAccounts((prev) => ({ ...prev, [network]: { ...prev[network], loading: true } }));
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, { credentials: "include" });
      const data = (await res.json()) as StatusPayload;
      if (network === "linkedin") setLinkedinRawStatus(data);
      const normalized = normalizeStatus(network, data, t);
      setAccounts((prev) => ({
        ...prev,
        [network]: {
          ...prev[network],
          ...normalized,
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de conexión";
      console.error(`[cuentas] ${network} status fetch failed:`, message);
      setAccounts((prev) => ({
        ...prev,
        [network]: { ...prev[network], loading: false, connected: false, message },
      }));
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/connections/health`, { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as HealthPayload;
      setAccounts((prev) => {
        const next = { ...prev };
        for (const c of data.connections || []) {
          const existing = next[c.network] || { loading: false, connected: false };
          next[c.network] = {
            ...existing,
            state: c.state,
            expiresAt: c.expiresAt,
            daysUntilExpiry: c.daysUntilExpiry,
            // Use health message when the per-network status didn't already
            // populate a friendlier one.
            message: existing.message || c.message,
          };
        }
        return next;
      });
    } catch (err) {
      console.warn("[cuentas] health fetch failed:", err);
    }
  };

  useEffect(() => {
    NETWORK_ORDER.forEach((network) => fetchOne(network, NETWORK_ENDPOINTS[network].status));
    fetchHealth();
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
    if (!confirm(`${t.cuentasDisconnect} ${NETWORK_LABELS[network]}?`)) return;
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error(`[cuentas] ${network} disconnect failed:`, res.status, txt);
        alert(`${t.cuentasDisconnect} ${NETWORK_LABELS[network]} failed`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      console.error(`[cuentas] ${network} disconnect error:`, message);
      alert(`${NETWORK_LABELS[network]}: ${message}`);
    }
    fetchOne(network, statusEndpoint);
  };

  const anyLoading = Object.values(accounts).some((a) => a.loading);
  const noNetworksConnected = useMemo(
    () => !anyLoading && Object.values(accounts).every((a) => !a.connected),
    [accounts, anyLoading],
  );

  return (
    <Layout>
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1 flex items-center gap-2">
            {t.cuentasTitle}
            <HelpHint
              text={t.cuentasHint}
              side="bottom"
            />
          </h1>
          <p className="text-muted-foreground text-sm sm:text-lg">
            {t.cuentasSubtitle}
          </p>
        </header>

        <BrandToneSection />

        {noNetworksConnected && (
          <EmptyState
            icon={Link2}
            title={t.cuentasNoConnected}
            description={t.cuentasNoConnectedDesc}
            size="sm"
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {NETWORKS_CONFIG.map(({ network, endpoints, description, serverManaged, serverManagedNote }, idx) => {
            const info = accounts[network];
            const authHref = endpoints.authUrl ? `${API_BASE}${endpoints.authUrl}` : "";
            return (
              <motion.div
                key={network}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="glass-card rounded-2xl p-5 border border-foreground/10"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${NETWORK_BG[network]}`}>
                    <NetworkIcon network={network} className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-display font-bold leading-tight flex items-center gap-1.5">
                      {NETWORK_LABELS[network]}
                      {serverManaged && (
                        <HelpHint
                          text={serverManagedNote || "Esta red usa credenciales del servidor configuradas por el administrador."}
                          side="right"
                        />
                      )}
                    </h2>
                    <p className="text-xs text-muted-foreground truncate">{description}</p>
                  </div>
                </div>

                {info.loading ? (
                  <div className="h-20 rounded-xl bg-foreground/5 animate-pulse flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (info.connected || info.state === "expired" || info.state === "revoked") ? (
                  // Render the "connected" card branch even when health says
                  // !connected but the state is expired/revoked, so the user
                  // sees the semáforo (Expirada/Revocada badge) and the
                  // "Reconectar ahora" CTA instead of falling back to the
                  // generic "No conectado" card.
                  (() => {
                    const state: ConnectionState = info.state || "connected";
                    const isWarn = state === "expiring";
                    const isFail = state === "expired" || state === "revoked";
                    const cardCls = isFail
                      ? "border-rose-500/30 bg-rose-500/5"
                      : isWarn
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-emerald-500/20 bg-emerald-500/5";
                    const badge = STATE_BADGE[state];
                    return (
                  <div className="space-y-3">
                    <div className={`flex items-center gap-3 p-3 rounded-xl border ${cardCls}`}>
                      {info.picture ? (
                        <img src={info.picture} alt="" className="w-11 h-11 rounded-full flex-shrink-0 object-cover border border-foreground/10" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-semibold text-sm text-foreground truncate">
                            {info.displayName || info.handle || NETWORK_LABELS[network]}
                          </h3>
                          {badge && (
                            <span className={`text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded ${badge.cls}`}>
                              {badge.label}
                            </span>
                          )}
                        </div>
                        {info.handle && info.displayName && info.handle !== info.displayName && (
                          <p className="text-xs text-muted-foreground truncate">{info.handle}</p>
                        )}
                        {info.meta && <p className="text-xs text-muted-foreground truncate">{info.meta}</p>}
                        {info.expiresAt && (state === "connected" || state === "expiring" || state === "expired") && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {t.expiresOn} {new Date(info.expiresAt).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}
                          </p>
                        )}
                        {state === "expiring" && info.daysUntilExpiry != null && (
                          <p className="text-[11px] text-amber-300/90 mt-1">
                            {t.expiringSoon(info.daysUntilExpiry)}
                          </p>
                        )}
                        {(state === "expired" || state === "revoked") && (
                          <p className="text-[11px] text-rose-300/90 mt-1">
                            {t.sessionInvalid}
                          </p>
                        )}
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
                          {t.linkedinChangeIdentity}
                          <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${linkedinOrgOpen ? "rotate-180" : ""}`} />
                        </button>

                        {linkedinOrgOpen && (
                          <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-3 space-y-2 mb-2">
                            {linkedinOrgLoading ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {t.linkedinSearching}
                              </div>
                            ) : (
                              <>
                                <p className="text-[11px] text-muted-foreground mb-2">{t.linkedinChooseHow}</p>
                                <button
                                  onClick={() => selectLinkedInOrg(null)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition border ${
                                    !linkedinRawStatus?.user?.orgUrn
                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                      : "border-foreground/10 hover:bg-foreground/5 text-muted-foreground"
                                  }`}
                                >
                                  <User className="w-4 h-4 flex-shrink-0" />
                                  <span className="truncate">{linkedinRawStatus?.user?.personalName || t.linkedinPersonal}</span>
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
                                          : "border-foreground/10 hover:bg-foreground/5 text-muted-foreground"
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
                                      {t.linkedinEnterPage}
                                    </p>
                                    <div className="flex gap-2">
                                      <input
                                        ref={linkedinSearchRef}
                                        type="text"
                                        value={linkedinSearch}
                                        onChange={(e) => { setLinkedinSearch(e.target.value); setLinkedinSearchResult(null); }}
                                        onKeyDown={(e) => e.key === "Enter" && searchLinkedInOrg()}
                                        placeholder="webmakerchile o linkedin.com/company/..."
                                        className="flex-1 text-xs bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-blue-500/50"
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
                                          <span className="ml-auto text-[10px] text-emerald-400">{t.linkedinSelect}</span>
                                        </button>
                                      ) : (
                                        <p className="text-[11px] text-amber-400/80 px-1">
                                          {t.linkedinNotFound}
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

                    {(state === "expired" || state === "revoked" || state === "expiring") && authHref && (
                      <a
                        href={authHref}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground font-medium text-sm transition"
                      >
                        <Link2 className="w-4 h-4" />
                        {t.cuentasReconnect}
                      </a>
                    )}

                    {endpoints.disconnect ? (
                      <button
                        onClick={() => handleDisconnect(network, endpoints.disconnect, endpoints.status)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-sm transition"
                      >
                        <Unlink className="w-4 h-4" />
                        {t.cuentasDisconnect}
                      </button>
                    ) : (
                      <button
                        onClick={() => { fetchOne(network, endpoints.status); fetchHealth(); }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-foreground/10 text-muted-foreground hover:bg-foreground/5 text-sm transition"
                      >
                        <Loader2 className="w-4 h-4" />
                        {t.cuentasRefresh}
                      </button>
                    )}
                  </div>
                  );
                  })()
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Link2 className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-amber-400">{t.cuentasNotConnected}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {info.message || t.cuentasNoSession}
                        </p>
                      </div>
                    </div>

                    {authHref ? (
                      <a
                        href={authHref}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground font-medium text-sm transition"
                      >
                        <Link2 className="w-4 h-4" />
                        {t.cuentasConnect}
                      </a>
                    ) : serverManaged ? (
                      <p className="text-[11px] text-muted-foreground/70 leading-relaxed flex items-start gap-1.5 px-2">
                        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>{serverManagedNote || t.cuentasServerManaged}</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/70 text-center px-2">
                        {t.cuentasNoMethod}
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
