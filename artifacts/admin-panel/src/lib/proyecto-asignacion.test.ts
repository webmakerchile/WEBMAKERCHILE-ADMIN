// De esto depende quién ve qué. Un fallo aquí no da error: hace que alguien
// vea proyectos que no le tocan, o que deje de ver los suyos y crea que se
// perdieron. Los casos de abajo son los datos que hay HOY en el tablero, donde
// ningún proyecto tiene todavía `assigneeIds`.

import { describe, it, expect } from "vitest";
import {
  asignadosDe,
  esMio,
  misProyectos,
  tieneAsignados,
  alternarAsignado,
  idDeCarpeta,
  carpetaDe,
  nombreDeCarpeta,
} from "./proyecto-asignacion";

const proyecto = (p: Partial<Parameters<typeof esMio>[0]> = {}) => ({ id: "p1", ...p });

describe("quién tiene asignado un proyecto", () => {
  it("lee los ids y los deja limpios", () => {
    expect(asignadosDe(proyecto({ assigneeIds: [3, 1, 3, 2] }))).toEqual([1, 2, 3]);
  });

  it("descarta lo que no es un id de usuario", () => {
    // El blob no valida nada, así que puede llegar cualquier cosa.
    expect(asignadosDe(proyecto({ assigneeIds: [1, 0, -2, 1.5, NaN, null, "3"] as never }))).toEqual([1, 3]);
  });

  it("sin lista no revienta", () => {
    expect(asignadosDe(proyecto())).toEqual([]);
    expect(asignadosDe(null)).toEqual([]);
    expect(asignadosDe(proyecto({ assigneeIds: "no-es-lista" as never }))).toEqual([]);
  });
});

describe("de quién es un proyecto", () => {
  it("de quien está asignado", () => {
    const p = proyecto({ assigneeIds: [7, 9] });
    expect(esMio(p, 7)).toBe(true);
    expect(esMio(p, 9)).toBe(true);
    expect(esMio(p, 4)).toBe(false);
  });

  // Es el caso de TODOS los proyectos que ya existen: no tienen assigneeIds.
  // Tratarlos como "de nadie" los haría desaparecer de la vista de todo el
  // equipo el día que esto se despliegue.
  it("un proyecto sin asignar es de todos", () => {
    expect(esMio(proyecto(), 7)).toBe(true);
    expect(esMio(proyecto({ assigneeIds: [] }), 7)).toBe(true);
    expect(esMio(proyecto(), null)).toBe(true);
  });

  it("sin sesión no se cuela en un proyecto ajeno", () => {
    expect(esMio(proyecto({ assigneeIds: [7] }), null)).toBe(false);
    expect(esMio(proyecto({ assigneeIds: [7] }), undefined)).toBe(false);
  });

  it("filtrar devuelve los propios y los sin asignar", () => {
    const lista = [
      proyecto({ id: "a", assigneeIds: [7] }),
      proyecto({ id: "b", assigneeIds: [9] }),
      proyecto({ id: "c" }),
    ];
    expect(misProyectos(lista, 7).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("saber si el filtro dice algo", () => {
    expect(tieneAsignados(proyecto({ assigneeIds: [1] }))).toBe(true);
    expect(tieneAsignados(proyecto())).toBe(false);
  });
});

describe("cambiar la asignación", () => {
  it("añade y quita", () => {
    expect(alternarAsignado([1, 2], 3)).toEqual([1, 2, 3]);
    expect(alternarAsignado([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("desde vacío o sin lista", () => {
    expect(alternarAsignado(undefined, 5)).toEqual([5]);
    expect(alternarAsignado([], 5)).toEqual([5]);
  });

  // El tablero se guarda entero: mutar en sitio hace que el diff no vea el
  // cambio y el guardado se pierda en silencio.
  it("no muta la lista original", () => {
    const original = [1, 2];
    alternarAsignado(original, 3);
    expect(original).toEqual([1, 2]);
  });
});

describe("carpeta de Drive del proyecto", () => {
  const ID = "1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB";

  it("saca el id de las formas en que se guardó", () => {
    // Las tres aparecen en los datos que ya hay: quien pegó el enlace no tenía
    // por qué saber cuál era la buena.
    expect(idDeCarpeta(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID);
    expect(idDeCarpeta(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID);
    expect(idDeCarpeta(`https://drive.google.com/drive/u/0/folders/${ID}`)).toBe(ID);
    expect(idDeCarpeta(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(idDeCarpeta(ID)).toBe(ID);
  });

  it("no se inventa un id a partir de un enlace que no reconoce", () => {
    // Quedarse con un trozo cualquiera daría una carpeta que no existe, y el
    // explorador saldría vacío sin decir por qué.
    expect(idDeCarpeta("https://ejemplo.cl/algo/otra-cosa")).toBeNull();
    expect(idDeCarpeta("no es un enlace")).toBeNull();
    expect(idDeCarpeta("")).toBeNull();
    expect(idDeCarpeta(null)).toBeNull();
    expect(idDeCarpeta("corto")).toBeNull();
  });

  it("el campo tipado manda sobre el enlace viejo", () => {
    expect(carpetaDe({ id: "p", driveFolderId: ID, link: "https://otra.cosa" })).toBe(ID);
    expect(carpetaDe({ id: "p", link: `https://drive.google.com/drive/folders/${ID}` })).toBe(ID);
    expect(carpetaDe({ id: "p" })).toBeNull();
  });
});

describe("nombre de la carpeta que se crea", () => {
  it("lleva el cliente: dos clientes piden 'Landing' el mismo mes", () => {
    expect(nombreDeCarpeta("Landing", "M&M Moda")).toBe("Landing — M&M Moda");
    expect(nombreDeCarpeta("Landing")).toBe("Landing");
  });

  it("quita lo que Drive no admite en un nombre", () => {
    expect(nombreDeCarpeta("Web/2026: v2*")).toBe("Web-2026- v2-");
  });

  it("no se queda sin nombre", () => {
    expect(nombreDeCarpeta("")).toBe("Proyecto");
    expect(nombreDeCarpeta("   ")).toBe("Proyecto");
  });

  it("acota el largo", () => {
    expect(nombreDeCarpeta("x".repeat(300), "y".repeat(300)).length).toBe(120);
  });
});
