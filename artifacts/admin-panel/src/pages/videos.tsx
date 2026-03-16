import { useState } from "react";
import { useListVideos, useCreateVideo, useDeleteVideo } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  Video, Plus, MoreVertical, Edit2, Trash2, Calendar, Folder, Image as ImageIcon, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { getListVideosQueryKey } from "@workspace/api-client-react";

const videoSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  description: z.string().min(1, "La descripción es requerida"),
  coverPrompt: z.string().optional(),
  month: z.string().optional(),
  week: z.string().optional(),
  day: z.string().optional(),
  videoNumber: z.string().optional(),
});

type VideoFormValues = z.infer<typeof videoSchema>;

export default function VideosPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: videos, isLoading } = useListVideos();
  const createVideo = useCreateVideo();
  const deleteVideo = useDeleteVideo();
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<VideoFormValues>({
    resolver: zodResolver(videoSchema)
  });

  const onSubmit = (data: VideoFormValues) => {
    createVideo.mutate({ data }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        reset();
        queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro de eliminar este video?")) {
      deleteVideo.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
        }
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-display font-bold text-gradient mb-2">Gestor de Videos</h1>
            <p className="text-muted-foreground text-lg">Administra el contenido y su organización.</p>
          </div>
          <button
            onClick={() => setIsDialogOpen(true)}
            className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-primary to-orange-400 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-300"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nuevo Video
          </button>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          </div>
        ) : (
          <div className="bg-card/50 backdrop-blur-sm border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-white/5 border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4 font-medium">Video</th>
                    <th className="px-6 py-4 font-medium">Ubicación</th>
                    <th className="px-6 py-4 font-medium">Estado</th>
                    <th className="px-6 py-4 font-medium">Portada</th>
                    <th className="px-6 py-4 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {videos?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        <Video className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        No hay videos registrados.
                      </td>
                    </tr>
                  )}
                  {videos?.map((video) => (
                    <tr key={video.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{video.title}</div>
                        <div className="text-muted-foreground truncate max-w-xs">{video.description}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-muted-foreground bg-white/5 px-3 py-1 rounded-md inline-flex">
                          <Folder className="w-4 h-4 mr-2 text-primary/70" />
                          {video.month}/{video.week}/{video.day}/#{video.videoNumber}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                          video.status === 'published' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          video.status === 'scheduled' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                          video.status === 'cover_generated' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                          'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                        }`}>
                          {video.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {video.coverImageBase64 ? (
                          <div className="flex items-center text-emerald-400">
                            <ImageIcon className="w-4 h-4 mr-2" />
                            Generada
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button className="p-2 text-muted-foreground hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(video.id)}
                            disabled={deleteVideo.isPending}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create Dialog */}
        <AnimatePresence>
          {isDialogOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-card w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-white/5">
                  <h2 className="text-2xl font-display font-bold">Nuevo Video</h2>
                  <p className="text-muted-foreground text-sm mt-1">Registra los detalles del contenido.</p>
                </div>
                
                <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Título</label>
                    <input 
                      {...register("title")}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                      placeholder="Ej: Setup minimalista 2024"
                    />
                    {errors.title && <p className="text-destructive text-sm">{errors.title.message}</p>}
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Descripción</label>
                    <textarea 
                      {...register("description")}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[100px]"
                      placeholder="Descripción del video..."
                    />
                    {errors.description && <p className="text-destructive text-sm">{errors.description.message}</p>}
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Mes</label>
                      <input {...register("month")} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none" placeholder="Octubre" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Semana</label>
                      <input {...register("week")} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none" placeholder="Semana 1" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Día</label>
                      <input {...register("day")} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none" placeholder="Lunes" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">Video #</label>
                      <input {...register("videoNumber")} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-primary outline-none" placeholder="01" />
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end gap-3">
                    <button 
                      type="button" 
                      onClick={() => setIsDialogOpen(false)}
                      className="px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      disabled={createVideo.isPending}
                      className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 transition-all"
                    >
                      {createVideo.isPending ? "Guardando..." : "Guardar Video"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
