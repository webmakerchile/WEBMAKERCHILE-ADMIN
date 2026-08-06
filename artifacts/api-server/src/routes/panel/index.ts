import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { normalizeRole } from "@workspace/roles";
import { PanelError, panelConfigurado, panelGet, panelPatch, panelPost } from "../../lib/panel/cliente";
import {
  conteoPorRecurso,
  esRecursoPanel,
  estadoSyncFila,
  guardarRegistros,
  leerEspejo,
  leerRegistro,
} from "../../lib/panel/espejo";
import {
  RECURSOS_EQUIPO,
  compartidosProyectos,
  depurarProfundo,
  esRecursoEquipo,
  esVisibleParaEquipo,
  fijarCompartidoProyecto,
  mantenimientoParaEquipo,
  plantillasParaEquipo,
  resumenParaEquipo,
  sanearListadoEquipo,
  sanearRegistroEquipo,
  type RecursoEquipo,
} from "../../lib/panel/equipo";
import { sincronizarPanel } from "../../lib/panel/sync";
import { guardarVista, limpiarCacheVistas, vistaEnCache } from "../../lib/panel/cache-vistas";

/**
 * Sección Agencia: espejo del panel autoadministrable de webmakerlatam.com.
 * Es SOLO de dirección: ningún otro rol del equipo entra, ni con vista reducida.
 *
 * Modos, resueltos acá y NUNCA en el cliente:
 *  - "completo": dirección (CEO / superadmin). Ve todo tal cual llega del panel.
 *  - "equipo": EXCLUSIVO de "tester" (cuenta de revisión de TikTok review, no
 *    se toca). El servidor sanea cada respuesta (lista blanca + depuración
 *    profunda): sin plata, sin finanzas, sin documentos de dirección;
 *    proyectos terminados solo si se compartieron.
 *  - cualquier otro rol del equipo: bloqueado con 403 antes de tocar el panel.
 *
 * Lecturas: del espejo local (listados) o del panel en vivo con caché corta.
 * La caché guarda SIEMPRE el payload crudo y se sanea después por request,
 * así dirección y equipo comparten la misma entrada sin filtrarse nada.
 * Escrituras: SIEMPRE delegadas al panel, que es la única fuente de verdad.
 */

const router: IRouter = Router();

/* ------------------------------------------------------------------ */
/* Modo por usuario. El rol se lee SIEMPRE de la base, nunca de la      */
/* sesión (como el Hub): un cambio de rol pega al siguiente request.    */
/* ------------------------------------------------------------------ */

type ModoAgencia = "completo" | "equipo";

async function modoAgencia(req: Request): Promise<ModoAgencia | null> {
  const sessionUser = req.user as { id?: number } | undefined;
  if (!sessionUser?.id) return null;
  const [me] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
  if (!me) return null;
  const esSuper = me.role === "superadmin";
  if (esSuper) return "completo";
  const rol = normalizeRole(me.teamRole, esSuper);
  if (rol === "ceo") return "completo";
  // Cuenta de revisión de TikTok: no se toca, sigue en modo equipo como hoy.
  if (rol === "tester") return "equipo";
  // Agencia es solo de dirección: cualquier otro rol del equipo queda afuera.
  return null;
}

router.use("/panel", (req: Request, res: Response, next: NextFunction) => {
  modoAgencia(req)
    .then((modo) => {
      if (!modo) {
        res.status(403).json({ error: "Tu cuenta no tiene acceso a la sección Agencia" });
        return;
      }
      res.locals.modoPanel = modo;
      next();
    })
    .catch(next);
});

const esEquipo = (res: Response): boolean => res.locals.modoPanel === "equipo";

/** Corta con 403 lo que es solo de dirección (finanzas, contratos en vivo, compartir). */
function soloDireccion(res: Response): boolean {
  if (!esEquipo(res)) return false;
  res.status(403).json({ error: "solo_direccion", mensaje: "Esta parte es solo para dirección." });
  return true;
}

/** Envuelve una ruta: PanelError y Zod se traducen a respuestas honestas. */
const conPanel =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof PanelError) {
        res.status(e.status).json({ error: e.codigo, mensaje: e.message });
        return;
      }
      if (e instanceof z.ZodError) {
        res.status(400).json({ error: "datos_invalidos", mensaje: "Revisá los campos del formulario.", detalles: e.issues.slice(0, 5) });
        return;
      }
      next(e);
    }
  };

