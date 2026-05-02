import { Heart, MessageCircle, Bookmark, Share2, Music2 } from "lucide-react";
import { Avatar } from "./Avatar";
import { HighlightedText, splitAtTruncation } from "./text-utils";
import { NETWORK_LIMITS } from "./limits";
import type { NetworkProfile, PreviewVideo } from "./types";

export function TikTokPreview({
  text,
  profile,
  video,
}: {
  text: string;
  profile?: NetworkProfile;
  video?: PreviewVideo;
}) {
  const handle = profile?.handle || "tu_cuenta";
  const { head, tail } = splitAtTruncation(text || "", NETWORK_LIMITS.tiktok.truncateAt);

  return (
    <div className="bg-black text-white rounded-2xl overflow-hidden shadow-lg max-w-sm mx-auto relative aspect-[9/16]">
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black flex items-center justify-center">
        {video?.title ? (
          <span className="px-6 text-center text-base font-semibold drop-shadow-2xl">{video.title}</span>
        ) : (
          <span className="text-zinc-500 text-sm">Vista previa del video</span>
        )}
      </div>

      <div className="absolute top-4 inset-x-0 flex items-center justify-center gap-6 text-[13px] font-semibold">
        <span className="opacity-60">Siguiendo</span>
        <span className="border-b-2 border-white pb-0.5">Para ti</span>
      </div>

      <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4">
        <div className="relative">
          <Avatar src={profile?.avatar} name={handle} size={44} />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-[12px] font-bold">
            +
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Heart className="w-7 h-7 fill-white" />
          <span className="text-[11px] font-semibold">12.4K</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <MessageCircle className="w-7 h-7 fill-white" />
          <span className="text-[11px] font-semibold">348</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Bookmark className="w-7 h-7 fill-white" />
          <span className="text-[11px] font-semibold">221</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Share2 className="w-7 h-7" />
          <span className="text-[11px] font-semibold">90</span>
        </div>
      </div>

      <div className="absolute left-3 right-16 bottom-3 space-y-1.5">
        <div className="text-[14px] font-semibold">@{handle}</div>
        <div className="text-[13px] leading-snug">
          <HighlightedText text={head} accentClassName="text-cyan-300" preserveLineBreaks={false} />
          {tail ? <span className="text-white/70"> ...más</span> : null}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] opacity-90 pt-0.5">
          <Music2 className="w-3.5 h-3.5" />
          <span className="truncate">Sonido original · {handle}</span>
        </div>
      </div>
    </div>
  );
}
