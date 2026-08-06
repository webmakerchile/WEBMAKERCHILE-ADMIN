import { Layout } from "@/components/layout";
import { AlertTriangle } from "lucide-react";
import { useHubBoard } from "./hub/use-hub-board";
import { DashView } from "./hub/views/dash-view";
import { SheetContent } from "./hub/sheet-content";
import { GlobalSearch } from "./hub/global-search";
import { PushEnableBanner } from "@/components/push-enable-banner";
import { TAB_TITLES } from "./hub/shared";

const [TITLE, SUBTITLE] = TAB_TITLES.dash;

export default function DashboardEjecutivoPage() {
  const hub = useHubBoard("dash");

  return (
    <Layout>
      <div className="hub-root relative">
        {hub.errorGuardado && (
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

        <div className="topbar">
          <div className="ptitle">
            <span>{TITLE}</span>
            <small>
              {SUBTITLE}
              {hub.boardOwner && <> · tablero de {hub.boardOwner.name || hub.boardOwner.email}</>}
              {hub.writeScopes.length === 0 && <> · solo lectura</>}
            </small>
          </div>
          <GlobalSearch state={hub.state} onNavigate={hub.navigateToTab} />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={hub.handleExport}
              className="flex items-center justify-center px-2.5 py-2 text-[11px] text-muted-foreground hover:text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/10 rounded-lg transition-base whitespace-nowrap"
            >
              ↓ Exportar
            </button>
            <button
              onClick={() => hub.importRef.current?.click()}
              className="flex items-center justify-center px-2.5 py-2 text-[11px] text-muted-foreground hover:text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-foreground/10 rounded-lg transition-base whitespace-nowrap"
            >
              ↑ Importar
            </button>
            <input ref={hub.importRef} type="file" accept=".json" className="hidden" onChange={hub.handleImportFile} />
          </div>
        </div>
        <div style={{ padding: "10px 18px 0" }}><PushEnableBanner /></div>

        <div className="main">
          <DashView
            state={hub.state}
            onOpenProject={id => hub.openSheet({ kind: "proj", id })}
            onNavigate={hub.navigateToTab}
            apiTasks={hub.apiTasks}
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
