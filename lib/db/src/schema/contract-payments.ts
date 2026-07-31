import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Pagos recibidos por contrato (cobranza).
 *
 * El estado de cobro (pendiente/facturado/pagado/incobrable) ya existe como
 * sub-objeto `cobro` del contrato en el blob del Hub, y ahí se queda: es UNA
 * marca de gestión. Esto es otra cosa: el registro contable de CADA pago que
 * llegó (fecha, monto, quién lo anotó). No puede vivir en el blob porque un
 * abono es un hecho contable — no se fusiona, no se pisa con ediciones del
 * tablero y tiene que sobrevivir aunque el contrato se edite o se borre.
 *
 * `contractRef` es el id (texto) del contrato en el blob, igual que en
 * `contract_signatures` y `attachments`.
 *
 * `monto` va en pesos chilenos ENTEROS e IVA incluido: es la plata que entró
 * a la cuenta, no un neto contable. El tope de integer (2.147 millones) queda
 * lejos de cualquier proyecto de la agencia.
 */
export const contractPayments = pgTable(
  "contract_payments",
  {
    id: serial("id").primaryKey(),
    contractRef: text("contract_ref").notNull(),
    /** YYYY-MM-DD (día de Santiago en que llegó la plata). */
    fecha: text("fecha").notNull(),
    /** CLP enteros, IVA incluido. */
    monto: integer("monto").notNull(),
    nota: text("nota").notNull().default(""),
    /** Quién lo anotó. Sin `.references()`: el rastro sobrevive a la cuenta. */
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // El acceso siempre es "los pagos de este contrato".
    index("contract_payments_ref_idx").on(t.contractRef),
  ],
);

export type ContractPaymentRow = typeof contractPayments.$inferSelect;
export type InsertContractPayment = typeof contractPayments.$inferInsert;
