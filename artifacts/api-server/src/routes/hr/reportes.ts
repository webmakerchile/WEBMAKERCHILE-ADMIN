import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hrDailyReports, hrWeeklyReports, users } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { canManagePeople } from "@workspace/roles";
import { z } from "zod";
import { notifyCeos } from "../../lib/notifications";
import { CORREO_DIRECCION, enviarCorreo } from "../../lib/correo";

/**
 * Reportes diarios e informe semanal de RRHH.
 *
 * - Reporte diario: formulario con fecha precargada (editable). Al EMITIRLO se
 *   avisa a la dirección (notificación interna) y se manda copia por correo al
 *   buzón de la dirección. Editar un reporte ya emitido NO re-avisa.
 * - Informe semanal: una fila por semana (su lunes, semanas de
 *   America/Santiago) con tres secciones de texto que redacta RRHH.
 *
 * Mismo gate que el resto de RRHH: `canManagePeople` verificado en DB
 * (dirección o RRHH) — contenido sensible del equipo.
 */
const router: IRouter = Router();

type Me = { id: number; name: string | null; email: string };

async function requireHr(req: Request, res: Response): Promise<Me | null> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) {
    res.status(401).json({ error: "No autenticado" });
    return null;
  }
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!me || !canManagePeople(me.teamRole, me.role === "superadmin")) {
    res.status(me ? 403 : 401).json({ error: me ? "Solo la dirección y RRHH pueden ver esta información" : "No autenticado" });
    return null;
  }
  return me as Me;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ¿Es una fecha de calendario real? El regex deja pasar 2026-02-30 y Date la
 * normaliza a marzo en silencio — reconstruirla y comparar cierra ese hoyo
 * (clave en weekKey: la versión normalizada caería en lunes y guardaría una
 * llave corrupta distinta de la fila legítima de esa semana).
 */
function fechaCivilValida(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** ¿La fecha civil es lunes? (el día de la semana de un YYYY-MM-DD no depende de la zona) */
function esLunes(v: string): boolean {
  return new Date(`${v}T12:00:00Z`).getUTCDay() === 1;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlReporte(fecha: string, autor: string, contenido: string): string {
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:640px">`,
    `<h2 style="margin:0 0 4px">Reporte diario RRHH — ${esc(fecha)}</h2>`,
    `<p style="margin:0 0 12px;color:#555">Emitido por ${esc(autor)} desde el panel de WebMaker.</p>`,
    `<div style="white-space:pre-wrap;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa">${esc(contenido)}</div>`,
    `</div>`,
  ].join("");
}

/** Bloque de una sección del informe semanal; se omite si viene vacía. */
function seccionHtml(titulo: string, contenido: string): string {
  if (!contenido.trim()) return "";
  return [
    `<div style="margin:0 0 14px">`,
    `<h3 style="margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.03em;color:#555">${esc(titulo)}</h3>`,
    `<div style="white-space:pre-wrap;border:1px solid #ddd;border-radius:8px;padding:12px;background:#fafafa">${esc(contenido)}</div>`,
    `</div>`,
  ].join("");
}

function htmlInforme(week: string, autor: string, resumen: string, destacadas: string, analisis: string): string {
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;max-width:640px">`,
    `<h2 style="margin:0 0 4px">Informe semanal RRHH — semana del ${esc(week)}</h2>`,
    `<p style="margin:0 0 16px;color:#555">Enviado por ${esc(autor)} desde el panel de WebMaker.</p>`,
    seccionHtml("Resumen semanal", resumen),
    seccionHtml("Actividades principales a destacar", destacadas),
    seccionHtml("Análisis", analisis),
    `</div>`,
  ].join("");
}

/** Primer texto no vacío entre las tres secciones, para el aviso corto. */
function previewInforme(resumen: string, destacadas: string, analisis: string): string {
  const texto = [resumen, destacadas, analisis].find((s) => s.trim()) || "";
  return texto.length > 180 ? `${texto.slice(0, 180)}…` : texto;
}

/* ========================== Reportes diarios ============================= */

const reporteSchema = z.object({
  reportDate: z.string().trim().refine(fechaCivilValida, "Fecha inválida (YYYY-MM-DD)"),
  content: z.string().trim().min(1, "El reporte no puede ir vacío").max(20000),
});

