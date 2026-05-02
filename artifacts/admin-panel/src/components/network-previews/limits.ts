import type { Network } from "../social-icons";

export type NetworkLimits = {
  /** Hard maximum chars allowed by the network. */
  max: number;
  /** Approx chars before "...ver más" truncation in the feed. 0 means no truncation. */
  truncateAt: number;
  /** Recommended hashtag soft limit (warn above). 0 means no recommendation. */
  hashtagWarnAbove: number;
};

export const NETWORK_LIMITS: Record<Network, NetworkLimits> = {
  instagram: { max: 2200, truncateAt: 125, hashtagWarnAbove: 30 },
  tiktok: { max: 2200, truncateAt: 150, hashtagWarnAbove: 100 },
  youtube: { max: 5000, truncateAt: 157, hashtagWarnAbove: 15 },
  linkedin: { max: 3000, truncateAt: 210, hashtagWarnAbove: 10 },
  x: { max: 280, truncateAt: 0, hashtagWarnAbove: 5 },
  facebook: { max: 500, truncateAt: 480, hashtagWarnAbove: 10 },
};

export const YOUTUBE_TITLE_MAX = 100;
export const YOUTUBE_TITLE_TRUNCATE = 70;

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
