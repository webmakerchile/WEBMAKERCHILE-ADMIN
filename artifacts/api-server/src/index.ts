import { initSentry } from "./lib/sentry";
initSentry();
import app from "./app";
import { startScheduler } from "./scheduler";
import { db } from "@workspace/db";
import { users, hubState, hubTasks } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function runDataMigrations() {
  // Migrate legacy area values to the new 4-area system.
  // Any value not in ["ceo","ejecutivo","edicion","marketing"] becomes "ceo"
  // so no user is accidentally locked out. Reassign manually after deploy.
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`
    UPDATE users
    SET team_role = 'ceo'
    WHERE team_role NOT IN ('ceo', 'ejecutivo', 'edicion', 'marketing')
  `);
  await migrateHubTasksFromBlob();
}

/**
 * One-time migration: moves tasks out of hub_state JSONB blobs into hub_tasks rows.
 * Idempotent — if the blob already has an empty tasks array, nothing happens.
 */
async function migrateHubTasksFromBlob() {
  try {
    const stateRows = await db.select().from(hubState);
    for (const row of stateRows) {
      const data = (row.data ?? {}) as Record<string, unknown>;
      const blobTasks = Array.isArray(data["tasks"]) ? (data["tasks"] as Record<string, unknown>[]) : [];
      if (blobTasks.length === 0) continue;

      console.log(`[HubMigration] Migrating ${blobTasks.length} tasks for userId=${row.userId}`);

      const insertRows = blobTasks.map((t, i) => {
        const stage = typeof t["stage"] === "string" ? t["stage"] : "backlog";
        const status =
          stage === "done"
            ? "hecha"
            : ["doing", "qa_sent", "qa_rev"].includes(stage)
              ? "en_progreso"
              : "pendiente";
        const createdAtMs =
          typeof t["createdAt"] === "number" ? t["createdAt"] : Date.now();

        return {
          title: typeof t["title"] === "string" ? t["title"].slice(0, 500) : "Sin título",
          notes: typeof t["notes"] === "string" ? t["notes"].slice(0, 5000) : null,
          createdById: row.userId,
          assigneeId: null as number | null,
          projectRef: typeof t["projectId"] === "string" ? t["projectId"].slice(0, 100) : null,
          priority: (["crítica", "alta", "media", "baja"].includes(String(t["crit"])) ? t["crit"] : "media") as string,
          status,
          dueDate: null as string | null,
          completedAt: status === "hecha" ? new Date(createdAtMs) : null,
          orderIndex: i,
          createdAt: new Date(createdAtMs),
          updatedAt: new Date(
            typeof t["updatedAt"] === "number" ? t["updatedAt"] : createdAtMs,
          ),
        };
      });

      await db.insert(hubTasks).values(insertRows).onConflictDoNothing();

      // Clear tasks from blob
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
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await runDataMigrations().catch((e) => console.error("[DataMigration] failed:", e));
  startScheduler();
});
