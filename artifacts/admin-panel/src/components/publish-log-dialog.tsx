import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type Attempt = {
  id: number;
  videoId: number;
  platform: string;
  attemptNumber: number;
  outcome: "success" | "transient_failure" | "permanent_failure" | "skipped";
  errorKind: string | null;
  errorMessage: string | null;
  nextRetryAt: string | null;
  createdAt: string;
};

const NETWORK_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
};

function outcomeUI(outcome: Attempt["outcome"]) {
  switch (outcome) {
    case "success":
      return { icon: CheckCircle2, cls: "text-emerald-500", label: "Éxito" };
    case "transient_failure":
      return { icon: Clock, cls: "text-amber-500", label: "Reintento programado" };
    case "permanent_failure":
      return { icon: AlertCircle, cls: "text-rose-500", label: "Falló definitivamente" };
    default:
      return { icon: AlertTriangle, cls: "text-muted-foreground", label: outcome };
  }
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function PublishLogDialog({
  videoId,
  videoTitle,
  open,
  onOpenChange,
}: {
  videoId: number | null;
  videoTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery<{ attempts: Attempt[] }>({
    queryKey: ["publish-attempts", videoId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/videos/${videoId}/publish-attempts`, {
        credentials: "include",
      });
      if (!r.ok) return { attempts: [] };
      return r.json();
    },
    enabled: open && videoId != null,
  });
  const attempts = data?.attempts ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Historial de publicación</DialogTitle>
          {videoTitle && (
            <p className="text-xs text-muted-foreground line-clamp-1">{videoTitle}</p>
          )}
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-foreground/5 animate-pulse" />
              ))}
            </div>
          ) : attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aún no hay intentos registrados para este video.
            </p>
          ) : (
            <ol className="space-y-2">
              {attempts.map((a) => {
                const ui = outcomeUI(a.outcome);
                const Icon = ui.icon;
                return (
                  <li
                    key={a.id}
                    className="flex gap-3 items-start rounded-lg border border-foreground/10 bg-card/40 p-3"
                  >
                    <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", ui.cls)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {NETWORK_LABELS[a.platform] || a.platform}
                          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                            Intento #{a.attemptNumber} · {ui.label}
                          </span>
                        </p>
                        <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                          {fmtTime(a.createdAt)}
                        </span>
                      </div>
                      {a.errorMessage && (
                        <p className="text-[12px] text-muted-foreground mt-1 break-words">
                          {a.errorMessage}
                        </p>
                      )}
                      {a.nextRetryAt && (
                        <p className="text-[11px] text-amber-500 mt-1">
                          Próximo reintento: {fmtTime(a.nextRetryAt)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
