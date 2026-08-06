import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Plus, X, Trash2, Pencil, Check, Loader2 } from "lucide-react";
import {
  type PersonalChecklist,
  useRenameChecklist,
  useDeleteChecklist,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
} from "@/lib/personal-tasks";

/** Un checklist propio: renombrar, borrar, y administrar sus ítems. */
export function PersonalChecklistCard({ checklist }: { checklist: PersonalChecklist }) {
  const { toast } = useToast();
  const renombrar = useRenameChecklist();
  const eliminar = useDeleteChecklist();
  const agregarItem = useAddChecklistItem();
  const actualizarItem = useUpdateChecklistItem();
  const eliminarItem = useDeleteChecklistItem();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(checklist.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState("");

  const done = checklist.items.filter((i) => i.done).length;
  const total = checklist.items.length;

  const onError = (e: Error) => toast({ title: e.message, variant: "destructive" });

  const guardarTitulo = () => {
    const title = titleDraft.trim();
    if (!title || title === checklist.title) { setEditingTitle(false); return; }
    renombrar.mutate({ id: checklist.id, title }, { onSuccess: () => setEditingTitle(false), onError });
  };

  const agregar = () => {
    const text = newItemText.trim();
    if (!text) return;
    agregarItem.mutate(
      { checklistId: checklist.id, text },
      { onSuccess: () => setNewItemText(""), onError },
    );
  };

  const guardarItem = (itemId: string) => {
    const text = itemDraft.trim();
    setEditingItemId(null);
    const original = checklist.items.find((i) => i.id === itemId);
    if (!text || !original || text === original.text) return;
    actualizarItem.mutate({ checklistId: checklist.id, itemId, text }, { onError });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          {editingTitle ? (
            <div className="flex gap-2 flex-1 min-w-0">
              <Input
                value={titleDraft}
                autoFocus
                maxLength={120}
                className="h-8"
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") guardarTitulo();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
              />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={guardarTitulo}>
                <Check className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditingTitle(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <CardTitle className="text-base flex items-center gap-2 min-w-0">
                <span className="truncate">{checklist.title}</span>
                <span className="text-xs font-normal text-muted-foreground shrink-0">{done}/{total}</span>
              </CardTitle>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => { setTitleDraft(checklist.title); setEditingTitle(true); }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-red-400 hover:text-red-400"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
        {confirmDelete && (
          <div className="flex flex-wrap items-center gap-2 text-xs bg-red-500/10 border border-red-500/20 rounded-md p-2 mt-2">
            <span className="flex-1 min-w-[10rem]">¿Eliminar este checklist? No se puede deshacer.</span>
            <Button size="sm" variant="destructive" disabled={eliminar.isPending} onClick={() => eliminar.mutate(checklist.id, { onError })}>
              {eliminar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Eliminar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {checklist.items.length === 0 && (
          <p className="text-xs text-muted-foreground pb-2">Sin ítems todavía. Agrega el primero abajo.</p>
        )}
        {checklist.items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group py-1">
            <Checkbox
              checked={item.done}
              onCheckedChange={(v) => actualizarItem.mutate({ checklistId: checklist.id, itemId: item.id, done: !!v }, { onError })}
            />
            {editingItemId === item.id ? (
              <Input
                className="h-7 flex-1 text-sm"
                value={itemDraft}
                autoFocus
                maxLength={280}
                onChange={(e) => setItemDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") guardarItem(item.id);
                  if (e.key === "Escape") setEditingItemId(null);
                }}
                onBlur={() => guardarItem(item.id)}
              />
            ) : (
              <span
                className={cn(
                  "flex-1 min-w-0 text-sm cursor-text break-words",
                  item.done && "line-through text-muted-foreground",
                )}
                onClick={() => { setEditingItemId(item.id); setItemDraft(item.text); }}
              >
                {item.text}
              </span>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 opacity-60 group-hover:opacity-100"
              onClick={() => eliminarItem.mutate({ checklistId: checklist.id, itemId: item.id }, { onError })}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2 pt-1.5">
          <Input
            placeholder="Agregar ítem…"
            className="h-8 text-sm"
            value={newItemText}
            maxLength={280}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
          />
          <Button size="sm" onClick={agregar} disabled={agregarItem.isPending || !newItemText.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
