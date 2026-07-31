// Qué se le contrató a este proyecto.
//
// Programación abría el brief técnico y no sabía si eso era todo lo vendido;
// el catálogo de servicios (`hub_services`) es global y no está atado a ningún
// proyecto. Esto cruza las dos caras del contrato en una sola vista y, cuando
// no cuadran, lo dice en vez de enseñar una lista limpia a la que le falta algo.
//
// Los montos NO se deciden aquí: el servidor ya los quitó para los roles que no
// los ven y marcó `moneyRedacted`. Esta pantalla solo respeta esa marca.

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { HubContract, HubProject } from "@/lib/hub-owner";
import { resumenDeProyecto, modulosDescuadrados, type ModuloResumen, type TareaContable } from "@/lib/resumen-servicios";
import { Package, ChevronDown, AlertTriangle, Target, Ban, Wrench, Flag } from "lucide-react";

const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;

function Lista({ titulo, items, icono }: { titulo: string; items: string[]; icono: React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        {icono} {titulo}
      </p>
      <ul className="space-y-0.5">
        {items.map((t, i) => (
          <li key={i} className="text-xs text-foreground/85 pl-3 relative before:content-['·'] before:absolute before:left-0">{t}</li>
        ))}
      </ul>
    </div>
  );
}

function Modulo({ m, sinMontos }: { m: ModuloResumen; sinMontos: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const hayDetalle = m.entregables.length > 0 || m.requisitos.length > 0 || Boolean(m.descripcion);

  return (
    <div className="rounded-lg border border-foreground/10 bg-card/40">
      <button
        type="button"
        onClick={() => hayDetalle && setAbierto(!abierto)}
        className="w-full flex items-start justify-between gap-3 p-3 text-left"
        aria-expanded={abierto}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{m.nombre}</p>
          {m.descripcion && !abierto && (
            <p className="text-[11px] text-muted-foreground truncate">{m.descripcion}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {m.origen === "comercial" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400">
              sin especificar
            </span>
          )}
          {m.origen === "tecnico" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-500/30 bg-sky-500/10 text-sky-400">
              fuera del contrato
            </span>
          )}
          {!sinMontos && m.precio !== null && (
            <span className="text-xs font-semibold tabular-nums">{clp(m.precio)}</span>
          )}
          {hayDetalle && <ChevronDown className={`w-4 h-4 text-muted-foreground transition ${abierto ? "rotate-180" : ""}`} />}
        </div>
      </button>

      {abierto && (
        <div className="px-3 pb-3 space-y-2 border-t border-foreground/10 pt-2">
          {m.descripcion && <p className="text-xs text-foreground/85">{m.descripcion}</p>}
          <Lista titulo="Entregables" items={m.entregables} icono={<Package className="w-3 h-3" />} />
          <Lista titulo="Requisitos" items={m.requisitos} icono={<Wrench className="w-3 h-3" />} />
        </div>
      )}
    </div>
  );
}

export function ResumenServicios({
  proyecto,
  contratos,
  tareas,
}: {
  proyecto: HubProject;
  contratos: readonly HubContract[];
  tareas: readonly TareaContable[];
}) {
  const r = resumenDeProyecto(proyecto, contratos, tareas);
  const { sinEspecificar, sinFacturar } = modulosDescuadrados(r);

  // Sin contrato no se inventa una sección vacía: se dice por qué está vacía.
  if (!r.contrato) {
    return (
      <Card className="bg-card/40 border-foreground/10">
        <CardContent className="p-4">
          <p className="flex items-center gap-2 text-sm font-semibold mb-1">
            <Package className="w-4 h-4 text-primary" /> Servicios contratados
          </p>
          <p className="text-xs text-muted-foreground">
            Este proyecto no tiene un contrato asociado, así que no hay alcance que mostrar.
            Se enlaza desde el Hub Ejecutivo, en la ficha del proyecto.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/40 border-foreground/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Package className="w-4 h-4 text-primary" /> Servicios contratados
          </p>
          <p className="text-[11px] text-muted-foreground">
            {r.avance.total > 0
              ? `${r.avance.hechas} de ${r.avance.total} tareas · ${r.avance.pct}%`
              : "Sin tareas creadas todavía"}
          </p>
        </div>

        {r.objetivo && (
          <p className="text-xs text-foreground/85 flex items-start gap-1.5">
            <Target className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" /> {r.objetivo}
          </p>
        )}

        {r.modulos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            El contrato no tiene módulos ni brief técnico. Genera el brief desde el Hub Ejecutivo
            para que aquí aparezca el alcance.
          </p>
        ) : (
          <div className="space-y-1.5">
            {r.modulos.map((m) => <Modulo key={m.nombre} m={m} sinMontos={r.sinMontos} />)}
          </div>
        )}

        {/* Que los dos documentos no cuadren es información, no un detalle a
            esconder: es trabajo vendido sin especificar, o al revés. */}
        {(sinEspecificar.length > 0 || sinFacturar.length > 0) && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              {sinEspecificar.length > 0 &&
                `${sinEspecificar.length} módulo${sinEspecificar.length === 1 ? "" : "s"} del contrato sin detalle técnico. `}
              {sinFacturar.length > 0 &&
                `${sinFacturar.length} del brief que no está${sinFacturar.length === 1 ? "" : "n"} en el contrato. `}
              Conviene revisarlo con quien lo vendió.
            </span>
          </p>
        )}

        <Lista titulo="Criterios de aceptación" items={r.criteriosAceptacion} icono={<Flag className="w-3 h-3" />} />
        <Lista titulo="Fuera de alcance" items={r.fueraDeAlcance} icono={<Ban className="w-3 h-3" />} />

        {r.hitos.length > 0 && (
          <Lista
            titulo="Hitos"
            items={r.hitos.map((h) => (h.detalle ? `${h.nombre} — ${h.detalle}` : h.nombre))}
            icono={<Flag className="w-3 h-3" />}
          />
        )}

        {r.stack.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.stack.map((s) => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded border border-foreground/15 text-muted-foreground">{s}</span>
            ))}
          </div>
        )}

        {r.total !== null && (
          <p className="text-xs text-muted-foreground pt-1 border-t border-foreground/10">
            Total de los módulos: <span className="font-semibold text-foreground tabular-nums">{clp(r.total)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
