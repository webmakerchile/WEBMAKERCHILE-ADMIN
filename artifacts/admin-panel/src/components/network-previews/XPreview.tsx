import { MessageCircle, Repeat2, Heart, BarChart3, Bookmark, Share, BadgeCheck } from "lucide-react";
import { Avatar } from "./Avatar";
import { HighlightedText } from "./text-utils";
import type { NetworkProfile, PreviewVideo } from "./types";

export function XPreview({
  text,
  profile,
  video,
}: {
  text: string;
  profile?: NetworkProfile;
  video?: PreviewVideo;
}) {
  const handle = profile?.handle || "tu_cuenta";
  const name = profile?.name || handle;

  return (
    <div className="bg-black text-white rounded-2xl overflow-hidden shadow-lg max-w-md mx-auto border border-white/10">
      <div className="flex gap-3 px-4 pt-3.5">
        <Avatar src={profile?.avatar} name={name} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-[14px] leading-tight">
            <span className="font-bold truncate">{name}</span>
            <BadgeCheck className="w-4 h-4 text-sky-400 fill-sky-400 stroke-black" />
            <span className="text-gray-500 truncate">@{handle}</span>
            <span className="text-gray-500">· 2 h</span>
          </div>
          <div className="text-[15px] leading-snug mt-0.5">
            <HighlightedText text={text || ""} accentClassName="text-sky-400" />
          </div>

          {video?.title ? (
            <div className="mt-2 aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-zinc-700 via-zinc-800 to-black flex items-center justify-center border border-white/10">
              <span className="px-4 text-center text-sm font-semibold drop-shadow">{video.title}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-5 gap-1 mt-2 text-[12px] text-gray-500 max-w-md">
            <Action Icon={MessageCircle} count="34" />
            <Action Icon={Repeat2} count="12" />
            <Action Icon={Heart} count="248" />
            <Action Icon={BarChart3} count="9.8K" />
            <div className="flex items-center justify-end gap-2 pr-2">
              <Bookmark className="w-4 h-4" />
              <Share className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
      <div className="h-3" />
    </div>
  );
}

function Action({ Icon, count }: { Icon: typeof MessageCircle; count: string }) {
  return (
    <button className="flex items-center gap-1.5 hover:text-sky-400 transition-colors">
      <Icon className="w-4 h-4" />
      <span>{count}</span>
    </button>
  );
}
