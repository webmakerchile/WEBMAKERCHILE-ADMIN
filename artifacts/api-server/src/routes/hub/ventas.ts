import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { contractSignatures } from "@workspace/db/schema";
import { generarToken, caducidad, urlDeFirma } from "../../lib/firma-contrato";
import { canSeeMoney, normalizeRole } from "@workspace/roles";
import { resolveBoard, saveBoard, saveBoardSiVersion } from "../../lib/hub-board";
import { recordActivity } from "../../lib/activity";
import {
  PIPELINE_STAGES,
  STAGE_DEFAULT_PROB,
  computeCommissions,
  getRenewalAlertDays,
  isPipelineStage,
  pipelineContracts,
  setRenewalAlertDays,
  toOpportunity,
  weightedProjection,
  contractNet,
} from "../../lib/ventas";
import {
  completarMeses,
  proyectarVentas,
  variacionUltimoMes,
  bondadDelAjuste,
} from "../../lib/proyeccion-ventas";
import {
  esVentaCerrada,
  motivoValido,
  tasaDeConversion,
  perdidasPorMotivo,
} from "../../lib/estado-contrato";
import {
  TIPOS_REUNION,
  DESENLACES_REUNION,
  MOTIVOS_FUTURO,
  siguienteTipo,
  esReunionVentas,
  embudoVentas,
  casosFuturo,
  casosPerdidos,
} from "../../lib/reuniones-ventas";

/**
 * Torre de control de Ventas (pipeline, renovaciones y comisiones).
 * Gestión: CEO y Ventas. Los montos (proyección, comisiones, neto) solo
 * salen del servidor para roles con canSeeMoney.
 */
const router: IRouter = Router();

type Rec = Record<string, unknown>;
type Me = { id: number; name: string | null; email: string; teamRole: string | null; role: string };

async function loadMe(req: Request, res: Response): Promise<Me | null> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) { res.status(401).json({ error: "No autenticado" }); return null; }
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!me) { res.status(401).json({ error: "No autenticado" }); return null; }
  return me as Me;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const roleOf = (me: Me) => normalizeRole(me.teamRole, me.role === "superadmin");
const canManageVentas = (me: Me) => {
  const r = roleOf(me);
  return r === "ceo" || r === "ventas";
};

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function currentMonth(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }).slice(0, 7);
}

/** Id con el mismo formato que usan las demás entidades del tablero. */
const nuevoId = () => "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/**
 * GET /hub/ventas/resumen?month=YYYY-MM
 * Pipeline normalizado + renovaciones próximas + proyección ponderada del mes.
 * La proyección y los netos solo se incluyen para roles con canSeeMoney.
 */
/**
 * Serie mensual de lo cerrado + tendencia por mínimos cuadrados.
 *
 * Cuenta las ventas HECHAS: los borradores son el embudo, no ventas, y
 * mezclarlos infla la historia con cosas que aún pueden caerse. Antes se
 * contaban solo los "activo", y eso borraba de su mes los contratos que se
 * firmaron y meses después se cortaron: la venta ocurrió, y el mes pasado
 * encogía sin que nadie lo notara. Ahora lo decide `desenlaceDe`, que además
 * separa lo perdido de lo cancelado (ver lib/estado-contrato.ts).
 *
 * Los meses sin ventas se rellenan con cero — si no, la recta se ajusta como
 * si esos meses no hubieran existido y la tendencia sale mejor de lo que fue.
 */
function tendenciaDeVentas(contracts: Rec[]) {
  const porMes = new Map<string, number>();
  for (const c of contracts) {
    if (!esVentaCerrada(c)) continue;
    const fecha = str(c.issuedAt) || str(c.createdAt);
    const mes = fecha.slice(0, 7);
    if (!MONTH_RE.test(mes)) continue;
    porMes.set(mes, (porMes.get(mes) ?? 0) + contractNet(c));
  }
  const serie = completarMeses([...porMes.entries()].map(([mes, monto]) => ({ mes, monto })));
  if (serie.length < 2) return { serie, proyeccion: [], variacion: null, confianza: null };
  return {
    serie,
    proyeccion: proyectarVentas(serie, 3),
    variacion: variacionUltimoMes(serie),
    // Sin esto, una raya sobre datos dispersos se lee como una previsión.
    confianza: bondadDelAjuste(serie),
  };
}

