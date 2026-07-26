import { describe, it, expect } from "vitest";
import { diffHubEntities, entityLabel, entityState } from "./hub-diff";

describe("diffHubEntities", () => {
  it("detecta entidades creadas (id nuevo) e ignora las que no tienen id", () => {
    const d = diffHubEntities(
      [{ id: "a", status: "draft" }],
      [{ id: "a", status: "draft" }, { id: "b", status: "activo" }, { status: "sin-id" }],
    );
    expect(d.created.map((e) => e.id)).toEqual(["b"]);
    expect(d.statusChanged).toEqual([]);
    expect(d.deleted).toEqual([]);
  });

  it("detecta cambio de estado con from/to (status, stage o etapa)", () => {
    const d = diffHubEntities(
      [{ id: "a", status: "draft" }, { id: "p", stage: "dev" }, { id: "e", etapa: "inicio" }],
      [{ id: "a", status: "activo" }, { id: "p", stage: "done" }, { id: "e", etapa: "inicio" }],
    );
    expect(d.statusChanged).toHaveLength(2);
    expect(d.statusChanged[0]).toMatchObject({ from: "draft", to: "activo" });
    expect(d.statusChanged[1]).toMatchObject({ from: "dev", to: "done" });
  });

  it("no marca cambio cuando el estado es idéntico", () => {
    const d = diffHubEntities([{ id: "a", status: "activo" }], [{ id: "a", status: "activo", title: "editado" }]);
    expect(d.statusChanged).toEqual([]);
    expect(d.created).toEqual([]);
    expect(d.deleted).toEqual([]);
  });

  it("detecta entidades eliminadas (estaban antes y ya no están)", () => {
    const d = diffHubEntities(
      [{ id: "a", title: "Contrato X" }, { id: "b" }],
      [{ id: "b" }],
    );
    expect(d.deleted.map((e) => e.id)).toEqual(["a"]);
  });

  it("un reemplazo total reporta creados y eliminados a la vez", () => {
    const d = diffHubEntities([{ id: "viejo", status: "activo" }], [{ id: "nuevo", status: "draft" }]);
    expect(d.created.map((e) => e.id)).toEqual(["nuevo"]);
    expect(d.deleted.map((e) => e.id)).toEqual(["viejo"]);
  });
});

describe("entityLabel / entityState", () => {
  it("usa title → name → nombre → client → id, con tope de 200 caracteres", () => {
    expect(entityLabel({ title: "T", name: "N" })).toBe("T");
    expect(entityLabel({ name: "N" })).toBe("N");
    expect(entityLabel({ nombre: "Ñ" })).toBe("Ñ");
    expect(entityLabel({ client: "C" })).toBe("C");
    expect(entityLabel({ id: "42" })).toBe("42");
    expect(entityLabel({})).toBe("(sin título)");
    expect(entityLabel({ title: "x".repeat(300) })).toHaveLength(200);
  });

  it("lee status, stage o etapa y devuelve '' si no hay ninguno", () => {
    expect(entityState({ status: "activo" })).toBe("activo");
    expect(entityState({ stage: "dev" })).toBe("dev");
    expect(entityState({ etapa: "fin" })).toBe("fin");
    expect(entityState({})).toBe("");
  });
});
