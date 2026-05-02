import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ChangeEvent,
  type CSSProperties,
} from "react";

export type TruncatedTextareaProps = {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  /** Approx. char index where the network truncates with "…ver más" in the feed. */
  truncateAt: number;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  /** Tailwind utility(s) for the minimum height (e.g. `min-h-[180px]`). */
  minHeightClass?: string;
  /** Optional aria-label for the underlying textarea. */
  ariaLabel?: string;
};

/**
 * Wraps a textarea with a non-interactive mirror layer that highlights the
 * portion of the text that would be hidden behind the network's "…ver más"
 * truncation in the feed. The mirror shares typography/padding with the real
 * textarea so wrapping aligns 1:1, and forwards scrollTop on long inputs.
 */
export const TruncatedTextarea = forwardRef<HTMLTextAreaElement, TruncatedTextareaProps>(
  function TruncatedTextarea(
    {
      value,
      onChange,
      truncateAt,
      placeholder,
      maxLength,
      disabled,
      minHeightClass = "min-h-[180px]",
      ariaLabel,
    },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const mirrorRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

    useEffect(() => {
      const ta = innerRef.current;
      const mirror = mirrorRef.current;
      if (!ta || !mirror) return;
      const handler = () => {
        mirror.scrollTop = ta.scrollTop;
      };
      ta.addEventListener("scroll", handler);
      return () => ta.removeEventListener("scroll", handler);
    }, []);

    const isOver = truncateAt > 0 && value.length > truncateAt;
    const head = isOver ? value.slice(0, truncateAt) : value;
    const tail = isOver ? value.slice(truncateAt) : "";

    const sharedTextStyle: CSSProperties = {
      font: "inherit",
      lineHeight: "1.5rem",
    };

    return (
      <div
        className={`relative bg-background border border-border rounded-xl focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all ${minHeightClass}`}
      >
        <div
          ref={mirrorRef}
          aria-hidden="true"
          className={`absolute inset-0 px-4 py-3 text-transparent whitespace-pre-wrap break-words overflow-hidden rounded-xl ${minHeightClass}`}
          style={sharedTextStyle}
        >
          <span>{head}</span>
          {isOver ? (
            <span className="rounded-sm bg-amber-500/15 outline outline-1 outline-amber-400/40">
              {tail}
            </span>
          ) : null}
          {/* zero-width sentinel keeps trailing newlines wrapped like in the textarea */}
          <span>{"\u200b"}</span>
        </div>
        <textarea
          ref={innerRef}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          aria-label={ariaLabel}
          className={`relative w-full bg-transparent text-foreground placeholder:text-muted-foreground px-4 py-3 outline-none resize-y rounded-xl ${minHeightClass}`}
          style={sharedTextStyle}
        />
        {isOver ? (
          <div
            className="absolute right-2 top-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 pointer-events-none select-none"
            title={`En el feed se mostrarán ~${truncateAt} caracteres antes de "…ver más"`}
          >
            <span aria-hidden="true">✂</span>
            <span>se corta a los {truncateAt}</span>
          </div>
        ) : null}
      </div>
    );
  },
);
