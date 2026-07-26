import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users, workSessions } from "@workspace/db/schema";
import { and, desc, eq, gte, isNull, isNotNull } from "drizzle-orm";
import { canManagePeople, normalizeRole } from "@workspace/roles";
import crypto from "crypto";
import {
  discordAuthUrl, discordHealth, discordOAuthConfigured, exchangeCode,
} from "../../lib/discord";
import { countSession, formatDuration, sessionSeconds, type CountableSession } from "../../lib/jornada";

const router: IRouter = Router();

async function loadMe(req: Request) {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) return null;
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  return me ?? null;
}

/** Inicio del día local (America/Santiago) expresado en UTC. */
function startOfLocalDay(now = new Date()): Date {
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
  const diff = now.getTime() - local.getTime();
  local.setHours(0, 0, 0, 0);
  return new Date(local.getTime() + diff);
}

/** Lunes de la semana en curso, hora local. */
function startOfLocalWeek(now = new Date()): Date {
  const day = startOfLocalDay(now);
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
  const dow = (local.getDay() + 6) % 7; // 0 = lunes
  return new Date(day.getTime() - dow * 86_400_000);
}

type Row = typeof workSessions.$inferSelect;

const toCountable = (r: Row): CountableSession => ({
  startedAt: new Date(r.startedAt),
  endedAt: r.endedAt ? new Date(r.endedAt) : null,
  lastSeenAt: new Date(r.lastSeenAt),
  durationSeconds: r.durationSeconds,
});

/** Resumen de una persona: hoy, semana, sesión abierta y los 7 días. */
function summarize(rows: Row[], now: Date) {
  const weekStart = startOfLocalWeek(now);
  const dayStart = startOfLocalDay(now);

  const todaySeconds = rows
    .filter(r => new Date(r.startedAt) >= dayStart)
    .reduce((a, r) => a + countSession(toCountable(r), now), 0);

  const weekSeconds = rows
    .filter(r => new Date(r.startedAt) >= weekStart)
    .reduce((a, r) => a + countSession(toCountable(r), now), 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const from = new Date(weekStart.getTime() + i * 86_400_000);
    const to = new Date(from.getTime() + 86_400_000);
    const seconds = rows
      .filter(r => new Date(r.startedAt) >= from && new Date(r.startedAt) < to)
      .reduce((a, r) => a + countSession(toCountable(r), now), 0);
    return { date: from.toISOString().slice(0, 10), seconds };
  });

  const open = rows.find(r => !r.endedAt) ?? null;

  return {
    todaySeconds,
    weekSeconds,
    todayLabel: formatDuration(todaySeconds),
    weekLabel: formatDuration(weekSeconds),
    days,
    open: open
      ? {
          id: open.id,
          source: open.source,
          channelName: open.channelName,
          startedAt: open.startedAt,
          lastSeenAt: open.lastSeenAt,
          seconds: countSession(toCountable(open), now),
        }
      : null,
  };
}

/** Mi jornada: lo que consume la pantalla "Mi día". */
router.get("/jornada/me", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const now = new Date();
  const since = new Date(startOfLocalWeek(now).getTime() - 7 * 86_400_000);
  const rows = await db
    .select()
    .from(workSessions)
    .where(and(eq(workSessions.userId, me.id), gte(workSessions.startedAt, since)))
    .orderBy(desc(workSessions.startedAt));

  res.json({
    discord: {
      linked: !!me.discordUserId,
      username: me.discordUsername,
      linkedAt: me.discordLinkedAt,
      canLink: discordOAuthConfigured(),
    },
    ...summarize(rows, now),
  });
});

/** Asistencia del equipo. Solo dirección y RRHH. */
router.get("/jornada/team", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  if (!canManagePeople(me.teamRole, me.role === "superadmin")) {
    res.status(403).json({ error: "Solo la dirección y RRHH ven la asistencia del equipo" });
    return;
  }

  const now = new Date();
  const weekStart = startOfLocalWeek(now);
  const people = await db
    .select({ id: users.id, name: users.name, email: users.email, picture: users.picture, discordUserId: users.discordUserId, discordUsername: users.discordUsername })
    .from(users);

  const rows = await db
    .select()
    .from(workSessions)
    .where(gte(workSessions.startedAt, weekStart));

  const byUser = new Map<number, Row[]>();
  for (const r of rows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  res.json({
    weekStart: weekStart.toISOString(),
    people: people.map(p => {
      const summary = summarize(byUser.get(p.id) ?? [], now);
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        picture: p.picture,
        linked: !!p.discordUserId,
        discordUsername: p.discordUsername,
        online: !!summary.open,
        channelName: summary.open?.channelName ?? "",
        todaySeconds: summary.todaySeconds,
        weekSeconds: summary.weekSeconds,
        todayLabel: summary.todayLabel,
        weekLabel: summary.weekLabel,
      };
    }),
  });
});

