import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ROLES, TEAM_ROLES, normalizeRole, type TeamRole } from "@workspace/roles";
import { Loader2, Check, ChevronDown } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

/** Color del chip por rol: el mismo en Equipo, Ajustes, RRHH y el Hub. */
export const ROLE_STYLE: Record<TeamRole, string> = {
  ceo: "bg-primary/10 text-primary border-primary/20",
  editora: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  social: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  ventas: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  dev: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  marketing: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  contador: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  rrhh: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
};

export function RoleBadge({ role, className = "" }: { role: string; className?: string }) {
  const r = normalizeRole(role);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_STYLE[r]} ${className}`}>
      {ROLES[r].label}
    </span>
  );
}

/**
 * Todo lo que cambia una persona (rol, Discord, acceso) invalida estas claves.
 * Es lo que mantiene Equipo, Ajustes, RRHH y la asistencia diciendo lo mismo:
 * cambias en una pantalla y las otras se enteran, sin recargar.
 */
export function usePeopleSync() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["team-members", "admin-users", "hr-people", "jornada-overview", "discord-members", "auth-me"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

/** Selector de rol. Escribe siempre en el mismo campo, venga de donde venga. */
export function RoleSelector({ userId, current, disabled }: { userId: number; current: string; disabled?: boolean }) {
  const { toast } = useToast();
  const sync = usePeopleSync();
  const role = normalizeRole(current);

  const mutation = useMutation({
    mutationFn: async (teamRole: TeamRole) => {
      const r = await fetch(`${API_BASE}/team/members/${userId}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamRole }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error((e as { error?: string })?.error || "No se pudo cambiar el rol");
      }
      return r.json();
    },
    onSuccess: (_d, teamRole) => {
      sync();
      toast({ title: `Rol actualizado → ${ROLES[teamRole].label}` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex items-center gap-2">
      <select
        value={role}
        disabled={disabled || mutation.isPending}
        onChange={(e) => mutation.mutate(e.target.value as TeamRole)}
        className="h-8 rounded-lg border border-foreground/15 bg-card/60 px-2 text-xs disabled:opacity-50"
        aria-label="Rol del equipo"
      >
        {TEAM_ROLES.map((r) => (
          <option key={r} value={r}>{ROLES[r].label}</option>
        ))}
      </select>
      {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
    </div>
  );
}

interface GuildMember { id: string; name: string; username: string; avatarUrl: string | null }
type MembersResponse = { ok: true; members: GuildMember[] } | { ok: false; reason: string };

/**
 * Emparejar una persona con su cuenta de Discord.
 *
 * Sin este vínculo su jornada no se verifica, así que el control vive donde se
 * gestiona gente: Equipo, Ajustes y RRHH — no escondido en la configuración.
 */
export function DiscordLinkPicker({ userId, currentId, currentTag, disabled }: {
  userId: number;
  currentId: string | null;
  currentTag: string | null;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const sync = usePeopleSync();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery<MembersResponse>({
    queryKey: ["discord-members"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/jornada/discord/members`, { credentials: "include" });
      if (!r.ok) return { ok: false, reason: "error" };
      return r.json();
    },
    enabled: open,
    staleTime: 60_000,
  });

  const map = useMutation({
    mutationFn: async (member: GuildMember | null) => {
      const r = await fetch(`${API_BASE}/jornada/discord/map`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          discordUserId: member ? member.id : null,
          discordTag: member ? member.name : null,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error((e as { error?: string })?.error || "No se pudo emparejar");
      }
      return r.json();
    },
    onSuccess: (_d, member) => {
      sync();
      setOpen(false);
      toast({ title: member ? `Discord vinculado: ${member.name}` : "Discord desvinculado" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const members = data && data.ok ? data.members : [];
  const problema = data && !data.ok ? data.reason : null;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || map.isPending}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-base disabled:opacity-50 ${
          currentId
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
            : "border-amber-500/25 bg-amber-500/10 text-amber-400"
        }`}
        title={currentId ? "Cuenta de Discord vinculada" : "Sin vincular: su jornada no se verifica"}
      >
        {map.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>🎧</span>}
        <span className="truncate max-w-[9rem]">{currentTag || (currentId ? "Vinculado" : "Vincular Discord")}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-64 max-h-72 overflow-y-auto bg-card border border-foreground/15 rounded-xl shadow-xl z-20">
            {isLoading && <div className="p-3 text-xs text-muted-foreground">Cargando miembros…</div>}

            {problema && (
              <div className="p-3 text-xs text-amber-400">
                {problema === "unconfigured" && "Falta configurar DISCORD_BOT_TOKEN en el servidor."}
                {problema === "noguild" && "El bot todavía no está en el servidor de Discord."}
                {problema === "intent" && "Activa \"Server Members Intent\" en el portal de Discord."}
                {problema === "error" && "No se pudo consultar Discord en este momento."}
              </div>
            )}

            {currentId && (
              <button
                type="button"
                onClick={() => map.mutate(null)}
                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-foreground/5 border-b border-foreground/10"
              >
                Quitar vínculo
              </button>
            )}

            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => map.mutate(m)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-foreground/5 transition-base"
              >
                {m.avatarUrl
                  ? <img src={m.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                  : <span className="w-5 h-5 rounded-full bg-foreground/10 flex items-center justify-center">{m.name[0]}</span>}
                <span className="flex-1 truncate text-left">{m.name}</span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[6rem]">{m.username}</span>
                {m.id === currentId && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
            ))}

            {!isLoading && !problema && members.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">No hay miembros para mostrar.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
