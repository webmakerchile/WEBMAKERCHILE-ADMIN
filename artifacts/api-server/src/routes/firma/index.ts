// Página pública de aceptación y FIRMA de una cotización o contrato.
//
// La abre el CLIENTE, que no tiene cuenta en el panel, así que va montada
// FUERA del `requireAuth` — igual que el enlace temporal de video de Instagram.
// Todo lo que se muestra aquí sale del token: no hay forma de listar, buscar ni
// enumerar documentos desde esta ruta.
//
// Se sirve HTML desde el servidor a propósito: quien la abre no debería cargar
// la aplicación entera para leer un contrato, y el enlace sigue funcionando
// aunque el panel se esté desplegando.
//
// Al firmar se guarda la firma (dibujo, imagen o texto), la constancia (IP,
// fecha, navegador) y se mandan los correos de confirmación. El resultado de
// los correos se guarda en la misma fila: si el envío falla, el panel lo dice
// — nunca en silencio.

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { contractSignatures } from "@workspace/db/schema";
import { activarContratoFirmado } from "../../lib/activar-contrato";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import {
  motivoNoFirmable,
  TEXTO_RECHAZO,
  tokenValido,
  ipDeLaPeticion,
  limpiarNombreFirmante,
  nombreFirmanteValido,
  validarFirma,
  type FirmaCapturada,
  type MotivoFirma,
} from "../../lib/firma-contrato";
import { enviarCorreo, CORREO_EQUIPO, type ResultadoCorreo } from "../../lib/correo";
import { correoParaCliente, correoParaEquipo, type DatosCorreoFirma } from "../../lib/correo-firma";
import { paginaMensaje, paginaContrato, paginaProyecto, CLP, type DocumentoFirma, type DocumentoProyecto } from "./plantilla";
import { logoDataUri } from "../cotizaciones/template";

const router: IRouter = Router();

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function responder(res: Response, p: { html: string; estado: number }): void {
  res.status(p.estado).type("html").send(p.html);
}

async function buscarEnlace(token: string) {
  const [fila] = await db.select().from(contractSignatures)
    .where(eq(contractSignatures.token, token)).limit(1);
  return fila ?? null;
}

const fechaLargaCL = (iso: string): string => {
  const d = new Date(iso + "T12:00:00");
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "long", year: "numeric" });
};

/** GET /api/firma/:token — el cliente lee el contrato completo y firma. */
router.get("/firma/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "");
  if (!tokenValido(token)) {
    responder(res, paginaMensaje("Enlace no válido", `<h1>Enlace no válido</h1><p class="sub">${esc(TEXTO_RECHAZO.no_existe)}</p>`, 404));
    return;
  }
  try {
    const enlace = await buscarEnlace(token);
    const motivo = motivoNoFirmable(
      enlace && {
        token: enlace.token,
        estado: enlace.estado as "pendiente" | "firmado" | "anulado",
        expiresAt: enlace.expiresAt ? enlace.expiresAt.toISOString() : null,
        signedAt: enlace.signedAt ? enlace.signedAt.toISOString() : null,
      },
    );

    const motivoFirma = (enlace?.motivo || "contrato") as MotivoFirma;

    if (motivo === "ya_firmado" && enlace?.signedAt) {
      // Ya aceptado NO es un error: se le confirma, con la fecha, para que no
      // se quede con la duda de si su "sí" llegó.
      const fechaTxt = esc(enlace.signedAt.toLocaleDateString("es-CL", { timeZone: "America/Santiago" }));
      const quien = esc(enlace.signerName || "el cliente");
      const cuerpo = motivoFirma === "cierre_proyecto"
        ? `<p class="sub">${quien} confirmó la conformidad de este proyecto el ${fechaTxt}. No hace falta que hagas nada más.</p>`
        : motivoFirma === "aprobacion_proyecto"
        ? `<p class="sub">${quien} aprobó el inicio de este proyecto el ${fechaTxt}. No hace falta que hagas nada más.</p>`
        : `<p class="sub">Lo aceptó ${quien} el ${fechaTxt}. No hace falta que hagas nada más.</p>`;
      responder(res, paginaMensaje("Documento aceptado", `<h1 class="ok">Ya está aceptado</h1>${cuerpo}`));
      return;
    }
    if (motivo) {
      responder(res, paginaMensaje("Enlace no disponible", `<h1>No se puede continuar</h1><p class="sub">${esc(TEXTO_RECHAZO[motivo])}</p>`, motivo === "no_existe" ? 404 : 410));
      return;
    }

    if (motivoFirma === "contrato") {
      const doc = await documentoDe(enlace!.contractId!, enlace!.expiresAt);
      res.status(200).type("html").send(paginaContrato({
        token,
        logo: logoDataUri(),
        doc,
        anio: String(new Date().getFullYear()),
      }));
      return;
    }
    const docProyecto = await documentoProyectoDe(enlace!.projectId!, motivoFirma);
    res.status(200).type("html").send(paginaProyecto({
      token,
      logo: logoDataUri(),
      doc: docProyecto,
      anio: String(new Date().getFullYear()),
    }));
  } catch (err) {
    console.error("[firma GET]", err);
    responder(res, paginaMensaje("Error", `<h1 class="err">Algo falló</h1><p class="sub">Vuelve a intentarlo en unos minutos o escríbele al equipo de WebMaker Latam.</p>`, 500));
  }
});

