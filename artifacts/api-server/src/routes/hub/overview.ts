import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hubClients, hubContracts, hubMeetings, hubProjects, hubQuotes, hubTasks } from "@workspace/db/schema";
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { getApprovedMembers } from "./helpers";

const router: IRouter = Router();

/** Tarea abierta = cualquier estado distinto de 'hecho' (incluye sin estado). */
const openTask = or(isNull(hubTasks.status), ne(hubTasks.status, "hecho"))!;

router.get("/hub/members", async (_req: Request, res: Response) => {
  const members = await getApprovedMembers();
  res.json(members);
});

router.get("/hub/overview", async (_req: Request, res: Response) => {
  const now = new Date();

  const [
    [projects],
    [clients],
    [tasksOpen],
    [meetingsUpcoming],
    [contractsActive],
    [quotesOpen],
    upcomingMeetings,
    dueTasks,
    expiringContracts,
  ] = await Promise.all([
    db.select({ value: count() }).from(hubProjects),
    db.select({ value: count() }).from(hubClients),
    db.select({ value: count() }).from(hubTasks).where(openTask),
    db.select({ value: count() }).from(hubMeetings).where(gte(hubMeetings.date, now)),
    db.select({ value: count() }).from(hubContracts).where(eq(hubContracts.status, "activo")),
    db.select({ value: count() }).from(hubQuotes).where(inArray(hubQuotes.status, ["borrador", "enviado"])),
    db
      .select()
      .from(hubMeetings)
      .where(gte(hubMeetings.date, now))
      .orderBy(asc(hubMeetings.date))
      .limit(5),
    db
      .select()
      .from(hubTasks)
      .where(and(isNotNull(hubTasks.dueDate), openTask))
      .orderBy(asc(hubTasks.dueDate))
      .limit(5),
    db
      .select()
      .from(hubContracts)
      .where(gte(hubContracts.expiresAt, now))
      .orderBy(asc(hubContracts.expiresAt))
      .limit(5),
  ]);

  res.json({
    counts: {
      projects: projects.value,
      clients: clients.value,
      tasksOpen: tasksOpen.value,
      meetingsUpcoming: meetingsUpcoming.value,
      contractsActive: contractsActive.value,
      quotesOpen: quotesOpen.value,
    },
    upcomingMeetings,
    dueTasks,
    expiringContracts,
  });
});

export default router;
