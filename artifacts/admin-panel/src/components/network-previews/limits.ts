import type { Network } from "../social-icons";

export type NetworkLimits = {
  /** Hard maximum chars allowed by the network. */
  max: number;
  /** Approx chars before "...ver más" truncation in the feed. 0 means no truncation. */
  truncateAt: number;
  /** Recommended hashtag soft limit (warn above). 0 means no recommendation. */
  hashtagWarnAbove: number;
  /** Recommended emoji soft limit (warn above). 0 means no recommendation. */
  emojiWarnAbove: number;
};

export const NETWORK_LIMITS: Record<Network, NetworkLimits> = {
  instagram: { max: 2200, truncateAt: 125, hashtagWarnAbove: 30, emojiWarnAbove: 0 },
  tiktok: { max: 2200, truncateAt: 150, hashtagWarnAbove: 100, emojiWarnAbove: 0 },
  youtube: { max: 5000, truncateAt: 157, hashtagWarnAbove: 15, emojiWarnAbove: 8 },
  linkedin: { max: 3000, truncateAt: 210, hashtagWarnAbove: 10, emojiWarnAbove: 4 },
  x: { max: 280, truncateAt: 0, hashtagWarnAbove: 5, emojiWarnAbove: 0 },
  facebook: { max: 500, truncateAt: 480, hashtagWarnAbove: 10, emojiWarnAbove: 0 },
};

export const YOUTUBE_TITLE_MAX = 100;
export const YOUTUBE_TITLE_TRUNCATE = 70;

/** Matches a single emoji code point (Extended_Pictographic). */
export const EMOJI_RE = /\p{Extended_Pictographic}/gu;
/** Matches an emoji ZWJ sequence (e.g. family/profession compound emojis). */
export const EMOJI_ZWJ_RE = /\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})+/gu;

export function countHashtags(text: string): number {
  if (!text) return 0;
  return (text.match(/#[\p{L}\p{N}_]+/gu) || []).length;
}

export function detectUrls(text: string): string[] {
  if (!text) return [];
  return text.match(/https?:\/\/[^\s]+/gi) || [];
}

export function countMentions(text: string): number {
  if (!text) return 0;
  return (text.match(/@[\w.]+/g) || []).length;
}

export function countEmojis(text: string): number {
  if (!text) return 0;
  return (text.match(EMOJI_RE) || []).length;
}

export function hasZwjEmoji(text: string): boolean {
  if (!text) return false;
  return EMOJI_ZWJ_RE.test(text);
}