/** POST /api/firma/:token/aceptar — registra aceptación + firma y manda los correos. */
router.post("/firma/:token/aceptar", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "");
  const esJson = Boolean(req.is("application/json"));
  const rechazo = (estado: number, error: string): void => {
    if (esJson) { res.status(estado).json({ error }); return; }
    responder(res, paginaMensaje("No se pudo firmar", `<h1>No se pudo firmar</h1><p class="sub">${esc(error)}</p>`, estado));
  };

  if (!tokenValido(token)) { rechazo(404, TEXTO_RECHAZO.no_existe); return; }

  const cuerpo = (req.body ?? {}) as Record<string, unknown>;
  const nombre = limpiarNombreFirmante(cuerpo.nombre);
  if (!nombreFirmanteValido(nombre)) {
    rechazo(400, "Necesitamos tu nombre y apellido: son parte de la constancia de aceptación.");
    return;
  }

  // La firma: dibujo/imagen/texto. Un POST sin firma (el formulario viejo que
  // alguien dejó abierto) cuenta como firma escrita con el nombre — que es
  // exactamente lo que ese formulario significaba.
  const firmaCruda = (cuerpo.firma ?? {}) as Record<string, unknown>;
  const validada = validarFirma(firmaCruda.kind ?? "texto", firmaCruda.data ?? nombre);
  if (!validada.ok) { rechazo(400, validada.error); return; }
  const firma: FirmaCapturada = validada.firma;

  try {
    const enlace = await buscarEnlace(token);
    const motivo = motivoNoFirmable(
      enlace && {
        token: enlace.token,
        estado: enlace.estado as "pendiente" | "firmado" | "anulado",
        expiresAt: enlace.expiresAt ? enlace.expiresAt.toISOString() : null,
        signedAt: enlace.signedAt ? enlace.signedAt.toISOString() : null,
      },
    );
    if (motivo) {
      rechazo(motivo === "no_existe" ? 404 : 410, TEXTO_RECHAZO[motivo]);
      return;
    }

    const email = String(cuerpo.email ?? "").trim().slice(0, 160) || null;
    const ahora = new Date();

    // TODAS las condiciones de elegibilidad van en el UPDATE, no solo en la
    // comprobación de arriba: entre la lectura y la escritura otra pestaña
    // puede firmar, alguien puede anular el enlace o puede caducar. Si el
    // UPDATE no encuentra fila que cumpla, aquí no se firma nada.
    const actualizadas = await db.update(contractSignatures)
      .set({
        estado: "firmado",
        signedAt: ahora,
        signerName: nombre,
        signerEmail: email,
        signerIp: ipDeLaPeticion(req.headers as Record<string, unknown>, req.ip) || null,
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 400) || null,
        signatureKind: firma.kind,
        signatureData: firma.data,
      })
      .where(and(
        eq(contractSignatures.token, token),
        eq(contractSignatures.estado, "pendiente"),
        isNull(contractSignatures.signedAt),
        or(isNull(contractSignatures.expiresAt), gt(contractSignatures.expiresAt, ahora)),
      ))
      .returning({ id: contractSignatures.id });

    if (actualizadas.length === 0) {
      // El enlace cambió entre la lectura y la escritura. La fila manda:
      // se vuelve a mirar para contestar la verdad (firmado, anulado o caducado).
      const despues = await buscarEnlace(token);
      const porQue = motivoNoFirmable(
        despues && {
          token: despues.token,
          estado: despues.estado as "pendiente" | "firmado" | "anulado",
          expiresAt: despues.expiresAt ? despues.expiresAt.toISOString() : null,
          signedAt: despues.signedAt ? despues.signedAt.toISOString() : null,
        },
      );
      if (porQue && porQue !== "ya_firmado") {
        rechazo(porQue === "no_existe" ? 404 : 410, TEXTO_RECHAZO[porQue]);
        return;
      }
      if (esJson) { res.status(200).json({ ok: true, yaFirmado: true, correoCliente: "sin_correo" }); return; }
      responder(res, paginaMensaje("Ya aceptado", `<h1 class="ok">Ya está aceptado</h1><p class="sub">${esc(TEXTO_RECHAZO.ya_firmado)}</p>`));
      return;
    }

    const motivoFirma = (enlace!.motivo || "contrato") as MotivoFirma;
    console.log(`[firma] ${motivoFirma} ${enlace!.contractId ?? enlace!.projectId} firmado por "${nombre}" (${firma.kind})`);

    if (motivoFirma === "contrato") {
      // La venta se concreta AQUÍ: el contrato del tablero pasa de borrador a
      // activo. Es una transición acotada (ver activar-contrato.ts) y ningún
      // dato del firmante entra al tablero. Si no se puede guardar, la firma
      // vale igual: se activa a mano en la ficha, y el fallo queda en el log.
      try {
        const activacion = await activarContratoFirmado({
          contractId: enlace!.contractId!,
          fechaFirma: ahora,
          actorId: enlace!.createdById ?? null,
        });
        if (activacion === "fallo") {
          console.error(`[firma] contrato ${enlace!.contractId}: firmado OK pero NO se pudo activar en el tablero — activar a mano en la ficha`);
        }
      } catch (e) {
        console.error(`[firma] contrato ${enlace!.contractId}: firmado OK pero la activación reventó`, e);
      }
    }
    // Aprobar el inicio o cerrar un proyecto NO cambia su estado en el
    // tablero: a diferencia del contrato, aquí la firma es solo una
    // constancia (ver la tarea de origen). Queda guardada en esta misma fila
    // y se ve en la ficha del proyecto, igual que ya se ve la del contrato.

    // ---- Correos de confirmación (el resultado SIEMPRE queda en la fila) ----
    const correos = await mandarCorreos({
      motivo: motivoFirma,
      contractId: enlace!.contractId,
      projectId: enlace!.projectId,
      expiresAt: enlace!.expiresAt,
      nombre, email, firma, ahora,
      ip: ipDeLaPeticion(req.headers as Record<string, unknown>, req.ip) || null,
      userAgent: String(req.headers["user-agent"] ?? "").slice(0, 200) || null,
      base: basePanelConfiable(),
    });
    // La firma ya está guardada; anotar el resultado de los correos no puede
    // deshacerla — pero tampoco puede perderse en silencio: es lo que el panel
    // enseña. Se reintenta una vez y, si aun así falla, queda a gritos en el log.
    const estadoCorreos = {
      emailClienteEstado: correos.cliente,
      emailEquipoEstado: correos.equipo,
      emailDetalle: correos.detalle,
    };
    for (let intento = 1; intento <= 2; intento++) {
      try {
        await db.update(contractSignatures).set(estadoCorreos).where(eq(contractSignatures.token, token));
        break;
      } catch (err) {
        if (intento === 2) {
          console.error(`[firma] IMPOSIBLE anotar el estado de los correos del contrato ${enlace!.contractId} (la firma sí quedó). Estados: ${JSON.stringify(estadoCorreos)}`, err);
        } else {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }

    if (esJson) {
      res.status(200).json({ ok: true, correoCliente: correos.cliente });
      return;
    }
    const tituloExito = motivoFirma === "cierre_proyecto" ? "Cierre confirmado"
      : motivoFirma === "aprobacion_proyecto" ? "Proyecto aprobado" : "Propuesta aceptada";
    const cuerpoExito = motivoFirma === "cierre_proyecto" ? "Tu confirmación y tu firma quedaron registradas."
      : motivoFirma === "aprobacion_proyecto" ? "Tu aprobación y tu firma quedaron registradas."
      : "Tu aceptación y tu firma quedaron registradas.";
    responder(res, paginaMensaje(tituloExito, `
      <h1 class="ok">¡Listo, ${esc(nombre.split(" ")[0])}!</h1>
      <p class="sub">${cuerpoExito} El equipo de WebMaker Latam se pondrá en
      contacto contigo para los siguientes pasos.</p>`));
  } catch (err) {
    console.error("[firma POST]", err);
    rechazo(500, "No se pudo registrar. Vuelve a intentarlo en unos minutos o escríbele al equipo de WebMaker Latam.");
  }
});

