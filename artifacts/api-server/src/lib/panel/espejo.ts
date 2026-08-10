import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { panelEspejo, panelSyncEstado } from "@workspace/db/schema";

/**
 * Lectura y escritura del espejo local del panel de webmakerlatam.com.
 * Los registros se pisan completos en cada sync; nunca se editan a mano.
 */

/** Los 23 recursos que expone el panel (ver GET /recursos y el manifiesto). */
export const RECURSOS_PANEL = [
  "clientes",
  "presupuestos",
  "proyectos",
  "tareas",
  "bitacora",
  "contratos-servicio",
  "contratos-mantenimiento",
  "pagos-mantenimiento",
  "contratos-laborales",
  "adicionales",
  "pagos",
  "ingresos",
  "gastos",
  "documentos-tributarios",
  "leads",
  "servicios",
  "pedidos",
  "solicitudes-cambio",
  "ofertas-cierre",
  "colaboradores",
  // Finanzas v2: mismo patrón que arriba -- 404 tolerado si el origen todavía
  // no los publicó (p. ej. si documentos-sii termina viviendo bajo
  // documentos-tributarios, este simplemente nunca trae datos).
  "categorias-gasto",
  "movimientos-mp",
  "documentos-sii",
] as const;

export type RecursoPanel = (typeof RECURSOS_PANEL)[number];

export const esRecursoPanel = (v: string): v is RecursoPanel =>
  (RECURSOS_PANEL as readonly string[]).includes(v);

/**
 * Estados de proyecto que cuentan como "terminado" para el modo equipo.
 * En los datos reales hoy aparecen QA/MOCKUP/DEVELOPMENT/DELIVERY/COMPLETED;
 * se listan también los finales que el panel puede emitir a futuro.
 */
export const ESTADOS_PROYECTO_FINAL = ["COMPLETED", "CANCELLED", "DELIVERED", "ARCHIVED"] as const;

