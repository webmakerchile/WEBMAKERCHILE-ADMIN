import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  useJornada, useJornadaStatus, discordChannelLink, formatDuration,
} from "@/lib/jornada";
import { Headphones, Radio } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

/**
 * Estado de la jornada, visible en todas las páginas.
 *
 * La jornada la abre y la cierra la presencia en el canal de voz de Discord, no
 * un botón: por eso esto no es un control, es un espejo. Cuando dice "fuera de
 * jornada" lo que falta no es marcar, es conectarse — y el enlace lleva ahí.
 */
export function JornadaIndicator({ variant = "sidebar" }: { variant?: "sidebar" | "compact" }) {
  const { data, isLoading } = useJornada();
  const { data: status } = useJornadaStatus();
  const [, setTick] = useState(0);

  // El contador avanza en pantalla entre sondeos, sin pedir datos al servidor.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Sin integración configurada no se muestra nada: un indicador que siempre
  // dice "fuera de jornada" enseña al equipo a ignorarlo.
  if (isLoading || !data || !status?.configured) return null;

  const link = discordChannelLink(status);
  const open = data.open;
  const running = !!open;

  // El servidor devuelve los segundos al momento de responder; se les suma lo
  // transcurrido desde entonces para que el reloj no se vea congelado.
  const liveSeconds = open
    ? open.seconds + Math.max(0, Math.floor((Date.now() - new Date(open.lastSeenAt).getTime()) / 1000))
    : data.todaySeconds;

  const openDiscord = () => {
    if (!link) return;
    window.location.href = link.app;
    // Si la app de escritorio no está instalada, el esquema no hace nada:
    // abrimos la versión web como respaldo.
    setTimeout(() => window.open(link.web, "_blank", "noopener"), 1200);
  };

  if (!data.discord.linked) {
    return (
      <a
        href={`${API_BASE}/discord/auth`}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400 transition-base hover:bg-amber-500/15",
          variant === "sidebar" ? "px-3 py-2 text-xs" : "px-2 py-1.5 text-[11px]",
        )}
        title="Vincula tu Discord para que tu jornada se mida sola"
      >
        <Headphones className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{variant === "sidebar" ? "Vincular Discord" : "Discord"}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={running ? undefined : openDiscord}
      className={cn(
        "flex items-center gap-2 rounded-lg border transition-base w-full",
        running
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-default"
          : "border-foreground/15 bg-foreground/[0.04] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]",
        variant === "sidebar" ? "px-3 py-2 text-xs" : "px-2 py-1.5 text-[11px]",
      )}
      title={
        running
          ? `En jornada desde ${new Date(open!.startedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}${open!.channelName ? ` · ${open!.channelName}` : ""}`
          : "Conéctate al canal de voz para que empiece tu jornada"
      }
    >
      {running ? (
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
      ) : (
        <Radio className="w-3.5 h-3.5 flex-shrink-0" />
      )}
      <span className="truncate flex-1 text-left">
        {running ? formatDuration(liveSeconds) : "Fuera de jornada"}
      </span>
      {variant === "sidebar" && (
        <span className="text-[10px] opacity-70 flex-shrink-0">
          {running ? "hoy" : "conectar"}
        </span>
      )}
    </button>
  );
}
