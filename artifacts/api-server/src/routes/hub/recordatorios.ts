// Reglas de los recordatorios de trabajo estancado.
//
// Van en el tablero compartido (`hub_state.data.recordatorios`) y no en una
// tabla nueva porque son cuatro números que afectan a todo el equipo, igual que
// el propio tablero. Pero NO se escriben por `PATCH /hub`: esa ruta fusiona
// colección por colección y manda el blob entero, así que guardar cuatro
// números por ahí implicaría reenviar todos los proyectos, contratos y notas —
// y arriesgarse a pisar lo que otra persona esté editando en ese momento.
//
// El job que las lee vive en `scheduler.ts`; la lógica, en `lib/recordatorios.ts`.

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { normalizeRole } from "@workspace/roles";
import { resolveBoard, saveBoard } from "../../lib/hub-board";
import {
  normalizarReglas,
  REGLAS_POR_DEFECTO,
  MAX_POR_PERSONA,
  type ReglasRecordatorio,
} from "../../lib/recordatorios";

const router: IRouter = Router();

type AuthUser = { id: number; role?: string; teamRole?: string };

/**
 * Quién puede cambiarlas.
 *
 * Son reglas que generan notificaciones para OTRAS personas, así que no las
 * toca cualquiera: si el umbral baja a un día, el panel empieza a escribirle a
 * todo el equipo. Leerlas sí puede cualquiera con acceso al Hub — quien recibe
 * los avisos tiene derecho a saber por qué le llegan.
 */
function puedeConfigurar(req: Request): boolean {
  const u = req.user as AuthUser | undefined;
  if (!u) return false;
  if (u.role === "superadmin") return true;
  const rol = normalizeRole(u.teamRole);
  return rol === "ceo" || rol === "dev";
}

const cuerpoSchema = z.object({
  diasTareaEstancada: z.number().int().min(1).max(365).optional(),
  diasTareaEstancadaCritica: z.number().int().min(1).max(365).optional(),
  diasTareaEstancadaAlta: z.number().int().min(1).max(365).optional(),
  diasTareaEstancadaBaja: z.number().int().min(1).max(365).optional(),
  diasEnCola: z.number().int().min(1).max(365).optional(),
  diasVencida: z.number().int().min(1).max(365).optional(),
  diasProyectoParado: z.number().int().min(1).max(365).optional(),
  prioridadMinima: z.string().trim().min(1).max(20).optional(),
});

function reglasGuardadas(data: Record<string, unknown> | undefined): ReglasRecordatorio {
  return normalizarReglas((data?.recordatorios ?? null) as Partial<ReglasRecordatorio> | null);
}

router.get("/hub/recordatorios", async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: "No autenticado" }); return; }
  const board = await resolveBoard();
  res.json({
    reglas: reglasGuardadas(board?.data),
    porDefecto: REGLAS_POR_DEFECTO,
    maxPorPersona: MAX_POR_PERSONA,
    puedeEditar: puedeConfigurar(req),
  });
});

router.put("/hub/recordatorios", async (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: "No autenticado" }); return; }
  if (!puedeConfigurar(req)) {
    res.status(403).json({ error: "Solo la dirección o Programación pueden cambiar los recordatorios" });
    return;
  }

  const parsed = cuerpoSchema.safeParse(req.body);
  if (!parsed.success) {
    // Se dice qué está mal en vez de "datos inválidos": el error más probable
    // es un 0, y quien lo escribió necesita saber que el mínimo es 1 día.
    const primero = parsed.error.issues[0];
    res.status(400).json({
      error: primero
        ? `${primero.path.join(".") || "dato"}: los plazos van de 1 a 365 días`
        : "Datos no válidos",
    });
    return;
  }

  const board = await resolveBoard();
  if (!board) {
    res.status(409).json({ error: "Todavía no hay un tablero de dirección donde guardarlas" });
    return;
  }

  // Se parte de lo guardado, no de los valores por defecto: un PUT parcial no
  // puede resetear en silencio los plazos que no venían en el cuerpo.
  const reglas = normalizarReglas({ ...reglasGuardadas(board.data), ...parsed.data } as Partial<ReglasRecordatorio>);
  await saveBoard(board.boardUserId, { ...board.data, recordatorios: reglas });

  res.json({ reglas });
});

export default router;