/** GET /hr/reportes — últimos reportes con su autor y el estado del correo. */
router.get("/hr/reportes", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const rows = await db
    .select({
      id: hrDailyReports.id,
      reportDate: hrDailyReports.reportDate,
      content: hrDailyReports.content,
      emailStatus: hrDailyReports.emailStatus,
      emailDetail: hrDailyReports.emailDetail,
      createdAt: hrDailyReports.createdAt,
      updatedAt: hrDailyReports.updatedAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(hrDailyReports)
    .leftJoin(users, eq(users.id, hrDailyReports.authorId))
    .orderBy(desc(hrDailyReports.reportDate), desc(hrDailyReports.id))
    .limit(200);
  res.json(rows);
});

/**
 * POST /hr/reportes — emite un reporte: se guarda, se avisa a la dirección y
 * se manda el correo. Ni el aviso ni el correo deciden la suerte del guardado:
 * su resultado queda registrado en la fila para que el panel lo muestre.
 */
router.post("/hr/reportes", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const parsed = reporteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const { reportDate, content } = parsed.data;
  const [row] = await db.insert(hrDailyReports).values({ reportDate, content, authorId: me.id }).returning();

  const autor = me.name || me.email;
  await notifyCeos({
    title: `Reporte diario de RRHH — ${reportDate}`,
    body: `${autor}: ${content.length > 180 ? `${content.slice(0, 180)}…` : content}`,
    link: "/informes-rrhh",
    excludeUserId: me.id,
  }).catch((err) => console.error("[hr reportes] notifyCeos failed", err));

  // enviarCorreo no lanza por contrato, pero el try/catch queda de cinturón:
  // un reporte emitido jamás se pierde por culpa del correo.
  let emailStatus = "fallido";
  let emailDetail = "";
  try {
    const r = await enviarCorreo({
      to: CORREO_DIRECCION,
      subject: `Reporte diario RRHH — ${reportDate}`,
      html: htmlReporte(reportDate, autor, content),
      text: `Reporte diario RRHH — ${reportDate}\nEmitido por: ${autor}\n\n${content}`,
    });
    emailStatus = r.ok ? "enviado" : r.motivo;
    emailDetail = r.ok ? "" : r.detalle;
  } catch (err) {
    emailDetail = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    console.error("[hr reportes] enviarCorreo lanzó (no debería)", emailDetail);
  }
  const [final] = await db
    .update(hrDailyReports)
    .set({ emailStatus, emailDetail })
    .where(eq(hrDailyReports.id, row.id))
    .returning();

  res.status(201).json({ ...(final ?? { ...row, emailStatus, emailDetail }), authorName: me.name, authorEmail: me.email });
});

/** PATCH /hr/reportes/:id — edita fecha o contenido. Editar no re-avisa. */
router.patch("/hr/reportes/:id", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Id inválido" });
    return;
  }
  const parsed = reporteSchema.partial().safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  if (parsed.data.reportDate === undefined && parsed.data.content === undefined) {
    res.status(400).json({ error: "Nada que actualizar" });
    return;
  }
  const [row] = await db
    .update(hrDailyReports)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(hrDailyReports.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Reporte no encontrado" });
    return;
  }
  res.json(row);
});

/* ========================== Informe semanal ============================== */

const informeSchema = z.object({
  resumen: z.string().trim().max(20000).default(""),
  destacadas: z.string().trim().max(20000).default(""),
  analisis: z.string().trim().max(20000).default(""),
});

function semanaValida(week: string, res: Response): boolean {
  if (!fechaCivilValida(week) || !esLunes(week)) {
    res.status(400).json({ error: "La semana se identifica por su lunes (YYYY-MM-DD)" });
    return false;
  }
  return true;
}

/** GET /hr/informes — semanas que ya tienen informe (para el selector). */
router.get("/hr/informes", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const rows = await db
    .select({ weekKey: hrWeeklyReports.weekKey, updatedAt: hrWeeklyReports.updatedAt })
    .from(hrWeeklyReports)
    .orderBy(desc(hrWeeklyReports.weekKey))
    .limit(52);
  res.json(rows);
});