router.get("/hub/ventas/resumen", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Solo dirección y ventas ven la torre de Ventas" }); return; }
  const month = typeof req.query.month === "string" && MONTH_RE.test(req.query.month) ? req.query.month : currentMonth();
  const seeMoney = canSeeMoney(roleOf(me));

  const board = await resolveBoard();
  const contracts = board && Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
  const opportunities = pipelineContracts(contracts).map((c) => toOpportunity(c, seeMoney));
  // Cuántas se ganan y en qué se pierden. No se podía calcular mientras
  // "perdido" y "cancelado" fueran el mismo estado.
  const conversion = tasaDeConversion(contracts);
  const motivosPerdida = perdidasPorMotivo(contracts);

  const renewalDays = await getRenewalAlertDays();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const limit = new Date(Date.now() + renewalDays * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const renewalStarted = new Set(contracts.map((c) => str(c.renewalOfId)).filter(Boolean));
  const renewals = contracts
    .filter((c) => str(c.status) === "activo" && str(c.expiresAt) !== "" && str(c.expiresAt) <= limit)
    .map((c) => ({
      id: str(c.id),
      title: str(c.title),
      client: str(c.client),
      expiresAt: str(c.expiresAt),
      expired: str(c.expiresAt) < today,
      renewalStarted: renewalStarted.has(str(c.id)),
    }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));

  // Posibles dueños de oportunidad: ejecutivos de venta y dirección.
  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, teamRole: users.teamRole, role: users.role, approvalStatus: users.approvalStatus })
    .from(users);
  const sellers = allUsers
    .filter((u) => u.approvalStatus === "approved" && ["ventas", "ceo"].includes(normalizeRole(u.teamRole, u.role === "superadmin")))
    .map((u) => ({ id: u.id, name: u.name || u.email }));

  res.json({
    month,
    sellers,
    stages: PIPELINE_STAGES,
    stageDefaults: STAGE_DEFAULT_PROB,
    opportunities,
    renewals,
    renewalAlertDays: renewalDays,
    // Proyección = suma(neto × probabilidad) de las oportunidades del mes.
    projection: seeMoney ? weightedProjection(opportunities, month) : null,
    // Tendencia sobre lo REALMENTE cerrado, que es otra cosa: la de arriba es
    // una foto del embudo de hoy, esta dice hacia dónde va el negocio.
    tendencia: seeMoney ? tendenciaDeVentas(contracts) : null,
    // Cuántas se ganan y en qué se pierden. Va sin `seeMoney` a propósito: es
    // un recuento, no un monto, y saber que se pierde por plazo o por no
    // responder le sirve a producción tanto como a ventas.
    conversion,
    motivosPerdida,
    // Embudo por fase del flujo de reuniones + historiales consultables.
    // También recuentos sin montos, por la misma razón que `conversion`.
    embudo: embudoVentas(contracts),
    casosFuturo: casosFuturo(contracts),
    casosPerdidos: casosPerdidos(contracts),
    motivosFuturo: MOTIVOS_FUTURO,
    canSeeMoney: seeMoney,
  });
});

/**
 * POST /hub/contracts/:id/firma — genera (o reutiliza) el enlace de aceptación.
 *
 * Reutiliza el pendiente en vez de crear uno nuevo cada vez: con un enlace
 * distinto por clic, el cliente que abre el que le mandaron ayer se encuentra
 * con que ya no vale, sin haber hecho nada mal.
 */
