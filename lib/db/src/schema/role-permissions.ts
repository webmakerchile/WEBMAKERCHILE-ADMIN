import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Overrides editables de qué rutas ve cada rol (pantalla Permisos, Ajustes).
 * Sin fila para un rol = se usan los valores por defecto de `ROLES[role].routes`
 * en `@workspace/roles`, así que nada cambia hasta que alguien lo edite.
 * CEO y tester nunca tienen fila acá: su acceso queda fijo en el código.
 */
export const rolePermissions = pgTable("role_permissions", {
  role: text("role").primaryKey(),
  routes: jsonb("routes").$type<string[]>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by"),
});
