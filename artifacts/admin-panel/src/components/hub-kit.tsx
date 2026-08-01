import { ReactNode } from "react";
import { X, ChevronRight } from "lucide-react";
import "./hub-kit.css";

export function SheetHeader({
  title,
  subtitle,
  icon,
  onClose,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="hk-sheet-head">
      <div className="hk-sheet-head-icon">{icon}</div>
      <div className="hk-sheet-head-text">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button className="hk-sheet-head-close" onClick={onClose} aria-label="Cerrar">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

export function OptionCard({
  icon,
  title,
  desc,
  previewCue,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  previewCue?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="hk-opt-card" onClick={onClick}>
      <div className="hk-opt-card-top">
        <div className="hk-opt-card-icon">{icon}</div>
        <div className="hk-opt-card-body">
          <div className="hk-opt-card-title">
            {title}
            <ChevronRight className="w-4 h-4 hk-opt-card-arr" />
          </div>
          <p className="hk-opt-card-desc">{desc}</p>
        </div>
      </div>
      {previewCue && <div className="hk-opt-card-cue">{previewCue}</div>}
    </button>
  );
}

export function SectionHeader({
  title,
  icon,
  count,
}: {
  title: string;
  icon?: ReactNode;
  count?: number;
}) {
  return (
    <div className="hk-sec-head">
      {icon && <div className="hk-sec-head-icon">{icon}</div>}
      <h3 className="hk-sec-head-title">
        {title}
        {count !== undefined && <span className="hk-sec-head-n">({count})</span>}
      </h3>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="hk-empty">
      <div className="hk-empty-ill">{icon}</div>
      <h4 className="hk-empty-title">{title}</h4>
      <p className="hk-empty-hint">{hint}</p>
      {action && <div className="hk-empty-action">{action}</div>}
    </div>
  );
}

export function StatusChip({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  return (
    <span className="hk-chip">
      <span className="hk-chip-dot" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function SkeletonShimmer({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`hk-shimmer ${className || ""}`}
      style={{ ...style, height: style?.height || 20, width: style?.width || "100%" }}
    />
  );
}
