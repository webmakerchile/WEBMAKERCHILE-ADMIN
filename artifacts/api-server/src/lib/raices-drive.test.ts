// Un id de raíz equivocado no da error: abre el explorador en una carpeta que
// no existe o que no es tuya, y eso se ve exactamente igual que una carpeta
// vacía. Es el mismo fallo que ya tuvimos con los ids escritos a fuego.

import { describe, it, expect } from "vitest";
import { carpetaPropiaDe, idDeRaiz, normalizarRaices, RAICES_POR_DEFECTO, urlDeRaiz } from "./raices-drive";

const ID = "1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB";

describe("id de una carpeta raíz", () => {
  // Pedir "solo el id" garantiza que alguien pegue la URL del navegador, que es
  // lo que se copia de verdad.
  it("acepta la URL además del id suelto", () => {
    expect(idDeRaiz(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID);
    expect(idDeRaiz(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID);
    expect(idDeRaiz(`https://drive.google.com/drive/u/0/folders/${ID}`)).toBe(ID);
    expect(idDeRaiz(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(idDeRaiz(`  ${ID}  `)).toBe(ID);
  });

  it("no se inventa un id de un enlace que no reconoce", () => {
    expect(idDeRaiz("https://ejemplo.cl/carpeta")).toBeNull();
    expect(idDeRaiz("mi carpeta de drive")).toBeNull();
    expect(idDeRaiz("corto")).toBeNull();
    expect(idDeRaiz("")).toBeNull();
    expect(idDeRaiz(null)).toBeNull();
    expect(idDeRaiz(undefined)).toBeNull();
  });
});

describe("normalizar las raíces", () => {
  it("sin nada guardado deja las de arranque", () => {
    expect(normalizarRaices(null)).toEqual(RAICES_POR_DEFECTO);
    expect(normalizarRaices({})).toEqual(RAICES_POR_DEFECTO);
  });

  // Las dos son distintas a propósito: si el explorador de videos abriera en la
  // carpeta del Hub, se llenaría de contratos.
  it("son dos raíces distintas, no una", () => {
    expect(RAICES_POR_DEFECTO.equipo).not.toBe(RAICES_POR_DEFECTO.hub);
  });

  it("guarda el id aunque le peguen la URL", () => {
    const r = normalizarRaices({ equipo: `https://drive.google.com/drive/folders/${ID}` });
    expect(r.equipo).toBe(ID);
  });

  it("un valor inservible cae al de arranque, no a vacío", () => {
    // Dejarlo vacío abriría el explorador en "Mi unidad" entera.
    expect(normalizarRaices({ equipo: "no es una carpeta" }).equipo).toBe(RAICES_POR_DEFECTO.equipo);
    expect(normalizarRaices({ hub: "" }).hub).toBe(RAICES_POR_DEFECTO.hub);
  });

  it("cambiar una no toca la otra", () => {
    const r = normalizarRaices({ equipo: ID });
    expect(r.hub).toBe(RAICES_POR_DEFECTO.hub);
  });
});

describe("enlace para comprobarla a ojo", () => {
  it("abre la carpeta en Drive", () => {
    expect(urlDeRaiz(ID)).toBe(`https://drive.google.com/drive/folders/${ID}`);
  });
});

describe("carpeta propia de un proyecto", () => {
  // Este es el fallback que faltaba: un proyecto vinculado a mano (o creado
  // antes de que existiera `driveFolderId`) solo tiene `link`. Sin esto los
  // archivos subidos caían en la raíz del Hub en vez de en su carpeta.
  it("usa el id ya extraído si está", () => {
    expect(carpetaPropiaDe({ driveFolderId: ID })).toBe(ID);
  });

  it("cae al enlace cuando no hay id propio", () => {
    expect(carpetaPropiaDe({ link: `https://drive.google.com/drive/folders/${ID}` })).toBe(ID);
    expect(carpetaPropiaDe({ driveFolderId: "", link: ID })).toBe(ID);
  });

  it("prioriza el id propio sobre el enlace si ambos están", () => {
    const otro = "z" + ID.slice(1);
    expect(carpetaPropiaDe({ driveFolderId: otro, link: `https://drive.google.com/drive/folders/${ID}` })).toBe(otro);
  });

  it("sin id ni enlace utilizable, no se inventa nada", () => {
    expect(carpetaPropiaDe({})).toBeNull();
    expect(carpetaPropiaDe({ link: "texto suelto sin url" })).toBeNull();
    expect(carpetaPropiaDe(null)).toBeNull();
    expect(carpetaPropiaDe(undefined)).toBeNull();
  });
});
