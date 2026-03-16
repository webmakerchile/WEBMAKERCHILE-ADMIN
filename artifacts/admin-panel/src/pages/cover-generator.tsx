import { useState } from "react";
import { useGenerateCover, useListVideos } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { fileToBase64 } from "@/lib/utils";
import { 
  Sparkles, Image as ImageIcon, Upload, Loader2, Download
} from "lucide-react";
import { motion } from "framer-motion";

export default function CoverGeneratorPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("Youtube Gaming Thumbnail, high contrast, vibrant colors");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const generateCover = useGenerateCover();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReferenceFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleGenerate = async () => {
    if (!title) return alert("El título es requerido");
    
    let base64 = undefined;
    if (referenceFile) {
      const b64Full = await fileToBase64(referenceFile);
      // Remove data:image/png;base64, prefix
      base64 = b64Full.split(',')[1];
    }

    generateCover.mutate({
      data: {
        title,
        description,
        style,
        referenceImageBase64: base64
      }
    });
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8">
        <header>
          <h1 className="text-4xl font-display font-bold text-gradient mb-2">Generador AI de Portadas</h1>
          <p className="text-muted-foreground text-lg">Crea miniaturas espectaculares usando Gemini 3.1 Pro.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Controls */}
          <div className="lg:col-span-5 space-y-6">
            <div className="glass-card p-6 rounded-3xl space-y-5 border border-white/5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Título Principal</label>
                <input 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-background/50 border border-white/10 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder="Texto destacado en la miniatura..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Contexto / Idea</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-background/50 border border-white/10 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all min-h-[100px]"
                  placeholder="Describe la emoción, los elementos, colores..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Estilo Visual</label>
                <input 
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  className="w-full bg-background/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground focus:border-primary outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Imagen de Referencia (Opcional)</label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 hover:border-primary/50 hover:bg-primary/5 rounded-xl cursor-pointer transition-all group overflow-hidden relative">
                  {previewUrl ? (
                    <>
                      <img src={previewUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-30 transition-opacity" />
                      <div className="relative z-10 flex flex-col items-center">
                         <ImageIcon className="w-6 h-6 text-white mb-2" />
                         <span className="text-sm text-white font-medium">Cambiar imagen</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary mb-2 transition-colors" />
                      <span className="text-sm text-muted-foreground font-medium">Subir foto o captura</span>
                    </>
                  )}
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generateCover.isPending || !title}
                className="w-full flex items-center justify-center px-6 py-4 bg-gradient-to-r from-primary to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl font-bold shadow-xl shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 hover:-translate-y-0.5 transition-all duration-300"
              >
                {generateCover.isPending ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5 mr-2" />
                )}
                {generateCover.isPending ? "Generando Magia..." : "Generar Portada"}
              </button>
            </div>
          </div>

          {/* Result */}
          <div className="lg:col-span-7">
            <div className="glass-card rounded-3xl h-full min-h-[500px] border border-white/5 flex flex-col items-center justify-center p-8 relative overflow-hidden">
              {/* Fallback image from requirements if no generation yet */}
              {!generateCover.data && !generateCover.isPending && (
                <div className="absolute inset-0 z-0 opacity-20 pointer-events-none flex items-center justify-center">
                  <img src={`${import.meta.env.BASE_URL}images/auth-bg.png`} alt="Background" className="w-full h-full object-cover" />
                </div>
              )}

              {generateCover.isPending ? (
                <div className="flex flex-col items-center relative z-10">
                  <div className="w-20 h-20 relative">
                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <p className="mt-6 text-lg font-medium text-foreground animate-pulse">Gemini está creando tu portada...</p>
                </div>
              ) : generateCover.data ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full relative z-10 group"
                >
                  <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative">
                    <img 
                      src={`data:${generateCover.data.mimeType};base64,${generateCover.data.b64_json}`} 
                      alt="Generated Cover" 
                      className="w-full h-auto aspect-video object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <a 
                        href={`data:${generateCover.data.mimeType};base64,${generateCover.data.b64_json}`} 
                        download={`portada-${title}.jpg`}
                        className="flex items-center px-6 py-3 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform"
                      >
                        <Download className="w-5 h-5 mr-2" />
                        Descargar
                      </a>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="text-center relative z-10">
                  <ImageIcon className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-muted-foreground">Tu portada aparecerá aquí</h3>
                  <p className="text-sm text-muted-foreground/60 mt-2 max-w-sm mx-auto">
                    Completa los detalles a la izquierda y presiona generar para ver el resultado de la IA.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
