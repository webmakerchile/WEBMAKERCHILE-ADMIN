import { ThumbsUp, MessageSquare, Repeat2, Send, Globe } from "lucide-react";
import { Avatar } from "./Avatar";
import { HighlightedText, formatCount, splitAtTruncation } from "./text-utils";
import { NETWORK_LIMITS } from "./limits";
import { isLinkedInExtra, type NetworkProfile, type PreviewVideo } from "./types";

export function LinkedInPreview({
  text,
  profile,
  video,
}: {
  text: string;
  profile?: NetworkProfile;
  video?: PreviewVideo;
}) {
  const name = profile?.name || "Tu cuenta";
  const subs = profile?.followers != null ? `${formatCount(profile.followers)} seguidores` : "Profesional";
  const isOrg = isLinkedInExtra(profile?.extra) ? profile.extra.isOrg : false;
  const { head, tail } = splitAtTruncation(text || "", NETWORK_LIMITS.linkedin.truncateAt);

  return (
    <div className="bg-white text-black rounded-2xl overflow-hidden shadow-lg max-w-md mx-auto border border-black/10">
      <header className="flex items-start gap-3 px-4 pt-3">
        <Avatar src={profile?.avatar} name={name} size={48} rounded={isOrg ? "md" : "full"} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold leading-tight truncate">{name}</div>
          <div className="text-[12px] text-gray-600 truncate">{subs}</div>
          <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
            2 h · <Globe className="w-3 h-3" />
          </div>
        </div>
      </header>

      <div className="px-4 mt-2 text-[14px] leading-snug">
        <HighlightedText text={head} accentClassName="text-blue-700" />
        {tail ? <span className="text-gray-600"> …ver más</span> : null}
      </div>

      <div className="aspect-video mt-3 bg-gradient-to-br from-blue-200 via-indigo-200 to-blue-300 flex items-center justify-center text-gray-700">
        {video?.title ? (
          <span className="px-6 text-center text-base font-semibold drop-shadow">{video.title}</span>
        ) : (
          <span className="text-gray-500 text-sm">Vista previa del video</span>
        )}
      </div>

      <div className="px-4 py-2 text-[11px] text-gray-600 border-b border-gray-200 flex items-center justify-between">
        <span>👍 ❤️ 👏 312</span>
        <span>27 comentarios · 14 republicaciones</span>
      </div>
      <div className="px-2 py-1.5 grid grid-cols-4 gap-1 text-[12px] text-gray-700">
        {[
          { Icon: ThumbsUp, label: "Recomendar" },
          { Icon: MessageSquare, label: "Comentar" },
          { Icon: Repeat2, label: "Compartir" },
          { Icon: Send, label: "Enviar" },
        ].map(({ Icon, label }) => (
          <button key={label} className="flex items-center justify-center gap-1.5 py-2 hover:bg-gray-100 rounded">
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
