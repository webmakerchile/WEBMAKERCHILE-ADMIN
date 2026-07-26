import { useLocation } from "wouter";
import { ROLES, TEAM_ROLES, roleHome, type TeamRole } from "@workspace/roles";
import { useViewAs } from "@/lib/view-as";
import { ROLE_STYLE } from "@/components/role-controls";
import { Eye, X } from "lucide-react";

/**
 * Barra de vista previa de rol.
 *
 * Permite a la dirección recorrer el panel tal como lo ve cada persona: el
 * menú, las rutas permitidas y la pantalla de inicio cambian de verdad. Es la
 * única forma de saber si la experiencia de alguien está rota sin pedirle su
 * contraseña.
 */
export function ViewAsBar() {
  const { viewAs, canSimulate, setViewAs } = useViewAs();
  const [, setLocation] = useLocation();

  if (!canSimulate || !viewAs) return null;

  const def = ROLES[viewAs];
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2 px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs">
      <Eye className="w-3.5 h-3.5 flex-shrink-0" />
      <span>
        Estás viendo el panel como <strong>{def.label}</strong> — así lo ve esa persona.
      </span>
      <select
        value={viewAs}
        onChange={(e) => {
          const next = e.target.value as TeamRole;
          setViewAs(next);
          setLocation(roleHome(next), { replace: true });
        }}
        className="h-7 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 text-[11px] text-amber-200"
        aria-label="Cambiar el rol que estás viendo"
      >
        {TEAM_ROLES.map((r) => (
          <option key={r} value={r}>{ROLES[r].label}</option>
        ))}
      </select>
      <button
        onClick={() => { setViewAs(null); setLocation("/", { replace: true }); }}
        className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-500/30 hover:bg-amber-500/20 transition-base"
      >
        <X className="w-3 h-3" /> Volver a mi panel
      </button>
    </div>
  );
}

/** Lanzador: la lista de roles para entrar a la vista previa. */
export function ViewAsLauncher() {
  const { canSimulate, viewAs, setViewAs } = useViewAs();
  const [, setLocation] = useLocation();

  if (!canSimulate || viewAs) return null;

  return (
    <div className="rounded-xl border border-foreground/10 bg-card/40 p-4">
      <p className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Eye className="w-4 h-4 text-primary" /> Ver el panel como…
      </p>
      <p className="text-[11px] text-muted-foreground mb-3">
        Recorre el panel con los ojos de cada rol: mismo menú, mismas secciones y misma
        pantalla de inicio que ve esa persona. No cambia ningún dato.
      </p>
      <div className="flex flex-wrap gap-2">
        {TEAM_ROLES.filter((r) => r !== "ceo").map((r) => (
          <button
            key={r}
            onClick={() => { setViewAs(r); setLocation(roleHome(r), { replace: true }); }}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-base hover:opacity-80 ${ROLE_STYLE[r]}`}
          >
            {ROLES[r].label}
          </button>
        ))}
      </div>
    </div>
  );
}
