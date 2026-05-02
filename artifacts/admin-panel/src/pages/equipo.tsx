import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/App";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users2, ShieldCheck, Pencil, Loader2 } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type Member = {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  teamRole: "editor" | "reviewer";
};

export default function EquipoPage() {
  const me = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["team-members"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/team/members`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, teamRole }: { id: number; teamRole: "editor" | "reviewer" }) => {
      const r = await fetch(`${API_BASE}/team/members/${id}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamRole }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.error || "Error al actualizar rol");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: "Rol actualizado" });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
    onSettled: () => setBusyId(null),
  });

  const canEdit = me?.teamRole === "reviewer";

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Equipo</h1>
          <p className="text-muted-foreground text-xs sm:text-base">
            Gestiona quién puede crear contenido y quién puede aprobarlo antes de publicarse.
          </p>
        </header>

        {!canEdit && (
          <div className="rounded-xl border border-foreground/10 bg-amber-500/10 text-amber-400 px-4 py-3 text-sm">
            Solo los usuarios con rol <strong>Revisor</strong> pueden cambiar los roles del equipo.
          </div>
        )}

        <Card className="bg-card/40 border-foreground/10">
          <CardContent className="p-2 sm:p-4">
            {isLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : members.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Users2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Aún no hay miembros registrados.
              </div>
            ) : (
              <ul className="divide-y divide-foreground/5">
                {members.map((m) => {
                  const isReviewer = m.teamRole === "reviewer";
                  const isMe = me?.id === m.id;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-2 sm:px-3 py-3">
                      {m.picture ? (
                        <img src={m.picture} alt={m.name || ""} className="w-9 h-9 rounded-full border border-foreground/15" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">
                          {(m.name || m.email)[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {m.name || m.email}
                          {isMe && <span className="text-[10px] text-muted-foreground ml-2">(tú)</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
                      </div>
                      <Badge
                        className={
                          isReviewer
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                        }
                      >
                        {isReviewer ? (
                          <>
                            <ShieldCheck className="w-3 h-3 mr-1" />
                            Revisor
                          </>
                        ) : (
                          <>
                            <Pencil className="w-3 h-3 mr-1" />
                            Editor
                          </>
                        )}
                      </Badge>
                      {canEdit && !isMe && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === m.id}
                          onClick={() => {
                            setBusyId(m.id);
                            updateRole.mutate({ id: m.id, teamRole: isReviewer ? "editor" : "reviewer" });
                          }}
                        >
                          {busyId === m.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isReviewer ? (
                            "Quitar revisor"
                          ) : (
                            "Hacer revisor"
                          )}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Los <strong>editores</strong> pueden crear y editar videos. Los <strong>revisores</strong> además
          pueden aprobar videos en revisión y asignar roles.
        </p>
      </div>
    </Layout>
  );
}