/* ------------------------------------------------------------------ */
/* Caché corta para vistas en vivo (el sync manual la limpia).          */
/* Devuelve el payload CRUDO: sanear siempre después, por request.      */
/* ------------------------------------------------------------------ */

async function cargarVista(clave: string, carga: () => Promise<unknown>): Promise<unknown> {
  const hit = vistaEnCache(clave);
  if (hit !== undefined) return hit;
  const datos = await carga();
  guardarVista(clave, datos);
  return datos;
}

/* ------------------------------------------------------------------ */
/* Estado del sync + sync manual (ambos modos: el botón es del equipo)  */
/* ------------------------------------------------------------------ */

router.get(
  "/panel/estado",
  conPanel(async (_req, res) => {
    const [fila, porRecurso] = await Promise.all([estadoSyncFila(), conteoPorRecurso()]);
    const equipo = esEquipo(res);
    const conteos = equipo
      ? Object.fromEntries(Object.entries(porRecurso).filter(([r]) => (RECURSOS_EQUIPO as readonly string[]).includes(r)))
      : porRecurso;
    // El cursor y el detalle son diagnóstico interno, y el texto crudo del
    // error puede traer pedazos de la respuesta del panel externo. Al equipo
    // solo le contamos QUE falló, con un texto apto para su banner.
    res.json({
      configurado: panelConfigurado(),
      cursor: equipo ? null : fila.cursor,
      ultimaCorrida: fila.ultimaCorrida,
      ultimoExito: fila.ultimoExito,
      ultimoError: equipo ? (fila.ultimoError ? "reintentá en unos minutos" : null) : fila.ultimoError,
      detalle: equipo ? null : fila.detalle,
      porRecurso: conteos,
    });
  })
);

router.post(
  "/panel/sync",
  conPanel(async (_req, res) => {
    const resultado = await sincronizarPanel("manual");
    limpiarCacheVistas();
    // Mismo criterio que /panel/estado: el equipo puede apretar el botón de
    // sync, pero el diagnóstico (motivo, cursor, conteos de recursos de
    // dirección) no le corresponde.
    if (esEquipo(res)) {
      res.json({ aplicado: resultado.aplicado === true });
      return;
    }
    res.json(resultado);
  })
);

/* ------------------------------------------------------------------ */
/* Espejo local: listados y registro puntual                            */
/* ------------------------------------------------------------------ */

router.get(
  "/panel/espejo/:recurso",
  conPanel(async (req, res) => {
    const recurso = String(req.params.recurso);
    if (!esRecursoPanel(recurso)) {
      res.status(404).json({ error: "recurso_desconocido", mensaje: `No existe el recurso "${recurso}".` });
      return;
    }
    if (esEquipo(res) && !esRecursoEquipo(recurso)) {
      soloDireccion(res);
      return;
    }
    const q = req.query as Record<string, string | undefined>;
    const num = (v: string | undefined) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
    const listado = await leerEspejo(
      recurso,
      {
        q: q.q,
        status: q.status,
        clientId: q.clientId,
        projectId: q.projectId,
        contractId: q.contractId,
        limite: num(q.limite),
        offset: num(q.offset),
      },
      { soloEquipo: esEquipo(res) }
    );
    res.json(esEquipo(res) ? sanearListadoEquipo(recurso as RecursoEquipo, listado) : listado);
  })
);

router.get(
  "/panel/espejo/:recurso/:id",
  conPanel(async (req, res) => {
    const recurso = String(req.params.recurso);
    if (!esRecursoPanel(recurso)) {
      res.status(404).json({ error: "recurso_desconocido", mensaje: `No existe el recurso "${recurso}".` });
      return;
    }
    if (esEquipo(res) && !esRecursoEquipo(recurso)) {
      soloDireccion(res);
      return;
    }
    const datos = await leerRegistro(recurso, String(req.params.id));
    if (!datos) {
      res.status(404).json({ error: "no_encontrado", mensaje: "Ese registro todavía no está en el espejo." });
      return;
    }
    if (esEquipo(res)) {
      // Mismo 404 que "no existe": no se confirma la existencia de lo no compartido.
      if (!(await esVisibleParaEquipo(recurso, datos))) {
        res.status(404).json({ error: "no_encontrado", mensaje: "Ese registro todavía no está en el espejo." });
        return;
      }
      res.json({ datos: sanearRegistroEquipo(recurso as RecursoEquipo, datos) });
      return;
    }
    res.json({ datos });
  })
);

