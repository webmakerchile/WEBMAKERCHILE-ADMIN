import { useState } from "react";

type AvatarProps = {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  rounded?: "full" | "lg" | "md";
};

const COLORS = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-fuchsia-500",
];

function pickColor(name: string): string {
  if (!name) return COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({ src, name, size = 36, className = "", rounded = "full" }: AvatarProps) {
  const [errored, setErrored] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const color = pickColor(name || "");
  const radius = rounded === "full" ? "rounded-full" : rounded === "lg" ? "rounded-lg" : "rounded-md";

  const showImg = !!src && !errored;

  return (
    <div
      className={`${radius} overflow-hidden flex items-center justify-center text-white font-semibold shrink-0 ${color} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.42) }}
    >
      {showImg ? (
        <img
          src={src as string}
          alt={name || ""}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setErrored(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
