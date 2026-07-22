import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { hubClients, hubContracts, hubProjects, users } from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/** Usuario autenticado tal como lo deja passport en req.user. */
export type HubUser = {
  id: number;
  email?: string;
  name?: string | null;
  role?: string;
};

export function getHubUser(req: Request): HubUser {
  return req.user as HubUser;
}

export function isAdmin(user: HubUser): boolean {
  return user.role === "admin" || user.role === "superadmin";
}

/** Parsea el :id numérico de la URL; responde 400 y devuelve null si no es válido. */
export function parseId(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID inválido" });
    return null;
  }
  return id;
}

/** Convierte un ZodError en un mensaje 400 legible en español. */
export function zodMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

export function sendZodError(res: Response, err: z.ZodError): void {
  res.status(400).json({ error: `Datos inválidos — ${zodMessage(err)}` });
}

/**
 * Fecha flexible: acepta ISO string, epoch ms o Date y la normaliza a Date.
 * Combinar con .nullable().optional() en los schemas (null limpia el campo,
 * undefined lo deja intacto en un PATCH).
 */
export const zFecha = z.union([z.string(), z.number(), z.date()]).transform((v, ctx) => {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha inválida" });
    return z.NEVER;
  }
  return d;
});

/** Objeto libre para el campo `extra` (datos de UI no normalizados). */
export const zExtra = z.record(z.unknown());

/** Construye el objeto de update de un PATCH omitiendo las claves undefined. */
export function definedFields<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Valida que un hub_client exista (para clientId en bodies). */
export async function clientExists(id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: hubClients.id })
    .from(hubClients)
    .where(eq(hubClients.id, id))
    .limit(1);
  return !!row;
}

/** Valida que un hub_project exista (para projectId en tareas). */
export async function projectExists(id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: hubProjects.id })
    .from(hubProjects)
    .where(eq(hubProjects.id, id))
    .limit(1);
  return !!row;
}

/** Valida que un hub_contract exista. */
export async function contractExists(id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: hubContracts.id })
    .from(hubContracts)
    .where(eq(hubContracts.id, id))
    .limit(1);
  return !!row;
}

/** Usuarios aprobados (miembros del Hub) con los campos públicos del contrato. */
export async function getApprovedMembers() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      picture: users.picture,
      role: users.role,
    })
    .from(users)
    .where(eq(users.approvalStatus, "approved"))
    .orderBy(users.name, users.id);
}

/** IDs de admins/superadmins aprobados (destinatarios de avisos administrativos). */
export async function getAdminIds(): Promise<number[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.approvalStatus, "approved"), inArray(users.role, ["admin", "superadmin"])));
  return rows.map((r) => r.id);
}
