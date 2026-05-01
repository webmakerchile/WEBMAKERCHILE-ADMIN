import { useState, useEffect } from "react";
import { 
  useListVideos, 
  useCheckScheduledVideos 
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { 
  Video, 
  ImageIcon, 
  CalendarCheck, 
  Clock, 
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

export default function Dashboard() {
  const { data: videos, isLoading } = useListVideos();
  const checkSchedule = useCheckScheduledVideos();
  const [ytChannel, setYtChannel] = useState<any>(null);
  const [ytLoading, setYtLoading] = useState(true);
  const [tiktokStatus, setTiktokStatus] = useState<any>(null);
  const [tiktokLoading, setTiktokLoading] = useState(true);
  const [igStatus, setIgStatus] = useState<any>(null);
  const [igLoading, setIgLoading] = useState(true);
  const [linkedinStatus, setLinkedinStatus] = useState<any>(null);
  const [linkedinLoading, setLinkedinLoading] = useState(true);
  const [linkedinOrgs, setLinkedinOrgs] = useState<any[]>([]);
  const [linkedinOrgsLoading, setLinkedinOrgsLoading] = useState(false);
  const [xStatus, setXStatus] = useState<any>(null);
  const [xLoading, setXLoading] = useState(true);

  const refreshLinkedin = () => {
    setLinkedinLoading(true);
    fetch(`${API_BASE}/linkedin/status`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setLinkedinStatus(data))
      .catch(() => setLinkedinStatus({ connected: false, message: "Error de conexión" }))
      .finally(() => setLinkedinLoading(false));
  };
  const refreshX = () => {
    setXLoading(true);
    fetch(`${API_BASE}/x/status`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setXStatus(data))
      .catch(() => setXStatus({ connected: false, message: "Error de conexión" }))
      .finally(() => setXLoading(false));
  };
  const disconnectLinkedin = async () => {
    if (!confirm("¿Desconectar LinkedIn?")) return;
    await fetch(`${API_BASE}/linkedin/disconnect`, { method: "POST", credentials: "include" });
    setLinkedinOrgs([]);
    refreshLinkedin();
  };
  const disconnectX = async () => {
    if (!confirm("¿Desconectar X?")) return;
    await fetch(`${API_BASE}/x/disconnect`, { method: "POST", credentials: "include" });
    refreshX();
  };
  const loadLinkedinOrgs = async () => {
    setLinkedinOrgsLoading(true);
    try {
      const r = await fetch(`${API_BASE}/linkedin/organizations`, { credentials: "include" });
      const data = await r.json();
      setLinkedinOrgs(data.organizations || []);
    } catch {
      setLinkedinOrgs([]);
    } finally {
      setLinkedinOrgsLoading(false);
    }
  };
  const selectLinkedinOrg = async (orgUrn: string | null) => {
    await fetch(`${API_BASE}/linkedin/select-org`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgUrn }),
    });
    refreshLinkedin();
  };

  useEffect(() => {
    fetch(`${API_BASE}/youtube/channel`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setYtChannel(data))
      .catch(() => setYtChannel({ connected: false, message: "Error de conexión" }))
      .finally(() => setYtLoading(false));

    fetch(`${API_BASE}/tiktok/status`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setTiktokStatus(data))
      .catch(() => setTiktokStatus({ connected: false, message: "Error de conexión" }))
      .finally(() => setTiktokLoading(false));

    fetch(`${API_BASE}/instagram/status`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setIgStatus(data))
      .catch(() => setIgStatus({ connected: false, message: "Error de conexión" }))
      .finally(() => setIgLoading(false));

    fetch(`${API_BASE}/linkedin/status`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setLinkedinStatus(data))
      .catch(() => setLinkedinStatus({ connected: false, message: "Error de conexión" }))
      .finally(() => setLinkedinLoading(false));

    fetch(`${API_BASE}/x/status`, { credentials: "include" })
      .then(r => r.json())
      .then(data => setXStatus(data))
      .catch(() => setXStatus({ connected: false, message: "Error de conexión" }))
      .finally(() => setXLoading(false));

    const params = new URLSearchParams(window.location.search);
    if (
      params.get("tiktok") === "connected" ||
      params.get("linkedin") === "connected" ||
      params.get("x") === "connected"
    ) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const stats = [
    {
      title: "Total Videos",
      value: videos?.length || 0,
      icon: Video,
      color: "from-blue-500/20 to-indigo-500/20",
      textColor: "text-blue-400"
    },
    {
      title: "Portadas Generadas",
      value: videos?.filter(v => v.status === "cover_generated").length || 0,
      icon: ImageIcon,
      color: "from-purple-500/20 to-pink-500/20",
      textColor: "text-purple-400"
    },
    {
      title: "Programados",
      value: videos?.filter(v => v.status === "scheduled").length || 0,
      icon: Clock,
      color: "from-orange-500/20 to-amber-500/20",
      textColor: "text-primary"
    },
    {
      title: "Publicados",
      value: videos?.filter(v => v.status === "published").length || 0,
      icon: CalendarCheck,
      color: "from-emerald-500/20 to-teal-500/20",
      textColor: "text-emerald-400"
    }
  ];

  const handleProcessSchedule = () => {
    checkSchedule.mutate(undefined, {
      onSuccess: () => {
        // Simple alert for now, could use a proper toast notification
        alert("Proceso de programación ejecutado correctamente.");
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Panel de Control</h1>
            <p className="text-muted-foreground text-sm sm:text-lg">Resumen de tu contenido y automatizaciones.</p>
          </div>
          
          <button
            onClick={handleProcessSchedule}
            disabled={checkSchedule.isPending}
            className="flex items-center justify-center px-4 py-2.5 sm:px-6 sm:py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all group disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 ${checkSchedule.isPending ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
            {checkSchedule.isPending ? "Procesando..." : "Forzar Programación"}
          </button>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={stat.title}
                  className="glass-card rounded-2xl p-6 relative overflow-hidden group"
                >
                  <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br ${stat.color} blur-2xl group-hover:scale-150 transition-transform duration-500`} />
                  
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className={`p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 ${stat.textColor}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>
                  
                  <div className="relative z-10">
                    <h3 className="text-3xl font-bold text-foreground mb-1">{stat.value}</h3>
                    <p className="text-muted-foreground font-medium">{stat.title}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="glass-card rounded-2xl p-5 sm:p-8 border border-white/5">
            <h2 className="text-lg sm:text-2xl font-display font-bold mb-4 sm:mb-6 flex items-center">
              <Sparkles className="w-5 h-5 text-primary mr-2" />
              Acciones Rápidas
            </h2>
            
            <div className="space-y-4">
              <Link href="/cover" className="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary/50 transition-all group">
                <div className="flex items-center">
                  <div className="p-3 bg-primary/20 text-primary rounded-lg mr-4">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Generar Portada</h3>
                    <p className="text-sm text-muted-foreground">Usa IA para crear una nueva miniatura</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </Link>
              
              <Link href="/videos" className="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-blue-500/50 transition-all group">
                <div className="flex items-center">
                  <div className="p-3 bg-blue-500/20 text-blue-400 rounded-lg mr-4">
                    <Video className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Nuevo Video</h3>
                    <p className="text-sm text-muted-foreground">Registra contenido en el sistema</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
              </Link>
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5 sm:p-8 border border-white/5">
            <h2 className="text-lg sm:text-2xl font-display font-bold mb-4 sm:mb-6 flex items-center">
              <Clock className="w-5 h-5 text-muted-foreground mr-2" />
              Actividad Reciente
            </h2>
            
            {!videos || videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
                <p className="text-muted-foreground">No hay actividad reciente.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {videos.slice(0, 4).map((video) => (
                  <div key={video.id} className="flex items-center p-3 rounded-lg hover:bg-white/5 transition-colors">
                    <div className={`w-2 h-2 rounded-full mr-4 ${
                      video.status === 'published' ? 'bg-emerald-500' :
                      video.status === 'scheduled' ? 'bg-primary' : 'bg-zinc-600'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
                      <p className="text-xs text-muted-foreground">{video.status}</p>
                    </div>
                    <span className="text-xs text-muted-foreground ml-4">
                      {new Date(video.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        <div className="glass-card rounded-2xl p-5 border border-white/5">
          <h2 className="text-lg font-display font-bold mb-4 flex items-center">
            <span className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center mr-2.5 flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </span>
            YouTube
          </h2>

          {ytLoading ? (
            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ) : ytChannel?.connected ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              {ytChannel.channel?.thumbnail && (
                <img src={ytChannel.channel.thumbnail} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-sm text-foreground truncate">{ytChannel.channel?.title}</h3>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {ytChannel.channel?.subscriberCount} subs · {ytChannel.channel?.videoCount} videos
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <XCircle className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-amber-400">No conectado</h3>
                <p className="text-xs text-muted-foreground truncate">{ytChannel?.message || "Reconecta Google"}</p>
              </div>
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/5">
          <h2 className="text-lg font-display font-bold mb-4 flex items-center">
            <span className="w-7 h-7 rounded-lg bg-black flex items-center justify-center mr-2.5 flex-shrink-0 border border-white/10">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.98a8.18 8.18 0 004.76 1.52V7.05a4.84 4.84 0 01-1-.36z"/></svg>
            </span>
            TikTok
          </h2>

          {tiktokLoading ? (
            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ) : tiktokStatus?.connected ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              {tiktokStatus.user?.avatar && (
                <img src={tiktokStatus.user.avatar} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-sm text-foreground truncate">{tiktokStatus.user?.displayName || "TikTok"}</h3>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">Conectado (sandbox)</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <XCircle className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-amber-400">No conectado</h3>
                <p className="text-xs text-muted-foreground truncate">{tiktokStatus?.message || "Conecta TikTok"}</p>
              </div>
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/5">
          <h2 className="text-lg font-display font-bold mb-4 flex items-center">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center mr-2.5 flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            </span>
            Instagram
          </h2>

          {igLoading ? (
            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ) : igStatus?.connected ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              {igStatus.account?.profilePicture && (
                <img src={igStatus.account.profilePicture} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-sm text-foreground truncate">@{igStatus.account?.username || "Instagram"}</h3>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {igStatus.account?.followersCount || 0} seguidores · {igStatus.account?.mediaCount || 0} posts
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <XCircle className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-amber-400">No conectado</h3>
                <p className="text-xs text-muted-foreground truncate">{igStatus?.message || "Configura Instagram"}</p>
              </div>
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/5">
          <h2 className="text-lg font-display font-bold mb-4 flex items-center">
            <span className="w-7 h-7 rounded-lg bg-[#0A66C2] flex items-center justify-center mr-2.5 flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M19 0h-14c-2.76 0-5 2.24-5 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5v-14c0-2.76-2.24-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.27c-.97 0-1.75-.79-1.75-1.76s.78-1.76 1.75-1.76 1.75.79 1.75 1.76-.78 1.76-1.75 1.76zm13.5 12.27h-3v-5.6c0-3.37-4-3.11-4 0v5.6h-3v-11h3v1.76c1.4-2.59 7-2.78 7 2.48v6.76z"/></svg>
            </span>
            LinkedIn
          </h2>

          {linkedinLoading ? (
            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ) : linkedinStatus?.connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                {linkedinStatus.user?.picture && (
                  <img src={linkedinStatus.user.picture} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-sm text-foreground truncate">
                      {linkedinStatus.user?.name || "LinkedIn"}
                    </h3>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {linkedinStatus.user?.orgUrn ? "Publicando como Página" : "Publicando como perfil personal"} · ~100/día
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  onClick={() => { if (linkedinOrgs.length === 0) loadLinkedinOrgs(); else setLinkedinOrgs([]); }}
                  className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/5 text-muted-foreground"
                >
                  {linkedinOrgs.length > 0 ? "Ocultar páginas" : (linkedinOrgsLoading ? "Cargando..." : "Páginas de empresa")}
                </button>
                <button
                  onClick={disconnectLinkedin}
                  className="px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                >
                  Desconectar
                </button>
              </div>
              {linkedinOrgs.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-white/5">
                  <button
                    onClick={() => selectLinkedinOrg(null)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded ${!linkedinStatus.user?.orgUrn ? "bg-emerald-500/10 text-emerald-300" : "hover:bg-white/5 text-muted-foreground"}`}
                  >
                    Perfil personal
                  </button>
                  {linkedinOrgs.map((o) => (
                    <button
                      key={o.urn}
                      onClick={() => selectLinkedinOrg(o.urn)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded ${linkedinStatus.user?.orgUrn === o.urn ? "bg-emerald-500/10 text-emerald-300" : "hover:bg-white/5 text-muted-foreground"}`}
                    >
                      {o.name || o.urn}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <a
              href={`${API_BASE}/linkedin/auth`}
              className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
            >
              <XCircle className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-amber-400">No conectado</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {linkedinStatus?.message || "Conectar LinkedIn"}
                </p>
              </div>
            </a>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5 border border-white/5">
          <h2 className="text-lg font-display font-bold mb-4 flex items-center">
            <span className="w-7 h-7 rounded-lg bg-black flex items-center justify-center mr-2.5 flex-shrink-0 border border-white/10">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </span>
            X (Twitter)
          </h2>

          {xLoading ? (
            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ) : xStatus?.connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center flex-shrink-0 border border-white/10">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-sm text-foreground truncate">
                      @{xStatus.user?.username || "X"}
                    </h3>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  </div>
                  <p className="text-xs text-muted-foreground">Conectado · 1500 posts/mes (Free)</p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={disconnectX}
                  className="px-2.5 py-1 text-xs rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                >
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <a
              href={`${API_BASE}/x/auth`}
              className="flex items-center gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
            >
              <XCircle className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-amber-400">No conectado</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {xStatus?.message || "Conectar X"}
                </p>
              </div>
            </a>
          )}
        </div>
        </div>
      </div>
    </Layout>
  );
}