router.post("/hub/contracts/:id/firma", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Solo dirección y ventas generan enlaces de firma" }); return; }

  const contractId = String(req.params.id ?? "");
  if (!contractId) { res.status(400).json({ error: "Falta el contrato" }); return; }

  try {
    const board = await resolveBoard();
    const contratos = board && Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
    if (!contratos.some((c) => str(c.id) === contractId)) {
      res.status(404).json({ error: "Ese contrato no existe" });
      return;
    }

    const [existente] = await db.select().from(contractSignatures)
      .where(and(eq(contractSignatures.contractId, contractId), eq(contractSignatures.estado, "pendiente")))
      .limit(1);

    const vigente = existente && (!existente.expiresAt || existente.expiresAt.getTime() > Date.now());
    const fila = vigente
      ? existente
      : (await db.insert(contractSignatures).values({
          contractId,
          token: generarToken(),
          createdById: me.id,
          expiresAt: caducidad(),
        }).returning())[0]!;

    res.json({
      token: fila.token,
      url: urlDeFirma(basePublica(req), fila.token),
      expiresAt: fila.expiresAt,
      estado: fila.estado,
    });
  } catch (err) {
    console.error("[hub/contracts/firma POST]", err);
    res.status(500).json({ error: "No se pudo generar el enlace de firma" });
  }
});

/** GET /hub/contracts/:id/firma — estado y constancia de la aceptación. */
router.get("/hub/contracts/:id/firma", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Sin acceso" }); return; }
  try {
    const filas = await db.select().from(contractSignatures)
      .where(eq(contractSignatures.contractId, String(req.params.id ?? "")));
    res.json({
      firmas: filas.map((f) => ({
        estado: f.estado,
        url: f.estado === "pendiente" ? urlDeFirma(basePublica(req), f.token) : null,
        expiresAt: f.expiresAt,
        signedAt: f.signedAt,
        signerName: f.signerName,
        signerEmail: f.signerEmail,
        // La IP es parte de la constancia: sin ella el registro dice mucho menos.
        signerIp: f.signerIp,
      })),
    });
  } catch (err) {
    console.error("[hub/contracts/firma GET]", err);
    res.status(500).json({ error: "No se pudo leer el estado de la firma" });
  }
});

/** Base pública del panel, para armar el enlace que se le manda al cliente. */
function basePublica(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost";
  const proto = req.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

const oppPatchSchema = z.object({
  pipelineStage: z.enum(PIPELINE_STAGES).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  nextFollowUp: z.string().refine((v) => v === "" || DATE_RE.test(v), "Fecha inválida").optional(),
  expectedClose: z.string().refine((v) => v === "" || DATE_RE.test(v) || MONTH_RE.test(v), "Fecha inválida").optional(),
  salesOwnerId: z.number().int().positive().nullable().optional(),
});

/**
 * PATCH /hub/ventas/opportunities/:id — actualiza SOLO los campos de pipeline
 * de un contrato (endpoint acotado, mismo patrón que /cobro: se toca una
 * entidad y se sube su updatedAt para que la fusión del tablero lo respete).
 */
router.patch("/hub/ventas/opportunities/:id", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Solo dirección y ventas gestionan el pipeline" }); return; }
  const parsed = oppPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: parsed.success ? "Nada que actualizar" : parsed.error.issues[0]?.message || "Datos inválidos" });
    return;
  }
  const board = await resolveBoard();
  if (!board) { res.status(409).json({ error: "Todavía no hay un tablero de dirección" }); return; }
  const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
  const idx = contracts.findIndex((c) => str(c?.id) === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Oportunidad no encontrada" }); return; }

  const patch: Rec = { ...parsed.data };
  // Al cambiar de etapa sin tocar probabilidad, se aplica el default de la etapa.
  if (isPipelineStage(patch.pipelineStage) && parsed.data.probability === undefined) {
    patch.probability = STAGE_DEFAULT_PROB[patch.pipelineStage];
  }
  const next = [...contracts];
  next[idx] = { ...contracts[idx], ...patch, updatedAt: Date.now() };
  await saveBoard(board.boardUserId, { ...board.data, contracts: next });

  if (parsed.data.pipelineStage) {
    recordActivity({
      actorId: me.id,
      entityType: "contract",
      entityId: 0,
      entityLabel: `Oportunidad ${str(contracts[idx].title) || req.params.id} → ${parsed.data.pipelineStage}`,
      action: "status_change",
      detail: { to: parsed.data.pipelineStage },
    });
  }
  res.json({ ok: true, opportunity: toOpportunity(next[idx], canSeeMoney(roleOf(me))) });
});

