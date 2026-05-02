import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/use-theme";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  LayoutDashboard,
  Video,
  CalendarClock,
  Image as ImageIcon,
  FolderTree,
  Clapperboard,
  Sparkles,
  MessageSquareText,
  Users2,
  HelpCircle,
  Plus,
  Search,
  Keyboard,
  Loader2,
  Plug,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, credentials: "include" });
}

// Navigate to /videos and trigger an action (new wizard or select). When the
// user is already on /videos, wouter does NOT re-mount the page on a query-only
// change, so we use a CustomEvent that the page listens for. From another
// route, we navigate with a deep-link query that the freshly-mounted page
// picks up. This dual mechanism keeps shortcuts and palette reliable from
// anywhere in the app.
function navigateAndTriggerVideo(
  setLocation: (to: string) => void,
  currentPath: string,
  action: "new" | { selectId: number },
) {
  const isHere = currentPath === "/videos";
  if (action === "new") {
    if (isHere) {
      window.dispatchEvent(new CustomEvent("videos:new"));
    } else {
      setLocation("/videos?new=1");
    }
  } else {
    if (isHere) {
      window.dispatchEvent(
        new CustomEvent("videos:select", { detail: { id: action.selectId } }),
      );
    } else {
      setLocation(`/videos?select=${action.selectId}`);
    }
  }
}

type SearchedVideo = {
  id: number;
  title: string;
  status: string;
  coverImageBase64: string | null;
  coverMimeType: string | null;
  scheduledAt: string | null;
  month: string | null;
};

type Page = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string[];
};

const PAGES: Page[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard, shortcut: ["g", "i"] },
  { href: "/videos", label: "Gestor de Videos", icon: Video, shortcut: ["g", "v"] },
  { href: "/schedule", label: "Calendario / Publicaciones", icon: CalendarClock, shortcut: ["g", "c"] },
  { href: "/cuentas", label: "Cuentas Sociales", icon: Users2, shortcut: ["g", "u"] },
  { href: "/cover", label: "Portadas", icon: ImageIcon, shortcut: ["g", "p"] },
  { href: "/historias", label: "Historias", icon: Sparkles },
  { href: "/descripciones", label: "Descripciones", icon: MessageSquareText, shortcut: ["g", "d"] },
  { href: "/drive", label: "Drive", icon: FolderTree },
  { href: "/estudio", label: "Estudio", icon: Clapperboard, shortcut: ["g", "e"] },
  { href: "/ayuda", label: "Ayuda", icon: HelpCircle },
];

type ActionContext = {
  setLocation: (to: string) => void;
  currentPath: string;
  cycleTheme: () => void;
  themeMode: "light" | "dark" | "system";
};

type Action = {
  id: string;
  label: (ctx: ActionContext) => string;
  icon: (ctx: ActionContext) => React.ComponentType<{ className?: string }>;
  shortcut?: string[];
  run: (ctx: ActionContext) => void;
};

const ACTIONS: Action[] = [
  {
    id: "new-video",
    label: () => "Crear nuevo video",
    icon: () => Plus,
    shortcut: ["n"],
    run: ({ setLocation, currentPath }) =>
      navigateAndTriggerVideo(setLocation, currentPath, "new"),
  },
  {
    id: "schedule",
    label: () => "Ir a programar publicaciones",
    icon: () => CalendarClock,
    shortcut: ["s"],
    run: ({ setLocation }) => setLocation("/schedule"),
  },
  {
    id: "connect-network",
    label: () => "Conectar red social",
    icon: () => Plug,
    run: ({ setLocation }) => setLocation("/cuentas"),
  },
  {
    id: "cycle-theme",
    label: ({ themeMode }) =>
      themeMode === "dark"
        ? "Cambiar tema → Sistema"
        : themeMode === "system"
          ? "Cambiar tema → Claro"
          : "Cambiar tema → Oscuro",
    icon: ({ themeMode }) =>
      themeMode === "dark" ? Moon : themeMode === "light" ? Sun : Monitor,
    shortcut: ["t"],
    run: ({ cycleTheme }) => cycleTheme(),
  },
  {
    id: "shortcuts",
    label: () => "Ver atajos de teclado",
    icon: () => Keyboard,
    shortcut: ["?"],
    run: () => {
      window.dispatchEvent(new CustomEvent("open-shortcuts"));
    },
  },
];

