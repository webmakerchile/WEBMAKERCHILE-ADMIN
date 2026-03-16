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
  Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: videos, isLoading } = useListVideos();
  const checkSchedule = useCheckScheduledVideos();

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
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-display font-bold text-gradient mb-2">Panel de Control</h1>
            <p className="text-muted-foreground text-lg">Resumen de tu contenido y automatizaciones.</p>
          </div>
          
          <button
            onClick={handleProcessSchedule}
            disabled={checkSchedule.isPending}
            className="flex items-center px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium transition-all group disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 mr-2 ${checkSchedule.isPending ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          {/* Quick Actions */}
          <div className="glass-card rounded-3xl p-8 border border-white/5">
            <h2 className="text-2xl font-display font-bold mb-6 flex items-center">
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

          {/* Recent Activity (Placeholder for visual completeness) */}
          <div className="glass-card rounded-3xl p-8 border border-white/5">
            <h2 className="text-2xl font-display font-bold mb-6 flex items-center">
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
      </div>
    </Layout>
  );
}
