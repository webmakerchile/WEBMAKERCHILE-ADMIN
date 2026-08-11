import { describe, it, expect, vi, beforeEach } from "vitest";
import { ROLES } from "@workspace/roles";

/**
 * getAllEffectiveRoutes se apoya en `role_permissions` (fila por rol) pero
 * nunca puede fallar: es parte del bootstrap de /auth/me. Estas pruebas
 * cubren las dos garantías que no son obvias leyendo el "camino feliz":
 * - rutas estáticas fuera del catálogo (ej. /ajustes para dev) sobreviven
 *   a cualquier override guardado, aunque el override no las incluya.
 * - una lectura fallida degrada a los defaults estáticos en vez de tumbar
 *   el endpoint.
 */

const selectMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));
vi.mock("@workspace/db/schema", () => ({ rolePermissions: { role: "role" } }));

// vi.mock(...) se "hoistea" por encima de los imports normales, así que
// esta importación estática ya ve los mocks de arriba.
import { getAllEffectiveRoutes, saveRolePermissions } from "./role-permissions";

function mockOverrideRows(rows: { role: string; routes: string[] }[]) {
  selectMock.mockReturnValue({ from: vi.fn(async () => rows) });
}

function mockSelectThrows() {
  selectMock.mockReturnValue({
    from: vi.fn(async () => {
      throw new Error("tabla no disponible");
    }),
  });
}

describe("getAllEffectiveRoutes", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("ceo y tester siempre son acceso total, nunca tienen fila propia", async () => {
    mockOverrideRows([{ role: "ceo", routes: ["/nope"] }]);
    const result = await getAllEffectiveRoutes();
    expect(result.ceo).toBe("*");
    expect(result.tester).toBe("*");
  });

  it("sin override guardado, cada rol usa su default estático", async () => {
    mockOverrideRows([]);
    const result = await getAllEffectiveRoutes();
    expect(new Set(result.ventas as string[])).toEqual(new Set(ROLES.ventas.routes));
  });

  it("dev conserva /ajustes aunque el override guardado no la incluya", async () => {
    // /ajustes no es una opción del catálogo (no es togglable), así que un
    // guardado "limpio" de permisos para dev jamás la incluiría a propósito.
    // Debe sobrevivir igual: es la única pantalla donde se administra esto.
    mockOverrideRows([{ role: "dev", routes: ["/mis-tareas", "/proyectos"] }]);
    const result = await getAllEffectiveRoutes();
    expect(result.dev).toContain("/ajustes");
    expect(result.dev).toEqual(expect.arrayContaining(["/mis-tareas", "/proyectos", "/ajustes"]));
  });

  it("aplica el override guardado para el resto de las rutas configurables", async () => {
    mockOverrideRows([{ role: "ventas", routes: ["/dashboard-ejecutivo", "/clientes"] }]);
    const result = await getAllEffectiveRoutes();
    expect(new Set(result.ventas as string[])).toEqual(new Set(["/dashboard-ejecutivo", "/clientes"]));
  });

  it("si falla la lectura de overrides, degrada a defaults estáticos en vez de lanzar", async () => {
    mockSelectThrows();
    await expect(getAllEffectiveRoutes()).resolves.toBeDefined();
    const result = await getAllEffectiveRoutes();
    expect(new Set(result.ventas as string[])).toEqual(new Set(ROLES.ventas.routes));
    expect(result.dev).toEqual(expect.arrayContaining([...ROLES.dev.routes]));
    expect(result.ceo).toBe("*");
  });
});

describe("saveRolePermissions", () => {
  beforeEach(() => {
    insertMock.mockReset();
  });

  it("filtra rutas fuera del catálogo y siempre fuerza el home del rol", async () => {
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn(async () => undefined) });
    insertMock.mockReturnValue({ values });

    const saved = await saveRolePermissions("ventas", ["/clientes", "/ruta-inventada"], "user-1");

    expect(saved).toContain("/clientes");
    expect(saved).toContain(ROLES.ventas.home);
    expect(saved).not.toContain("/ruta-inventada");
  });
});
