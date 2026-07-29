// Pase de lista de la jornada.
//
// Era una lista de <li> con tipografía diminuta donde el estado de cada
// persona se leía en cuatro etiquetas sueltas de 11px ("en pausa", "Discord
// sin vincular", "en voz", "72% verificado"). Para saber quién estaba
// trabajando había que descifrar un punto de color de 8 píxeles.
//
// Aquí el estado es lo primero que se ve, se puede filtrar por él, y los
// totales del día están arriba en vez de en una línea perdida.

import { useMemo, useState } from "react";
import { Users2, Search, Circle, ChevronDown } from "lucide-react";
import { formatMinutes, type AsistenciaMiembro, type DesgloseJornada, type TramoJornada } from "@/lib/asistencia";

/** Hora local corta de un ISO: "08:12". */
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });

const TRAMOS: Record<TramoJornada["tipo"], { etiqueta: string; barra: string; texto: string }> = {
  trabajo: { etiqueta: "Trabajando", barra: "bg-emerald-400", texto: "text-emerald-400" },
  pausa: { etiqueta: "En pausa", barra: "bg-amber-400", texto: "text-amber-400" },
  fuera: { etiqueta: "Sin marcar", barra: "bg-zinc-600", texto: "text-muted-foreground" },
};

/**
 * En qué se fue el día, tramo por tramo.
 *
 * La franja "08:12 → 22:34" junto a "6h 37m" no se podía entender: faltaban
 * las pausas y, sobre todo, los huecos entre sesiones — si alguien marca
 * salida a mediodía y vuelve a entrar a las cinco, esas horas no estaban en
 * ninguna parte. Aquí los tramos suman exactamente lo que abarca la franja.
 */
