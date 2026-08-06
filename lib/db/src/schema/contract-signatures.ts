import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Aceptación de una cotización, contrato, aprobación de proyecto o cierre de
 * proyecto — todo por el mismo enlace público.
 *
 * No es firma electrónica avanzada y no se presenta como tal: es la prueba de
 * que ALGUIEN CONCRETO dijo que sí, cuándo y desde dónde. Eso es lo que
 * convierte un "dale, vamos" de WhatsApp en algo que se puede mostrar meses
 * después.
 *
 * Tabla propia y no un campo del contrato/proyecto porque ambos viven en un
 * blob JSONB sin esquema: meter aquí el registro que puede acabar en una
 * discusión con un cliente sería guardarlo en el sitio menos fiable que hay.
 *
 * Una fila sirve para UN sujeto: `motivo` dice cuál, y solo la columna que le
 * corresponde (`contractId` o `projectId`) va llena. No hay CHECK en la DB
 * para eso — igual que el resto de la tabla, la disciplina es de la app.
 */
export const contractSignatures = pgTable(
  "contract_signatures",
  {
    id: serial("id").primaryKey(),
    /** Id del contrato dentro del blob del Hub. Texto porque allí no hay FK. Solo si motivo="contrato". */
    contractId: text("contract_id"),
    /** Id del proyecto dentro del blob del Hub. Solo si motivo empieza con "aprobacion_proyecto"/"cierre_proyecto". */
    projectId: text("project_id"),
    /** "contrato" | "aprobacion_proyecto" | "cierre_proyecto". Ver `MotivoFirma` en lib/firma-contrato. */
    motivo: text("motivo").notNull().default("contrato"),
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

    /* ---- Firma digital ---- */
    /** Cómo firmó: "dibujo" | "imagen" | "texto". */
    signatureKind: text("signature_kind"),
    /**
     * La firma en sí: data URI PNG/JPEG para dibujo e imagen; el texto tecleado
     * para "texto". Va en la misma fila porque ES parte de la constancia: una
     * firma separada de su registro no prueba nada.
     */
    signatureData: text("signature_data"),

    /* ---- Correos de confirmación ---- */
    /** "enviado" | "fallido" | "sin_correo" | "sin_configurar". Null = firma anterior a esta función. */
    emailClienteEstado: text("email_cliente_estado"),
    /** Ídem para el aviso al buzón del equipo. */
    emailEquipoEstado: text("email_equipo_estado"),
    /** Detalle del último error de envío, para verlo en el panel y no en logs. */
    emailDetalle: text("email_detalle"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    porToken: uniqueIndex("contract_signatures_token_uniq").on(t.token),
    porContrato: index("contract_signatures_contract_idx").on(t.contractId),
    porProyecto: index("contract_signatures_project_idx").on(t.projectId),
  }),
);

export type ContractSignature = typeof contractSignatures.$inferSelect;
