import { useState, type DragEvent } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Lightbulb, Plus, X, ArrowLeftRight, Loader2 } from "lucide-react";
import { useIdeasBoard, IDEA_COLUMNS, type Idea, type IdeaColumnId } from "@/lib/ideas-board";

const COLUMN_META: Record<IdeaColumnId, { label: string; dot: string; border: string }> = {
  funciona: { label: "Funciona", dot: "bg-emerald-400", border: "border-emerald-500/30" },
  no_funciona: { label: "No funciona", dot: "bg-rose-400", border: "border-rose-500/30" },
};

function otraColumna(id: IdeaColumnId): IdeaColumnId {
  return id === "funciona" ? "no_funciona" : "funciona";
}

function IdeaCard({
  idea,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onDelete,
}: {
  idea: Idea;
  dragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-lg bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 p-2.5 cursor-grab active:cursor-grabbing transition",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-1.5">
        <p className="text-sm leading-snug flex-1 break-words">{idea.title}</p>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition flex-shrink-0">
          <button
            type="button"
            onClick={onMove}
            className="p-1 rounded text-muted-foreground hover:text-primary"
            title={`Mover a "${COLUMN_META[otraColumna(idea.columnId)].label}"`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded text-muted-foreground hover:text-rose-400"
            title="Eliminar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {idea.createdByName && (
        <p className="text-[11px] text-muted-foreground mt-1">{idea.createdByName}</p>
      )}
    </div>
  );
}

/**
 * Tablero de Ideas de Editora + Redes sociales: compartido entre todas las
 * cuentas con acceso (ver ideas-gate.ts en el backend) — no es una lista
 * privada por usuario. Dos columnas fijas, sin edición de texto ni
 * comentarios: solo cargar, mover y eliminar.
 */
export default function IdeasPage() {
  const { toast } = useToast();
  const onError = (e: Error) => toast({ title: e.message, variant: "destructive" });
  const { grouped, cargando, error, crear, mover, eliminar } = useIdeasBoard();

  const [drafts, setDrafts] = useState<Record<IdeaColumnId, string>>({ funciona: "", no_funciona: "" });
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<IdeaColumnId | null>(null);

  const agregar = (columnId: IdeaColumnId) => {
    const title = drafts[columnId].trim();
    if (!title) return;
    crear.mutate(
      { title, columnId },
      { onSuccess: () => setDrafts((d) => ({ ...d, [columnId]: "" })), onError },
    );
  };

  const onDrop = (columnId: IdeaColumnId) => {
    setDragOver(null);
    if (dragId == null) return;
    const idea = [...grouped.funciona, ...grouped.no_funciona].find((i) => i.id === dragId);
    setDragId(null);
    if (!idea || idea.columnId === columnId) return;
    mover.mutate({ id: idea.id, columnId }, { onError });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="w-6 h-6" /> Ideas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tablero compartido de Editora y Redes sociales: anota una idea y muévela según si funciona o no.
          </p>
        </div>

        {cargando && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
          </div>
        )}

        {!!error && !cargando && (
          <p className="text-sm text-red-400">No se pudo cargar el tablero. Intenta de nuevo en un momento.</p>
        )}

        {!cargando && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {IDEA_COLUMNS.map((columnId) => {
              const meta = COLUMN_META[columnId];
              const items = grouped[columnId];
              return (
                <Card
                  key={columnId}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(columnId); }}
                  onDragLeave={() => setDragOver((c) => (c === columnId ? null : c))}
                  onDrop={() => onDrop(columnId)}
                  className={cn("flex flex-col", dragOver === columnId && "ring-2 ring-primary/40")}
                >
                  <CardHeader className={cn("pb-3 border-b", meta.border)}>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full", meta.dot)} />
                        {meta.label}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2 flex-1">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nueva idea…"
                        value={drafts[columnId]}
                        maxLength={280}
                        onChange={(e) => setDrafts((d) => ({ ...d, [columnId]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") agregar(columnId); }}
                      />
                      <Button onClick={() => agregar(columnId)} disabled={crear.isPending || !drafts[columnId].trim()}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>

                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">Sin ideas todavía.</p>
                    ) : (
                      <div className="space-y-2">
                        {items.map((idea) => (
                          <IdeaCard
                            key={idea.id}
                            idea={idea}
                            dragging={dragId === idea.id}
                            onDragStart={(e) => { setDragId(idea.id); e.dataTransfer.setData("text/plain", String(idea.id)); }}
                            onDragEnd={() => { setDragId(null); setDragOver(null); }}
                            onMove={() => mover.mutate({ id: idea.id, columnId: otraColumna(idea.columnId) }, { onError })}
                            onDelete={() => eliminar.mutate(idea.id, { onError })}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
