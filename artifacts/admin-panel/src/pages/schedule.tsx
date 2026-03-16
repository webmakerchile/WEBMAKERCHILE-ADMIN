import { useCheckScheduledVideos, useListVideos } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { CalendarClock, AlertCircle, CheckCircle2, Play } from "lucide-react";
import { motion } from "framer-motion";

export default function SchedulePage() {
  const { data: videos } = useListVideos();
  const checkSchedule = useCheckScheduledVideos();

  const scheduledVideos = videos?.filter(v => v.status === 'scheduled') || [];

  const handleProcess = () => {
    checkSchedule.mutate();
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h1 className="text-4xl font-display font-bold text-gradient mb-2">Programación Automática</h1>
            <p className="text-muted-foreground text-lg">Gestiona la subida automática a Google Drive.</p>
          </div>
          
          <button
            onClick={handleProcess}
            disabled={checkSchedule.isPending}
            className="flex items-center px-6 py-3 bg-primary hover:bg-orange-400 text-white rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-50"
          >
            <Play className={`w-5 h-5 mr-2 ${checkSchedule.isPending ? "animate-pulse" : ""}`} />
            {checkSchedule.isPending ? "Procesando Cola..." : "Ejecutar Cola Ahora"}
          </button>
        </header>

        <div className="grid gap-6">
          {checkSchedule.data && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 mb-4"
            >
              <h3 className="text-emerald-400 font-bold flex items-center mb-2">
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Resultado del Proceso
              </h3>
              <p className="text-emerald-400/80 text-sm">
                Procesados: {checkSchedule.data.processed} | Errores: {checkSchedule.data.errors}
              </p>
            </motion.div>
          )}

          <div className="glass-card rounded-3xl border border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center">
              <CalendarClock className="w-6 h-6 text-primary mr-3" />
              <h2 className="text-xl font-bold">En Cola de Programación</h2>
              <span className="ml-auto bg-primary/20 text-primary px-3 py-1 rounded-full text-sm font-medium">
                {scheduledVideos.length} pendientes
              </span>
            </div>
            
            <div className="p-6">
              {scheduledVideos.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">No hay videos programados actualmente.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {scheduledVideos.map(video => (
                    <div key={video.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                      <div>
                        <h4 className="font-bold text-foreground">{video.title}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Carpeta destino: {video.month}/{video.week}/{video.day}/#{video.videoNumber}
                        </p>
                      </div>
                      <div className="mt-4 sm:mt-0 text-right">
                        <div className="text-xs text-muted-foreground mb-1">Fecha Programada</div>
                        <div className="text-sm font-medium text-orange-400">
                          {video.scheduledAt ? new Date(video.scheduledAt).toLocaleString() : 'No definida'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
