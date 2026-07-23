import { initSentry } from "./lib/sentry";
initSentry();
import app from "./app";
import { startScheduler } from "./scheduler";
import { db } from "@workspace/db";
import { users, hubState, hubTasks } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

async function runDataMigrations() {
  // Migrate legacy area values to the new 4-area system.
  // Any value not in the 4 areas → "ceo" so no one is locked out.
  await db.execute(sql`
    UPDATE users
    SET team_role = 'ceo'
    WHERE team_role NOT IN ('ceo', 'ejecutivo', 'edicion', 'marketing')
  `);

  // Migrate existing hub_tasks rows that were created with the old
  // status-based model (pendiente/en_progreso/hecha) to the Scrumban
  // stage model. Only rows that still have the column defaults need this.
  await db.execute(sql`
    UPDATE hub_tasks
    SET stage = CASE
          WHEN stage = 'pendiente'   THEN 'backlog'
          WHEN stage = 'en_progreso' THEN 'doing'
          WHEN stage = 'hecha'       THEN 'done'
          ELSE stage
        END
    WHERE stage IN ('pendiente', 'en_progreso', 'hecha')
  `);

  await migrateHubTasksFromBlob();
}

/**
 * One-time migration: moves tasks out of hub_state JSONB blobs into hub_tasks rows.
 * Preserves stage, stageSince, stageTime from the blob exactly.
 * Idempotent — if the blob's tasks array is empty, nothing happens.
 */
async function migrateHubTasksFromBlob() {
  try {
    const stateRows = await db.select().from(hubState);
    for (const row of stateRows) {
      const data = (row.data ?? {}) as Record<string, unknown>;
      const blobTasks = Array.isArray(data["tasks"])
        ? (data["tasks"] as Record<string, unknown>[])
        : [];
      if (blobTasks.length === 0) continue;

      console.log(`[HubMigration] Migrating ${blobTasks.length} tasks for userId=${row.userId}`);

      const insertRows = blobTasks.map((t, i) => {
        const stage =
          typeof t["stage"] === "string" ? t["stage"] : "backlog";
        const createdAtMs =
          typeof t["createdAt"] === "number" ? t["createdAt"] : Date.now();
        const stageSinceMs =
          typeof t["stageSince"] === "number" ? t["stageSince"] : createdAtMs;
        const rawStageTime = t["stageTime"];
        const stageTime: Record<string, number> =
          rawStageTime && typeof rawStageTime === "object" && !Array.isArray(rawStageTime)
            ? Object.fromEntries(
                Object.entries(rawStageTime as Record<string, unknown>)
                  .filter(([, v]) => typeof v === "number")
                  .map(([k, v]) => [k, v as number]),
              )
            : {};

        return {
          title:
            typeof t["title"] === "string" ? t["title"].slice(0, 500) : "Sin título",
          notes:
            typeof t["notes"] === "string" ? t["notes"].slice(0, 5000) : null,
          createdById: row.userId,
          assigneeId: null as number | null,
          projectRef:
            typeof t["projectId"] === "string"
              ? t["projectId"].slice(0, 100)
              : null,
          priority: (
            ["crítica", "alta", "media", "baja"].includes(String(t["crit"]))
              ? t["crit"]
              : "media"
          ) as string,
          stage,
          stageSince: new Date(stageSinceMs),
          stageTime,
          dueDate: null as string | null,
          completedAt: stage === "done" ? new Date(createdAtMs) : null,
          orderIndex: i,
          createdAt: new Date(createdAtMs),
          updatedAt: new Date(
            typeof t["updatedAt"] === "number" ? t["updatedAt"] : createdAtMs,
          ),
        };
      });

      await db.insert(hubTasks).values(insertRows).onConflictDoNothing();

      // Clear tasks from blob (keep projects/clients/meetings/notes/contracts)
      const newData = { ...data, tasks: [] };
      await db
        .update(hubState)
        .set({ data: newData })
        .where(eq(hubState.id, row.id));

      console.log(`[HubMigration] Done for userId=${row.userId}`);
    }
  } catch (err) {
    console.error("[HubMigration] Failed:", err);
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await runDataMigrations().catch((e) =>
    console.error("[DataMigration] failed:", e),
  );
  startScheduler();
});