/* ==================== Correos =========================================== */

interface ParaCorreos {
  motivo: MotivoFirma;
  contractId: string | null;
  projectId: string | null;
  expiresAt: Date | null;
  nombre: string;
  email: string | null;
  firma: FirmaCapturada;
  ahora: Date;
  ip: string | null;
  userAgent: string | null;
  base: string;
}

type EstadoCorreo = "enviado" | "fallido" | "sin_correo" | "sin_configurar";

const estadoDe = (r: ResultadoCorreo): EstadoCorreo => (r.ok ? "enviado" : r.motivo);

/**
 * Manda la confirmación al cliente (si dejó correo) y el aviso al buzón del
 * equipo. Nunca lanza: devuelve los estados para guardarlos en la fila.
 */
async function mandarCorreos(p: ParaCorreos): Promise<{ cliente: EstadoCorreo; equipo: EstadoCorreo; detalle: string | null }> {
  let titulo = "";
  let clienteNombre = "";
  let totalTexto: string | null = null;
  if (p.motivo === "contrato" && p.contractId) {
    const doc = await documentoDe(p.contractId, p.expiresAt).catch(() => null);
    titulo = doc?.titulo || "Propuesta de trabajo";
    clienteNombre = doc?.cliente || "";
    totalTexto = doc?.totalConIva ? `${CLP(doc.totalConIva)} · IVA incluido`
      : doc?.valorFicha ? `${doc.valorFicha} · IVA incluido` : null;
  } else if (p.projectId) {
    const doc = await documentoProyectoDe(p.projectId, p.motivo === "cierre_proyecto" ? "cierre_proyecto" : "aprobacion_proyecto").catch(() => null);
    titulo = doc?.titulo || "Proyecto";
    clienteNombre = doc?.cliente || "";
    // Sin monto: aprobar o cerrar un proyecto no lleva cobro asociado.
  }

  const esImagen = p.firma.kind !== "texto";
  const datos: DatosCorreoFirma = {
    motivo: p.motivo,
    titulo,
    cliente: clienteNombre,
    firmante: p.nombre,
    correoFirmante: p.email,
    fechaFirma: p.ahora,
    metodo: p.firma.kind,
    ip: p.ip,
    userAgent: p.userAgent,
    totalTexto,
    urlPanel: p.base ? `${p.base}/ejecutivo` : null,
    firmaAdjunta: esImagen,
  };
  // La firma viaja adjunta (no incrustada): Gmail descarta las imágenes en
  // data URI y el correo llegaría "firmado" pero sin firma visible.
  const adjuntos = esImagen
    ? [{
        filename: `firma-${p.nombre.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase() || "cliente"}.${p.firma.data.startsWith("data:image/jpeg") ? "jpg" : "png"}`,
        content: p.firma.data.split(",")[1] ?? "",
      }]
    : undefined;

  const detalles: string[] = [];
  let cliente: EstadoCorreo = "sin_correo";
  if (p.email) {
    const c = correoParaCliente(datos);
    const r = await enviarCorreo({ to: p.email, subject: c.subject, html: c.html, text: c.text, attachments: adjuntos });
    cliente = estadoDe(r);
    if (!r.ok) detalles.push(`cliente: ${r.detalle}`);
  }
  const e = correoParaEquipo(datos);
  const re = await enviarCorreo({ to: CORREO_EQUIPO, subject: e.subject, html: e.html, text: e.text, attachments: adjuntos });
  const equipo = estadoDe(re);
  if (!re.ok) detalles.push(`equipo: ${re.detalle}`);

  return { cliente, equipo, detalle: detalles.length ? detalles.join(" · ").slice(0, 500) : null };
}