const reunionSchema = z.object({
  tipo: z.enum(TIPOS_REUNION),
  date: z.string().regex(DATE_RE, "Fecha inválida"),
  summary: z.string().max(2000).optional(),
});

/**
 * POST /hub/ventas/opportunities/:id/reuniones — agenda una reunión del flujo
 * de ventas (discovery/propuesta/seguimiento) vinculada a la oportunidad.
 *
 * La reunión queda en la colección de reuniones del tablero (se ve en la
 * pestaña Reuniones) y el seguimiento de la oportunidad pasa a apuntar a esa
 * fecha; de avisar si pasa sin resultado se encarga el recordatorio de
 * reuniones sin desenlace (el de seguimientos vencidos se calla en ese caso
 * para no avisar dos veces por lo mismo). No se crea evento en Google
 * Calendar: el permiso actual del OAuth es de solo lectura, y prometer un
 * evento que no se crea es peor que decirlo.
 */
router.post("/hub/ventas/opportunities/:id/reuniones", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Solo dirección y ventas agendan reuniones de venta" }); return; }
  const parsed = reunionSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" }); return; }

  // Guardado condicionado a la versión leída: si otro guardado del tablero se
  // cruza (el PATCH completo del Hub, otro endpoint), se relee y se reintenta
  // en vez de pisar esos cambios con una copia vieja.
  for (let intento = 0; intento < 3; intento++) {
    const board = await resolveBoard();
    if (!board) { res.status(409).json({ error: "Todavía no hay un tablero de dirección" }); return; }
    const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
    const meetings = Array.isArray(board.data.meetings) ? (board.data.meetings as Rec[]) : [];
    const idx = contracts.findIndex((c) => str(c?.id) === req.params.id);
    if (idx === -1) { res.status(404).json({ error: "Oportunidad no encontrada" }); return; }
    if (str(contracts[idx].status) !== "borrador") { res.status(409).json({ error: "Este contrato ya salió del embudo de ventas" }); return; }

    const c = contracts[idx];
    const now = Date.now();
    const meeting: Rec = {
      id: nuevoId(),
      client: str(c.client),
      date: parsed.data.date,
      summary: (parsed.data.summary?.trim() || `Reunión ${parsed.data.tipo}: ${str(c.title)}`).slice(0, 200),
      notes: "",
      tipo: parsed.data.tipo,
      contractId: str(c.id),
      createdAt: now,
      updatedAt: now,
    };
    const nextContracts = [...contracts];
    // Agendar reactiva el caso: si estaba "a futuro" vuelve al embudo activo,
    // y el seguimiento pasa a apuntar a la fecha de la reunión.
    nextContracts[idx] = { ...c, nextFollowUp: parsed.data.date, futuroMotivo: "", futuroFecha: "", futuroNota: "", updatedAt: now };
    const guardado = await saveBoardSiVersion(
      board.boardUserId,
      { ...board.data, contracts: nextContracts, meetings: [...meetings, meeting] },
      board.version,
    );
    if (!guardado) continue;

    recordActivity({
      actorId: me.id,
      entityType: "contract",
      entityId: 0,
      entityLabel: `Reunión ${parsed.data.tipo} agendada: ${str(c.client) || str(c.title)} — ${parsed.data.date}`,
      action: "created",
      detail: { tipo: parsed.data.tipo, date: parsed.data.date },
    });
    res.status(201).json({ ok: true, meeting, opportunity: toOpportunity(nextContracts[idx], canSeeMoney(roleOf(me))) });
    return;
  }
  res.status(503).json({ error: "El tablero está recibiendo otros cambios; intenta de nuevo en unos segundos" });
});

