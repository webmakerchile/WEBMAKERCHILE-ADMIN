import { useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";

/** Tarjeta de sección. */
export function Panel({ titulo, accion, children }: { titulo?: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      {(titulo || accion) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titulo ? <h2 className="text-sm font-semibold text-foreground">{titulo}</h2> : <span />}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

/** Tarjeta de indicador. */
export function Ficha({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; tono?: "bien" | "mal" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className={`mt-1 text-lg font-semibold leading-tight ${tono === "bien" ? "text-emerald-500" : tono === "mal" ? "text-red-500" : "text-foreground"}`}>
        {valor}
      </p>
      {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

/** Chip de estado con punto de color. */
export function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground/90">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/** Lámina lateral (desktop) / hoja inferior (celular). */
export function Lamina({ titulo, alCerrar, children }: { titulo: ReactNode; alCerrar: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:items-stretch lg:justify-end"
      onClick={alCerrar}
    >
      <div
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-border bg-background lg:h-full lg:max-h-none lg:w-[560px] lg:rounded-none lg:border-l lg:border-t-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="min-w-0 truncate text-base font-semibold">{titulo}</h2>
          <button onClick={alCerrar} aria-label="Cerrar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

/** Botón que copia texto y avisa. */
export function BotonCopiar({ texto, etiqueta = "Copiar link" }: { texto: string; etiqueta?: string }) {
  const [listo, setListo] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = texto;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setListo(true);
        setTimeout(() => setListo(false), 1800);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
    >
      {listo ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
      {listo ? "Copiado" : etiqueta}
    </button>
  );
}

/** Esqueleto de carga. */
export function Cargando({ filas = 4 }: { filas?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-muted/40" />
      ))}
    </div>
  );
}

/** Error con reintento. */
export function ErrorCarga({ error, reintentar }: { error: unknown; reintentar?: () => void }) {
  const mensaje = error instanceof Error ? error.message : "Algo falló cargando los datos.";
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
      <p className="text-red-500">{mensaje}</p>
      {reintentar && (
        <button onClick={reintentar} className="mt-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted">
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Aviso en banner (para errores de formularios o avisos del panel). */
export function Aviso({ tono = "error", children }: { tono?: "error" | "info" | "ok"; children: ReactNode }) {
  const estilos =
    tono === "error"
      ? "border-red-500/30 bg-red-500/5 text-red-500"
      : tono === "ok"
        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
        : "border-amber-500/30 bg-amber-500/5 text-amber-600";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${estilos}`}>{children}</div>;
}

/** Campo de texto con etiqueta. */
export function Campo({
  etiqueta,
  valor,
  onCambio,
  tipo = "text",
  placeholder,
  requerido,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  tipo?: string;
  placeholder?: string;
  requerido?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {etiqueta}
        {requerido && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={tipo}
        value={valor}
        required={requerido}
        placeholder={placeholder}
        onChange={(e) => onCambio(e.target.value)}
        inputMode={tipo === "number" ? "decimal" : undefined}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
