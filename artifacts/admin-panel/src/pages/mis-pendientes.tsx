import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, Plus, X, Trash2, ListChecks, CheckSquare2, Lock } from "lucide-react";
import {
  type PersonalTask,
  usePersonalTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCreateChecklist,
} from "@/lib/personal-tasks";
import { PersonalChecklistCard } from "@/components/personal-checklist-card";

function TaskRow({ task, onError }: { task: PersonalTask; onError: (e: Error) => void }) {
  const actualizar = useUpdateTask();
  const eliminar = useDeleteTask();
  return (
    <div className="flex items-center gap-2 group py-1.5">
      <Checkbox
        checked={task.done}
        onCheckedChange={(v) => actualizar.mutate({ id: task.id, done: !!v }, { onError })}
      />
      <span className={cn("flex-1 min-w-0 text-sm break-words", task.done && "line-through text-muted-foreground")}>
        {task.title}
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0 opacity-60 group-hover:opacity-100"
        onClick={() => eliminar.mutate(task.id, { onError })}
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

/**
 * "Mis pendientes": tareas simples + checklists de rutinas diarias, 100%
 * privados. Nadie más —ni dirección— puede ver o tocar lo que hay acá; cada
 * ruta del servidor filtra siempre por el dueño de la sesión.
 *
 * Distinto de "Mis tareas" (el tablero del Hub, compartido y por rol): esta
 * sección es personal y está disponible para todo el equipo.
 */
export default function MisPendientesPage() {
  const { toast } = useToast();
  const onError = (e: Error) => toast({ title: e.message, variant: "destructive" });

  const { data, isLoading, error } = usePersonalTasks();
  const crearTarea = useCreateTask();
  const crearChecklist = useCreateChecklist();

  const [nuevaTarea, setNuevaTarea] = useState("");
  const [nuevoChecklist, setNuevoChecklist] = useState("");
  const [creandoChecklist, setCreandoChecklist] = useState(false);

  const tareas = data?.tasks ?? [];
  const checklists = data?.checklists ?? [];
  const pendientes = tareas.filter((t) => !t.done);
  const hechas = tareas.filter((t) => t.done);

  const agregarTarea = () => {
    const title = nuevaTarea.trim();
    if (!title) return;
    crearTarea.mutate(title, { onSuccess: () => setNuevaTarea(""), onError });
  };

  const agregarChecklist = () => {
    const title = nuevoChecklist.trim();
    if (!title) return;
    crearChecklist.mutate(title, {
      onSuccess: () => { setNuevoChecklist(""); setCreandoChecklist(false); },
      onError,
    });
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ListChecks className="w-6 h-6" /> Mis pendientes
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            Espacio privado: solo tú ves esto, ni siquiera dirección puede entrar a tus tareas o checklists.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…
          </div>
        )}

        {!!error && !isLoading && (
          <p className="text-sm text-red-400">No se pudieron cargar tus pendientes. Intenta de nuevo en un momento.</p>
        )}

        {!isLoading && !error && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tareas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Agregar una tarea…"
                    value={nuevaTarea}
                    maxLength={280}
                    onChange={(e) => setNuevaTarea(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") agregarTarea(); }}
                  />
                  <Button onClick={agregarTarea} disabled={crearTarea.isPending || !nuevaTarea.trim()}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {tareas.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3 text-center">
                    Todavía no tienes tareas. Agrega la primera arriba.
                  </p>
                ) : (
                  <div className="space-y-0.5 divide-y divide-border/50">
                    {pendientes.map((task) => (
                      <TaskRow key={task.id} task={task} onError={onError} />
                    ))}
                  </div>
                )}

                {hechas.length > 0 && (
                  <div className="pt-2 border-t space-y-0.5 divide-y divide-border/50">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide pb-1">
                      Hechas ({hechas.length})
                    </p>
                    {hechas.map((task) => (
                      <TaskRow key={task.id} task={task} onError={onError} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CheckSquare2 className="w-5 h-5" /> Checklists diarios
                </h2>
                {!creandoChecklist && (
                  <Button variant="outline" size="sm" onClick={() => setCreandoChecklist(true)}>
                    <Plus className="w-4 h-4 mr-1" /> Nuevo checklist
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Los ítems se desmarcan solos cada día (hora de Chile) para que reutilices la misma rutina.
              </p>

              {creandoChecklist && (
                <Card>
                  <CardContent className="pt-4 flex gap-2 flex-wrap">
                    <Input
                      autoFocus
                      placeholder="Nombre del checklist (ej: Rutina de apertura)"
                      className="flex-1 min-w-[12rem]"
                      value={nuevoChecklist}
                      maxLength={120}
                      onChange={(e) => setNuevoChecklist(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") agregarChecklist();
                        if (e.key === "Escape") setCreandoChecklist(false);
                      }}
                    />
                    <Button onClick={agregarChecklist} disabled={crearChecklist.isPending || !nuevoChecklist.trim()}>
                      Crear
                    </Button>
                    <Button variant="ghost" onClick={() => { setCreandoChecklist(false); setNuevoChecklist(""); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {checklists.length === 0 && !creandoChecklist && (
                <p className="text-sm text-muted-foreground py-3 text-center">
                  Sin checklists todavía. Crea uno para tus rutinas diarias.
                </p>
              )}

              {checklists.map((cl) => (
                <PersonalChecklistCard key={cl.id} checklist={cl} />
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
