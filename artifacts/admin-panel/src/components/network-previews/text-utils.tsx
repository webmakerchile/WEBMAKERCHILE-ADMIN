import { Fragment, type ReactNode } from "react";

const TOKEN_RE = /(#[\p{L}\p{N}_]+|@[\w.]+|https?:\/\/\S+)/gu;

/**
 * Renders text where hashtags, mentions and URLs are highlighted in
 * the network's accent color so the preview matches what the user sees.
 */
export function HighlightedText({
  text,
  className = "",
  accentClassName = "text-sky-400",
  preserveLineBreaks = true,
}: {
  text: string;
  className?: string;
  accentClassName?: string;
  preserveLineBreaks?: boolean;
}): ReactNode {
  if (!text) return <span className={className}>{""}</span>;
  const parts = text.split(TOKEN_RE);
  return (
    <span className={`${className} ${preserveLineBreaks ? "whitespace-pre-wrap" : ""}`}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (TOKEN_RE.test(part)) {
          TOKEN_RE.lastIndex = 0;
          return (
            <span key={i} className={accentClassName}>
              {part}
            </span>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}

export function formatCount(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "";
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")} mil`;
  if (n < 1_000_000) return `${Math.round(n / 1000)} mil`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/**
 * Splits a text into the first portion shown above the fold and the rest
 * that would be hidden behind a "...ver más" affordance.
 */
export function splitAtTruncation(text: string, at: number): { head: string; tail: string } {
  if (!text || at <= 0 || text.length <= at) return { head: text || "", tail: "" };
  const slice = text.slice(0, at);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > at - 30 ? lastSpace : at;
  return { head: text.slice(0, cut), tail: text.slice(cut) };
}