/**
 * Estado de la integración. Existe para que un fallo se vea: si el bot no está
 * configurado o Discord dejó de responder, la jornada de todos quedaría en cero
 * sin explicación.
 */
router.get("/jornada/status", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  const [{ count } = { count: 0 }] = await db
    .select({ count: users.id })
    .from(users)
    .where(isNotNull(users.discordUserId))
    .limit(1)
    .then(rows => [{ count: rows.length }]);
  res.json(discordHealth(count));
});

/* ---------- Marca manual: respaldo cuando se trabaja sin Discord ---------- */

router.post("/jornada/start", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const [existing] = await db
    .select()
    .from(workSessions)
    .where(and(eq(workSessions.userId, me.id), isNull(workSessions.endedAt)))
    .limit(1);
  if (existing) { res.json({ session: existing, alreadyOpen: true }); return; }

  const now = new Date();
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 200) : "";
  const [row] = await db
    .insert(workSessions)
    .values({ userId: me.id, source: "manual", startedAt: now, lastSeenAt: now, note })
    .returning();
  res.status(201).json({ session: row, alreadyOpen: false });
});

router.post("/jornada/stop", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }

  const [open] = await db
    .select()
    .from(workSessions)
    .where(and(eq(workSessions.userId, me.id), isNull(workSessions.endedAt)))
    .limit(1);
  if (!open) { res.status(404).json({ error: "No tienes una jornada abierta" }); return; }

  const now = new Date();
  // Una sesión de Discord se cierra hasta la última presencia confirmada, no
  // hasta ahora: el tiempo que cuenta es el que estuvo realmente conectada.
  const endedAt = open.source === "discord" ? new Date(open.lastSeenAt) : now;
  const [row] = await db
    .update(workSessions)
    .set({ endedAt, durationSeconds: sessionSeconds(new Date(open.startedAt), endedAt) })
    .where(eq(workSessions.id, open.id))
    .returning();
  res.json({ session: row });
});

/* ---------- Vincular la cuenta de Discord ---------- */

const pendingStates = new Map<string, { userId: number; at: number }>();

router.get("/discord/auth", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  if (!discordOAuthConfigured()) {
    res.status(503).json({ error: "Falta configurar DISCORD_CLIENT_ID y DISCORD_CLIENT_SECRET" });
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, { userId: me.id, at: Date.now() });
  // Limpieza de estados viejos (10 min).
  for (const [key, val] of pendingStates) {
    if (Date.now() - val.at > 600_000) pendingStates.delete(key);
  }
  res.redirect(discordAuthUrl(state));
});

router.get("/discord/callback", async (req: Request, res: Response) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const pending = pendingStates.get(state);
  pendingStates.delete(state);

  if (!code || !pending || Date.now() - pending.at > 600_000) {
    res.redirect("/?discord=error");
    return;
  }

  const profile = await exchangeCode(code);
  if (!profile) { res.redirect("/?discord=error"); return; }

  await db
    .update(users)
    .set({ discordUserId: profile.id, discordUsername: profile.username, discordLinkedAt: new Date() })
    .where(eq(users.id, pending.userId));

  res.redirect("/?discord=ok");
});

router.post("/discord/disconnect", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  await db
    .update(users)
    .set({ discordUserId: null, discordUsername: null, discordLinkedAt: null })
    .where(eq(users.id, me.id));
  res.json({ ok: true });
});

/** RRHH puede vincular a mano el id de Discord de alguien del equipo. */
router.patch("/discord/link/:userId", async (req: Request, res: Response) => {
  const me = await loadMe(req);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return; }
  if (!canManagePeople(me.teamRole, me.role === "superadmin")) {
    res.status(403).json({ error: "Solo la dirección y RRHH pueden vincular cuentas" });
    return;
  }
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) { res.status(400).json({ error: "userId inválido" }); return; }

  const raw = String((req.body as { discordUserId?: unknown })?.discordUserId ?? "").trim();
  if (raw && !/^\d{5,25}$/.test(raw)) {
    res.status(400).json({ error: "El ID de Discord son solo números (clic derecho en el usuario → Copiar ID)" });
    return;
  }

  const [row] = await db
    .update(users)
    .set({
      discordUserId: raw || null,
      discordUsername: raw ? (String((req.body as { discordUsername?: unknown })?.discordUsername ?? "") || null) : null,
      discordLinkedAt: raw ? new Date() : null,
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id, discordUserId: users.discordUserId, discordUsername: users.discordUsername });

  if (!row) { res.status(404).json({ error: "Persona no encontrada" }); return; }
  res.json(row);
});

export { normalizeRole };
export default router;
