import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from "lucide-react";
import { Avatar } from "./Avatar";
import { HighlightedText, splitAtTruncation } from "./text-utils";
import { NETWORK_LIMITS } from "./limits";
import type { NetworkProfile, PreviewVideo } from "./types";

export function InstagramPreview({
  text,
  profile,
  video,
  density = "comfortable",
}: {
  text: string;
  profile?: NetworkProfile;
  video?: PreviewVideo;
  density?: "comfortable" | "compact";
}) {
  const handle = profile?.handle || "tu_cuenta";
  const name = profile?.name || handle;
  const { head, tail } = splitAtTruncation(text || "", NETWORK_LIMITS.instagram.truncateAt);
  const compact = density === "compact";

  return (
    <div className="bg-white text-black rounded-2xl overflow-hidden shadow-lg max-w-md mx-auto border border-black/10">
      <header className="flex items-center gap-3 px-3 py-2.5">
        <div className="rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
          <div className="bg-white p-[2px] rounded-full">
            <Avatar src={profile?.avatar} name={name} size={32} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold leading-tight truncate">{handle}</div>
          <div className="text-[11px] text-gray-500 truncate">Original audio</div>
        </div>
        <MoreHorizontal className="w-5 h-5 text-black" />
      </header>

      <div className="aspect-[4/5] bg-gradient-to-br from-pink-200 via-purple-200 to-orange-200 flex items-center justify-center text-gray-700 text-sm relative">
        {video?.title ? (
          <span className="px-4 text-center text-base font-semibold drop-shadow">{video.title}</span>
        ) : (
          <span className="text-gray-500">Vista previa del video</span>
        )}
      </div>

      <div className="px-3 pt-2.5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <Heart className="w-6 h-6" />
            <MessageCircle className="w-6 h-6" />
            <Send className="w-6 h-6" />
          </div>
          <Bookmark className="w-6 h-6" />
        </div>
        <div className="text-[13px] font-semibold mt-2">1.234 Me gusta</div>
        <div className={`text-[13px] leading-snug mt-1 ${compact ? "line-clamp-3" : ""}`}>
          <span className="font-semibold mr-1">{handle}</span>
          <HighlightedText
            text={head}
            accentClassName="text-blue-700"
            preserveLineBreaks={false}
          />
          {tail ? <span className="text-gray-500"> ...más</span> : null}
        </div>
        <div className="text-[12px] text-gray-500 mt-1">Ver los 12 comentarios</div>
        <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide">Hace 2 horas</div>
      </div>
    </div>
  );
}
