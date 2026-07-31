// Proyecciones por mínimos cuadrados sobre las series reales del negocio.
//
// Vive bajo /hub, así que el gate por área (ceo / ejecutivo / rrhh) ya corrió
// antes de llegar aquí; el chequeo interno repite la regla por si algún día el
// prefijo cambia de gates. Las series con montos exigen además `canSeeMoney`:
// RRHH analiza horas y cumplimiento, no la caja.
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  contractPayments,
  hubWorkSessions,
  projectAssignments,
  sprintWeekClosures,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { canSeeMoney, normalizeRole, type TeamRole } from "@workspace/roles";
import { resolveBoard } from "../../lib/hub-board";
import { mesSiguiente } from "../../lib/proyeccion-ventas";
import {
  analizarSerie,
  semanaSiguiente,
  serieCobros,
  serieCumplimiento,
  serieHorasMensuales,
  serieVentasCerradas,
  type PuntoPeriodo,
} from "../../lib/proyecciones";

const router: IRouter = Router();

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

type Me = { id?: number; role?: string; teamRole?: string };
const rolDe = (req: Request): TeamRole => {
  const me = req.user as Me | undefined;
  return normalizeRole(me?.teamRole, me?.role === "superadmin");
};
const puedeVer = (rol: TeamRole) => rol === "ceo" || rol === "ventas" || rol === "rrhh";

/**
 * Catálogo de series. `dinero` marca las que muestran montos: para esas el rol
 * necesita canSeeMoney, y para el resto basta con entrar a la sección.
 */
const SERIES = {
  ventas: {
    label: "Ventas cerradas por mes",
    unidad: "clp",
    tipoPeriodo: "mes",
    dinero: true,
  },
  cobros: {
    label: "Ingresos cobrados por mes",
    unidad: "clp",
    tipoPeriodo: "mes",
    dinero: true,
  },
  horas: {
    label: "Horas de jornada por mes",
    unidad: "horas",
    tipoPeriodo: "mes",
    dinero: false,
  },
  cumplimiento: {
    label: "Cumplimiento semanal de tareas",
    unidad: "pct",
    tipoPeriodo: "semana",
    dinero: false,
  },
} as const;
type SerieId = keyof typeof SERIES;

/** Qué series puede ver este rol y qué proyectos tienen horas imputadas. */
router.get("/hub/proyecciones/series", async (req: Request, res: Response) => {
  const rol = rolDe(req);
  if (!puedeVer(rol)) {
    res.status(403).json({ error: "Solo dirección, ventas y RRHH ven las proyecciones" });
    return;
  }
  const dinero = canSeeMoney(rol);

  const [asignaciones, board] = await Promise.all([
    db.select({ projectRef: projectAssignments.projectRef }).from(projectAssignments),
    resolveBoard(),
  ]);
  // Solo proyectos con alguien asignado: los demás no tienen horas que mirar.
  const conHoras = new Set(asignaciones.map((a) => a.projectRef));
  const projects = board && Array.isArray(board.data.projects) ? (board.data.projects as Rec[]) : [];
  const proyectos = projects
    .filter((p) => conHoras.has(str(p.id)))
    .map((p) => ({ id: str(p.id), nombre: str(p.name) || str(p.client) || str(p.id) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  res.json({
    series: (Object.keys(SERIES) as SerieId[]).map((id) => ({
      id,
      label: SERIES[id].label,
      unidad: SERIES[id].unidad,
      tipoPeriodo: SERIES[id].tipoPeriodo,
      disponible: SERIES[id].dinero ? dinero : true,
    })),
    proyectos,
  });
});

const DatosQuery = z.object({
  serie: z.enum(["ventas", "cobros", "horas", "cumplimiento"]),
  /** Últimos N periodos del histórico; 0 = todo lo que haya. */
  rango: z.coerce.number().int().min(0).max(60).default(12),
  horizonte: z.coerce.number().int().min(1).max(6).default(3),
  proyecto: z.string().trim().min(1).max(120).optional(),
});

/** Serie histórica + recta ajustada + proyección, listas para el gráfico. */
router.get("/hub/proyecciones/datos", async (req: Request, res: Response) => {
  const rol = rolDe(req);
  if (!puedeVer(rol)) {
    res.status(403).json({ error: "Solo dirección, ventas y RRHH ven las proyecciones" });
    return;
  }
  const parsed = DatosQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parámetros inválidos", detalles: parsed.error.flatten() });
    return;
  }
  const { serie: serieId, rango, horizonte, proyecto } = parsed.data;
  const def = SERIES[serieId];
  if (def.dinero && !canSeeMoney(rol)) {
    res.status(403).json({ error: "Esta serie muestra montos y tu rol no los ve" });
    return;
  }

  let completa: PuntoPeriodo[];
  switch (serieId) {
    case "ventas": {
      const board = await resolveBoard();
      const contracts = board && Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
      completa = serieVentasCerradas(contracts);
      break;
    }
    case "cobros": {
      const pagos = await db
        .select({ fecha: contractPayments.fecha, monto: contractPayments.monto })
        .from(contractPayments);
      completa = serieCobros(pagos);
      break;
    }
    case "horas": {
      const [sesiones, asignaciones] = await Promise.all([
        db
          .select({
            userId: hubWorkSessions.userId,
            workDate: hubWorkSessions.workDate,
            checkIn: hubWorkSessions.checkIn,
            checkOut: hubWorkSessions.checkOut,
          })
          .from(hubWorkSessions),
        proyecto
          ? db
              .select({ userId: projectAssignments.userId, allocationPct: projectAssignments.allocationPct })
              .from(projectAssignments)
              .where(eq(projectAssignments.projectRef, proyecto))
          : Promise.resolve(null),
      ]);
      completa = serieHorasMensuales(sesiones, asignaciones);
      break;
    }
    case "cumplimiento": {
      const cierres = await db
        .select({
          weekKey: sprintWeekClosures.weekKey,
          total: sprintWeekClosures.total,
          done: sprintWeekClosures.done,
        })
        .from(sprintWeekClosures);
      completa = serieCumplimiento(cierres);
      break;
    }
  }

  // El rango recorta el histórico ANTES de ajustar: la recta describe lo que
  // se está mirando, no meses viejos que quedaron fuera del gráfico.
  const historico = rango > 0 ? completa.slice(-rango) : completa;
  const siguiente = def.tipoPeriodo === "semana" ? semanaSiguiente : mesSiguiente;
  const analisis = analizarSerie(historico, horizonte, siguiente, {
    tope: serieId === "cumplimiento" ? 100 : undefined,
    decimales: def.unidad === "clp" ? 0 : 1,
  });

  res.json({
    serie: { id: serieId, label: def.label, unidad: def.unidad, tipoPeriodo: def.tipoPeriodo },
    rango,
    horizonte,
    proyecto: serieId === "horas" ? (proyecto ?? null) : null,
    ...analisis,
  });
});

export default router;
