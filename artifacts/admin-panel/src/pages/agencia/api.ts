/**
 * Cliente HTTP de la sección Agencia (espejo del panel webmakerlatam.com).
 * Todas las llamadas van a nuestro backend; la llave del panel jamás llega acá.
 * Regla de oro: este panel NO calcula plata ni genera documentos — solo muestra
 * lo que el panel de la agencia ya calculó, y delega las escrituras.
 */

export class ErrorPanel extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string | undefined,
    mensaje: string
  ) {
    super(mensaje);
  }
}

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${ruta}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  const cuerpo: any = await r.json().catch(() => null);
  if (!r.ok) {
    throw new ErrorPanel(
      r.status,
      cuerpo?.error,
      cuerpo?.mensaje ?? cuerpo?.error ?? `Error ${r.status} hablando con el panel`
    );
  }
  return cuerpo as T;
}

function qs(filtros: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v !== undefined && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ------------------------------- Tipos ------------------------------- */

export type Registro = Record<string, any> & { id: string };

export interface Listado<T = Registro> {
  total: number;
  limite: number;
  offset: number;
  datos: T[];
}

export interface EstadoSync {
  configurado: boolean;
  cursor: string | null;
  ultimaCorrida: string | null;
  ultimoExito: string | null;
  ultimoError: string | null;
  detalle: unknown;
  porRecurso: Record<string, number>;
}

export interface Cliente extends Registro {
  companyName: string;
  rut?: string | null;
  billingRut?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  closerId?: string | null;
  createdAt?: string;
}

export interface Presupuesto extends Registro {
  clientId: string;
  status: string;
  tokenUrl?: string | null;
  /** Plata: llega en dirección y en acotado con acceso a Proyectos (ventas/dev) — al equipo el servidor no se la manda. */
  subtotal?: number;
  iva?: number;
  total?: number;
  hasIVA?: number;
  paymentModality?: string;
  installmentCount?: number | null;
  customPaymentTerms?: string | null;
  maintenanceType?: string | null;
  monthlyMaintenance?: number;
  discount?: number;
  notes?: string | null;
  validUntil?: string | null;
  includeContract?: number;
  createdAt?: string;
  updatedAt?: string;
  _enlaces?: { propuesta?: string };
}

export interface ItemPresupuesto extends Registro {
  name: string;
  description?: string | null;
  quantity: number;
  /** Plata: dirección y acotado con acceso a Proyectos; no llega al equipo. */
  unitPrice?: number;
}

export interface Proyecto extends Registro {
  proposalId?: string | null;
  clientId: string;
  name: string;
  status: string;
  totalValue?: number;
  monthlyMaintenance?: number;
  deadlineDays?: number | null;
  deadlineStartDate?: string | null;
  driveFolderUrl?: string | null;
  repositoryUrl?: string | null;
  createdAt?: string;
}

export interface Tarea extends Registro {
  projectId: string;
  title: string;
  status: string;
  phase?: string;
  weight?: number;
  completedAt?: string | null;
}

export interface ContratoServicio extends Registro {
  proposalId: string;
  status: string;
  tokenUrl?: string;
  clientCompanyName?: string;
  clientRepresentativeName?: string;
  signedAt?: string | null;
  signedByName?: string | null;
  /** Respaldo legal de la firma: dirección y acotado con acceso a Proyectos; no llega al equipo. */
  signedByEmail?: string | null;
  signedByIp?: string | null;
  signedPdfUrl?: string | null;
  validUntil?: string | null;
  createdAt?: string;
  _enlaces?: { contrato?: string; pdf?: string };
}

/** Una sección del contenido de un contrato (título + cuerpo con marcado). */
export interface SeccionContrato {
  titulo: string;
  contenido: string;
}

/** Respuesta de la redacción/corrección con la IA del panel (no guarda nada). */
export interface RedaccionIA {
  ok: boolean;
  modelo?: string;
  contexto?: { cliente?: string; total?: number; formaDePago?: string };
  secciones: SeccionContrato[];
  porCampos?: Record<string, string>;
}

export interface ContratoMantenimiento extends Registro {
  projectId?: string | null;
  clientId: string;
  serviceType: string;
  /** Solo en modo dirección. */
  monthlyPrice?: number;
  hasIVA?: number;
  status: string;
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
}

export interface PagoMantenimiento extends Registro {
  contractId: string;
  month: number;
  year: number;
  amount: number;
  status: string;
  dueDate: string;
  paidAt?: string | null;
}

export interface ResumenPanel {
  ok: boolean;
  generadoEn: string;
  registros: Record<string, number>;
  negocio: {
    contratosMantenimientoActivos: number;
    proyectosActivos: number;
    presupuestosAbiertos: number;
    /** Plata: solo en modo dirección. */
    mrrNeto?: number;
    mrrConIva?: number;
    arrEstimadoNeto?: number;
    valorProyectosActivos?: number;
    pipelineCotizado?: number;
  };
}

export interface ResumenMantenimiento {
  ok: boolean;
  configuracion?: { diaDeCobro?: number; interesMoraPorcentaje?: string; ivaPorcentaje?: number };
  contratos: {
    total: number;
    activos: number;
    pausados: number;
    cancelados: number;
    porTipo: Record<string, { contratos: number; mrrNeto?: number }>;
  };
  /** Plata: solo en modo dirección. */
  recurrencia?: { mrrNeto: number; mrrConIva: number; ticketPromedio: number };
  cobranza?: { cuotasImpagas: number; montoImpago: number; cuotasVencidas: number; montoVencido: number };
  proximosVencimientos: Array<{
    pagoId: string;
    contratoId: string;
    cliente: string;
    tipoServicio: string;
    periodo: string;
    monto?: number;
    vence: string;
    estado: string;
  }>;
}

/** Filtro de período que acepta la vista de Finanzas en vivo del panel. */
export type PeriodoFinanzas = "hoy" | "semana" | "mes" | "rango";

/** Categoría de gasto (recurso nuevo del espejo): solo para etiquetar, sin plata propia. */
export interface CategoriaGasto extends Registro {
  name: string;
  tipo?: string | null;
}

/** Movimiento de Mercado Pago (recurso nuevo del espejo). */
export interface MovimientoMp extends Registro {
  date?: string | null;
  description?: string | null;
  /** Plata: solo llega en modo dirección/acotado — al equipo el servidor no se la manda. */
  amount?: number;
  categoryId?: string | null;
  categoryName?: string | null;
}

/** Documento SII (recurso nuevo del espejo; puede no existir si el origen aún lo sirve bajo documentos-tributarios). */
export interface DocumentoSii extends Registro {
  type?: string | null;
  folio?: string | number | null;
  date?: string | null;
  amount?: number;
  status?: string | null;
  url?: string | null;
}

/** Un gasto o ingreso manual, tal como los devuelve /finanzas/gastos y /finanzas/ingresos. */
export interface MovimientoManual extends Registro {
  description: string;
  amount?: number;
  date?: string | null;
  categoryId?: string | null;
  notes?: string | null;
}

/** Cuenta por cobrar de un proyecto, tal cual la entrega la vista de período. */
export interface CuentaPorCobrar {
  proyectoId: string;
  nombre: string;
  /** Plata: solo llega en modo dirección/acotado. */
  total?: number;
  pagado?: number;
  porcentajePagado?: number;
}

/** Resumen de movimientos MP agrupados por categoría, tal cual lo entrega el panel. */
export interface ResumenCategoriaMp {
  categoryId: string | null;
  categoryName: string;
  total?: number;
  cantidad: number;
}

/**
 * Vista de Finanzas en vivo por período (reemplaza el resumen anual v1).
 * Todo llega calculado por el panel de origen -- acá solo se muestra.
 */
export interface FinanzasPeriodo {
  ok: boolean;
  periodo?: PeriodoFinanzas;
  desde?: string;
  hasta?: string;
  kpis: {
    /** Plata: todos estos campos solo llegan en modo dirección/acotado. */
    utilidadNeta?: number;
    ventasNetas?: number;
    gastosOperativos?: number;
    egresosMp?: number;
    mantenimientos?: number;
    ivaDebito?: number;
    notaF29?: string | null;
  };
  ingresos?: MovimientoManual[];
  gastos?: MovimientoManual[];
  porCobrar?: CuentaPorCobrar[];
  movimientosMp?: MovimientoMp[];
  resumenPorCategoriaMp?: ResumenCategoriaMp[];
  documentosSii?: DocumentoSii[];
}

export interface VistaPresupuesto {
  ok: boolean;
  datos: {
    presupuesto: Presupuesto;
    cliente?: Cliente;
    items?: ItemPresupuesto[];
  };
}

/* ------------------------------ Llamadas ------------------------------ */

export const CLAVE = "agencia";

export const agenciaApi = {
  estado: () => pedir<EstadoSync>("/panel/estado"),
  sync: () => pedir<unknown>("/panel/sync", { method: "POST" }),

  espejo: <T = Registro>(recurso: string, filtros: Record<string, string | number | undefined> = {}) =>
    pedir<Listado<T>>(`/panel/espejo/${recurso}${qs(filtros)}`),
  registro: <T = Registro>(recurso: string, id: string) =>
    pedir<{ datos: T }>(`/panel/espejo/${recurso}/${encodeURIComponent(id)}`),
  vista: <T = any>(recurso: string, id: string) =>
    pedir<T>(`/panel/vistas/${recurso}/${encodeURIComponent(id)}`),

  resumen: () => pedir<ResumenPanel>("/panel/resumen"),
  mantenimiento: () => pedir<ResumenMantenimiento>("/panel/mantenimiento/resumen"),
  plantillas: () => pedir<{ ok: boolean; datos?: Registro[] } & Partial<Listado>>("/panel/plantillas-contrato"),

  /* Finanzas v2: vista en vivo por período + escrituras delegadas. */
  finanzasPeriodo: (filtros: { periodo?: PeriodoFinanzas; desde?: string; hasta?: string }) =>
    pedir<FinanzasPeriodo>(`/panel/finanzas/periodo${qs(filtros)}`),
  registrarGasto: (b: { description: string; amount: number; categoryId?: string; date?: string; notes?: string }) =>
    pedir<{ ok: boolean; datos: MovimientoManual }>("/panel/finanzas/gastos", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  registrarIngreso: (b: { description: string; amount: number; date?: string; notes?: string }) =>
    pedir<{ ok: boolean; datos: MovimientoManual }>("/panel/finanzas/ingresos", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  categorizarMovimientoMp: (id: string, categoryId: string) =>
    pedir<{ ok: boolean; datos: MovimientoMp }>(`/panel/finanzas/movimientos-mp/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ categoryId }),
    }),
  sincronizarMp: () =>
    pedir<{ ok: boolean; sincronizados?: number; datos?: MovimientoMp[] }>("/panel/finanzas/mp-sync", {
      method: "POST",
    }),

  /* Compartir proyectos terminados con el equipo (solo dirección). */
  compartidos: () => pedir<{ todos: boolean; ids: string[] }>("/panel/compartidos/proyectos"),
  fijarCompartidoGlobal: (compartido: boolean) =>
    pedir<{ ok: boolean; todos: boolean }>("/panel/compartidos/proyectos", {
      method: "PUT",
      body: JSON.stringify({ compartido }),
    }),
  fijarCompartido: (id: string, compartido: boolean) =>
    pedir<{ ok: boolean; id: string; compartido: boolean }>(
      `/panel/compartidos/proyectos/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify({ compartido }) }
    ),

  crearCliente: (b: Record<string, unknown>) =>
    pedir<{ ok: boolean; creado?: boolean; datos: Cliente }>("/panel/clientes", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  crearPresupuesto: (b: Record<string, unknown>) =>
    pedir<{
      ok: boolean;
      datos: Presupuesto;
      items?: ItemPresupuesto[];
      calculo?: { subtotal: number; descuento: number; iva: number; total: number };
    }>("/panel/presupuestos", { method: "POST", body: JSON.stringify(b) }),
  crearContrato: (b: Record<string, unknown>) =>
    pedir<{
      ok: boolean;
      creado?: boolean;
      /** "secciones" | "campos" | "texto_plano" — si dice texto_plano, algo anda mal. */
      formatoContenido?: string;
      advertencia?: string;
      datos: ContratoServicio;
    }>("/panel/contratos-servicio", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  /** Redacta las secciones con la IA del panel (mismo prompt que su proposal builder). */
  redactarIA: (b: Record<string, unknown>) =>
    pedir<RedaccionIA>("/panel/contratos-servicio/redactar-ia", { method: "POST", body: JSON.stringify(b) }),
  /** Ajusta las secciones actuales con una instrucción en lenguaje natural. */
  corregirIA: (b: { correccion: string; secciones: SeccionContrato[] }) =>
    pedir<RedaccionIA>("/panel/contratos-servicio/corregir-ia", { method: "POST", body: JSON.stringify(b) }),
  patchPresupuesto: (id: string, b: Record<string, unknown>) =>
    pedir<{ ok: boolean; datos: Presupuesto }>(`/panel/presupuestos/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(b),
    }),
  patchContrato: (id: string, b: Record<string, unknown>) =>
    pedir<{ ok: boolean; datos: ContratoServicio }>(`/panel/contratos-servicio/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(b),
    }),
};

/** Link público de una propuesta: SOLO el que entrega el panel en _enlaces
 * (jamás fabricamos URLs públicas acá — regla de oro de la integración). */
export function enlacePropuesta(p: Presupuesto): string | undefined {
  return p._enlaces?.propuesta;
}
