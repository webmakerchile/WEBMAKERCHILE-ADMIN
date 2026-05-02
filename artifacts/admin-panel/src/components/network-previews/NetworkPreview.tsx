import type { Network, NetworkProfile, PreviewVideo } from "./types";
import { InstagramPreview } from "./InstagramPreview";
import { TikTokPreview } from "./TikTokPreview";
import { YouTubePreview } from "./YouTubePreview";
import { LinkedInPreview } from "./LinkedInPreview";
import { XPreview } from "./XPreview";
import { FacebookPreview } from "./FacebookPreview";

export type NetworkPreviewProps = {
  network: Network;
  text: string;
  /** Used by YouTube only. */
  title?: string;
  profile?: NetworkProfile;
  video?: PreviewVideo;
};

export function NetworkPreview({ network, text, title, profile, video }: NetworkPreviewProps) {
  switch (network) {
    case "instagram":
      return <InstagramPreview text={text} profile={profile} video={video} />;
    case "tiktok":
      return <TikTokPreview text={text} profile={profile} video={video} />;
    case "youtube":
      return <YouTubePreview title={title || ""} description={text} profile={profile} video={video} />;
    case "linkedin":
      return <LinkedInPreview text={text} profile={profile} video={video} />;
    case "x":
      return <XPreview text={text} profile={profile} video={video} />;
    case "facebook":
      return <FacebookPreview text={text} profile={profile} video={video} />;
  }
}
