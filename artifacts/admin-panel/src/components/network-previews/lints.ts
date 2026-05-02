import type { Network } from "../social-icons";
import {
  NETWORK_LIMITS,
  YOUTUBE_TITLE_MAX,
  YOUTUBE_TITLE_TRUNCATE,
  countEmojis,
  countHashtags,
  detectUrls,
  hasZwjEmoji,
} from "./limits";

export type LintLevel = "error" | "warn" | "info";

export type LintIssue = {
  level: LintLevel;
  message: string;
};

export type LintInput = {
  network: Network;
  text: string;
  /** Optional title (used for YouTube). */
  title?: string;
};

/**
 * Returns content lints for a given network's text. Errors block publishing,
 * warns are advisory, infos are stylistic suggestions.
 */
export function lintContent({ network, text, title }: LintInput): LintIssue[] {
  const issues: LintIssue[] = [];
  const limits = NETWORK_LIMITS[network];
  const value = text || "";
  const len = value.length;

  if (limits.max && len > limits.max) {
    issues.push({
      level: "error",
      message: `Excede el máximo de ${limits.max} caracteres (${len}).`,
    });
  } else if (limits.max && len > limits.max * 0.95) {
    issues.push({
      level: "warn",
      message: `Cerca del límite (${len}/${limits.max}).`,
    });
  }

  const hashtags = countHashtags(value);
  if (limits.hashtagWarnAbove && hashtags > limits.hashtagWarnAbove) {
    issues.push({
      level: "warn",
      message: `${hashtags} hashtags · se recomienda máximo ${limits.hashtagWarnAbove}.`,
    });
  }

  const urls = detectUrls(value);
  if (network === "x" && urls.length > 0) {
    issues.push({
      level: "warn",
      message: "X no genera tarjetas de enlace en posts simples · el link se verá como texto plano.",
    });
  }
  if (network === "instagram" && urls.length > 0) {
    issues.push({
      level: "info",
      message: "Instagram no convierte enlaces en el caption — usa “link en bio”.",
    });
  }
  if (network === "tiktok" && urls.length > 0) {
    issues.push({
      level: "info",
      message: "TikTok no muestra enlaces clickeables en la descripción.",
    });
  }

  // Emoji compatibility checks per network.
  const emojiCount = countEmojis(value);
  if (limits.emojiWarnAbove && emojiCount > limits.emojiWarnAbove) {
    const where = network === "linkedin" ? "feed corporativo" : "buscadores y miniaturas";
    issues.push({
      level: "warn",
      message: `${emojiCount} emojis · pueden ocultarse en el ${where} de ${networkProperName(network)}.`,
    });
  }
  if (network === "youtube" && title && countEmojis(title) > 0) {
    issues.push({
      level: "info",
      message: "Los emojis en el título no aparecen en el buscador ni en miniaturas de YouTube.",
    });
  }
  if (hasZwjEmoji(value)) {
    issues.push({
      level: "info",
      message: "Algunos emojis combinados (familias, profesiones) pueden no verse en clientes antiguos.",
    });
  }

  if (network === "youtube") {
    const t = (title || "").length;
    if (t > YOUTUBE_TITLE_MAX) {
      issues.push({ level: "error", message: `Título excede ${YOUTUBE_TITLE_MAX} caracteres (${t}).` });
    } else if (t > YOUTUBE_TITLE_TRUNCATE) {
      issues.push({
        level: "warn",
        message: `Título largo (${t}). Se trunca en móvil después de ~${YOUTUBE_TITLE_TRUNCATE} caracteres.`,
      });
    }
  }

  if (network === "linkedin") {
    const lineBreaks = (value.match(/\n/g) || []).length;
    if (lineBreaks > 6) {
      issues.push({
        level: "info",
        message: "Demasiados saltos de línea — el feed mostrará “…ver más” muy pronto.",
      });
    }
  }

  if ((network === "tiktok" || network === "instagram") && hashtags === 0 && len > 0) {
    issues.push({
      level: "info",
      message: "Sin hashtags · agrega 3-5 para mejor alcance.",
    });
  }

  return issues;
}

function networkProperName(n: Network): string {
  switch (n) {
    case "linkedin":
      return "LinkedIn";
    case "youtube":
      return "YouTube";
    case "tiktok":
      return "TikTok";
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "x":
      return "X";
  }
}

export function severity(issues: LintIssue[]): LintLevel | null {
  if (issues.some((i) => i.level === "error")) return "error";
  if (issues.some((i) => i.level === "warn")) return "warn";
  if (issues.some((i) => i.level === "info")) return "info";
  return null;
}