/**
 * Base del panel para el botón "Ver en el panel" del correo al equipo.
 *
 * SOLO de configuración (PUBLIC_BASE_URL) o de la plataforma (REPLIT_DOMAINS),
 * nunca de cabeceras de la petición: esta ruta es pública, quien firma
 * controla esas cabeceras, y el enlace del correo acabaría apuntando adonde
 * un desconocido quisiera.
 */
function basePanelConfiable(): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const dominio = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
  return dominio ? `https://${dominio}` : "";
}

/* ==================== Datos del documento =============================== */

/**
 * Lo que se le enseña al cliente del contrato que va a firmar.
 *
 * El `doc` del contrato es el estado del wizard (client/project/modules con
 * price = NETO), pero contratos viejos guardaron otras claves (modulos/neto) y
 * los subidos a mano no tienen doc: cada campo cae en cascada hasta algo que
 * exista. Deliberadamente NO se vuelca el blob entero: notas internas del
 * contrato viven fuera de `doc` y no son para la página pública.
 */
async function documentoDe(contractId: string, vence: Date | null): Promise<DocumentoFirma> {
  const { resolveBoard } = await import("../../lib/hub-board");
  const board = await resolveBoard();
  const contratos = board && Array.isArray(board.data.contracts) ? (board.data.contracts as Array<Record<string, unknown>>) : [];
  const c = contratos.find((x) => String(x.id ?? "") === contractId) ?? {};

  const doc = (c.doc ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

  const crudos = Array.isArray(doc.modules) ? doc.modules : Array.isArray(doc.modulos) ? doc.modulos : [];
  const modulos = (crudos as Array<Record<string, unknown>>).slice(0, 12)
    .map((m) => ({
      nombre: str(m.name ?? m.nombre),
      desc: str(m.desc ?? m.descripcion),
      neto: num(m.price ?? m.neto ?? m.precio),
    }))
    .filter((m) => m.nombre);

  const totalNeto = modulos.reduce((a, m) => a + (m.neto ?? 0), 0) || null;
  const iva = totalNeto ? Math.round(totalNeto * 0.19) : null;

  // "$1.234.567" guardado en la ficha → total con IVA para contratos sin
  // precios por módulo. Si no parsea, se muestra tal cual venía.
  const valorFicha = str(c.value);

  const fechaDoc = str(doc.date) || str(c.signedAt);
  const validezDias = num(doc.validityDays);
  let validaHasta = "";
  if (vence) validaHasta = vence.toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "long", year: "numeric" });
  else if (str(c.expiresAt)) validaHasta = fechaLargaCL(str(c.expiresAt));
  else if (fechaDoc && validezDias) {
    const d = new Date(fechaDoc + "T12:00:00");
    if (!Number.isNaN(d.getTime())) { d.setDate(d.getDate() + validezDias); validaHasta = d.toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "long", year: "numeric" }); }
  }

  return {
    titulo: str(c.title) || str(doc.project) || "Propuesta de trabajo",
    cliente: str(c.client) || str(doc.client),
    fecha: fechaDoc ? fechaLargaCL(fechaDoc) : "",
    asesor: str(doc.advisor),
    alcance: str(doc.scope),
    notas: str(doc.notes),
    modulos,
    totalNeto,
    iva,
    totalConIva: totalNeto && iva ? totalNeto + iva : null,
    downPct: typeof doc.downPct === "number" && Number.isFinite(doc.downPct) ? doc.downPct : null,
    monthly: str(doc.monthly),
    monthlyPrice: num(doc.monthlyPrice),
    valorFicha,
    validaHasta,
  };
}

