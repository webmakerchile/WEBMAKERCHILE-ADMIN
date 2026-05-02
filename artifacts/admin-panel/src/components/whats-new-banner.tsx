import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Megaphone, X } from "lucide-react";
import { useAuth } from "@/App";

const WHATS_NEW_VERSION = "2026-05-onboarding";

function storageKey(userId: number | undefined) {
  return `webmaker.whatsnew.${userId ?? "anon"}.${WHATS_NEW_VERSION}`;
}

type Props = {
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function WhatsNewBanner({
  title = "Novedades: tour guiado, ayuda y estados vacíos mejorados",
  body = "Acabamos de añadir una lista de configuración inicial, un tour guiado y una nueva sección de ayuda con preguntas frecuentes.",
  ctaLabel = "Ver ayuda",
  ctaHref = "/ayuda",
}: Props) {
  const user = useAuth();
  const key = storageKey(user?.id);
  const [dismissed, setDismissed] = useState(() => readDismissed(key));

  useEffect(() => {
    setDismissed(readDismissed(key));
  }, [key]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === key) setDismissed(readDismissed(key));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  if (dismissed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3 flex items-start gap-3"
      role="status"
      aria-label="Novedades"
    >
      <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
        <Megaphone className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{body}</p>
      </div>
      <Link
        to={ctaHref}
        className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-orange-400 transition-base flex-shrink-0"
      >
        {ctaLabel}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Ocultar novedades"
        className="p-1 rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
