// Lo que se prueba aquí es que no se pierda nada por el camino.
//
// El resumen cruza dos listas del mismo contrato que se generaron por separado
// y divergen. Un fallo no da error: da una lista limpia a la que le falta un
// módulo — trabajo vendido que nadie construye, o construido que nadie facturó.
// Y el segundo riesgo es el opuesto: filtrar un precio a un rol que no ve
// montos, que el servidor censura precisamente para que no pase.

import { describe, it, expect } from "vitest";
import {
  claveModulo,
  cruzarModulos,
  avanceDeTareas,
  resumenDeProyecto,
  modulosDescuadrados,
} from "./resumen-servicios";
import type { HubContract, HubProject, HubTask } from "@/lib/hub-owner";

const proyecto = (p: Partial<HubProject> = {}): HubProject => ({
  id: "p1", name: "Landing M&M", client: "M&M Moda", type: "web", prio: "media",
  status: "dev", owner: "", prog: 0, notes: "", link: "",
  contractId: "c1", createdAt: 1, updatedAt: 1, ...p,
});

const contrato = (c: Partial<HubContract> = {}): HubContract => ({
  id: "c1", title: "Landing M&M", client: "M&M Moda", value: "$1.190.000",
  status: "activo", signedAt: "", expiresAt: "", notes: "",
  createdAt: 1, updatedAt: 1, ...c,
});

const tarea = (t: Partial<HubTask> = {}): HubTask => ({
  id: "t1", title: "x", projectId: "p1", crit: "media", stage: "doing",
  stageSince: 0, notes: "", createdAt: 1, updatedAt: 1, ...t,
});

describe("emparejar nombres de módulo", () => {
  // Los dos documentos los escribe la IA por separado, así que el mismo módulo
  // sale como "Diseño UI" en uno y "diseno ui" en otro.
  it("ignora tildes, mayúsculas y puntuación", () => {
    expect(claveModulo("Diseño UI/UX")).toBe(claveModulo("diseno ui ux"));
    expect(claveModulo("  Landing  ")).toBe(claveModulo("landing"));
    expect(claveModulo("SEO — básico")).toBe(claveModulo("seo basico"));
  });

  it("no confunde módulos distintos", () => {
    expect(claveModulo("Landing")).not.toBe(claveModulo("Landing Pro"));
  });
});

describe("cruzar lo comercial con lo técnico", () => {
  const comercial = [{ name: "Landing", desc: "One-page", price: 400000 }];
  const tecnico = [{
    modulo: "landing", descripcion: "Una sola página con formulario",
    entregables: ["Maqueta", "Deploy"], requisitos: ["Textos del cliente"],
  }];

  it("junta los dos lados en una sola fila", () => {
    const [m] = cruzarModulos(comercial, tecnico, true);
    expect(m.origen).toBe("ambos");
    expect(m.nombre).toBe("Landing");
    expect(m.precio).toBe(400000);
    expect(m.entregables).toEqual(["Maqueta", "Deploy"]);
    // La descripción útil para construir es la del brief.
    expect(m.descripcion).toBe("Una sola página con formulario");
  });

  // El fallo que importa: descartar lo que no empareja deja una lista limpia a
  // la que le falta trabajo real.
  it("conserva lo que solo está en un lado, y dice en cuál", () => {
    const salida = cruzarModulos(
      [{ name: "Landing", price: 400000 }, { name: "Blog", price: 200000 }],
      [{ modulo: "Landing", descripcion: "", entregables: [], requisitos: [] },
       { modulo: "Migración de datos", descripcion: "", entregables: [], requisitos: [] }],
      true,
    );
    expect(salida.map((m) => m.nombre)).toEqual(["Landing", "Blog", "Migración de datos"]);
    expect(salida.find((m) => m.nombre === "Blog")?.origen).toBe("comercial");
    expect(salida.find((m) => m.nombre === "Migración de datos")?.origen).toBe("tecnico");
  });

  it("el brief sin descripción no borra la comercial", () => {
    const [m] = cruzarModulos(comercial, [{ modulo: "Landing", descripcion: "", entregables: [], requisitos: [] }], true);
    expect(m.descripcion).toBe("One-page");
  });

  // El servidor ya quitó `price` de los módulos al censurar; esto es la segunda
  // barrera, para que un cambio en el backend no acabe pintando cifras.
  it("sin permiso de montos no aparece ningún precio", () => {
    const salida = cruzarModulos(comercial, tecnico, false);
    expect(salida[0].precio).toBeNull();
  });

  it("un precio que no es número no se cuela", () => {
    const salida = cruzarModulos(
      [{ name: "Landing", price: "400.000" as never }, { name: "Blog", price: NaN }],
      [], true,
    );
    expect(salida.map((m) => m.precio)).toEqual([null, null]);
  });

  it("los módulos sin nombre se descartan: no hay con qué emparejarlos", () => {
    expect(cruzarModulos([{ name: "  ", price: 1 }], [{ modulo: "", descripcion: "x", entregables: [], requisitos: [] }], true))
      .toEqual([]);
  });

  it("aguanta listas vacías y campos que no son listas", () => {
    expect(cruzarModulos([], [], true)).toEqual([]);
    const [m] = cruzarModulos([], [{ modulo: "X", descripcion: "", entregables: null as never, requisitos: undefined as never }], true);
    expect(m.entregables).toEqual([]);
    expect(m.requisitos).toEqual([]);
  });

  it("dos módulos comerciales con el mismo nombre no duplican la fila", () => {
    const salida = cruzarModulos([{ name: "Landing", price: 1 }, { name: "landing", price: 2 }], [], true);
    expect(salida).toHaveLength(1);
  });
});

