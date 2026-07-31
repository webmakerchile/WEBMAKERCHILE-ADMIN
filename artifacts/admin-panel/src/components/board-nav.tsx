/**
 * Navegación para tableros horizontales (kanban / scrumban).
 *
 * Tres piezas que se montan sobre el contenedor de scroll EXISTENTE sin
 * cambiar su estructura (clave para no romper drag & drop):
 *  - useBoardNav(): mide overflow, posición y columna activa.
 *  - <BoardNav/>: fila sticky de chips (nombre + contador por etapa) con
 *    flechas ‹ › que avanzan una columna. Solo aparece si hay overflow.
 *  - <BoardScroller/>: envuelve el contenedor y pinta degradados laterales
 *    cuando hay contenido oculto a la izquierda/derecha.
 *
 * Las columnas se marcan con `data-bnav-col` y el contenedor de scroll lleva
 * la clase `bnav-scroll` (barra gruesa con acento + scroll-snap en móvil).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./board-nav.css";

export type BoardStageChip = { id: string; label: string; count: number; color?: string };

export type BoardNavState = {
  /** Callback-ref: pásalo como `ref` del contenedor con overflow-x. */
  ref: (el: HTMLElement | null) => void;
  el: HTMLElement | null;
  overflow: boolean;
  canL: boolean;
  canR: boolean;
  active: number;
  toCol: (i: number) => void;
  prev: () => void;
  next: () => void;
};

export function useBoardNav(): BoardNavState {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [st, setSt] = useState({ overflow: false, canL: false, canR: false, active: 0 });
  const raf = useRef(0);

  const measure = useCallback(() => {
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 8;
    const canL = el.scrollLeft > 8;
    const canR = el.scrollLeft < el.scrollWidth - el.clientWidth - 8;
    // Columna activa: la que tiene su borde izquierdo más cerca del borde
    // izquierdo visible del contenedor.
    const cols = el.querySelectorAll<HTMLElement>("[data-bnav-col]");
    const base = el.getBoundingClientRect().left;
    let active = 0, best = Infinity;
    cols.forEach((c, i) => {
      const d = Math.abs(c.getBoundingClientRect().left - base);
      if (d < best) { best = d; active = i; }
    });
    // Al llegar al final, la última columna ya es visible aunque su borde
    // izquierdo no toque el del contenedor: márcala como activa para que el
    // chip refleje dónde está mirando la persona (clave con overflow pequeño).
    if (overflow && !canR && cols.length) active = cols.length - 1;
    setSt(s => (s.overflow === overflow && s.canL === canL && s.canR === canR && s.active === active)
      ? s : { overflow, canL, canR, active });
  }, [el]);

  useEffect(() => {
    if (!el) return;
    const queue = () => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(measure); };
    measure();
    el.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    const ro = new ResizeObserver(queue);
    ro.observe(el);
    const mo = new MutationObserver(queue); // columnas/tarjetas que aparecen o se filtran
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      ro.disconnect(); mo.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [el, measure]);

  const scrollLeftTo = useCallback((left: number) => {
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }, [el]);

  const toCol = useCallback((i: number) => {
    if (!el) return;
    const cols = el.querySelectorAll<HTMLElement>("[data-bnav-col]");
    if (!cols.length) return;
    const c = cols[Math.max(0, Math.min(cols.length - 1, i))];
    scrollLeftTo(c.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft - 4);
  }, [el, scrollLeftTo]);

  // Flechas por POSICIÓN, no por índice: con overflow pequeño, el borde de la
  // "columna anterior" puede quedar fuera del rango de scroll y un salto por
  // índice se clava en el clamp del navegador (no se mueve nada).
  const step = useCallback((dir: 1 | -1) => {
    if (!el) return;
    const base = el.getBoundingClientRect().left;
    const lefts = Array.from(el.querySelectorAll<HTMLElement>("[data-bnav-col]"))
      .map(c => c.getBoundingClientRect().left - base + el.scrollLeft);
    if (!lefts.length) return;
    const max = el.scrollWidth - el.clientWidth;
    const cur = el.scrollLeft;
    if (dir > 0) {
      const next = lefts.find(l => l > cur + 8);
      scrollLeftTo(next !== undefined ? Math.min(next - 4, max) : max);
    } else {
      const prevs = lefts.filter(l => l < cur - 8);
      scrollLeftTo(prevs.length ? Math.max(0, prevs[prevs.length - 1] - 4) : 0);
    }
  }, [el, scrollLeftTo]);

  return {
    ref: setEl, el, ...st, toCol,
    prev: () => step(-1),
    next: () => step(1),
  };
}

/** Fila sticky: ‹ chips de etapas (con contador) ›. Nada si no hay overflow. */
export function BoardNav({ nav, stages, className }: { nav: BoardNavState; stages: BoardStageChip[]; className?: string }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = row.current?.children[nav.active] as HTMLElement | undefined;
    on?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [nav.active]);
  if (!nav.overflow) return null;
  return (
    <div className={"bnav-rail" + (className ? " " + className : "")}>
      <button type="button" className="bnav-arrow" onClick={nav.prev} disabled={!nav.canL} aria-label="Columna anterior">‹</button>
      <div className="bnav-chips" ref={row} aria-label="Columnas del tablero">
        {stages.map((s, i) => (
          <button
            key={s.id} type="button" aria-current={i === nav.active ? "true" : undefined}
            className={"bnav-chip" + (i === nav.active ? " on" : "")}
            onClick={() => nav.toCol(i)}
          >
            {s.color && <span className="bnav-dot" style={{ background: s.color }} aria-hidden />}
            <span className="bnav-lbl">{s.label}</span>
            <span className="bnav-n">{s.count}</span>
          </button>
        ))}
      </div>
      <button type="button" className="bnav-arrow" onClick={nav.next} disabled={!nav.canR} aria-label="Columna siguiente">›</button>
    </div>
  );
}

/** Envuelve el contenedor de scroll y pinta los degradados "hay más". */
export function BoardScroller({ nav, children, className }: { nav: BoardNavState; children: ReactNode; className?: string }) {
  return (
    <div className={"bnav-wrap" + (className ? " " + className : "")}>
      {children}
      <div className="bnav-fade l" data-on={nav.overflow && nav.canL ? "true" : "false"} aria-hidden />
      <div className="bnav-fade r" data-on={nav.overflow && nav.canR ? "true" : "false"} aria-hidden />
    </div>
  );
}