const desenlaceSchema = z.object({
  desenlace: z.enum(DESENLACES_REUNION),
  motivoPerdida: z.string().max(60).optional(),
  futuroMotivo: z.enum(MOTIVOS_FUTURO).optional(),
  futuroFecha: z.string().regex(DATE_RE, "Fecha inválida").optional(),
  futuroNota: z.string().max(500).optional(),
  siguienteFecha: z.string().regex(DATE_RE, "Fecha inválida").optional(),
  siguienteTipo: z.enum(TIPOS_REUNION).optional(),
});

/**
 * POST /hub/ventas/reuniones/:id/desenlace — registra cómo terminó una
 * reunión de venta y aplica el paso siguiente sobre la oportunidad:
 *
 *   siguiente_reunion → crea la próxima reunión (discovery→propuesta→seguimiento)
 *   acepta_inmediato  → la oportunidad pasa a etapa cierre
 *   acepta_futuro     → guarda motivo + fecha estimada; el aviso de "casos a
 *                       futuro" recuerda retomar cuando la fecha se acerque
 *   perdido           → el contrato pasa a "perdido" con su motivo
 *
 * Se registra una sola vez: para corregir un desenlace está la ficha del
 * contrato, donde el estado se cambia con todas sus consecuencias a la vista.
 */
