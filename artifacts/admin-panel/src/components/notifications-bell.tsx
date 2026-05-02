import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  Clock,
  Info,
  X,
  BellOff,
  BellRing,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  getCurrentSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-notifications";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

type Notification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function iconFor(type: string) {
  switch (type) {
    case "publish_success":
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case "publish_partial":
      return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    case "publish_error":
      return <AlertCircle className="w-5 h-5 text-rose-500" />;
    case "schedule_reminder":
      return <Clock className="w-5 h-5 text-blue-500" />;
    case "idea_done":
      return <Lightbulb className="w-5 h-5 text-violet-500" />;
    default:
      return <Info className="w-5 h-5 text-muted-foreground" />;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return "Ahora";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(dateStr).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: items = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/notifications?limit=50`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 60 * 1000,
  });

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/notifications/unread-count`, { credentials: "include" });
      if (!r.ok) return { count: 0 };
      return r.json();
    },
    refetchInterval: 30 * 1000,
  });

  const unreadCount = unread?.count ?? 0;

  // Refresh when an SW push arrives so the bell updates without a manual reload.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "push-received") {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [queryClient]);

  // Detect existing push subscription (so the toggle reflects the real state).
  useEffect(() => {
    if (!isPushSupported()) {
      setPushSubscribed(false);
      return;
    }
    getCurrentSubscription().then((sub) => setPushSubscribed(!!sub));
  }, [open]);

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch(`${API_BASE}/notifications/read-all`, {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const removeOne = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${API_BASE}/notifications/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleTogglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
        toast({ title: "Notificaciones push desactivadas" });
      } else {
        const r = await subscribeToPush();
        if (r.ok) {
          setPushSubscribed(true);
          toast({ title: "Notificaciones push activadas" });
        } else {
          toast({
            title: "No se pudieron activar las notificaciones",
            description: r.reason,
            variant: "destructive",
          });
        }
      }
    } finally {
      setPushBusy(false);
    }
  };

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [items],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative p-2 rounded-lg hover:bg-foreground/10 transition-base text-muted-foreground hover:text-foreground"
          aria-label="Notificaciones"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(92vw,380px)] p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/10 bg-card/80 backdrop-blur">
          <div>
            <h3 className="font-semibold text-sm">Notificaciones</h3>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} sin leer` : "Todo al día"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {isPushSupported() && (
              <button
                type="button"
                onClick={handleTogglePush}
                disabled={pushBusy}
                className={cn(
                  "p-2 rounded-lg transition-base text-xs",
                  pushSubscribed
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-foreground/10",
                )}
                title={pushSubscribed ? "Desactivar push" : "Activar push"}
              >
                {pushSubscribed ? <BellRing className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </button>
            )}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-base flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todo
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          <AnimatePresence initial={false}>
            {sortedItems.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No tienes notificaciones</p>
              </div>
            ) : (
              sortedItems.map((n) => {
                const isRead = !!n.readAt;
                const inner = (
                  <div className="flex gap-3 items-start">
                    <div className="mt-0.5 flex-shrink-0">{iconFor(n.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm leading-snug",
                            isRead ? "text-muted-foreground" : "font-semibold",
                          )}
                        >
                          {n.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeOne.mutate(n.id);
                      }}
                      className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-base opacity-0 group-hover:opacity-100"
                      aria-label="Eliminar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );

                const wrapperCls = cn(
                  "block px-4 py-3 border-b border-foreground/5 hover:bg-foreground/5 transition-base group relative",
                  !isRead && "bg-primary/[0.04]",
                );

                return (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    {n.link ? (
                      <Link
                        href={n.link}
                        className={wrapperCls}
                        onClick={() => {
                          if (!isRead) markRead.mutate(n.id);
                          setOpen(false);
                        }}
                      >
                        {!isRead && (
                          <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-primary" />
                        )}
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={cn(wrapperCls, "w-full text-left")}
                        onClick={() => {
                          if (!isRead) markRead.mutate(n.id);
                        }}
                      >
                        {!isRead && (
                          <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-primary" />
                        )}
                        {inner}
                      </button>
                    )}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  );
}
