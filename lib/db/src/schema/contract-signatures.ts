import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Aceptación de una cotización o contrato por enlace.
 *
 * No es firma electrónica avanzada y no se presenta como tal: es la prueba de
 * que ALGUIEN CONCRETO dijo que sí, cuándo y desde dónde. Eso es lo que
 * convierte un "dale, vamos" de WhatsApp en algo que se puede mostrar meses
 * después.
 *
 * Tabla propia y no un campo del contrato porque los contratos viven en un
 * blob JSONB sin esquema: meter aquí el registro que puede acabar en una
 * discusión con un cliente sería guardarlo en el sitio menos fiable que hay.
 */
export const contractSignatures = pgTable(
  "contract_signatures",
  {
    id: serial("id").primaryKey(),
    /** Id del contrato dentro del blob del Hub. Texto porque allí no hay FK. */
    contractId: text("contract_id").notNull(),
    /** Token del enlace público. Único: es la credencial de acceso. */
    token: text("token").notNull(),
    /** "pendiente" | "firmado" | "anulado". */
    estado: text("estado").notNull().default("pendiente"),
    /** Quién generó el enlace. */
    createdById: integer("created_by_id"),
    /** Null = no caduca. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    /* ---- Lo que se registra al aceptar ---- */
    signedAt: timestamp("signed_at", { withTimezone: true }),
    /** Nombre declarado por quien acepta. Sin esto el registro no prueba nada. */
    signerName: text("signer_name"),
    signerEmail: text("signer_email"),
    /**
     * IP del cliente, tomada de x-forwarded-for.
     *
     * `req.ip` sería la del proxy y no distinguiría a un cliente de otro, que
     * es justo lo único que este registro tiene que probar.
     */
    signerIp: text("signer_ip"),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    porToken: uniqueIndex("contract_signatures_token_uniq").on(t.token),
    porContrato: index("contract_signatures_contract_idx").on(t.contractId),
  }),
);

export type ContractSignature = typeof contractSignatures.$inferSelect;