/** GET /hr/informes/:week — el informe de esa semana, o null si no existe. */
router.get("/hr/informes/:week", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const week = String(req.params.week);
  if (!semanaValida(week, res)) return;
  const [row] = await db
    .select({
      weekKey: hrWeeklyReports.weekKey,
      resumen: hrWeeklyReports.resumen,
      destacadas: hrWeeklyReports.destacadas,
      analisis: hrWeeklyReports.analisis,
      sentAt: hrWeeklyReports.sentAt,
      emailStatus: hrWeeklyReports.emailStatus,
      emailDetail: hrWeeklyReports.emailDetail,
      updatedAt: hrWeeklyReports.updatedAt,
      updatedByName: users.name,
      updatedByEmail: users.email,
    })
    .from(hrWeeklyReports)
    .leftJoin(users, eq(users.id, hrWeeklyReports.updatedBy))
    .where(eq(hrWeeklyReports.weekKey, week))
    .limit(1);
  res.json(row ?? null);
});

/**
 * PUT /hr/informes/:week — crea o actualiza el BORRADOR de la semana. Guardar
 * no avisa ni manda correo: RRHH puede volver a esta ficha muchas veces
 * mientras redacta. Enviarlo a dirección es una acción aparte (ver abajo).
 */
router.put("/hr/informes/:week", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const week = String(req.params.week);
  if (!semanaValida(week, res)) return;
  const parsed = informeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const [row] = await db
    .insert(hrWeeklyReports)
    .values({ weekKey: week, ...parsed.data, updatedBy: me.id, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: hrWeeklyReports.weekKey,
      set: { ...parsed.data, updatedBy: me.id, updatedAt: new Date() },
    })
    .returning();
  res.json(row);
});

/**
 * POST /hr/informes/:week/enviar — guarda el informe y lo ENVÍA a dirección:
 * avisa a los CEO (notificación interna) y manda copia por correo. Se puede
 * volver a enviar la misma semana si hay novedades (a diferencia del reporte
 * diario, el informe semanal es una sola ficha que se redacta en varias
 * pasadas). Ni el aviso ni el correo deciden la suerte del guardado.
 */
router.post("/hr/informes/:week/enviar", async (req, res) => {
  const me = await requireHr(req, res);
  if (!me) return;
  const week = String(req.params.week);
  if (!semanaValida(week, res)) return;
  const parsed = informeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const { resumen, destacadas, analisis } = parsed.data;
  if (!resumen.trim() && !destacadas.trim() && !analisis.trim()) {
    res.status(400).json({ error: "El informe no puede ir vacío" });
    return;
  }
  const sentAt = new Date();
  const [row] = await db
    .insert(hrWeeklyReports)
    .values({ weekKey: week, ...parsed.data, updatedBy: me.id, updatedAt: sentAt, sentAt })
    .onConflictDoUpdate({
      target: hrWeeklyReports.weekKey,
      set: { ...parsed.data, updatedBy: me.id, updatedAt: sentAt, sentAt },
    })
    .returning();

  const autor = me.name || me.email;
  await notifyCeos({
    title: `Informe semanal de RRHH — semana del ${week}`,
    body: `${autor}: ${previewInforme(resumen, destacadas, analisis)}`,
    link: "/informes-rrhh",
    excludeUserId: me.id,
  }).catch((err) => console.error("[hr informes] notifyCeos failed", err));

  let emailStatus = "fallido";
  let emailDetail = "";
  try {
    const r = await enviarCorreo({
      to: CORREO_DIRECCION,
      subject: `Informe semanal RRHH — semana del ${week}`,
      html: htmlInforme(week, autor, resumen, destacadas, analisis),
      text: `Informe semanal RRHH — semana del ${week}\nEnviado por: ${autor}\n\nResumen semanal:\n${resumen}\n\nActividades a destacar:\n${destacadas}\n\nAnálisis:\n${analisis}`,
    });
    emailStatus = r.ok ? "enviado" : r.motivo;
    emailDetail = r.ok ? "" : r.detalle;
  } catch (err) {
    emailDetail = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    console.error("[hr informes] enviarCorreo lanzó (no debería)", emailDetail);
  }
  const [final] = await db
    .update(hrWeeklyReports)
    .set({ emailStatus, emailDetail })
    .where(eq(hrWeeklyReports.weekKey, week))
    .returning();

  res.json({ ...(final ?? { ...row, emailStatus, emailDetail }), updatedByName: me.name, updatedByEmail: me.email });
});

export default router;