/* ------------------------------------------------------------------ */
/* Vistas en vivo del panel (ya calculadas allá; acá solo se muestran)  */
/* ------------------------------------------------------------------ */

router.get(
  "/panel/resumen",
  conPanel(async (_req, res) => {
    const crudo = await cargarVista("resumen", () => panelGet("/resumen"));
    res.json(esEquipo(res) ? resumenParaEquipo(crudo) : crudo);
  })
);

router.get(
  "/panel/mantenimiento/resumen",
  conPanel(async (_req, res) => {
    const crudo = await cargarVista("mantenimiento", () => panelGet("/mantenimiento/resumen"));
    res.json(esEquipo(res) ? mantenimientoParaEquipo(crudo) : crudo);
  })
);

router.get(
  "/panel/finanzas/resumen",
  conPanel(async (req, res) => {
    if (soloDireccion(res)) return;
    const anio = String(req.query.anio ?? "");
    const crudo = await cargarVista(`finanzas:${anio}`, () => panelGet("/finanzas/resumen", { params: { anio: anio || undefined } }));
    res.json(crudo);
  })
);

router.get(
  "/panel/contratos",
  conPanel(async (req, res) => {
    if (soloDireccion(res)) return;
    const q = req.query as Record<string, string | undefined>;
    const params = { tipo: q.tipo, estado: q.estado, q: q.q, limite: q.limite, offset: q.offset };
    const crudo = await cargarVista(`contratos:${JSON.stringify(params)}`, () => panelGet("/contratos", { params }));
    res.json(crudo);
  })
);

router.get(
  "/panel/plantillas-contrato",
  conPanel(async (_req, res) => {
    const crudo = await cargarVista("plantillas", () => panelGet("/plantillas-contrato"));
    res.json(esEquipo(res) ? plantillasParaEquipo(crudo) : crudo);
  })
);

/** Detalle en vivo de un registro (el endpoint de detalle trae textos completos). */
router.get(
  "/panel/vistas/:recurso/:id",
  conPanel(async (req, res) => {
    const recurso = String(req.params.recurso);
    if (!esRecursoPanel(recurso)) {
      res.status(404).json({ error: "recurso_desconocido", mensaje: `No existe el recurso "${recurso}".` });
      return;
    }
    if (esEquipo(res)) {
      if (!esRecursoEquipo(recurso)) {
        soloDireccion(res);
        return;
      }
      // Visibilidad de proyectos terminados (y su cascada tareas/bitácora):
      // si el espejo no lo tiene o no está compartido, para el equipo no existe.
      if (recurso === "proyectos" || recurso === "tareas" || recurso === "bitacora") {
        const registro = await leerRegistro(recurso, String(req.params.id));
        if (!registro || !(await esVisibleParaEquipo(recurso, registro))) {
          res.status(404).json({ error: "no_encontrado", mensaje: "Ese registro todavía no está en el espejo." });
          return;
        }
      }
    }
    const id = encodeURIComponent(String(req.params.id));
    const crudo = await cargarVista(`vista:${recurso}:${id}`, () => panelGet(`/${recurso}/${id}`));
    if (esEquipo(res)) {
      const comp = await compartidosProyectos();
      res.json(depurarProfundo(crudo, comp));
      return;
    }
    res.json(crudo);
  })
);

/* ------------------------------------------------------------------ */
/* Compartir proyectos terminados con el equipo (solo dirección)        */
/* ------------------------------------------------------------------ */

const esqCompartir = z.object({ compartido: z.boolean() }).strip();

router.get(
  "/panel/compartidos/proyectos",
  conPanel(async (_req, res) => {
    if (soloDireccion(res)) return;
    const comp = await compartidosProyectos();
    res.json({ todos: comp.todos, ids: [...comp.ids] });
  })
);