describe("avance por tareas", () => {
  it("cuenta solo las del proyecto", () => {
    const tareas = [
      tarea({ id: "a", stage: "done" }),
      tarea({ id: "b", stage: "doing" }),
      tarea({ id: "c", projectId: "otro", stage: "done" }),
    ];
    expect(avanceDeTareas(tareas, "p1")).toEqual({ hechas: 1, total: 2, pct: 50 });
  });

  it("sin tareas no divide por cero", () => {
    expect(avanceDeTareas([], "p1")).toEqual({ hechas: 0, total: 0, pct: 0 });
  });
});

describe("resumen del proyecto", () => {
  const conBrief = contrato({
    doc: { modules: [{ name: "Landing", desc: "", price: 400000 }, { name: "Blog", desc: "", price: 200000 }] },
    brief: {
      objetivo: "Captar leads",
      contexto: "",
      alcance: [{ modulo: "Landing", descripcion: "Una página", entregables: ["Deploy"], requisitos: [] }],
      criteriosAceptacion: ["Carga en menos de 2 s"],
      fueraDeAlcance: ["App móvil"],
      stackSugerido: ["React"],
      hitos: [{ nombre: "Entrega 1", detalle: "Maqueta" }],
    },
  });

  it("reúne alcance, criterios, hitos y avance", () => {
    const r = resumenDeProyecto(proyecto(), [conBrief], [tarea({ stage: "done" })]);
    expect(r.objetivo).toBe("Captar leads");
    expect(r.criteriosAceptacion).toEqual(["Carga en menos de 2 s"]);
    expect(r.fueraDeAlcance).toEqual(["App móvil"]);
    expect(r.hitos).toHaveLength(1);
    expect(r.avance.pct).toBe(100);
    expect(r.total).toBe(600000);
  });

  // Programación abre el proyecto y no debe ver un solo monto: el servidor ya
  // los quitó y marcó `moneyRedacted`.
  it("un contrato censurado no enseña ni total ni precios", () => {
    const r = resumenDeProyecto(proyecto(), [contrato({ ...conBrief, moneyRedacted: true })], []);
    expect(r.sinMontos).toBe(true);
    expect(r.total).toBeNull();
    expect(r.modulos.every((m) => m.precio === null)).toBe(true);
  });

  // Null y no 0: "no se ven los montos" y "suman cero" son cosas distintas, y
  // un $0 en pantalla sería una cifra falsa.
  it("sin ningún precio el total es null, no cero", () => {
    const r = resumenDeProyecto(proyecto(), [contrato({ brief: conBrief.brief })], []);
    expect(r.total).toBeNull();
  });

  it("un proyecto sin contrato sigue mostrando su avance", () => {
    const r = resumenDeProyecto(proyecto({ contractId: undefined }), [conBrief], [tarea({ stage: "done" }), tarea({ id: "b" })]);
    expect(r.contrato).toBeNull();
    expect(r.modulos).toEqual([]);
    expect(r.avance).toEqual({ hechas: 1, total: 2, pct: 50 });
  });

  it("un contractId que ya no existe no revienta", () => {
    const r = resumenDeProyecto(proyecto({ contractId: "borrado" }), [conBrief], []);
    expect(r.contrato).toBeNull();
  });

  it("un contrato sin brief da los módulos comerciales igual", () => {
    const r = resumenDeProyecto(proyecto(), [contrato({ doc: { modules: [{ name: "Landing", price: 1000 }] } })], []);
    expect(r.modulos).toHaveLength(1);
    expect(r.modulos[0].origen).toBe("comercial");
  });

  it("señala lo descuadrado entre los dos documentos", () => {
    const r = resumenDeProyecto(proyecto(), [conBrief], []);
    const { sinEspecificar, sinFacturar } = modulosDescuadrados(r);
    expect(sinEspecificar.map((m) => m.nombre)).toEqual(["Blog"]);
    expect(sinFacturar).toEqual([]);
  });
});
