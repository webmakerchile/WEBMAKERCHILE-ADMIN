import { type ReactNode } from "react";
import { Link } from "wouter";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
  size?: "sm" | "md" | "lg";
  children?: ReactNode;
};

const SIZES = {
  sm: { wrap: "py-8 px-4", icon: "w-8 h-8 mb-2", title: "text-sm", description: "text-xs" },
  md: { wrap: "py-12 px-6", icon: "w-12 h-12 mb-3", title: "text-base", description: "text-sm" },
  lg: { wrap: "py-16 px-8", icon: "w-14 h-14 mb-4", title: "text-lg", description: "text-sm" },
} as const;

function ActionButton({ action, primary }: { action: EmptyStateAction; primary: boolean }) {
  const baseClass = primary
    ? "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-orange-400 transition-base shadow-lg shadow-primary/20 text-sm"
    : "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-foreground border border-foreground/10 transition-base text-sm";
  if (action.href) {
    return (
      <Link to={action.href} className={baseClass}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={baseClass}>
      {action.label}
    </button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "md",
  children,
}: EmptyStateProps) {
  const s = SIZES[size];
  return (
    <div className={cn("text-center flex flex-col items-center", s.wrap, className)}>
      <div className="rounded-2xl bg-foreground/[0.04] border border-foreground/10 p-3 mb-3">
        <Icon className={cn(s.icon, "text-primary/60 mb-0")} aria-hidden="true" />
      </div>
      <h3 className={cn("font-semibold text-foreground mb-1", s.title)}>{title}</h3>
      {description && (
        <p className={cn("text-muted-foreground max-w-sm", s.description)}>{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          {action && <ActionButton action={action} primary />}
          {secondaryAction && <ActionButton action={secondaryAction} primary={false} />}
        </div>
      )}
      {children && <div className="mt-4 w-full">{children}</div>}
    </div>
  );
}