/** Toggle global: compartir TODOS los proyectos terminados (fila '*'). */
router.put(
  "/panel/compartidos/proyectos",
  conPanel(async (req, res) => {
    if (soloDireccion(res)) return;
    const { compartido } = esqCompartir.parse(req.body ?? {});
    await fijarCompartidoProyecto("*", compartido);
    res.json({ ok: true, todos: compartido });
  })
);

router.put(
  "/panel/compartidos/proyectos/:id",
  conPanel(async (req, res) => {
    if (soloDireccion(res)) return;
    const { compartido } = esqCompartir.parse(req.body ?? {});
    const id = String(req.params.id ?? "").trim();
    if (!id || id === "*") {
      res.status(400).json({ error: "datos_invalidos", mensaje: "Falta el proyecto." });
      return;
    }
    // Solo proyectos que existen en el espejo: evita filas basura o forjadas
    // en panel_visibilidad (defensa extra además del gate de dirección).
    if (!(await leerRegistro("proyectos", id))) {
      res.status(404).json({ error: "no_encontrado", mensaje: "Ese proyecto no está en el espejo." });
      return;
    }
    await fijarCompartidoProyecto(id, compartido);
    res.json({ ok: true, id, compartido });
  })
);

/* ------------------------------------------------------------------ */
/* Escritura delegada: el panel genera todo (ids, links, PDFs, cascada) */
/* Para el equipo, la RESPUESTA también sale saneada: pueden tipear     */
/* precios al crear, pero nunca los vuelven a ver.                      */
/* ------------------------------------------------------------------ */

const esqCliente = z
  .object({
    companyName: z.string().trim().min(1, "Falta el nombre de la empresa"),
    rut: z.string().trim().optional(),
    billingRut: z.string().trim().optional(),
    contactName: z.string().trim().optional(),
    contactEmail: z.string().trim().optional(),
    contactPhone: z.string().trim().optional(),
    address: z.string().trim().optional(),
  })
  .strip();

router.post(
  "/panel/clientes",
  conPanel(async (req, res) => {
    const cuerpo = esqCliente.parse(req.body ?? {});
    const resp = await panelPost<{ ok: boolean; creado?: boolean; datos: Record<string, unknown> }>("/clientes", cuerpo);
    if (resp?.datos?.id) await guardarRegistros("clientes", [resp.datos]);
    limpiarCacheVistas();
    if (esEquipo(res)) {
      res.json({ ok: resp?.ok === true, creado: resp?.creado, datos: sanearRegistroEquipo("clientes", resp?.datos ?? {}) });
      return;
    }
    res.json(resp);
  })
);

const esqItem = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

/** El panel calcula subtotal/IVA/total — acá jamás se manda plata calculada. */
const esqPresupuesto = z
  .object({
    clienteId: z.string().trim().optional(),
    cliente: esqCliente.optional(),
    items: z.array(esqItem).min(1, "Agregá al menos un ítem"),
    hasIVA: z.boolean().optional(),
    discount: z.number().min(0).optional(),
    paymentModality: z.string().trim().optional(),
    installmentCount: z.number().int().positive().optional(),
    customPaymentTerms: z.string().trim().optional(),
    maintenanceType: z.string().trim().optional(),
    monthlyMaintenance: z.number().min(0).optional(),
    notes: z.string().trim().optional(),
    validUntil: z.string().trim().optional(),
    includeContract: z.boolean().optional(),
    estado: z.enum(["DRAFT", "SENT"]).optional(),
  })
  .strip()
  .refine((v) => v.clienteId || v.cliente, { message: "Elegí un cliente o creá uno nuevo" });

router.post(
  "/panel/presupuestos",
  conPanel(async (req, res) => {
    const cuerpo = esqPresupuesto.parse(req.body ?? {});
    const resp = await panelPost<{ ok: boolean; datos: Record<string, unknown>; calculo?: unknown; items?: unknown }>(
      "/presupuestos",
      cuerpo
    );
    if (resp?.datos?.id) await guardarRegistros("presupuestos", [resp.datos]);
    limpiarCacheVistas();
    if (esEquipo(res)) {
      // Sin calculo/items: el equipo tipea precios al crear, pero no los re-ve.
      res.json({ ok: resp?.ok === true, datos: sanearRegistroEquipo("presupuestos", resp?.datos ?? {}) });
      return;
    }
    res.json(resp);
  })
);

