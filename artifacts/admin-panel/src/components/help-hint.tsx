import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type HelpHintProps = {
  text: string;
  className?: string;
  iconClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
  ariaLabel?: string;
};

export function HelpHint({ text, className, iconClassName, side = "top", ariaLabel }: HelpHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel || "Más información"}
          className={cn(
            "inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground/70 hover:text-primary transition-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <HelpCircle className={cn("w-3.5 h-3.5", iconClassName)} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[260px] text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
