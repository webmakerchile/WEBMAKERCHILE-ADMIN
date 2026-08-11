import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useAuth } from "@/App";
import { useEffectiveRole, useViewAs } from "@/lib/view-as";
import { normalizeRole, routesInclude, canAccessRoute } from "@workspace/roles";
import { filterByRouteAccess } from "@/lib/nav-pages";

type Row = { keys: string[]; label: string; href?: string };

// `href` (when set) is only used to filter out rows for routes the current
// role can't reach -- it isn't rendered. Labels here are this dialog's own
// fixed Spanish wording (kept independent of lib/nav-pages' labels/lang.tsx,
// which don't always match, e.g. "Descripciones" vs. navDescriptions'
// "Posts IA") -- no visible text changes, just fewer rows per role.
const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Generales",
    rows: [
      { keys: ["⌘", "K"], label: "Abrir paleta de comandos" },
      { keys: ["Ctrl", "K"], label: "Abrir paleta de comandos (Windows)" },
      { keys: ["?"], label: "Mostrar este panel de atajos" },
      { keys: ["Esc"], label: "Cerrar diálogos abiertos" },
    ],
  },
  {
    title: "Acciones rápidas",
    rows: [
      { keys: ["n"], label: "Crear nuevo video", href: "/videos" },
      { keys: ["s"], label: "Ir a programar publicaciones", href: "/schedule" },
      { keys: ["t"], label: "Cambiar tema (claro / oscuro / sistema)" },
    ],
  },
  {
    title: "Navegación (g + tecla)",
    rows: [
      { keys: ["g", "i"], label: "Inicio", href: "/" },
      { keys: ["g", "v"], label: "Gestor de Videos", href: "/videos" },
      { keys: ["g", "c"], label: "Calendario / Publicaciones", href: "/schedule" },
      { keys: ["g", "u"], label: "Cuentas Sociales", href: "/cuentas" },
      { keys: ["g", "p"], label: "Portadas", href: "/cover" },
      { keys: ["g", "d"], label: "Descripciones", href: "/descripciones" },
      { keys: ["g", "e"], label: "Estudio", href: "/estudio" },
      { keys: ["g", "s"], label: "Insights", href: "/insights" },
      { keys: ["g", "b"], label: "Biblioteca", href: "/biblioteca" },
      { keys: ["g", "t"], label: "Transcriptor", href: "/transcriptor" },
      { keys: ["g", "q"], label: "Equipo", href: "/equipo" },
      { keys: ["g", "a"], label: "Ajustes", href: "/ajustes" },
      { keys: ["g", "h"], label: "Hub Ejecutivo", href: "/dashboard-ejecutivo" },
    ],
  },
  {
    title: "En la lista de videos",
    rows: [
      { keys: ["a"], label: "Seleccionar todos los videos visibles" },
      { keys: ["Esc"], label: "Limpiar selección" },
    ],
  },
];

export function ShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useAuth();
  const { viewAs } = useViewAs();
  const effectiveRole = useEffectiveRole();
  const isSuperAdmin = !viewAs && user?.role === "superadmin";
  const dynamicRoutes = user?.roleRoutes?.[normalizeRole(effectiveRole, isSuperAdmin)];
  const hasAccess = (href: string) =>
    dynamicRoutes ? routesInclude(dynamicRoutes, href) : canAccessRoute(effectiveRole, href, isSuperAdmin);

  const visibleSections = SECTIONS.map((section) => ({
    ...section,
    rows: filterByRouteAccess(section.rows, hasAccess),
  })).filter((section) => section.rows.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {visibleSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                {section.title}
              </h3>
              <div className="rounded-lg border border-border bg-card/40 divide-y divide-border">
                {section.rows.map((row, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm">{row.label}</span>
                    <KbdGroup>
                      {row.keys.map((k, i) => (
                        <Kbd key={i}>{k}</Kbd>
                      ))}
                    </KbdGroup>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground pt-1">
            Los atajos se desactivan cuando estás escribiendo en un campo de texto.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