/**
 * El contenido de un contrato NO es texto plano: la página pública de firma
 * parsea un JSON con secciones (título + cuerpo con **negritas** y - viñetas).
 * Acá se manda `secciones` y el panel serializa al formato exacto que la
 * firma sabe renderizar; su respuesta confirma con formatoContenido:
 * "secciones". Mandar texto suelto en `contenido` rompe la presentación.
 */
const esqSeccion = z.object({
  titulo: z.string().trim().min(1, "Cada sección lleva título"),
  contenido: z.string(),
});

const esqContrato = z
  .object({
    presupuestoId: z.string().trim().min(1, "Falta el presupuesto"),
    clientRepresentativeName: z.string().trim().optional(),
    clientRepresentativeRut: z.string().trim().optional(),
    plantillaId: z.string().trim().optional(),
    contenido: z.string().optional(),
    secciones: z.array(esqSeccion).min(1).max(20).optional(),
    estado: z.enum(["DRAFT", "PENDING_SIGNATURE"]).optional(),
    forzarNuevo: z.boolean().optional(),
  })
  .strip();

router.post(
  "/panel/contratos-servicio",
  conPanel(async (req, res) => {
    const cuerpo = esqContrato.parse(req.body ?? {});
    // El equipo arma contratos desde plantilla; el texto libre (contenido o
    // secciones redactadas) es de dirección.
    const enviado = esEquipo(res) ? { ...cuerpo, contenido: undefined, secciones: undefined } : cuerpo;
    const resp = await panelPost<{ ok: boolean; creado?: boolean; datos: Record<string, unknown> }>(
      "/contratos-servicio",
      enviado
    );
    if (resp?.datos?.id) await guardarRegistros("contratos-servicio", [resp.datos]);
    limpiarCacheVistas();
    if (esEquipo(res)) {
      // sanearRegistroEquipo conserva _enlaces.contrato: el link de firma es su herramienta.
      res.json({ ok: resp?.ok === true, creado: resp?.creado, datos: sanearRegistroEquipo("contratos-servicio", resp?.datos ?? {}) });
      return;
    }
    res.json(resp);
  })
);

/* ------------------------------------------------------------------ */
/* Redacción de contratos con la IA del panel (solo dirección)          */
/* ------------------------------------------------------------------ */

/**
 * La redacción vive en el panel (mismo prompt y modelo que su proposal
 * builder): acá NO se reimplementa ni se llama a un LLM propio. Estos proxys
 * son de dirección porque la redacción trae plata (total, forma de pago).
 *
 * Si la versión publicada del panel todavía no trae estos endpoints, la
 * request cae a su frontend SPA (HTML con 200 → respuesta_invalida): se
 * traduce a un 503 honesto para que la UI ofrezca el editor manual sin
 * romperse. SOLO ese síntoma: un 404 JSON legítimo (p. ej. presupuesto
 * inexistente cuando el endpoint ya exista) pasa tal cual, y el 503
 * ia_no_configurada del propio panel también.
 */
async function iaDelPanel<T>(llamada: () => Promise<T>): Promise<T> {
  try {
    return await llamada();
  } catch (e) {
    if (e instanceof PanelError && e.codigo === "respuesta_invalida") {
      throw new PanelError(
        503,
        "ia_no_disponible",
        "El panel de la agencia todavía no publica la redacción con IA — usá el editor manual o la plantilla mientras tanto."
      );
    }
    throw e;
  }
}

/** La IA tarda varios segundos (Gemini): timeout propio, generoso. */
const TIMEOUT_IA_MS = 120_000;

const esqRedactar = z
  .object({
    presupuestoId: z.string().trim().min(1).optional(),
    clienteId: z.string().trim().min(1).optional(),
    items: z.array(esqItem).min(1).optional(),
    paymentModality: z.string().trim().optional(),
  })
  .strip()
  .refine((v) => v.presupuestoId || (v.clienteId && (v.items?.length ?? 0) > 0), {
    message: "Mandá el presupuesto, o un cliente con ítems",
  });

