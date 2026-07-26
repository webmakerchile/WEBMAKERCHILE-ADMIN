import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { employeeProfiles, users } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { canManagePeople, normalizeRole } from "@workspace/roles";
import { z } from "zod";
import { assignOnboarding } from "./ops";

const router: IRouter = Router();

/**
 * Recursos Humanos: fichas laborales del equipo y solicitudes de acceso.
 *
 * Todo aquí es sensible (renta, teléfonos personales, contratos), así que cada
 * endpoint verifica contra la DB que quien llama tenga `canManagePeople`
 * (dirección o RRHH) — nunca se confía en el rol que traiga la sesión.
 */
async function requireHr(req: Request, res: Response) {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) {
    res.status(401).json({ error: "No autenticado" });
    return null;
  }
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!me) {
    res.status(401).json({ error: "No autenticado" });
    return null;
  }
  if (!canManagePeople(me.teamRole, me.role === "superadmin")) {
    res.status(403).json({ error: "Solo la dirección y RRHH pueden ver esta información" });
    return null;
  }
  return me;
}

const CONTRACT_TYPES = ["indefinido", "plazo_fijo", "honorarios", "practica"] as const;
const EMPLOYMENT_STATUS = ["activo", "licencia", "desvinculado"] as const;

/** Fecha civil YYYY-MM-DD, o vacío. */
const dateStr = z
  .string()
  .trim()
  .refine(v => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Formato de fecha inválido (YYYY-MM-DD)");

const profileSchema = z.object({
  position: z.string().trim().max(120).default(""),
  area: z.string().trim().max(120).default(""),
  contractType: z.enum(CONTRACT_TYPES).default("indefinido"),
  employmentStatus: z.enum(EMPLOYMENT_STATUS).default("activo"),
  startDate: dateStr.default(""),
  endDate: dateStr.default(""),
  // "Sin registrar" (null o vacío) debe llegar como null a la DB: el orden
  // importa, porque `z.coerce.number()` convertiría null y "" en 0.
  monthlySalary: z
    .union([z.null(), z.literal(""), z.coerce.number().int().min(0).max(1_000_000_000)])
    .default(null)
    .transform(v => (v === "" ? null : v)),
  phone: z.string().trim().max(40).default(""),
  emergencyContact: z.string().trim().max(120).default(""),
  emergencyPhone: z.string().trim().max(40).default(""),
  documentsUrl: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(4000).default(""),
  /** Días hábiles de vacaciones al año (saldo anual). */
  vacationDaysPerYear: z.coerce.number().int().min(0).max(90).default(15),
});

router.get("/hr/people", async (req: Request, res: Response) => {
  const me = await requireHr(req, res);
  if (!me) return;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      picture: users.picture,
      teamRole: users.teamRole,
      role: users.role,
      approvalStatus: users.approvalStatus,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      profile: employeeProfiles,
    })
    .from(users)
    .leftJoin(employeeProfiles, eq(employeeProfiles.userId, users.id))
    .orderBy(asc(users.id));

  res.json(
    rows.map(({ role, ...r }) => ({
      ...r,
      teamRole: normalizeRole(r.teamRole, role === "superadmin"),
      isOwner: role === "superadmin",
    })),
  );
});

router.put("/hr/people/:userId", async (req: Request, res: Response) => {
  const me = await requireHr(req, res);
  if (!me) return;

  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "userId inválido" });
    return;
  }
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Persona no encontrada" });
    return;
  }

  const parsed = profileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const data = parsed.data;

  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    res.status(400).json({ error: "La fecha de término no puede ser anterior al ingreso" });
    return;
  }

  const [row] = await db
    .insert(employeeProfiles)
    .values({ userId, ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: employeeProfiles.userId,
      set: { ...data, updatedAt: new Date() },
    })
    .returning();

  res.json(row);
});

router.patch("/hr/people/:userId/approval", async (req: Request, res: Response) => {
  const me = await requireHr(req, res);
  if (!me) return;

  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "userId inválido" });
    return;
  }
  if (userId === me.id) {
    res.status(400).json({ error: "No puedes cambiar el estado de tu propia cuenta" });
    return;
  }

  const status = String((req.body as { status?: unknown })?.status || "");
  if (!["approved", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "Estado inválido. Use: approved, rejected, pending" });
    return;
  }

  const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Persona no encontrada" });
    return;
  }
  // El dueño de la cuenta no se puede bloquear a sí mismo por esta vía.
  if (target.role === "superadmin" && status !== "approved") {
    res.status(400).json({ error: "No se puede revocar el acceso del administrador principal" });
    return;
  }

  const [row] = await db
    .update(users)
    .set({ approvalStatus: status })
    .where(eq(users.id, userId))
    .returning({ id: users.id, email: users.email, approvalStatus: users.approvalStatus });

  // Al aprobar el acceso, se asigna solo el onboarding según su rol (si no
  // tiene uno). Fallo aquí no bloquea la aprobación.
  if (row?.approvalStatus === "approved") {
    await assignOnboarding(userId, me.id).catch((err) => console.error("[hr approval] assignOnboarding failed", err));
  }

  res.json(row);
});

export default router;
