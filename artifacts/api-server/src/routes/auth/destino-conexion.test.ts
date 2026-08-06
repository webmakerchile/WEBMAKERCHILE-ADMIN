// Al conectar Drive hay que volver a la página desde donde se pidió.
//
// El callback mandaba SIEMPRE a /cuentas, que es justo la página a la que el
// ejecutivo comercial no tiene acceso: conectaba Drive y aterrizaba en un
// "acceso restringido". Y el destino no puede salir tal cual de la URL, porque
// entonces cualquiera podría usar el enlace de conexión para mandar a un
// usuario autenticado a un sitio externo.

import { describe, it, expect } from "vitest";
import { destinoSeguro, DESTINOS_CONEXION } from "./index.js";

describe("destino tras conectar Google", () => {
  it("acepta las páginas del panel donde se usa Drive", () => {
    for (const destino of DESTINOS_CONEXION) {
      expect(destinoSeguro(destino), `${destino} debería aceptarse`).toBe(destino);
    }
  });

  it("acepta el nombre sin la barra inicial", () => {
    expect(destinoSeguro("contratos")).toBe("/contratos");
    expect(destinoSeguro("drive-hub")).toBe("/drive-hub");
  });

  it("rechaza cualquier destino externo", () => {
    // Un redirect abierto: el enlace lo abre alguien ya autenticado.
    for (const malo of [
      "https://otro-sitio.cl",
      "//otro-sitio.cl",
      "/../../etc",
      "javascript:alert(1)",
      "/pagina-inventada",
    ]) {
      expect(destinoSeguro(malo), `${malo} NO debería aceptarse`).toBe("/cuentas");
    }
  });

  it("sin destino cae en un sitio seguro", () => {
    expect(destinoSeguro(undefined)).toBe("/cuentas");
    expect(destinoSeguro(null)).toBe("/cuentas");
    expect(destinoSeguro(123)).toBe("/cuentas");
    expect(destinoSeguro("")).toBe("/cuentas");
  });
});