router.post("/hub/ventas/reuniones/:id/desenlace", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Solo dirección y ventas registran desenlaces" }); return; }
  const parsed = desenlaceSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" }); return; }
  const body = parsed.data;

  // Validaciones condicionales por desenlace, antes de tocar el tablero.
  const motivo = body.desenlace === "perdido" ? motivoValido(body.motivoPerdida) : null;
  if (body.desenlace === "perdido" && !motivo) { res.status(400).json({ error: "Indica el motivo de la pérdida" }); return; }
  if (body.desenlace === "acepta_futuro" && (!body.futuroMotivo || !body.futuroFecha)) {
    res.status(400).json({ error: "Indica el motivo y la fecha estimada del caso a futuro" });
    return;
  }
  if (body.desenlace === "siguiente_reunion" && !body.siguienteFecha) {
    res.status(400).json({ error: "Indica la fecha de la siguiente reunión" });
    return;
  }

  // Mismo guardado condicionado a versión que al agendar. De paso resuelve la
  // carrera de dos desenlaces simultáneos: el segundo reintenta con el tablero
  // fresco y se encuentra la reunión ya resuelta (409).
  for (let intento = 0; intento < 3; intento++) {
    const board = await resolveBoard();
    if (!board) { res.status(409).json({ error: "Todavía no hay un tablero de dirección" }); return; }
    const meetings = Array.isArray(board.data.meetings) ? (board.data.meetings as Rec[]) : [];
    const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
    const mIdx = meetings.findIndex((m) => str(m?.id) === req.params.id);
    if (mIdx === -1) { res.status(404).json({ error: "Reunión no encontrada" }); return; }
    const m = meetings[mIdx];
    // Solo reuniones del flujo de ventas (vinculadas y con tipo válido): una
    // reunión suelta o enlazada a mano no puede perder ni cerrar un contrato.
    if (!esReunionVentas(m)) { res.status(409).json({ error: "Esta reunión no es del flujo de ventas (falta vincularla a una oportunidad)" }); return; }
    if (str(m.desenlace) !== "") { res.status(409).json({ error: "Esta reunión ya tiene desenlace registrado. Para corregirlo, edita el contrato." }); return; }
    const cIdx = contracts.findIndex((c) => str(c?.id) === str(m.contractId));
    if (cIdx === -1) { res.status(404).json({ error: "La oportunidad de esta reunión ya no existe" }); return; }
    if (str(contracts[cIdx].status) !== "borrador") { res.status(409).json({ error: "Este contrato ya salió del embudo de ventas" }); return; }

    const c = contracts[cIdx];
    const now = Date.now();
    const nextMeetings = [...meetings];
    nextMeetings[mIdx] = { ...m, desenlace: body.desenlace, desenlaceAt: now, updatedAt: now };
    const contrato: Rec = { ...c, updatedAt: now };
    let creada: Rec | null = null;
    let label = "";

    if (body.desenlace === "siguiente_reunion") {
      const tipoNext = body.siguienteTipo ?? siguienteTipo(m.tipo);
      creada = {
        id: nuevoId(),
        client: str(c.client),
        date: body.siguienteFecha,
        summary: `Reunión ${tipoNext}: ${str(c.title)}`.slice(0, 200),
        notes: "",
        tipo: tipoNext,
        contractId: str(c.id),
        createdAt: now,
        updatedAt: now,
      };
      nextMeetings.push(creada);
      Object.assign(contrato, { nextFollowUp: body.siguienteFecha, futuroMotivo: "", futuroFecha: "", futuroNota: "" });
      label = `Reunión con ${str(c.client) || str(c.title)}: siguiente (${tipoNext}) el ${body.siguienteFecha}`;
    } else if (body.desenlace === "acepta_inmediato") {
      // El cliente dijo que sí: a etapa cierre. El contrato se activa recién
      // con la firma — eso sigue siendo el flujo de siempre. El seguimiento
      // apuntaba a esta reunión ya resuelta: se apaga para que no suene el
      // aviso de "seguimiento vencido" por una fecha que ya pasó bien.
      Object.assign(contrato, { pipelineStage: "cierre", probability: STAGE_DEFAULT_PROB.cierre, nextFollowUp: "", futuroMotivo: "", futuroFecha: "", futuroNota: "" });
      label = `Oportunidad ${str(c.title)}: el cliente acepta — pasa a cierre`;
    } else if (body.desenlace === "acepta_futuro") {
      // El seguimiento normal se apaga: de recordarlo se encarga el aviso de
      // casos a futuro, con la fecha que el cliente dio.
      Object.assign(contrato, { futuroMotivo: body.futuroMotivo, futuroFecha: body.futuroFecha, futuroNota: body.futuroNota?.trim() || "", nextFollowUp: "" });
      label = `Oportunidad ${str(c.title)}: a futuro (retomar ${body.futuroFecha})`;
    } else {
      Object.assign(contrato, { status: "perdido", motivoPerdida: motivo });
      label = `Oportunidad ${str(c.title)}: perdida (${motivo})`;
    }

    const nextContracts = [...contracts];
    nextContracts[cIdx] = contrato;
    const guardado = await saveBoardSiVersion(board.boardUserId, { ...board.data, meetings: nextMeetings, contracts: nextContracts }, board.version);
    if (!guardado) continue;

    recordActivity({
      actorId: me.id,
      entityType: "contract",
      entityId: 0,
      entityLabel: label,
      action: body.desenlace === "siguiente_reunion" ? "stage_change" : "status_change",
      detail: { desenlace: body.desenlace },
    });
    res.json({ ok: true, meeting: nextMeetings[mIdx], opportunity: toOpportunity(contrato, canSeeMoney(roleOf(me))), siguiente: creada });
    return;
  }
  res.status(503).json({ error: "El tablero está recibiendo otros cambios; intenta de nuevo en unos segundos" });
});

/**
 * POST /hub/ventas/contracts/:id/renew — "iniciar renovación": crea una
 * oportunidad nueva (contrato borrador) enlazada al contrato que vence.
 */
