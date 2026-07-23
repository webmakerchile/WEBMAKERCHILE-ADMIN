import { initSentry } from "./lib/sentry";
initSentry();
import app from "./app";
import { startScheduler } from "./scheduler";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function runDataMigrations() {
  await db.update(users).set({ teamRole: "editora" }).where(eq(users.teamRole, "editor"));
  await db.update(users).set({ teamRole: "ceo" }).where(eq(users.teamRole, "reviewer"));
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
