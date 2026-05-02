import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { useAuth } from "@/App";

type TourStep = {
  selector?: string;
  title: string;
  body: string;
};

const TOUR_VERSION = "v1";

const STEPS: TourStep[] = [
  {
    title: "¡Bienvenido a WebMaker Admin!",
    body: "Te mostramos en menos de un minuto cómo funciona el panel para que empieces a publicar en tus redes.",
  },
  {
    selector: "[data-tour='onboarding-checklist']",
    title: "Tu lista de configuración",
    body: "Sigue estos pasos para tener todo listo: conecta Drive, vincula al menos una red, crea un video y prográmalo.",
  },
  {
    selector: "[data-tour='nav-cuentas'], [data-tour='mobile-nav-cuentas']",
    title: "Cuentas Sociales",
    body: "Aquí conectas TikTok, Instagram, YouTube, LinkedIn, X y Facebook. Es el primer paso.",
  },
  {
    selector: "[data-tour='nav-videos'], [data-tour='mobile-nav-videos']",
    title: "Gestor de Videos",
    body: "Crea cada video paso a paso: título, portada, descripciones por red social y publicación.",
  },
  {
    selector: "[data-tour='nav-schedule'], [data-tour='mobile-nav-schedule']",
    title: "Publicaciones",
    body: "Programa cada video en el calendario y elige en qué redes se publicará.",
  },
  {
    selector: "[data-tour='nav-help'], [data-tour='mobile-nav-help']",
    title: "Ayuda siempre a mano",
    body: "¿Dudas? Encuentra respuestas en la sección de Ayuda. ¡A publicar!",
  },
];

function tourStorageKey(userId: number | undefined) {
  return `webmaker.tour.${userId ?? "anon"}.${TOUR_VERSION}`;
}

function readSeen(userId: number | undefined): boolean {
  try {
    return window.localStorage.getItem(tourStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function writeSeen(userId: number | undefined) {
  try {
    window.localStorage.setItem(tourStorageKey(userId), "1");
  } catch {
    /* ignore */
  }
}

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Tracks the bounding rect of a target element. Updates on resize/scroll
 * (passively, without forcing scroll) so the highlight follows the element.
 * `scrollIntoView` is intentionally NOT called here to avoid fighting the user.
 */
function pickVisibleTarget(selector: string): Element | null {
  const all = Array.from(document.querySelectorAll(selector));
  if (all.length === 0) return null;
  // Prefer the first element whose bounding rect is non-zero AND
  // has actual layout (covers responsive variants where one variant
  // is display:none on the current breakpoint).
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return all[0];
}

function useTargetRect(selector: string | undefined, deps: any[]): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    function update() {
      const el = pickVisibleTarget(selector!);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    update();
    const id = window.setTimeout(update, 200);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...deps]);

  return rect;
}

export function OnboardingTour() {
  const user = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Auto-start on first dashboard visit (only once per user+version).
  useEffect(() => {
    if (!user) return;
    if (location !== "/") return;
    if (readSeen(user.id)) return;
    const t = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(t);
  }, [user, location]);

  // Manual trigger via global event.
  useEffect(() => {
    function listener() {
      setStepIndex(0);
      setOpen(true);
    }
    window.addEventListener("webmaker:start-tour", listener);
    return () => window.removeEventListener("webmaker:start-tour", listener);
  }, []);

  const step = STEPS[stepIndex];
  const rect = useTargetRect(step?.selector, [stepIndex, open]);

  // Scroll to target ONLY when step changes, not on every reflow.
  useEffect(() => {
    if (!open || !step?.selector) return;
    const el = pickVisibleTarget(step.selector);
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    } catch {
      /* ignore */
    }
  }, [open, stepIndex, step?.selector]);

  // Focus management: capture previous focus on open, restore on close,
  // and move focus into the popover so keyboard users can navigate.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
    const t = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  function close() {
    setOpen(false);
    if (user) writeSeen(user.id);
    const prev = previouslyFocusedRef.current;
    if (prev && typeof prev.focus === "function") {
      window.setTimeout(() => prev.focus(), 0);
    }
  }

  // ESC + Arrow keys handler.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStepIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab") {
        // Soft focus trap inside the popover.
        const root = popoverRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !step) return null;

  const isLast = stepIndex === STEPS.length - 1;

  function next() {
    if (isLast) {
      close();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function prev() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  const HIGHLIGHT_PADDING = 8;
  const POPOVER_GAP = 16;
  const POPOVER_WIDTH = 320;

  let popoverStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 1001,
    width: POPOVER_WIDTH,
    maxWidth: "calc(100vw - 24px)",
  };

  if (rect) {
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const placeBelow = spaceBelow > 240 || rect.top < 240;
    const top = placeBelow
      ? rect.top + rect.height + POPOVER_GAP
      : rect.top - POPOVER_GAP - 200;
    const rawLeft = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    const left = Math.max(12, Math.min(window.innerWidth - POPOVER_WIDTH - 12, rawLeft));
    popoverStyle.top = Math.max(12, top);
    popoverStyle.left = left;
  } else {
    popoverStyle.top = "50%";
    popoverStyle.left = "50%";
    popoverStyle.transform = "translate(-50%, -50%)";
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
        onClick={close}
      />
      {rect && (
        <motion.div
          key={`hl-${stepIndex}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed z-[1001] rounded-2xl pointer-events-none"
          style={{
            top: rect.top - HIGHLIGHT_PADDING,
            left: rect.left - HIGHLIGHT_PADDING,
            width: rect.width + HIGHLIGHT_PADDING * 2,
            height: rect.height + HIGHLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 3px hsl(var(--primary) / 0.85)",
          }}
        />
      )}
      <motion.div
        key={`pop-${stepIndex}`}
        ref={popoverRef}
        initial={{ opacity: 0, scale: 0.96, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 4 }}
        transition={{ duration: 0.2 }}
        style={popoverStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
      >
        <div className="rounded-2xl bg-card text-foreground border border-foreground/10 shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/10 bg-primary/5">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Paso {stepIndex + 1} de {STEPS.length}
            </span>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={close}
              aria-label="Cerrar tour"
              className="ml-auto p-1 rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4">
            <h3 id="tour-title" className="font-display font-bold text-base mb-1">
              {step.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-3 border-t border-foreground/10 bg-foreground/[0.03]">
            <button
              type="button"
              onClick={close}
              className="text-xs text-muted-foreground hover:text-foreground transition-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
            >
              Saltar
            </button>
            <div className="ml-auto flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={prev}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground bg-foreground/5 hover:bg-foreground/10 transition-base focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Atrás
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-orange-400 transition-base shadow-md shadow-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {isLast ? "Listo" : "Siguiente"}
                {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

export function startOnboardingTour() {
  window.dispatchEvent(new Event("webmaker:start-tour"));
}
