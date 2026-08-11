-- Overrides editables de qué rutas ve cada rol (pantalla Permisos, Ajustes).
-- Sin fila para un rol = se usan los defaults estáticos de ROLES[role].routes
-- en @workspace/roles. CEO y tester nunca tienen fila: su acceso queda fijo.
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT PRIMARY KEY,
  routes JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_by TEXT
);