function Desglose({ d }: { d: DesgloseJornada }) {
  if (d.tramos.length === 0) return null;
  const total = Math.max(1, d.abarcado);
  return (
    <div className="mt-2 space-y-2">
      {/* La barra da la forma del día de un vistazo: cuánto fue trabajo real
          y cuánto no, en proporción. */}
      <div className="flex h-1.5 rounded-full overflow-hidden bg-foreground/5">
        {d.tramos.map((t, i) => (
          <span
            key={i}
            className={TRAMOS[t.tipo].barra}
            style={{ width: `${(t.minutos / total) * 100}%` }}
            title={`${TRAMOS[t.tipo].etiqueta} · ${formatMinutes(t.minutos)}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        <span className="text-emerald-400">{formatMinutes(d.trabajado)} trabajados</span>
        {d.pausado > 0 && <span className="text-amber-400">{formatMinutes(d.pausado)} en pausa</span>}
        {d.fuera > 0 && (
          <span className="text-muted-foreground" title="Entre una salida y la siguiente entrada">
            {formatMinutes(d.fuera)} sin marcar
          </span>
        )}
        <span className="text-muted-foreground/70">{formatMinutes(d.abarcado)} de punta a punta</span>
      </div>

      <ul className="space-y-0.5">
        {d.tramos.map((t, i) => (
          <li key={i} className="flex items-center gap-2 text-[10px] tabular-nums">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TRAMOS[t.tipo].barra}`} />
            <span className="text-muted-foreground w-[5.5rem] shrink-0">
              {hhmm(t.desde)} → {t.hasta ? hhmm(t.hasta) : "ahora"}
            </span>
            <span className={`${TRAMOS[t.tipo].texto} shrink-0`}>{TRAMOS[t.tipo].etiqueta}</span>
            <span className="text-muted-foreground/70">{formatMinutes(t.minutos)}</span>
            {t.motivo && <span className="text-muted-foreground/60 truncate">· {t.motivo}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

type Estado = "trabajando" | "pausa" | "termino" | "sin_marcar";

const ESTADOS: Record<Estado, { etiqueta: string; punto: string; chip: string }> = {
  trabajando: { etiqueta: "Trabajando", punto: "bg-emerald-400", chip: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
  pausa: { etiqueta: "En pausa", punto: "bg-amber-400", chip: "bg-amber-500/10 text-amber-400 border-amber-500/25" },
  termino: { etiqueta: "Terminó", punto: "bg-sky-400", chip: "bg-sky-500/10 text-sky-400 border-sky-500/25" },
  sin_marcar: { etiqueta: "Sin marcar", punto: "bg-zinc-600", chip: "bg-foreground/5 text-muted-foreground border-foreground/15" },
};

export function estadoDe(m: AsistenciaMiembro): Estado {
  if (m.today?.pausa) return "pausa";
  if (m.today?.open) return "trabajando";
  if (m.today) return "termino";
  return "sin_marcar";
}

/** Iniciales para el avatar cuando no hay foto. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0]![0]! + (partes[1]?.[0] ?? "")).toUpperCase();
}

export function PaseDeLista({
  miembros,
  /** Acción por persona (pausar/reanudar); solo la ven los roles con permiso. */
  accion,
}: {
  miembros: AsistenciaMiembro[];
  accion?: (m: AsistenciaMiembro) => React.ReactNode;
}) {
  const [filtro, setFiltro] = useState<Estado | "todos">("todos");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);

  const conEstado = useMemo(
    () => miembros.map((m) => ({ m, estado: estadoDe(m) })),
    [miembros],
  );

  const totales = useMemo(() => {
    const t: Record<Estado, number> = { trabajando: 0, pausa: 0, termino: 0, sin_marcar: 0 };
    for (const { estado } of conEstado) t[estado]++;
    return t;
  }, [conEstado]);

  const minutosHoy = useMemo(
    () => conEstado.reduce((n, { m }) => n + (m.today?.minutes ?? 0), 0),
    [conEstado],
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const orden: Record<Estado, number> = { trabajando: 0, pausa: 1, termino: 2, sin_marcar: 3 };
    return conEstado
      .filter(({ estado }) => filtro === "todos" || estado === filtro)
      .filter(({ m }) => !q || (m.name || m.email || "").toLowerCase().includes(q))
      .sort((a, b) => orden[a.estado] - orden[b.estado] || (b.m.today?.minutes ?? 0) - (a.m.today?.minutes ?? 0));
  }, [conEstado, filtro, busqueda]);

  if (miembros.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        <Users2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
        Sin datos de asistencia todavía.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Los totales del día, arriba y legibles: antes vivían en una línea de
          11px que había que buscar. También son el filtro. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(Object.keys(ESTADOS) as Estado[]).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setFiltro(filtro === e ? "todos" : e)}
            aria-pressed={filtro === e}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${
              filtro === e ? ESTADOS[e].chip : "border-foreground/10 bg-card/40 hover:border-foreground/25"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${ESTADOS[e].punto}`} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{ESTADOS[e].etiqueta}</span>
            </span>
            <span className="block text-xl font-bold tabular-nums mt-0.5">{totales[e]}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar persona…"
            className="w-full pl-8 pr-3 h-9 rounded-lg border border-foreground/15 bg-card/60 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <span className="text-[11px] text-muted-foreground">
          {formatMinutes(minutosHoy)} en total hoy
        </span>
        {filtro !== "todos" && (
          <button onClick={() => setFiltro("todos")} className="text-[11px] text-primary hover:underline">
            Ver todos
          </button>
        )}
      </div>

      <ul className="space-y-1.5">
        {visibles.length === 0 && (
          <li className="text-sm text-muted-foreground text-center py-6">Nadie coincide con ese filtro.</li>
        )}
        {visibles.map(({ m, estado }) => {
          const nombre = m.name || m.email || "Sin nombre";
          const pausadas = m.today?.pausedMinutes ?? 0;
          const desglose = m.today?.desglose;
          const expandido = abierto === m.id;
          return (
            <li
              key={m.id}
              className="rounded-xl border border-foreground/10 bg-card/40 px-3 py-2.5"
            >
            <div className="flex items-center gap-3">
              <span className="relative shrink-0">
                <span className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {iniciales(nombre)}
                </span>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${ESTADOS[estado].punto}`}
                  title={ESTADOS[estado].etiqueta}
                />
              </span>

              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{nombre}</span>
                <span className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${ESTADOS[estado].chip}`}>
                    {ESTADOS[estado].etiqueta}
                  </span>
                  {m.today?.pausa?.motivo && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[10rem]">
                      {m.today.pausa.motivo}
                    </span>
                  )}
                  {/* Discord no verifica una jornada sin vincular: decirlo aquí
                      evita leer el porcentaje como si fuera real. */}
                  {!m.discord?.linked ? (
                    <span className="text-[10px] text-amber-400">Discord sin vincular</span>
                  ) : (
                    <>
                      {m.discord?.inVoiceNow === true && (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                          <Circle className="w-1.5 h-1.5 fill-current" /> en voz
                        </span>
                      )}
                      {m.discord?.pct !== null && m.discord?.pct !== undefined && (
                        <span className="text-[10px] text-muted-foreground">{m.discord.pct}% verificado</span>
                      )}
                    </>
                  )}
                </span>
              </span>

              {/* La franja entrada → salida, que es lo que hay que poder
                  desarmar: sola no explica por qué el total es menor. */}
              {desglose && desglose.entrada && (
                <button
                  type="button"
                  onClick={() => setAbierto(expandido ? null : m.id)}
                  aria-expanded={expandido}
                  className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground tabular-nums shrink-0 transition"
                  title="Ver en qué se fue el día"
                >
                  {hhmm(desglose.entrada)} → {desglose.salida ? hhmm(desglose.salida) : "…"}
                  <ChevronDown className={`w-3 h-3 transition-transform ${expandido ? "rotate-180" : ""}`} />
                </button>
              )}

              <span className="text-right shrink-0">
                <span className="block text-sm font-semibold tabular-nums">{formatMinutes(m.today?.minutes ?? 0)}</span>
                <span className="block text-[10px] text-muted-foreground tabular-nums">
                  {formatMinutes(m.weekTotal)} sem
                </span>
                {pausadas > 0 && (
                  <span className="block text-[10px] text-amber-400/80 tabular-nums" title="Ya descontado del total">
                    −{formatMinutes(pausadas)} pausa
                  </span>
                )}
              </span>

              {accion && <span className="shrink-0">{accion(m)}</span>}
            </div>

            {expandido && desglose && <Desglose d={desglose} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
