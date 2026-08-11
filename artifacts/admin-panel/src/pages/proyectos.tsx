import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { AlertTriangle } from "lucide-react";
import { useHubBoard } from "./hub/use-hub-board";
import { ProjView } from "./hub/views/proj-view";
import { SheetContent } from "./hub/sheet-content";
import { GlobalSearch } from "./hub/global-search";
import { PushEnableBanner } from "@/components/push-enable-banner";
import { TAB_TITLES, type ProjView as ProjViewMode } from "./hub/shared";

const [TITLE, SUBTITLE] = TAB_TITLES.proj;

export default function ProyectosPage() {
  const hub = useHubBoard("proj");
  const [projView, setProjView] = useState<ProjViewMode>("board");
  const [searchQ, setSearchQ] = useState("");
  const [filterPrio, setFilterPrio] = useState("");
  // Filtro de proyecto del tablero Scrum: "" = todos los proyectos (default).
  const [filterProject, setFilterProject] = useState("");
  // Vista inmersiva del tablero: oculta la navegación principal y agranda
  // el tablero para que quepan todas las columnas sin scroll horizontal.
  const [boardFullscreen, setBoardFullscreen] = useState(false);
  useEffect(() => {
    if (!boardFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBoardFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [boardFullscreen]);

  const onNew = projView === "scrum" ? hub.newAction("tasks", { kind: "new-task" }) : hub.newAction("projects", { kind: "new-proj" });

  return (
    <Layout chromeHidden={boardFullscreen}>
      <div className="hub-root relative">
        {hub.errorGuardado && !boardFullscreen && (
          <div className="flex items-start gap-2 px-4 py-2 mb-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Tus cambios NO se guardaron en el servidor</p>
              <p className="opacity-90">{hub.errorGuardado} · Siguen en este navegador; no cierres la pestaña sin volver a intentarlo.</p>
            </div>
            <button
              onClick={() => { hub.setErrorGuardado(null); hub.setState(prev => ({ ...prev })); }}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-red-400/40 hover:bg-red-500/20 font-semibold"
            >
              Reintentar
            </button>
          </div>
        )}

        {!boardFullscreen && (
          <>
            <div className="topbar">
              <div className="ptitle">
                <span>{TITLE}</span>
                <small>
                  {SUBTITLE}
                  {hub.writeScopes.length === 0 && <> · solo lectura</>}
                </small>
              </div>
              <GlobalSearch state={hub.state} onNavigate={hub.navigateToTab} />
              <button type="button" onClick={onNew} className="add-btn" style={{ width: "auto", padding: "10px 18px", marginTop: 0 }}>+ Nuevo</button>
            </div>
            <div style={{ padding: "10px 18px 0" }}><PushEnableBanner /></div>
          </>
        )}

        <div className="main">
          <ProjView
            state={hub.state}
            onSave={hub.setState}
            onOpenProject={id => hub.openSheet({ kind: "proj", id })}
            onOpenTask={id => hub.openSheet({ kind: "task", id })}
            onToast={hub.showToast}
            projView={projView}
            setProjView={setProjView}
            searchQ={searchQ}
            setSearchQ={setSearchQ}
            filterPrio={filterPrio}
            setFilterPrio={setFilterPrio}
            filterProject={filterProject}
            setFilterProject={setFilterProject}
            apiTasks={hub.apiTasks}
            onRefreshTasks={hub.onRefreshTasks}
            canManage={hub.canManageTasks}
            onDeleteTask={hub.handleDeleteTask}
            onClearCompleted={hub.handleClearCompleted}
            onNew={onNew}
            boardFullscreen={boardFullscreen}
            setBoardFullscreen={setBoardFullscreen}
          />
        </div>

        {hub.sheet && (
          <>
            <div className="overlay" onClick={hub.closeSheet} />
            <div className="sheet">
              <SheetContent
                sheet={hub.sheet}
                state={hub.state}
                onClose={hub.closeSheet}
                onSave={hub.setState}
                onToast={hub.showToast}
                onNavigate={hub.navigateToTab}
                onOpenSheet={hub.openSheet}
                onConfirm={(msg, onYes) => hub.setConfirm({ msg, onYes })}
                apiTasks={hub.apiTasks}
                teamMembers={hub.teamMembers}
                onRefreshTasks={hub.onRefreshTasks}
                canWrite={hub.canWrite}
                onBoardRefresh={hub.refreshBoard}
              />
            </div>
          </>
        )}

        {hub.toast && (
          <div className={`toast ${hub.toast.undo ? "action" : ""}`}>
            {hub.toast.msg}
            {hub.toast.undo && (
              <button className="undo" onClick={() => { hub.toast!.undo!(); hub.showToast("Elemento restaurado"); }}>Deshacer</button>
            )}
          </div>
        )}

        {hub.confirm && (
          <div className="cmodal" onClick={e => { if (e.target === e.currentTarget) hub.setConfirm(null); }}>
            <div className="cbox">
              <p>{hub.confirm.msg}</p>
              <div className="crow">
                <button onClick={() => hub.setConfirm(null)}>Cancelar</button>
                <button className="yes" onClick={() => { hub.confirm!.onYes(); hub.setConfirm(null); }}>Confirmar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