/** La transacción de drizzle o la conexión normal: mismos métodos. */
type Ejecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function fechaDe(r: Record<string, unknown>): Date | null {
  const cruda = r.updatedAt ?? r.createdAt;
  if (typeof cruda !== "string") return null;
  const d = new Date(cruda);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Upsert por (recurso, id): pisa la copia completa. Devuelve cuántos guardó. */
export async function guardarRegistros(
  recurso: string,
  registros: Array<Record<string, unknown>>,
  dbx: Ejecutor = db
): Promise<number> {
  const filas = registros
    .filter((r): r is Record<string, unknown> & { id: string } => typeof r?.id === "string" && r.id.length > 0)
    .map((r) => ({
      recurso,
      id: r.id,
      datos: r,
      actualizadoEn: fechaDe(r),
      sincronizadoEn: new Date(),
    }));

  for (let i = 0; i < filas.length; i += 200) {
    const trozo = filas.slice(i, i + 200);
    await dbx
      .insert(panelEspejo)
      .values(trozo)
      .onConflictDoUpdate({
        target: [panelEspejo.recurso, panelEspejo.id],
        set: {
          datos: sql`excluded.datos`,
          actualizadoEn: sql`excluded.actualizado_en`,
          sincronizadoEn: sql`excluded.sincronizado_en`,
        },
      });
  }
  return filas.length;
}

export interface FiltrosEspejo {
  q?: string;
  status?: string;
  clientId?: string;
  projectId?: string;
  contractId?: string;
  limite?: number;
  offset?: number;
}

/**
 * Igualdad sobre un campo del jsonb. `campo` SIEMPRE viene de nuestro código
 * (whitelist), jamás del usuario. Acepta "A" o "A,B" (cualquiera de los dos).
 */
function campoIgual(campo: "status" | "clientId" | "projectId" | "contractId", valores: string): SQL {
  const lista = valores
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const col = sql`${panelEspejo.datos}->>${sql.raw(`'${campo}'`)}`;
  if (lista.length <= 1) return sql`${col} = ${lista[0] ?? ""}`;
  return sql`${col} = ANY(${lista}::text[])`;
}

/**
 * Visibilidad para el EQUIPO, resuelta en SQL para que paginación y totales
 * sean honestos: proyectos terminados solo si el CEO los compartió (fila
 * puntual o global '*' en panel_visibilidad); tareas y bitácora heredan la
 * visibilidad de su proyecto padre. Los demás recursos no se filtran acá.
 */
function condicionSoloEquipo(recurso: RecursoPanel): SQL | null {
  // OJO: drizzle expande un array JS en placeholders sueltos, por lo que
  // `= ANY(${array}::text[])` genera SQL inválido en runtime (500). La lista
  // de estados va como IN (...) con un placeholder por estado.
  const listaFinales = () =>
    sql.join(
      [...ESTADOS_PROYECTO_FINAL].map((e) => sql`${e}`),
      sql`, `,
    );
  if (recurso === "proyectos") {
    return sql`(
      ${panelEspejo.datos}->>'status' IS NULL
      OR ${panelEspejo.datos}->>'status' NOT IN (${listaFinales()})
      OR EXISTS (
        SELECT 1 FROM panel_visibilidad pv
        WHERE pv.recurso = 'proyectos' AND pv.compartido = true
          AND (pv.panel_id = ${panelEspejo.id} OR pv.panel_id = '*')
      )
    )`;
  }
  if (recurso === "tareas" || recurso === "bitacora") {
    return sql`EXISTS (
      SELECT 1 FROM panel_espejo pe
      WHERE pe.recurso = 'proyectos'
        AND pe.id = ${panelEspejo.datos}->>'projectId'
        AND (
          pe.datos->>'status' IS NULL
          OR pe.datos->>'status' NOT IN (${listaFinales()})
          OR EXISTS (
            SELECT 1 FROM panel_visibilidad pv
            WHERE pv.recurso = 'proyectos' AND pv.compartido = true
              AND (pv.panel_id = pe.id OR pv.panel_id = '*')
          )
        )
    )`;
  }
  return null;
}

/** Listado desde el espejo con filtros básicos; devuelve los registros tal cual. */
export async function leerEspejo(recurso: RecursoPanel, f: FiltrosEspejo, opciones?: { soloEquipo?: boolean }) {
  const condiciones: SQL[] = [eq(panelEspejo.recurso, recurso)];
  if (f.status) condiciones.push(campoIgual("status", f.status));
  if (f.clientId) condiciones.push(campoIgual("clientId", f.clientId));
  if (f.projectId) condiciones.push(campoIgual("projectId", f.projectId));
  if (f.contractId) condiciones.push(campoIgual("contractId", f.contractId));
  if (f.q?.trim()) condiciones.push(sql`${panelEspejo.datos}::text ILIKE ${"%" + f.q.trim() + "%"}`);
  if (opciones?.soloEquipo) {
    const extra = condicionSoloEquipo(recurso);
    if (extra) condiciones.push(extra);
  }
  const donde = and(...condiciones);

  const limite = Math.min(Math.max(f.limite ?? 100, 1), 500);
  const offset = Math.max(f.offset ?? 0, 0);

  const [filas, totales] = await Promise.all([
    db
      .select({ datos: panelEspejo.datos })
      .from(panelEspejo)
      .where(donde)
      .orderBy(sql`${panelEspejo.actualizadoEn} DESC NULLS LAST`, desc(panelEspejo.sincronizadoEn))
      .limit(limite)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(panelEspejo).where(donde),
  ]);

  return { total: totales[0]?.total ?? 0, limite, offset, datos: filas.map((x) => x.datos) };
}

export async function leerRegistro(recurso: RecursoPanel, id: string): Promise<Record<string, unknown> | null> {
  const [fila] = await db
    .select({ datos: panelEspejo.datos })
    .from(panelEspejo)
    .where(and(eq(panelEspejo.recurso, recurso), eq(panelEspejo.id, id)))
    .limit(1);
  return fila?.datos ?? null;
}

/** Fila única de estado del sync (id = 1); la crea si no existe. */
export async function estadoSyncFila(dbx: Ejecutor = db) {
  const [fila] = await dbx.select().from(panelSyncEstado).where(eq(panelSyncEstado.id, 1)).limit(1);
  if (fila) return fila;
  await dbx.insert(panelSyncEstado).values({ id: 1 }).onConflictDoNothing();
  const [creada] = await dbx.select().from(panelSyncEstado).where(eq(panelSyncEstado.id, 1)).limit(1);
  return creada!;
}

/** Conteo de registros espejados por recurso (para la pantalla de estado). */
export async function conteoPorRecurso(): Promise<Record<string, number>> {
  const filas = await db
    .select({ recurso: panelEspejo.recurso, n: sql<number>`count(*)::int` })
    .from(panelEspejo)
    .groupBy(panelEspejo.recurso);
  return Object.fromEntries(filas.map((f) => [f.recurso, f.n]));
}