router.post("/hub/ventas/contracts/:id/renew", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Solo dirección y ventas inician renovaciones" }); return; }
  const board = await resolveBoard();
  if (!board) { res.status(409).json({ error: "Todavía no hay un tablero de dirección" }); return; }
  const contracts = Array.isArray(board.data.contracts) ? (board.data.contracts as Rec[]) : [];
  const orig = contracts.find((c) => str(c?.id) === req.params.id);
  if (!orig) { res.status(404).json({ error: "Contrato no encontrado" }); return; }
  if (contracts.some((c) => str(c.renewalOfId) === str(orig.id))) {
    res.status(409).json({ error: "Ese contrato ya tiene una renovación iniciada" });
    return;
  }
  const now = Date.now();
  const renewal: Rec = {
    id: "id" + now.toString(36) + Math.random().toString(36).slice(2, 7),
    title: `${str(orig.title)} (renovación)`.slice(0, 160),
    client: str(orig.client),
    value: str(orig.value),
    status: "borrador",
    signedAt: "",
    expiresAt: "",
    notes: `Renovación del contrato "${str(orig.title)}" que vence el ${str(orig.expiresAt) || "—"}.`,
    doc: orig.doc,
    // El brief técnico se hereda.
    //
    // No se copiaba, así que la renovación nacía sin versión técnica y, al
    // pasar a "activo", el handoff caía al arranque genérico: el equipo de
    // desarrollo recibía "Kickoff interno / Levantamiento / Planificar hitos"
    // como si ESE fuera el alcance de un proyecto que ya conocen entero.
    // Una renovación es el mismo alcance: lo lógico es partir de él y editarlo.
    brief: orig.brief,
    briefUrl: orig.briefUrl,
    briefTitle: orig.briefTitle,
    briefUploadedAt: orig.briefUploadedAt,
    createdAt: now,
    updatedAt: now,
    pipelineStage: "contactado",
    probability: STAGE_DEFAULT_PROB.contactado,
    renewalOfId: str(orig.id),
    salesOwnerId: Number(orig.salesOwnerId) > 0 ? Number(orig.salesOwnerId) : me.id,
  };
  await saveBoard(board.boardUserId, { ...board.data, contracts: [...contracts, renewal] });
  recordActivity({
    actorId: me.id,
    entityType: "contract",
    entityId: 0,
    entityLabel: `Renovación iniciada: ${str(orig.title)}`,
    action: "created",
  });
  res.status(201).json({ ok: true, opportunity: toOpportunity(renewal, canSeeMoney(roleOf(me))) });
});

/** GET/PUT /hub/ventas/settings — antelación de la alerta de renovación. */
router.get("/hub/ventas/settings", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Sin acceso" }); return; }
  res.json({ renewalAlertDays: await getRenewalAlertDays() });
});

router.put("/hub/ventas/settings", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (!canManageVentas(me)) { res.status(403).json({ error: "Sin acceso" }); return; }
  const parsed = z.object({ renewalAlertDays: z.number().int().min(1).max(365) }).safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Antelación inválida (1–365 días)" }); return; }
  res.json({ renewalAlertDays: await setRenewalAlertDays(parsed.data.renewalAlertDays) });
});

/**
 * GET /hub/ventas/comisiones?month=YYYY-MM
 * Comisiones sobre lo efectivamente cobrado (cobro.estado = "pagado").
 * Ventas ve SOLO las suyas; CEO ve todas.
 */
router.get("/hub/ventas/comisiones", async (req: Request, res: Response) => {
  const me = await loadMe(req, res);
  if (!me) return;
  const role = roleOf(me);
  if (role !== "ceo" && role !== "ventas") { res.status(403).json({ error: "Sin acceso a comisiones" }); return; }
  if (!canSeeMoney(role)) { res.status(403).json({ error: "Tu rol no puede ver montos" }); return; }
  const month = typeof req.query.month === "string" && MONTH_RE.test(req.query.month) ? req.query.month : currentMonth();

  let rows = await computeCommissions(month);
  if (role !== "ceo") rows = rows.filter((r) => r.salesOwnerId === me.id);

  const ownerIds = [...new Set(rows.map((r) => r.salesOwnerId).filter((n): n is number => n !== null))];
  const names = new Map<number, string>();
  for (const id of ownerIds) {
    const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    if (u) names.set(id, u.name || u.email);
  }
  res.json({
    month,
    rows: rows.map((r) => ({ ...r, ownerName: r.salesOwnerId ? (names.get(r.salesOwnerId) ?? null) : null })),
    totals: {
      collectedNet: rows.reduce((a, r) => a + r.amountNet, 0),
      commission: rows.reduce((a, r) => a + r.commission, 0),
    },
  });
});

export default router;
