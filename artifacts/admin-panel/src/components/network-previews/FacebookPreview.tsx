import { ThumbsUp, MessageCircle, Share2, Globe, MoreHorizontal } from "lucide-react";
import { Avatar } from "./Avatar";
import { HighlightedText, formatCount, splitAtTruncation } from "./text-utils";
import { NETWORK_LIMITS } from "./limits";
import type { NetworkProfile, PreviewVideo } from "./types";

export function FacebookPreview({
  text,
  profile,
  video,
}: {
  text: string;
  profile?: NetworkProfile;
  video?: PreviewVideo;
}) {
  const name = profile?.name || "Tu Página";
  const subs = profile?.followers != null ? `${formatCount(profile.followers)} seguidores` : "Página";
  const { head, tail } = splitAtTruncation(text || "", NETWORK_LIMITS.facebook.truncateAt);

  return (
    <div className="bg-white text-black rounded-2xl overflow-hidden shadow-lg max-w-md mx-auto border border-black/10">
      <header className="flex items-start gap-3 px-4 pt-3">
        <Avatar src={profile?.avatar} name={name} size={44} rounded="full" />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold leading-tight truncate">{name}</div>
          <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5 truncate">
            <span>{subs}</span>
            <span>·</span>
            <span>2 h</span>
            <Globe className="w-3 h-3" />
          </div>
        </div>
        <MoreHorizontal className="w-5 h-5 text-gray-600" />
      </header>

      <div className="px-4 mt-2 text-[14px] leading-snug">
        <HighlightedText text={head} accentClassName="text-blue-700" />
        {tail ? <span className="text-gray-600"> …Ver más</span> : null}
      </div>

      <div className="aspect-video mt-3 bg-gradient-to-br from-blue-200 via-cyan-200 to-blue-300 flex items-center justify-center text-gray-700">
        {video?.title ? (
          <span className="px-6 text-center text-base font-semibold drop-shadow">{video.title}</span>
        ) : (
          <span className="text-gray-500 text-sm">Vista previa del video</span>
        )}
      </div>

      <div className="px-4 py-2 text-[12px] text-gray-600 flex items-center justify-between border-b border-gray-200">
        <span>👍 ❤️ 1.2K</span>
        <span>89 comentarios · 23 veces compartido</span>
      </div>
      <div className="grid grid-cols-3 px-2 py-1 text-[13px] text-gray-700">
        {[
          { Icon: ThumbsUp, label: "Me gusta" },
          { Icon: MessageCircle, label: "Comentar" },
          { Icon: Share2, label: "Compartir" },
        ].map(({ Icon, label }) => (
          <button key={label} className="flex items-center justify-center gap-1.5 py-2 hover:bg-gray-100 rounded">
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
