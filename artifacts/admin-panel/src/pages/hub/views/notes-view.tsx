import { EmptyState } from "@/components/hub-kit";
import { FileText, FileCheck2, Pin } from "lucide-react";
import type { HubState, Note, NoteCat, StateUpdater } from "../shared";
import { fmtDate, hlText, NOTE_CAT_COLORS, NOTE_CATS, noteChecklist, renderNoteFmt } from "../shared";

export function NotesView({ state, onSave, onOpen, onToast, filterCat, setFilterCat, searchQ, setSearchQ }: { state: HubState; onSave: (n: StateUpdater) => void; onOpen: (id: string) => void; onToast: (m: string) => void; filterCat: string; setFilterCat: (v: string) => void; searchQ: string; setSearchQ: (v: string) => void }) {
  const q = searchQ.trim();
  const list = state.notes
    .filter(n => (!filterCat || n.cat === filterCat) && (!q || (n.title + " " + (n.body || "")).toLowerCase().includes(q)))
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  const pinned = list.filter(n => n.pinned);
  const rest = list.filter(n => !n.pinned);
  const togglePin = (e: React.MouseEvent, n: Note) => {
    e.stopPropagation();
    onSave({ ...state, notes: state.notes.map(x => x.id === n.id ? { ...x, pinned: !x.pinned || undefined } : x) });
    onToast(n.pinned ? "Nota desfijada" : "Nota fijada arriba");
  };
  const noteCard = (n: Note) => {
    const cl = noteChecklist(n.body || "");
    const color = NOTE_CAT_COLORS[n.cat] || "#8a8f98";
    return (
      <div key={n.id} className="gcard ncard" style={{ "--nc": color } as React.CSSProperties} onClick={() => onOpen(n.id)}>
        <button className={`npin${n.pinned ? " on" : ""}`} title={n.pinned ? "Desfijar" : "Fijar arriba"} aria-label={n.pinned ? "Desfijar nota" : "Fijar nota arriba"} aria-pressed={!!n.pinned} onClick={e => togglePin(e, n)}>
          <Pin className="w-3.5 h-3.5" style={n.pinned ? { fill: "currentColor" } : undefined} />
        </button>
        <div className="gt">{hlText(n.title, q || undefined, "t")}</div>
        <div className="gsub ncat"><span className="fdot" style={{ background: color }} />{NOTE_CATS[n.cat] || "Otra"}</div>
        {(n.body || "").trim() !== "" && <div className="gbody note-fmt">{renderNoteFmt(n.body, q || undefined)}</div>}
        <div className="gfoot">
          {cl.total > 0 && <span className={`chip${cl.done === cl.total ? " chip-done" : ""}`}>☑ {cl.done}/{cl.total}</span>}
          <span className="gdate">{fmtDate(n.updatedAt || n.createdAt)}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="wrap">
      <div className="toolbar">
        <div className="tsearch"><span>🔍</span><input value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} placeholder="Buscar nota…" aria-label="Buscar nota" /></div>
        <div className="fchips" role="group" aria-label="Filtrar por categoría">
          <button className={`fchip${!filterCat ? " on" : ""}`} aria-pressed={!filterCat} onClick={() => setFilterCat("")}>Todas <span className="fn">{state.notes.length}</span></button>
          {(Object.entries(NOTE_CATS) as [NoteCat, string][]).map(([k, v]) => {
            const cnt = state.notes.filter(n => n.cat === k).length;
            if (cnt === 0 && filterCat !== k) return null;
            return (
              <button key={k} className={`fchip${filterCat === k ? " on" : ""}`} aria-pressed={filterCat === k} onClick={() => setFilterCat(filterCat === k ? "" : k)}>
                <span className="fdot" style={{ background: NOTE_CAT_COLORS[k] }} />{v} <span className="fn">{cnt}</span>
              </button>
            );
          })}
        </div>
      </div>
      {state.notes.length === 0 ? (
        <EmptyState title="Sin notas aún" hint="Captura ideas, acuerdos y visión. Tip: usa # para títulos y [ ] para checklists." icon={<FileText />} />
      ) : list.length === 0 ? (
        <EmptyState title="Sin resultados" hint="Nada coincide con tu búsqueda o filtro actual." icon={<FileCheck2 />} />
      ) : (
        <>
          {pinned.length > 0 && (<>
            <div className="subhead"><Pin className="w-3 h-3" style={{ fill: "currentColor" }} />Fijadas <span className="n">{pinned.length}</span></div>
            <div className="cardlist">{pinned.map(noteCard)}</div>
          </>)}
          {rest.length > 0 && (<>
            {pinned.length > 0 && <div className="subhead"><FileText className="w-3 h-3" />Recientes <span className="n">{rest.length}</span></div>}
            <div className="cardlist">{rest.map(noteCard)}</div>
          </>)}
        </>
      )}
    </div>
  );
}

/* ============================================================
   CONTRATOS
   ============================================================ */
