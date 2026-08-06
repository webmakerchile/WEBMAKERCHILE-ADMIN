import { useState, useRef } from "react";
import { useListDriveFiles, useListDriveFolders } from "@workspace/api-client-react";
import { ConectarDrive, useEstadoDrive } from "@/components/conectar-drive";
import { FolderTree, Upload } from "lucide-react";
import { DRIVE_API_BASE } from "../sheet-content";
import { HUB_DRIVE_ROOT } from "../shared";

export function HubDriveView({ showToast }: { showToast: (msg: string) => void }) {
  const [currentFolderId, setCurrentFolderId] = useState<string>(HUB_DRIVE_ROOT);
  const [folderHistory, setFolderHistory] = useState<{ id: string; name: string }[]>([{ id: HUB_DRIVE_ROOT, name: "Raíz" }]);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const { data: filesData, isLoading: filesLoading, error: filesError, refetch: refetchFiles } = useListDriveFiles({ folderId: currentFolderId });
  const { data: foldersData, isLoading: foldersLoading, error: foldersError, refetch: refetchFolders } = useListDriveFolders({ parentId: currentFolderId });
  const drive = useEstadoDrive();
  // Un error NO es una carpeta vacía. Pintarlos igual es lo que ocultó durante
  // meses que al ejecutivo comercial le faltaba el permiso de Drive.
  const fallo = filesError || foldersError;

  const navigateToFolder = (id: string, name: string) => {
    setFolderHistory(prev => [...prev, { id, name }]);
    setCurrentFolderId(id);
  };

  const navigateBack = () => {
    if (folderHistory.length > 1) {
      const newHistory = [...folderHistory];
      newHistory.pop();
      const prev = newHistory[newHistory.length - 1];
      setFolderHistory(newHistory);
      setCurrentFolderId(prev.id);
    }
  };

  // Antes solo se podía mirar el Drive del Hub, nunca meter algo nuevo: había
  // que salir al Drive real para subir un archivo a la carpeta que ya se
  // estaba viendo aquí mismo.
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("parentId", currentFolderId);
      const res = await fetch(`${DRIVE_API_BASE}/drive/upload`, { method: "POST", credentials: "include", body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as { error?: string };
        showToast(e.error || "Error al subir el archivo");
        return;
      }
      const data = await res.json() as { name: string };
      showToast(`"${data.name}" subido a Drive`);
      void refetchFiles();
      void refetchFolders();
    } catch {
      showToast("Error de conexión al subir el archivo");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const isLoading = filesLoading || foldersLoading;

  const itemCount = (foldersData?.length || 0) + (filesData?.files?.length || 0);

  return (
    <div className="wrap">
      <div className="subhead"><FolderTree className="w-3.5 h-3.5" />Drive del Hub {!isLoading && <span className="n">{itemCount} elemento{itemCount !== 1 ? "s" : ""}</span>}</div>
      <div style={{ background: "var(--card1)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", overflow: "hidden" }}>
        {/* Breadcrumbs & back */}
        <div style={{ padding: "12px 16px", background: "var(--card2)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={navigateBack} disabled={folderHistory.length <= 1}
            style={{ padding: "6px 10px", background: "var(--card1)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--dim)", cursor: folderHistory.length <= 1 ? "not-allowed" : "pointer", opacity: folderHistory.length <= 1 ? 0.35 : 1, display: "flex", alignItems: "center" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={16} height={16}><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, overflowX: "auto", whiteSpace: "nowrap" }}>
            {folderHistory.map((f, i) => (
              <span key={f.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: i === folderHistory.length - 1 ? "var(--orange2)" : "var(--dim)", fontWeight: i === folderHistory.length - 1 ? 600 : 400 }}>{f.name}</span>
                {i < folderHistory.length - 1 && <span style={{ color: "var(--faint)" }}>/</span>}
              </span>
            ))}
          </div>
          {(drive.cargando || drive.conectado) && (<>
            <button onClick={() => uploadInputRef.current?.click()} disabled={uploading}
              style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "var(--card1)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)", fontSize: 12, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.6 : 1 }}>
              <Upload className="w-3.5 h-3.5" />{uploading ? "Subiendo…" : "Subir archivo"}
            </button>
            <input ref={uploadInputRef} type="file" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }} />
          </>)}
        </div>

        {/* File grid */}
        <div style={{ padding: 20, minHeight: 300 }}>
          {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px 0", color: "var(--faint)", fontSize: 13 }}>Cargando…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {foldersData?.map(folder => (
                <button key={folder.id} onClick={() => navigateToFolder(folder.id, folder.name)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, cursor: "pointer", textAlign: "left", transition: "border-color .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--orange-line)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--line)")}>
                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" width={20} height={20} style={{ color: "var(--orange2)", flexShrink: 0 }}><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</span>
                </button>
              ))}
              {filesData?.files.map(file => (
                <div key={file.id} style={{ display: "flex", flexDirection: "column", padding: "14px 16px", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} width={18} height={18} style={{ color: "#6aa0c0", flexShrink: 0, marginTop: 1 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file.name}>{file.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}>{file.mimeType.split("/").pop()}</div>
                    </div>
                  </div>
                  {file.webViewLink && (
                    <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0", background: "var(--card1)", borderRadius: 7, fontSize: 11, fontWeight: 600, color: "var(--dim)", textDecoration: "none", border: "1px solid var(--line)", transition: "color .15s" }}>
                      Abrir en Drive ↗
                    </a>
                  )}
                </div>
              ))}
              {!foldersData?.length && !filesData?.files?.length && (
                <div style={{ gridColumn: "1/-1", padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
                  {!drive.cargando && !drive.conectado ? (
                    <div style={{ maxWidth: 460, margin: "0 auto", textAlign: "left" }}>
                      <ConectarDrive volverA="drive-hub" motivo="Por eso esta carpeta se ve vacía." />
                    </div>
                  ) : fallo ? (
                    <>
                      <div style={{ color: "#f87171", fontWeight: 600 }}>No se pudo leer esta carpeta.</div>
                      <div style={{ marginTop: 6, fontSize: 11.5 }}>
                        {(fallo as Error).message || "El servidor devolvió un error."} Si la carpeta es de
                        otra persona, pídele que la comparta con tu cuenta.
                      </div>
                    </>
                  ) : (
                    "Esta carpeta está vacía."
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

