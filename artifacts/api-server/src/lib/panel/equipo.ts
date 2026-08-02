import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { panelEspejo, panelVisibilidad } from "@workspace/db/schema";
import {
  ESTADOS_PROYECTO_FINAL,
  leerRegistro,
  type RecursoPanel,
} from "./espejo";

/**
 * Modo EQUIPO de la sección Agencia: lo que ve el equipo llega SIEMPRE
 * saneado desde el servidor. La regla es lista blanca por recurso para los
 * listados (shape conocido) + depuración profunda por clave para las vistas
 * en vivo (shape del panel, puede cambiar). Nada de plata sale de acá:
 * montos, precios, MRR, márgenes, comisiones, sueldos, presupuestos totales.
 *
 * La UI también esconde por modo, pero eso es cosmética: la frontera real es
 * este módulo — al equipo el dato jamás se le envía.
 */

/** La transacción de drizzle o la conexión normal: mismos métodos. */
type Ejecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ------------------------------------------------------------------ */
/* Recursos que el equipo puede leer (default-deny: el resto es 403).   */
/* ------------------------------------------------------------------ */

export const RECURSOS_EQUIPO = [
  "clientes",
  "presupuestos",
  "proyectos",
  "tareas",
  "bitacora",
  "contratos-servicio",
  "contratos-mantenimiento",
  "leads",
] as const;

export type RecursoEquipo = (typeof RECURSOS_EQUIPO)[number];

export const esRecursoEquipo = (v: string): v is RecursoEquipo =>
  (RECURSOS_EQUIPO as readonly string[]).includes(v);

/* ------------------------------------------------------------------ */
/* Proyectos terminados y compartidos                                   */
/* ------------------------------------------------------------------ */

export function esEstadoFinalProyecto(status: unknown): boolean {
  return typeof status === "string" && (ESTADOS_PROYECTO_FINAL as readonly string[]).includes(status);
}

export function esProyectoTerminado(datos: Record<string, unknown>): boolean {
  return esEstadoFinalProyecto(datos.status);
}

export interface CompartidosProyectos {
  todos: boolean;
  ids: Set<string>;
}

/** Filas de compartir activas para proyectos ('*' = compartir todos). */
export async function compartidosProyectos(): Promise<CompartidosProyectos> {
  const filas = await db
    .select({ panelId: panelVisibilidad.panelId })
    .from(panelVisibilidad)
    .where(and(eq(panelVisibilidad.recurso, "proyectos"), eq(panelVisibilidad.compartido, true)));
  const ids = new Set<string>();
  let todos = false;
  for (const f of filas) {
    if (f.panelId === "*") todos = true;
    else ids.add(f.panelId);
  }
  return { todos, ids };
}

/** Upsert del toggle de compartir (id puntual del panel o '*' para todos). */
export async function fijarCompartidoProyecto(panelId: string, compartido: boolean): Promise<void> {
  await db
    .insert(panelVisibilidad)
    .values({ recurso: "proyectos", panelId, compartido, actualizado: new Date() })
    .onConflictDoUpdate({
      target: [panelVisibilidad.recurso, panelVisibilidad.panelId],
      set: { compartido, actualizado: new Date() },
    });
}

/**
 * Hook del sync (corre DENTRO de la transacción, antes de pisar proyectos):
 * si un proyecto estaba en curso y llega terminado, se borra su fila puntual
 * de compartir — al terminar desaparece para el equipo hasta que el CEO lo
 * comparta de nuevo a propósito. La fila global ('*') no se toca.
 */
