// PRIMER import: registra las fuentes (efecto secundario) antes de que ningún
// otro módulo del árbol cargue Sharp/librsvg.
import "./lib/fonts-boot";
import { initSentry } from "./lib/sentry";
initSentry();
import app from "./app";
import { startScheduler } from "./scheduler";
import { startDiscordSweep } from "./lib/discord-sweep";
import { purgarBorradoresCaducados } from "./routes/community";
import { migrarTareasDelBlob } from "./lib/migrar-tareas-blob";
import { respaldarProyectosWmcAlHubDesdeEspejo } from "./lib/panel/hub-sync";
import { db } from "@workspace/db";
import { users, hubState, hubTasks } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

async function runDataMigrations() {
  // Traduce SOLO los valores antiguos de team_role a los roles actuales
  // (mismo mapeo que LEGACY_ALIASES en @workspace/roles). Nunca toca un rol
  // válido: antes este bloque reseteaba a 'ceo' todo lo que no estuviera en
  // una lista vieja de 4 valores, y cada arranque/republicación borraba los
  // roles asignados desde Ajustes.
  await db.execute(sql`
    UPDATE users
    SET team_role = CASE team_role
          WHEN 'reviewer'  THEN 'ceo'
          WHEN 'editor'    THEN 'editora'
          WHEN 'ejecutivo' THEN 'ventas'
          WHEN 'edicion'   THEN 'editora'
        END
    WHERE team_role IN ('reviewer', 'editor', 'ejecutivo', 'edicion')
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

  // Pausas de jornada. Se crea aquí, de forma idempotente, porque
  // `drizzle push` se cuelga en este entorno y el arranque es el único punto
  // garantizado donde el esquema puede converger sin intervención manual.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS hub_work_breaks (
      id          serial PRIMARY KEY,
      session_id  integer NOT NULL REFERENCES hub_work_sessions(id) ON DELETE CASCADE,
      user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at  timestamptz NOT NULL DEFAULT now(),
      ended_at    timestamptz,
      reason      text NOT NULL DEFAULT '',
      created_by  integer REFERENCES users(id) ON DELETE SET NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hub_work_breaks_session_idx ON hub_work_breaks (session_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hub_work_breaks_user_idx ON hub_work_breaks (user_id, started_at)`);
  // A lo sumo UNA pausa abierta por sesión: sin esto, dos clics seguidos
  // descontarían el descanso dos veces.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS hub_work_breaks_open_uniq
    ON hub_work_breaks (session_id) WHERE ended_at IS NULL
  `);

  // Cuentas publicitarias que administra marketing. Idempotente y en el
  // arranque por el mismo motivo que las pausas de jornada.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS marketing_ad_accounts (
      id             serial PRIMARY KEY,
      client_name    text NOT NULL,
      platform       text NOT NULL,
      account_id     text NOT NULL DEFAULT '',
      account_name   text NOT NULL DEFAULT '',
      status         text NOT NULL DEFAULT 'activa',
      monthly_budget integer,
      currency       text NOT NULL DEFAULT 'CLP',
      notes          text NOT NULL DEFAULT '',
      owner_id       integer REFERENCES users(id) ON DELETE SET NULL,
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS marketing_ad_accounts_client_idx ON marketing_ad_accounts (client_name)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS marketing_ad_accounts_platform_idx ON marketing_ad_accounts (platform)`);

  // Links guardados en el espejo del panel: el panel ahora emite SIEMPRE su
  // dominio canónico https://www.webmakerlatam.com (antes salían con
  // webmakerchile.com o sin www; los viejos redirigen 301, pero acá se guarda
  // el canónico). Traducción explícita de esos DOS orígenes viejos y nada
  // más — idempotente: tras el primer arranque el WHERE no matchea filas.
  // El sync solo re-trae registros que cambian, por eso los estancados
  // necesitan esta pasada.
  for (const origenViejo of ["https://webmakerchile.com/", "https://webmakerlatam.com/"]) {
    await db.execute(sql`
      UPDATE panel_espejo
      SET datos = replace(datos::text, ${origenViejo}, 'https://www.webmakerlatam.com/')::jsonb
      WHERE datos::text LIKE ${"%" + origenViejo + "%"}
    `);
  }

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
  startDiscordSweep();
  // Los borradores de Historias y Posts IA se purgan solos. Al arrancar y
  // luego una vez al día: guardar también dispara un barrido, pero un panel
  // que pasa días sin generar nada no puede quedarse sin limpiar.
  const barrerBorradores = () =>
    purgarBorradoresCaducados().catch((e) => console.error("[Borradores] barrido falló:", e));
  void barrerBorradores();
  // Las tareas que el equipo creó en el sistema viejo pasan al real. Una sola
  // vez: la marca vive en el propio tablero.
  void migrarTareasDelBlob().catch((e) => console.error("[migrar-tareas] falló:", e));
  // Respaldo de arranque del puente Proyectos (WMC) → Kanban del Hub: cubre
  // los proyectos wmc que ya existían antes de que este puente existiera, sin
  // esperar a la próxima reconciliación diaria. Idempotente (dedupe por
  // `wmcId`): un reinicio no duplica tarjetas.
  void respaldarProyectosWmcAlHubDesdeEspejo().catch((e) => console.error("[wmc→hub] respaldo falló:", e));
  setInterval(barrerBorradores, 24 * 60 * 60 * 1000).unref();
});
