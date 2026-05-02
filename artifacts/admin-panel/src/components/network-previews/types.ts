import type { Network } from "../social-icons";

export type { Network };

/** Shape of LinkedIn-specific extra fields returned by /api/social/profiles. */
export type LinkedInExtra = {
  isOrg: boolean;
};

export type NetworkExtra = {
  linkedin?: LinkedInExtra;
};

export type NetworkProfile = {
  connected: boolean;
  name?: string | null;
  handle?: string | null;
  avatar?: string | null;
  followers?: number | null;
  /** Network-specific metadata. The shape depends on `network`. */
  extra?: LinkedInExtra | Record<string, unknown> | null;
};

export type SocialProfilesMap = Record<Network, NetworkProfile>;

export type PreviewVideo = {
  id?: number;
  title?: string | null;
  coverDriveId?: string | null;
  coverUrl?: string | null;
  videoFileDriveId?: string | null;
};

/** Type guard for the LinkedIn `extra` shape. */
export function isLinkedInExtra(extra: NetworkProfile["extra"]): extra is LinkedInExtra {
  return !!extra && typeof (extra as LinkedInExtra).isOrg === "boolean";
}