export async function retirarCompartidosDeTerminados(
  entrantes: Array<Record<string, unknown>>,
  dbx: Ejecutor = db
): Promise<number> {
  const conId = entrantes.filter(
    (r): r is Record<string, unknown> & { id: string } => typeof r.id === "string" && r.id.length > 0
  );
  const terminadosAhora = conId.filter((r) => esProyectoTerminado(r));
  if (!terminadosAhora.length) return 0;

  const previos = await dbx
    .select({ id: panelEspejo.id, datos: panelEspejo.datos })
    .from(panelEspejo)
    .where(and(eq(panelEspejo.recurso, "proyectos"), inArray(panelEspejo.id, terminadosAhora.map((r) => r.id))));
  const estadoPrevio = new Map(previos.map((f) => [f.id, (f.datos as Record<string, unknown>)?.status]));

  const recienTerminados = terminadosAhora
    .filter((r) => estadoPrevio.has(r.id) && !esEstadoFinalProyecto(estadoPrevio.get(r.id)))
    .map((r) => r.id);
  if (!recienTerminados.length) return 0;

  await dbx
    .delete(panelVisibilidad)
    .where(and(eq(panelVisibilidad.recurso, "proyectos"), inArray(panelVisibilidad.panelId, recienTerminados)));
  return recienTerminados.length;
}

/**
 * ¿Puede el equipo ver este registro puntual? (la variante SQL para listados
 * vive en leerEspejo con soloEquipo: true — misma regla, en la consulta).
 */
