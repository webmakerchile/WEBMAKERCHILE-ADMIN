import { useState } from "react";
import { useListDriveFiles, useListDriveFolders } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { 
  Folder, File, HardDrive, ArrowLeft, Loader2, ExternalLink
} from "lucide-react";
import { motion } from "framer-motion";

const DEFAULT_ROOT_ID = "1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB";

export default function DriveBrowserPage() {
  const [currentFolderId, setCurrentFolderId] = useState<string>(DEFAULT_ROOT_ID);
  const [folderHistory, setFolderHistory] = useState<{id: string, name: string}[]>([{ id: DEFAULT_ROOT_ID, name: "Raíz" }]);

  const { data: filesData, isLoading: filesLoading } = useListDriveFiles({ folderId: currentFolderId });
  const { data: foldersData, isLoading: foldersLoading } = useListDriveFolders({ parentId: currentFolderId });

  const navigateToFolder = (id: string, name: string) => {
    setFolderHistory(prev => [...prev, { id, name }]);
    setCurrentFolderId(id);
  };

  const navigateBack = () => {
    if (folderHistory.length > 1) {
      const newHistory = [...folderHistory];
      newHistory.pop(); // remove current
      const prevFolder = newHistory[newHistory.length - 1];
      setFolderHistory(newHistory);
      setCurrentFolderId(prevFolder.id);
    }
  };

  const isLoading = filesLoading || foldersLoading;

  return (
    <Layout>
      <div className="space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-display font-bold text-gradient mb-2 flex items-center">
              <HardDrive className="w-8 h-8 mr-3 text-primary" />
              Explorador Drive
            </h1>
            <p className="text-muted-foreground text-lg">Navega la estructura de carpetas de tu contenido.</p>
          </div>
        </header>

        <div className="glass-card rounded-3xl border border-white/5 overflow-hidden">
          {/* Breadcrumbs & Navigation */}
          <div className="p-4 bg-white/5 border-b border-white/5 flex items-center gap-4">
            <button 
              onClick={navigateBack}
              disabled={folderHistory.length <= 1}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            
            <div className="flex items-center space-x-2 text-sm overflow-x-auto whitespace-nowrap scrollbar-hide">
              {folderHistory.map((folder, index) => (
                <div key={folder.id} className="flex items-center">
                  <span className={`font-medium ${index === folderHistory.length - 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                    {folder.name}
                  </span>
                  {index < folderHistory.length - 1 && (
                    <span className="text-muted-foreground/30 mx-2">/</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="p-6 min-h-[400px]">
            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* Render Folders First */}
                {foldersData?.map((folder) => (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={folder.id}
                    onClick={() => navigateToFolder(folder.id, folder.name)}
                    className="flex items-center p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary/30 transition-all text-left group"
                  >
                    <div className="p-3 bg-primary/20 rounded-xl mr-4 group-hover:scale-110 transition-transform">
                      <Folder className="w-6 h-6 text-primary" fill="currentColor" />
                    </div>
                    <div className="flex-1 truncate font-medium text-foreground">
                      {folder.name}
                    </div>
                  </motion.button>
                ))}

                {/* Render Files */}
                {filesData?.files.map((file) => (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={file.id}
                    className="flex flex-col p-4 rounded-2xl bg-white/5 border border-white/5 group relative overflow-hidden"
                  >
                    <div className="flex items-start mb-3">
                      <div className="p-3 bg-blue-500/20 rounded-xl mr-4">
                        <File className="w-6 h-6 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-foreground text-sm" title={file.name}>
                          {file.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {file.mimeType.split('/').pop()}
                        </div>
                      </div>
                    </div>
                    
                    {file.webViewLink && (
                      <a 
                        href={file.webViewLink} 
                        target="_blank" 
                        rel="noreferrer"
                        className="mt-auto flex items-center justify-center w-full py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-medium text-muted-foreground hover:text-white transition-colors"
                      >
                        Abrir en Drive <ExternalLink className="w-3 h-3 ml-2" />
                      </a>
                    )}
                  </motion.div>
                ))}

                {(!foldersData?.length && !filesData?.files?.length) && (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center text-muted-foreground">
                    <img src={`${import.meta.env.BASE_URL}images/empty-state.png`} alt="Empty" className="w-32 h-32 mb-6 opacity-50 mix-blend-screen" />
                    <p>Esta carpeta está vacía.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