/**
 * Lo que se le enseña al cliente que va a aprobar el inicio de un proyecto o
 * confirmar su cierre. Deliberadamente mínimo: a diferencia del contrato, un
 * proyecto no separa un campo "público" de sus notas internas, así que esas
 * notas NUNCA salen en esta página. Si hay un contrato vinculado, se reusa SU
 * alcance — ya es público porque el mismo cliente lo vio y lo aceptó ahí.
 */
async function documentoProyectoDe(
  projectId: string,
  motivo: "aprobacion_proyecto" | "cierre_proyecto",
): Promise<DocumentoProyecto> {
  const { resolveBoard } = await import("../../lib/hub-board");
  const board = await resolveBoard();
  const proyectos = board && Array.isArray(board.data.projects) ? (board.data.projects as Array<Record<string, unknown>>) : [];
  const p = proyectos.find((x) => String(x.id ?? "") === projectId) ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  let alcance = "";
  const contractId = str(p.contractId);
  if (contractId) {
    const contratos = board && Array.isArray(board.data.contracts) ? (board.data.contracts as Array<Record<string, unknown>>) : [];
    const c = contratos.find((x) => String(x.id ?? "") === contractId);
    const doc = (c?.doc ?? {}) as Record<string, unknown>;
    alcance = str(doc.scope);
  }

  return {
    titulo: str(p.name) || "Proyecto",
    cliente: str(p.client),
    tipo: str(p.type),
    alcance,
    motivo,
  };
}

export default router;
