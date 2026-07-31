import { integer, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Archivos adjuntos a cualquier cosa del panel.
 *
 * Hasta ahora solo se podía adjuntar un PDF, y solo a un contrato: la ruta era
 * `/drive/upload-pdf`, rechazaba cualquier otro tipo y no guardaba nada en la
 * base — el archivo se subía a Drive y el enlace se pegaba a mano en un campo
 * de texto del blob. Proyectos, tareas y tickets no tenían nada.
 *
 * El archivo sigue viviendo en Drive; esta tabla guarda a QUÉ está adjunto,
 * quién lo subió y cuándo. Sin ella no hay forma de listar "los archivos de
 * este ticket" sin recorrer Drive entero adivinando por el nombre.
 *
 * `entityId` es texto porque las entidades no comparten tipo de id: los
 * proyectos y contratos viven en el blob con ids de texto, y las tareas y los
 * tickets son enteros. Guardarlo como número obligaría a una tabla por tipo.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: serial("id").primaryKey(),
    /** "project" | "task" | "ticket" | "contract" */
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    /** Bytes. Puede faltar: Drive no siempre lo devuelve. */
    size: integer("size"),
    driveFileId: text("drive_file_id").notNull(),
    driveLink: text("drive_link"),
    /**
     * Quién lo subió. Sin `.references()`: este esquema no las usa para las
     * tablas del panel, y borrar una cuenta no debe borrar el rastro de los
     * archivos que dejó.
     */
    uploadedById: integer("uploaded_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // El acceso siempre es "dame los de esta entidad": sin este índice cada
    // ficha abierta recorrería la tabla entera.
    byEntity: index("attachments_entity_idx").on(t.entityType, t.entityId),
  }),
);

export type AttachmentRow = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;