function statusLabel(status: string): string {
  if (status === "published") return "Publicado";
  if (status === "scheduled") return "Programado";
  if (status === "partial") return "Parcial";
  if (status === "error") return "Error";
  if (status === "cover_generated") return "Portada lista";
  return "Borrador";
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [currentPath, setLocation] = useLocation();
  const { mode: themeMode, cycle: cycleTheme } = useTheme();
  const actionCtx: ActionContext = { setLocation, currentPath, cycleTheme, themeMode };

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
    }
  }, [open]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 180);
    return () => window.clearTimeout(t);
  }, [query]);

  const { data: searchData, isFetching } = useQuery<{ items: SearchedVideo[]; total: number }>({
    queryKey: ["command-search", debounced],
    enabled: open && debounced.length >= 2,
    queryFn: async () => {
      const res = await apiFetch(
        `${API_BASE}/content/videos/search?q=${encodeURIComponent(debounced)}&limit=10`,
      );
      if (!res.ok) throw new Error("search failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const videos = useMemo(() => searchData?.items ?? [], [searchData]);

  const close = () => onOpenChange(false);

  const go = (to: string) => {
    close();
    setLocation(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar video, página o acción..."
        value={query}
        onValueChange={setQuery}
        autoFocus
      />
      <CommandList>
        <CommandEmpty>
          {isFetching ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando...
            </span>
          ) : (
            "Sin resultados"
          )}
        </CommandEmpty>

        <CommandGroup heading="Acciones">
          {ACTIONS.map((action) => {
            const Icon = action.icon(actionCtx);
            const label = action.label(actionCtx);
            return (
            <CommandItem
              key={action.id}
              value={`acción ${label}`}
              onSelect={() => {
                close();
                action.run(actionCtx);
              }}
              className="cursor-pointer"
            >
              <Icon className="text-muted-foreground" />
              <span>{label}</span>
              {action.shortcut && (
                <KbdGroup className="ml-auto">
                  {action.shortcut.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </KbdGroup>
              )}
            </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandGroup heading="Páginas">
          {PAGES.map((page) => (
            <CommandItem
              key={page.href}
              value={`página ${page.label} ${page.href}`}
              onSelect={() => go(page.href)}
              className="cursor-pointer"
            >
              <page.icon className="text-muted-foreground" />
              <span>{page.label}</span>
              {page.shortcut && (
                <KbdGroup className="ml-auto">
                  {page.shortcut.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </KbdGroup>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        {videos.length > 0 && (
          <CommandGroup heading="Videos">
            {videos.map((video) => (
              <CommandItem
                key={video.id}
                value={`video ${video.id} ${video.title}`}
                onSelect={() => {
                  close();
                  navigateAndTriggerVideo(setLocation, currentPath, { selectId: video.id });
                }}
                className="cursor-pointer"
              >
                <div className="w-8 h-8 rounded bg-foreground/[0.05] border border-foreground/10 flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {video.coverImageBase64 ? (
                    <img
                      src={`data:${video.coverMimeType || "image/png"};base64,${video.coverImageBase64}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Video className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{video.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {statusLabel(video.status)}
                    {video.month ? ` · ${video.month}` : ""}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {debounced.length >= 2 && videos.length === 0 && !isFetching && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Search className="w-3 h-3" />
              Sin coincidencias para "{debounced}"
            </span>
          </div>
        )}
      </CommandList>

      <div className={cn(
        "flex items-center justify-between px-3 py-2 border-t border-border text-[10px] text-muted-foreground",
      )}>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> seleccionar
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navegar
          </span>
        </div>
        <div className="inline-flex items-center gap-1">
          <Kbd>esc</Kbd> cerrar
        </div>
      </div>
    </CommandDialog>
  );
}