export async function esVisibleParaEquipo(recurso: RecursoPanel, datos: Record<string, unknown>): Promise<boolean> {
  if (recurso === "proyectos") {
    if (!esProyectoTerminado(datos)) return true;
    const comp = await compartidosProyectos();
    return comp.todos || (typeof datos.id === "string" && comp.ids.has(datos.id));
  }
  if (recurso === "tareas" || recurso === "bitacora") {
    const pid = typeof datos.projectId === "string" ? datos.projectId : null;
    if (!pid) return false;
    const proyecto = await leerRegistro("proyectos", pid);
    if (!proyecto) return false;
    return esVisibleParaEquipo("proyectos", proyecto);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Depuración profunda por clave (red de seguridad para shapes vivos)   */
/* ------------------------------------------------------------------ */

/**
 * Claves que huelen a plata. Verificado contra el inventario real de claves
 * del panel (dev DB): totalValue, aiCostBudget, developerPayment,
 * freelancerCost, closerCommission*, margin*, mrr*, monto*, salary, etc.
 * "interes(?!t)" deja pasar el inglés "interest" (serviceInterest de leads)
 * pero corta "interesMora".
 */
const CLAVE_PLATA =
  /amount|monto|price|precio|total|subtotal|iva|mrr|salar|cost|pago|payment|paid|valor|value|comision|commission|margin|margen|pipeline|ingreso|gasto|saldo|budget|discount|descuento|cuota|tarifa|interes(?!t)/i;

/** arrEstimadoNeto y parientes: "arr" solo si sigue mayúscula o termina ahí. */
const CLAVE_ARR = /^arr(?=[A-Z]|$)/;

/** Colecciones/documentos que el equipo no debe ver ni en resumen. */
const CLAVE_COLECCION_VETADA = /factura|pedido|oferta|adicional|colaborador|documento|finanza/i;

/** Claves puntuales sin plata en el nombre pero con plata (o PII) adentro. */
const DROP_EXACTO = new Set([
  "monthlyMaintenance",
  "ticketPromedio",
  "installmentCount",
  "tokenUrl",
  "signedPdfUrl",
  "contenido",
  "signedByRut",
  "clientRepresentativeRut",
  "signatureData",
  "signatureImage",
  "recurrencia",
  "cobranza",
  "notes",
]);

/** Excepciones que las reglas de arriba atraparían por error. */
const KEEP_EXACTO = new Set(["billingRut", "pagoId"]);

/** Claves cuyo valor SÍ puede quedarse aunque otro filtro las mire feo. */
function claveVetada(clave: string): boolean {
  if (KEEP_EXACTO.has(clave)) return false;
  if (DROP_EXACTO.has(clave)) return true;
  if (CLAVE_PLATA.test(clave)) return true;
  if (CLAVE_ARR.test(clave)) return true;
  if (CLAVE_COLECCION_VETADA.test(clave)) return true;
  return false;
}

/**
 * Copia recursiva sin claves de plata. Con `comp` además filtra arrays bajo
 * la clave "proyectos" según visibilidad (vistas tipo cliente-360), reduce
 * "items" a { id, name, quantity } y deja en `_enlaces` SOLO el link de firma
 * (`contrato`); propuesta, pdf y descripción son de dirección.
 */
export function depurarProfundo(valor: unknown, comp?: CompartidosProyectos): unknown {
  if (Array.isArray(valor)) return valor.map((v) => depurarProfundo(v, comp));
  if (valor === null || typeof valor !== "object") return valor;

  const fuente = valor as Record<string, unknown>;
  const salida: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(fuente)) {
    if (claveVetada(clave)) continue;
    if (clave === "_enlaces") {
      const enlaces = (v ?? {}) as Record<string, unknown>;
      if (typeof enlaces.contrato === "string") salida._enlaces = { contrato: enlaces.contrato };
      continue;
    }
    if (clave === "items" && Array.isArray(v)) {
      salida.items = v.map((it) => {
        const o = (it ?? {}) as Record<string, unknown>;
        return { id: o.id, name: o.name, quantity: o.quantity };
      });
      continue;
    }
    if (clave === "proyectos" && Array.isArray(v) && comp) {
      salida.proyectos = v
        .filter((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          if (!esProyectoTerminado(o)) return true;
          return comp.todos || (typeof o.id === "string" && comp.ids.has(o.id));
        })
        .map((p) => depurarProfundo(p, comp));
      continue;
    }
    salida[clave] = depurarProfundo(v, comp);
  }
  return salida;
}

/* ------------------------------------------------------------------ */
/* Listas blancas por recurso (listados del espejo: shape conocido)     */
/* ------------------------------------------------------------------ */

const CAMPOS_EQUIPO: Record<RecursoEquipo, readonly string[]> = {
  clientes: [
    "id", "companyName", "rut", "billingRut", "contactName", "contactEmail",
    "contactPhone", "address", "closerId", "createdAt", "updatedAt",
  ],
  // Sin subtotal/iva/total/discount/monthlyMaintenance/notes/customPaymentTerms/tokenUrl/_enlaces.
  presupuestos: ["id", "clientId", "status", "maintenanceType", "validUntil", "includeContract", "createdAt", "updatedAt"],
  // Sin totalValue/monthlyMaintenance/aiCostBudget/developerPayment.
  proyectos: [
    "id", "proposalId", "clientId", "name", "status", "deadlineDays",
    "deadlineStartDate", "driveFolderUrl", "repositoryUrl", "createdAt", "updatedAt",
  ],
  // Sin freelancerCost.
  tareas: ["id", "projectId", "title", "status", "phase", "weight", "completedAt", "createdAt", "updatedAt"],
  bitacora: ["id", "projectId", "title", "phase", "imageUrls", "videoUrls", "contentOmitido", "createdAt", "updatedAt"],
  // Sin tokenUrl/signedPdfUrl/contenido/RUTs de firma; _enlaces.contrato se re-agrega aparte.
  "contratos-servicio": [
    "id", "proposalId", "status", "clientCompanyName", "clientRepresentativeName",
    "signedAt", "signedByName", "validUntil", "createdAt", "updatedAt",
  ],
  // Sin monthlyPrice/hasIVA/notes.
  "contratos-mantenimiento": ["id", "projectId", "clientId", "serviceType", "status", "startDate", "endDate", "createdAt", "updatedAt"],
  leads: [
    "id", "name", "company", "email", "phone", "status", "serviceInterest",
    "requestType", "notes", "messageOmitido", "createdAt", "updatedAt",
  ],
};

/**
 * Un registro del espejo, reducido a su lista blanca. La lista ES el contrato
 * (por eso leads conserva sus notes de venta aunque el scrub genérico vete
 * "notes" en las vistas); la depuración profunda igual pasa por los VALORES,
 * por si un campo permitido trae un objeto anidado con plata.
 */
export function sanearRegistroEquipo(recurso: RecursoEquipo, datos: Record<string, unknown>): Record<string, unknown> {
  const campos = CAMPOS_EQUIPO[recurso];
  const salida: Record<string, unknown> = {};
  for (const campo of campos) {
    if (campo in datos) salida[campo] = depurarProfundo(datos[campo]);
  }
  // El link de firma es la herramienta de trabajo del equipo: se conserva.
  if (recurso === "contratos-servicio") {
    const enlaces = (datos._enlaces ?? {}) as Record<string, unknown>;
    if (typeof enlaces.contrato === "string") salida._enlaces = { contrato: enlaces.contrato };
  }
  return salida;
}

export function sanearListadoEquipo<L extends { datos: Array<Record<string, unknown>> }>(
  recurso: RecursoEquipo,
  listado: L
): L {
  return { ...listado, datos: listado.datos.map((d) => sanearRegistroEquipo(recurso, d)) };
}

/* ------------------------------------------------------------------ */
/* Vistas en vivo: versiones para el equipo (shape explícito)           */
/* ------------------------------------------------------------------ */

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Resumen general sin negocio en plata: solo conteos. */
export function resumenParaEquipo(crudo: unknown): Record<string, unknown> {
  const r = (crudo ?? {}) as Record<string, unknown>;
  const negocio = (r.negocio ?? {}) as Record<string, unknown>;
  const registros = (r.registros ?? {}) as Record<string, unknown>;
  const registrosEquipo: Record<string, number> = {};
  for (const recurso of RECURSOS_EQUIPO) {
    if (typeof registros[recurso] === "number") registrosEquipo[recurso] = registros[recurso] as number;
  }
  return {
    ok: r.ok === true,
    generadoEn: r.generadoEn,
    registros: registrosEquipo,
    negocio: {
      contratosMantenimientoActivos: num(negocio.contratosMantenimientoActivos),
      proyectosActivos: num(negocio.proyectosActivos),
      presupuestosAbiertos: num(negocio.presupuestosAbiertos),
    },
  };
}

/** Mantención sin MRR ni cobranza: conteos y vencimientos sin monto. */
export function mantenimientoParaEquipo(crudo: unknown): Record<string, unknown> {
  const r = (crudo ?? {}) as Record<string, unknown>;
  const contratos = (r.contratos ?? {}) as Record<string, unknown>;
  const porTipoCrudo = (contratos.porTipo ?? {}) as Record<string, unknown>;
  const porTipo: Record<string, { contratos: number }> = {};
  for (const [tipo, info] of Object.entries(porTipoCrudo)) {
    porTipo[tipo] = { contratos: num((info as Record<string, unknown>)?.contratos) };
  }
  const vencimientos = Array.isArray(r.proximosVencimientos) ? r.proximosVencimientos : [];
  return {
    ok: r.ok === true,
    contratos: {
      total: num(contratos.total),
      activos: num(contratos.activos),
      pausados: num(contratos.pausados),
      cancelados: num(contratos.cancelados),
      porTipo,
    },
    proximosVencimientos: vencimientos.map((v) => {
      const o = (v ?? {}) as Record<string, unknown>;
      return {
        pagoId: o.pagoId,
        contratoId: o.contratoId,
        cliente: o.cliente,
        tipoServicio: o.tipoServicio,
        periodo: o.periodo,
        vence: o.vence,
        estado: o.estado,
      };
    }),
  };
}

/** Plantillas de contrato: el equipo solo necesita id y nombre para el select. */
export function plantillasParaEquipo(crudo: unknown): Record<string, unknown> {
  const r = (crudo ?? {}) as Record<string, unknown>;
  const datos = Array.isArray(r.datos) ? r.datos : [];
  return {
    ok: r.ok === true,
    datos: datos.map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return { id: o.id, nombre: o.nombre ?? o.name ?? o.titulo ?? o.id };
    }),
  };
}
