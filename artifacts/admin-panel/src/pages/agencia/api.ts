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
  subtotal: number;
  iva: number;
  total: number;
  hasIVA: number;
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
  unitPrice: number;
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
  signedPdfUrl?: string | null;
  validUntil?: string | null;
  createdAt?: string;
  _enlaces?: { contrato?: string; pdf?: string };
}

export interface ContratoMantenimiento extends Registro {
  projectId?: string | null;
  clientId: string;
  serviceType: string;
  monthlyPrice: number;
  hasIVA: number;
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
    mrrNeto: number;
    mrrConIva: number;
    arrEstimadoNeto: number;
    proyectosActivos: number;
    valorProyectosActivos: number;
    presupuestosAbiertos: number;
    pipelineCotizado: number;
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
    porTipo: Record<string, { contratos: number; mrrNeto: number }>;
  };
  recurrencia: { mrrNeto: number; mrrConIva: number; ticketPromedio: number };
  cobranza: { cuotasImpagas: number; montoImpago: number; cuotasVencidas: number; montoVencido: number };
  proximosVencimientos: Array<{
    pagoId: string;
    contratoId: string;
    cliente: string;
    tipoServicio: string;
    periodo: string;
    monto: number;
    vence: string;
    estado: string;
  }>;
}

export interface ResumenFinanzas {
  ok: boolean;
  anio: number;
  totales: { ingresos: number; gastos: number; neto: number; pagosProyecto: number; ingresosManuales: number };
  porMes: Array<{ mes: number; pagosProyecto: number; ingresosManuales: number; gastos: number; neto: number }>;
  pipeline: {
    presupuestosAbiertos: number;
    montoCotizado: number;
    presupuestosGanados: number;
    montoGanado: number;
    tasaConversion: number;
  };
  tienda: { pedidosPagados: number; montoPedidosPagados: number };
  documentosTributarios: { total: number; emitidos: number; fallidos: number; montoEmitido: number };
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
  finanzas: (anio?: number) => pedir<ResumenFinanzas>(`/panel/finanzas/resumen${anio ? `?anio=${anio}` : ""}`),
  plantillas: () => pedir<{ ok: boolean; datos?: Registro[] } & Partial<Listado>>("/panel/plantillas-contrato"),

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
    pedir<{ ok: boolean; creado?: boolean; datos: ContratoServicio }>("/panel/contratos-servicio", {
      method: "POST",
      body: JSON.stringify(b),
    }),
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
