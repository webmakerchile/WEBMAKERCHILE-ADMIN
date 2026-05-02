import { Avatar } from "./Avatar";
import { HighlightedText, formatCount, splitAtTruncation } from "./text-utils";
import { NETWORK_LIMITS, YOUTUBE_TITLE_TRUNCATE } from "./limits";
import type { NetworkProfile, PreviewVideo } from "./types";

export function YouTubePreview({
  title,
  description,
  profile,
  video,
}: {
  title: string;
  description: string;
  profile?: NetworkProfile;
  video?: PreviewVideo;
}) {
  const channelName = profile?.name || "Tu canal";
  const subs = profile?.followers != null ? `${formatCount(profile.followers)} suscriptores` : "Sin datos";
  const truncTitle = title.length > YOUTUBE_TITLE_TRUNCATE
    ? `${title.slice(0, YOUTUBE_TITLE_TRUNCATE)}…`
    : title;
  const { head: descHead, tail: descTail } = splitAtTruncation(description || "", NETWORK_LIMITS.youtube.truncateAt);

  return (
    <div className="bg-white text-black rounded-2xl overflow-hidden shadow-lg max-w-md mx-auto border border-black/10">
      <div className="aspect-video bg-gradient-to-br from-red-200 via-orange-200 to-amber-200 flex items-center justify-center text-gray-700 relative">
        {video?.title ? (
          <span className="px-6 text-center text-base font-semibold drop-shadow">{video.title}</span>
        ) : (
          <span className="text-gray-500 text-sm">Vista previa del video</span>
        )}
        <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded">0:42</span>
      </div>

      <div className="px-3 py-3">
        <div className="flex gap-3">
          <Avatar src={profile?.avatar} name={channelName} size={36} />
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold leading-snug line-clamp-2">
              {truncTitle || "Tu título de YouTube"}
            </h3>
            <div className="text-[12px] text-gray-600 mt-1 truncate">
              {channelName} · {subs}
            </div>
            <div className="text-[12px] text-gray-600 mt-0.5">12K vistas · hace 2 horas</div>
          </div>
        </div>

        {description ? (
          <div className="mt-3 bg-gray-100 rounded-lg p-2.5 text-[12px] leading-snug">
            <HighlightedText text={descHead} accentClassName="text-blue-600" />
            {descTail ? <span className="text-gray-500"> …más</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
