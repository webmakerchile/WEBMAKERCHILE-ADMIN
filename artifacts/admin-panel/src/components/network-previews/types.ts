import type { Network } from "../social-icons";

export type { Network };

export type NetworkProfile = {
  connected: boolean;
  name?: string | null;
  handle?: string | null;
  avatar?: string | null;
  followers?: number | null;
  extra?: Record<string, unknown>;
};

export type SocialProfilesMap = Record<Network, NetworkProfile>;

export type PreviewVideo = {
  id?: number;
  title?: string | null;
  coverDriveId?: string | null;
  coverUrl?: string | null;
  videoFileDriveId?: string | null;
};
