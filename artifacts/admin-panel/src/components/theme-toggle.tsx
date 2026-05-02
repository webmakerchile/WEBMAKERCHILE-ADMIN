import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemeMode } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const NEXT_LABEL: Record<ThemeMode, string> = {
  light: "Cambiar a tema oscuro",
  dark: "Cambiar a tema del sistema",
  system: "Cambiar a tema claro",
};

const CURRENT_LABEL: Record<ThemeMode, string> = {
  light: "Claro",
  dark: "Oscuro",
  system: "Sistema",
};

/**
 * Botón cíclico: claro → oscuro → sistema → claro.
 * Persiste en localStorage. Accesible por teclado y screen-reader.
 */
export function ThemeToggle({
  variant = "icon",
  className,
}: {
  variant?: "icon" | "full";
  className?: string;
}) {
  const { mode, cycle } = useTheme();
  const Icon = ICONS[mode];

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={cycle}
        aria-label={NEXT_LABEL[mode]}
        title={NEXT_LABEL[mode]}
        className={cn(
          "flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium",
          "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
          "border border-foreground/10 transition-base",
          className,
        )}
      >
        <Icon className="w-4 h-4" />
        <span>Tema: {CURRENT_LABEL[mode]}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={NEXT_LABEL[mode]}
      title={`Tema: ${CURRENT_LABEL[mode]} — clic para cambiar`}
      className={cn(
        "inline-flex items-center justify-center w-9 h-9 rounded-xl",
        "text-muted-foreground hover:text-foreground hover:bg-foreground/5",
        "border border-foreground/10 transition-base",
        className,
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
