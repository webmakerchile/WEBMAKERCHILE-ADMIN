import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/App";

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");
const KEY_VERSION = "v1";

function dismissedKey(userId: number | undefined) {
  return `webmaker.onboarding.${userId ?? "anon"}.${KEY_VERSION}.dismissed`;
}
function collapsedKey(userId: number | undefined) {
  return `webmaker.onboarding.${userId ?? "anon"}.${KEY_VERSION}.collapsed`;
}

type ChecklistStep = {
  id: "drive" | "networks" | "firstVideo" | "firstScheduled";
  done: boolean;
  label: string;
  description: string;
  href: string;
};

type ChecklistData = {
  completed: boolean;
  completedCount: number;
  totalCount: number;
  steps: ChecklistStep[];
};

function readBool(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    if (value) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function OnboardingChecklist() {
  const user = useAuth();
  const userId = user?.id;
  const dKey = dismissedKey(userId);
  const cKey = collapsedKey(userId);

  const { data, isLoading } = useQuery<ChecklistData>({
    queryKey: ["onboarding-checklist"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/onboarding/checklist`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });

  const [dismissed, setDismissed] = useState(() => readBool(dKey));
  const [collapsed, setCollapsed] = useState(() => readBool(cKey));

  // Re-read state when user changes (login/switch).
  useEffect(() => {
    setDismissed(readBool(dKey));
    setCollapsed(readBool(cKey));
  }, [dKey, cKey]);

  // Cross-tab sync.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === dKey) setDismissed(readBool(dKey));
      if (e.key === cKey) setCollapsed(readBool(cKey));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [dKey, cKey]);

  useEffect(() => {
    if (data?.completed) {
      writeBool(dKey, true);
    }
  }, [data?.completed, dKey]);

  const progress = useMemo(() => {
    if (!data) return 0;
    return Math.round((data.completedCount / data.totalCount) * 100);
  }, [data]);

  if (isLoading || !data) return null;
  if (data.completed && readBool(dKey)) return null;
  if (dismissed) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass-card rounded-2xl border border-primary/30 overflow-hidden"
      data-tour="onboarding-checklist"
      aria-label="Configuración inicial"
    >
      <header className="flex items-center gap-3 px-4 py-3 border-b border-foreground/10 bg-primary/5">
        <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            {data.completed ? "¡Todo listo!" : "Termina de configurar tu cuenta"}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {data.completedCount} de {data.totalCount} pasos completados
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              writeBool(cKey, next);
            }}
            aria-label={collapsed ? "Expandir lista" : "Contraer lista"}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              writeBool(dKey, true);
            }}
            aria-label="Cerrar checklist"
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="px-4 pt-3">
        <div className="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
            className="h-full rounded-full bg-gradient-to-r from-primary to-orange-400"
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="divide-y divide-foreground/5 overflow-hidden"
          >
            {data.steps.map((step) => (
              <li key={step.id}>
                <Link
                  to={step.href}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 hover:bg-foreground/[0.03] transition-base group",
                  )}
                >
                  {step.done ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/40 flex-shrink-0 mt-0.5 group-hover:text-primary/60 transition-base" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        step.done ? "line-through text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{step.description}</p>
                  </div>
                  {!step.done && (
                    <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                  )}
                </Link>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