router.post(
  "/panel/contratos-servicio/redactar-ia",
  conPanel(async (req, res) => {
    if (soloDireccion(res)) return;
    const cuerpo = esqRedactar.parse(req.body ?? {});
    // No guarda nada: las secciones vuelven a la UI para revisarse y editarse.
    const resp = await iaDelPanel(() =>
      panelPost<Record<string, unknown>>("/contratos-servicio/redactar-ia", cuerpo, { timeoutMs: TIMEOUT_IA_MS })
    );
    res.json(resp);
  })
);

const esqCorregir = z
  .object({
    correccion: z.string().trim().min(3, "Contá qué querés ajustar"),
    secciones: z.array(esqSeccion).min(1, "Faltan las secciones actuales"),
  })
  .strip();

router.post(
  "/panel/contratos-servicio/corregir-ia",
  conPanel(async (req, res) => {
    if (soloDireccion(res)) return;
    const cuerpo = esqCorregir.parse(req.body ?? {});
    const resp = await iaDelPanel(() =>
      panelPost<Record<string, unknown>>("/contratos-servicio/corregir-ia", cuerpo, { timeoutMs: TIMEOUT_IA_MS })
    );
    res.json(resp);
  })
);

/** SIGNED y APPROVED no existen acá a propósito: esos pasos son del cliente. */
const esqPatchPresupuesto = z
  .object({
    estado: z.enum(["DRAFT", "SENT", "REJECTED", "EXPIRED"]).optional(),
    notes: z.string().optional(),
    validUntil: z.string().nullable().optional(),
  })
  .strip();

router.patch(
  "/panel/presupuestos/:id",
  conPanel(async (req, res) => {
    const cuerpo = esqPatchPresupuesto.parse(req.body ?? {});
    // El equipo solo mueve estados; notas y vigencia son de dirección.
    const enviado = esEquipo(res) ? { estado: cuerpo.estado } : cuerpo;
    const id = encodeURIComponent(String(req.params.id));
    const resp = await panelPatch<{ ok: boolean; datos: Record<string, unknown> }>(`/presupuestos/${id}`, enviado);
    if (resp?.datos?.id) await guardarRegistros("presupuestos", [resp.datos]);
    limpiarCacheVistas();
    if (esEquipo(res)) {
      res.json({ ok: resp?.ok === true, datos: sanearRegistroEquipo("presupuestos", resp?.datos ?? {}) });
      return;
    }
    res.json(resp);
  })
);

const esqPatchContrato = z
  .object({
    estado: z.enum(["DRAFT", "PENDING_SIGNATURE", "EXPIRED"]).optional(),
    contenido: z.string().optional(),
  })
  .strip();

router.patch(
  "/panel/contratos-servicio/:id",
  conPanel(async (req, res) => {
    const cuerpo = esqPatchContrato.parse(req.body ?? {});
    const enviado = esEquipo(res) ? { estado: cuerpo.estado } : cuerpo;
    const id = encodeURIComponent(String(req.params.id));
    const resp = await panelPatch<{ ok: boolean; datos: Record<string, unknown> }>(`/contratos-servicio/${id}`, enviado);
    if (resp?.datos?.id) await guardarRegistros("contratos-servicio", [resp.datos]);
    limpiarCacheVistas();
    if (esEquipo(res)) {
      res.json({ ok: resp?.ok === true, datos: sanearRegistroEquipo("contratos-servicio", resp?.datos ?? {}) });
      return;
    }
    res.json(resp);
  })
);

const esqLead = z
  .object({
    name: z.string().trim().min(1, "Falta el nombre"),
    email: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    message: z.string().trim().optional(),
    serviceInterest: z.string().trim().optional(),
  })
  .strip();

router.post(
  "/panel/leads",
  conPanel(async (req, res) => {
    const cuerpo = esqLead.parse(req.body ?? {});
    const resp = await panelPost<{ ok: boolean; datos: Record<string, unknown> }>("/leads", cuerpo);
    if (resp?.datos?.id) await guardarRegistros("leads", [resp.datos]);
    if (esEquipo(res)) {
      res.json({ ok: resp?.ok === true, datos: sanearRegistroEquipo("leads", resp?.datos ?? {}) });
      return;
    }
    res.json(resp);
  })
);

export default router;
