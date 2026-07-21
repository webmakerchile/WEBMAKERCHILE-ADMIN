import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

type Row = { keys: string[]; label: string };

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
      { keys: ["n"], label: "Crear nuevo video" },
      { keys: ["s"], label: "Ir a programar publicaciones" },
      { keys: ["t"], label: "Cambiar tema (claro / oscuro / sistema)" },
    ],
  },
  {
    title: "Navegación (g + tecla)",
    rows: [
      { keys: ["g", "i"], label: "Inicio" },
      { keys: ["g", "v"], label: "Gestor de Videos" },
      { keys: ["g", "c"], label: "Calendario / Publicaciones" },
      { keys: ["g", "u"], label: "Cuentas Sociales" },
      { keys: ["g", "p"], label: "Portadas" },
      { keys: ["g", "d"], label: "Descripciones" },
      { keys: ["g", "e"], label: "Estudio" },
      { keys: ["g", "s"], label: "Insights" },
      { keys: ["g", "b"], label: "Biblioteca" },
      { keys: ["g", "t"], label: "Transcriptor" },
      { keys: ["g", "q"], label: "Equipo" },
      { keys: ["g", "a"], label: "Ajustes" },
      { keys: ["g", "h"], label: "Hub Ejecutivo" },
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {SECTIONS.map((section) => (
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
