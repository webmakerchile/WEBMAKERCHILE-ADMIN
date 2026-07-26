import { describe, it, expect } from "vitest";
import { mergeCollection, type HubEntity } from "./hub-merge";

const T0 = 1_000_000; // "cuando el cliente cargó"

const task = (id: string, over: Partial<HubEntity> = {}): HubEntity => ({
  id, title: `Tarea ${id}`, createdAt: T0 - 1000, updatedAt: T0 - 1000, ...over,
});

describe("fusión del tablero compartido", () => {
  it("conserva lo que otra persona creó mientras yo trabajaba", () => {
    const stored = [task("a"), task("nueva-de-otro", { createdAt: T0 + 5000, updatedAt: T0 + 5000 })];
    const incoming = [task("a")]; // mi pestaña ni siquiera vio la tarea del otro
    const out = mergeCollection(stored, incoming, T0);
    expect(out.map(e => e.id).sort()).toEqual(["a", "nueva-de-otro"]);
  });

  it("respeta que yo haya borrado algo que ya existía cuando cargué", () => {
    const stored = [task("a"), task("b")];
    const incoming = [task("a")]; // borré "b"
    const out = mergeCollection(stored, incoming, T0);
    expect(out.map(e => e.id)).toEqual(["a"]);
  });

  it("gana la edición más reciente cuando dos personas tocan la misma tarea", () => {
    const stored = [task("a", { title: "versión del otro", updatedAt: T0 + 9000 })];
    const incoming = [task("a", { title: "mi versión", updatedAt: T0 + 1000 })];
    const out = mergeCollection(stored, incoming, T0);
    expect(out[0].title).toBe("versión del otro");

    const out2 = mergeCollection(
      [task("a", { title: "versión del otro", updatedAt: T0 + 1000 })],
      [task("a", { title: "mi versión", updatedAt: T0 + 9000 })],
      T0,
    );
    expect(out2[0].title).toBe("mi versión");
  });

  it("en empate gana quien acaba de guardar", () => {
    const stored = [task("a", { title: "servidor", updatedAt: T0 })];
    const incoming = [task("a", { title: "cliente", updatedAt: T0 })];
    expect(mergeCollection(stored, incoming, T0)[0].title).toBe("cliente");
  });

  it("agrega lo que yo creé y no estaba en el servidor", () => {
    const out = mergeCollection([task("a")], [task("a"), task("mia", { createdAt: T0 + 10 })], T0);
    expect(out.map(e => e.id)).toEqual(["a", "mia"]);
  });

  it("no duplica cuando ambos lados traen la misma entidad nueva", () => {
    const nueva = task("x", { createdAt: T0 + 10, updatedAt: T0 + 10 });
    const out = mergeCollection([nueva], [nueva], T0);
    expect(out).toHaveLength(1);
  });

  it("dos personas trabajando en paralelo no se borran entre sí", () => {
    // Estado inicial común.
    const inicial = [task("a"), task("b")];
    // Ventas agrega "c" y guarda.
    const trasVentas = mergeCollection(inicial, [...inicial, task("c", { createdAt: T0 + 100 })], T0);
    // Desarrollo, que cargó ANTES de que existiera "c", edita "b" y guarda.
    const trasDev = mergeCollection(
      trasVentas,
      [task("a"), task("b", { title: "b editada", updatedAt: T0 + 200 })],
      T0,
    );
    expect(trasDev.map(e => e.id).sort()).toEqual(["a", "b", "c"]);
    expect(trasDev.find(e => e.id === "b")?.title).toBe("b editada");
  });

  it("tolera entidades sin marcas de tiempo sin romperse", () => {
    const out = mergeCollection([{ id: "a" }], [{ id: "a", title: "editada" }], T0);
    expect(out).toEqual([{ id: "a", title: "editada" }]);
  });

  it("una colección vacía del cliente con baseVersion actual no borra nada ajeno", () => {
    // baseVersion=0 se trata como 'cargué recién' en la ruta; aquí simulamos el caso
    // de un cliente que no conoce nada previo: solo aporta lo suyo.
    const stored = [task("a", { createdAt: T0 + 1 }), task("b", { createdAt: T0 + 2 })];
    const out = mergeCollection(stored, [], T0);
    expect(out.map(e => e.id).sort()).toEqual(["a", "b"]);
  });
});
