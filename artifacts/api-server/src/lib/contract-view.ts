/**
 * Dos vistas del mismo contrato.
 *
 * El contrato tiene una cara comercial (valores, precios por módulo, forma de
 * pago, PDF que se le manda al cliente) y una cara técnica (qué hay que
 * construir: alcance, entregables, criterios de aceptación). Programación y
 * marketing necesitan la segunda para trabajar, pero no deben ver la primera.
 *
 * La censura ocurre AQUÍ, en el servidor, antes de responder: al rol sin
 * permiso no se le envía el monto y luego se oculta en pantalla — simplemente
 * nunca sale del backend. Si mañana alguien abre las herramientas del navegador
 * o llama la API a mano, tampoco lo encuentra.
 */

/** Campos del contrato que revelan dinero. */
const MONEY_FIELDS = ["value", "monto", "total", "neto", "iva"] as const;

/** Campos del documento (cotización) que revelan dinero. */
const DOC_MONEY_FIELDS = ["downPct", "monthlyPrice", "validityDays"] as const;

export interface RedactedFlags {
  /** true cuando a este contrato se le quitaron los montos. */
  moneyRedacted: boolean;
}

type Rec = Record<string, unknown>;

/**
 * Devuelve el contrato sin ningún rastro de dinero, conservando lo que sirve
 * para ejecutar el trabajo: título, cliente, estado, fechas, alcance, módulos
 * (solo nombre y descripción) y el brief técnico con su PDF.
 */
export function redactContractMoney(contract: Rec): Rec & RedactedFlags {
  const out: Rec = { ...contract };

  for (const field of MONEY_FIELDS) delete out[field];

  // El PDF comercial lleva los precios impresos: no se entrega.
  delete out.pdfUrl;
  delete out.pdfTitle;
  delete out.pdfUploadedAt;

  // El estado de cobro (facturado, pagado, nº de factura) es información
  // comercial: solo lo ve quien ve montos.
  delete out.cobro;

  const doc = contract.doc;
  if (doc && typeof doc === "object" && !Array.isArray(doc)) {
    const d = { ...(doc as Rec) };
    for (const field of DOC_MONEY_FIELDS) delete d[field];
    delete d.monthly;
    if (Array.isArray(d.modules)) {
      d.modules = (d.modules as Rec[]).map(m => {
        const { price, ...rest } = (m ?? {}) as Rec & { price?: unknown };
        void price;
        return rest;
      });
    }
    out.doc = d;
  }

  return { ...out, moneyRedacted: true };
}

/** Aplica la censura a toda la colección de contratos. */
export function redactContracts(contracts: unknown): unknown[] {
  if (!Array.isArray(contracts)) return [];
  return contracts.map(c => (c && typeof c === "object" ? redactContractMoney(c as Rec) : c));
}

/**
 * Quita del brief técnico cualquier monto que la IA haya deslizado.
 * El brief es lo único del contrato que ve programación: no puede filtrar precios.
 */
export function stripMoneyFromText(text: string): string {
  return text
    // $1.200.000 / $ 1200000 / 1.200.000 CLP / 990 UF
    .replace(/\$\s?[\d.,]+/g, "[monto reservado]")
    .replace(/\b[\d.,]{4,}\s?(CLP|clp|pesos|USD|usd|UF|uf)\b/g, "[monto reservado]")
    .replace(/\b(UF|uf)\s?[\d.,]+/g, "[monto reservado]");
}

/**
 * stripMoneyFromText + montos UF con la cifra antes ("990 UF"), que el filtro
 * base solo pilla desde 4 dígitos. El punto ÚNICO para "ni una cifra": lo usan
 * la bitácora, los requerimientos con IA y el arranque de proyectos.
 */
export function stripAllMoneyFromText(text: string): string {
  return stripMoneyFromText(text).replace(/\b[\d.,]+\s?(UF|uf)\b/g, "[monto reservado]");
}
