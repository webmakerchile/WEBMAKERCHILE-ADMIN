import { db } from "@workspace/db";
import { hubState, users } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { normalizeRole } from "@workspace/roles";

/**
 * Resolución del tablero compartido.
 *
 * Hay un solo tablero para toda la agencia y vive en la fila de `hub_state` de
 * la dirección. Todo lo que escriba en él (el Hub, los tickets convertidos en
 * tareas) debe resolverlo por aquí: si dos caminos eligieran filas distintas,
 * el equipo vería tableros distintos.
 *
 * Continuidad: el Hub nació siendo un tablero por usuario. Si la dirección aún
 * no tiene fila propia pero existe otra con datos —el tablero original—, se
 * adopta esa en vez de arrancar en blanco. Nunca se pierde el trabajo previo.
 */

export interface BoardRef {
  /** Usuario dueño de la fila donde se guarda el tablero. */
  boardUserId: number;
  owner: { id: number; name: string | null; email: string } | null;
  data: Record<string, unknown>;
  /** Marca de la última escritura, en ms (0 si el tablero aún no existe). */
  version: number;
  exists: boolean;
}

const COLLECTIONS = ["projects", "tasks", "clients", "meetings", "notes", "contracts"] as const;

function hasContent(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return COLLECTIONS.some(c => Array.isArray(d[c]) && (d[c] as unknown[]).length > 0);
}

/** Dueño del tablero: el superadministrador, o el CEO más antiguo. */
export async function findBoardOwner() {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, teamRole: users.teamRole })
    .from(users)
    .orderBy(asc(users.id));
  return rows.find(u => u.role === "superadmin")
    ?? rows.find(u => normalizeRole(u.teamRole) === "ceo")
    ?? null;
}

export async function resolveBoard(): Promise<BoardRef | null> {
  const owner = await findBoardOwner();
  const rows = await db.select().from(hubState);

  const ownRow = owner ? rows.find(r => r.userId === owner.id) : undefined;
  const stamp = (r: { updatedAt: Date | null } | undefined) =>
    r?.updatedAt ? new Date(r.updatedAt).getTime() : 0;

  if (ownRow && hasContent(ownRow.data)) {
    return {
      boardUserId: ownRow.userId,
      owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
      data: (ownRow.data ?? {}) as Record<string, unknown>,
      version: stamp(ownRow),
      exists: true,
    };
  }

  // Tablero heredado de la época "uno por usuario": se adopta el que tenga datos.
  const legacy = rows
    .filter(r => hasContent(r.data))
    .sort((a, b) => stamp(b) - stamp(a))[0];
  if (legacy) {
    return {
      boardUserId: legacy.userId,
      owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
      data: (legacy.data ?? {}) as Record<string, unknown>,
      version: stamp(legacy),
      exists: true,
    };
  }

  if (!owner) return null;
  return {
    boardUserId: ownRow?.userId ?? owner.id,
    owner: { id: owner.id, name: owner.name, email: owner.email },
    data: (ownRow?.data ?? {}) as Record<string, unknown>,
    version: stamp(ownRow),
    exists: !!ownRow,
  };
}

/** Guarda el tablero completo en la fila que corresponde. */
export async function saveBoard(boardUserId: number, data: Record<string, unknown>) {
  const now = new Date();
  const [saved] = await db
    .insert(hubState)
    .values({ userId: boardUserId, data, updatedAt: now })
    .onConflictDoUpdate({ target: hubState.userId, set: { data, updatedAt: now } })
    .returning();
  return { data: (saved?.data ?? data) as Record<string, unknown>, version: now.getTime() };
}
