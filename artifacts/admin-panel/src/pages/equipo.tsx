import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/App";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ROLES, TEAM_ROLES, canManageTeam, normalizeRole, type TeamRole } from "@workspace/roles";
import { Users2, ShieldCheck, Loader2 } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type Member = {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
  teamRole: TeamRole;
};

/** Color del chip por rol, para distinguir las áreas de un vistazo. */
const ROLE_STYLE: Record<TeamRole, string> = {
  ceo: "bg-primary/10 text-primary border-primary/20",
  editora: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  social: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  ventas: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  dev: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  marketing: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  contador: "bg-teal-500/10 text-teal-400 border-teal-500/20",
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
    mutationFn: async ({ id, teamRole }: { id: number; teamRole: TeamRole }) => {
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

  const canEdit = canManageTeam(me?.teamRole, me?.role === "superadmin");

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl sm:text-4xl font-display font-bold text-gradient mb-1">Equipo</h1>
          <p className="text-muted-foreground text-xs sm:text-base">
            Cada persona entra directo a su área y solo ve las secciones de su rol.
          </p>
        </header>

        {!canEdit && (
          <div className="rounded-xl border border-foreground/10 bg-amber-500/10 text-amber-400 px-4 py-3 text-sm">
            Solo la <strong>dirección</strong> puede cambiar los roles del equipo.
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
                  const role = normalizeRole(m.teamRole);
                  const def = ROLES[role];
                  const isMe = me?.id === m.id;
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 px-2 sm:px-3 py-3">
                      {m.picture ? (
                        <img src={m.picture} alt={m.name || ""} className="w-9 h-9 rounded-full border border-foreground/15" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">
                          {(m.name || m.email)[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-[10rem]">
                        <p className="text-sm font-medium truncate">
                          {m.name || m.email}
                          {isMe && <span className="text-[10px] text-muted-foreground ml-2">(tú)</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5">{def.description}</p>
                      </div>
                      <Badge className={ROLE_STYLE[role]}>
                        {def.canManageTeam && <ShieldCheck className="w-3 h-3 mr-1" />}
                        {def.label}
                      </Badge>
                      {canEdit && !isMe && (
                        <div className="flex items-center gap-2">
                          <select
                            value={role}
                            disabled={busyId === m.id}
                            onChange={(e) => {
                              setBusyId(m.id);
                              updateRole.mutate({ id: m.id, teamRole: e.target.value as TeamRole });
                            }}
                            className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs"
                            aria-label={`Rol de ${m.name || m.email}`}
                          >
                            {TEAM_ROLES.map((r) => (
                              <option key={r} value={r}>{ROLES[r].label}</option>
                            ))}
                          </select>
                          {busyId === m.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-foreground/10">
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">Qué ve cada rol</p>
            <ul className="space-y-2">
              {TEAM_ROLES.map((r) => {
                const def = ROLES[r];
                return (
                  <li key={r} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <Badge className={ROLE_STYLE[r]}>{def.label}</Badge>
                    <span className="text-muted-foreground">
                      entra en <code className="text-foreground">{def.home}</code>
                      {def.routes.includes("*")
                        ? " · acceso completo"
                        : ` · ${def.routes.length} secciones`}
                      {def.canReview && " · puede aprobar contenido"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
