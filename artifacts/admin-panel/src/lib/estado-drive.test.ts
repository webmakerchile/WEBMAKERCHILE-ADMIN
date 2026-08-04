import { describe, expect, it } from "vitest";
import {
  estadoInicial, alComprobar, alApagar, alResponder, RUTA_CONECTAR_POR_DEFECTO,
} from "./estado-drive";

describe("estado de la autorización de Drive (cerrado por defecto)", () => {
  it("nunca arranca conectado, ni activo ni apagado", () => {
    expect(estadoInicial(true)).toEqual({ conectado: false, cargando: true, conectar: RUTA_CONECTAR_POR_DEFECTO });
    expect(estadoInicial(false).conectado).toBe(false);
    expect(estadoInicial(false).cargando).toBe(false);
  });

  it("re-comprobar olvida el 'conectado' de la vez anterior", () => {
    const conectado = alResponder(estadoInicial(true), { conectado: true });
    const reabierto = alComprobar(conectado);
    // Mientras la comprobación nueva no responda, NO se puede listar.
    expect(reabierto.conectado).toBe(false);
    expect(reabierto.cargando).toBe(true);
  });

  it("un fallo de red o una respuesta no-OK dejan la cuenta desconectada", () => {
    const conectado = alResponder(estadoInicial(true), { conectado: true, conectar: "/api/auth/drive?from=x" });
    const trasFallo = alResponder(alComprobar(conectado), null);
    expect(trasFallo.conectado).toBe(false);
    expect(trasFallo.cargando).toBe(false);
    // La ruta para conectar se conserva: el botón tiene que seguir sirviendo.
    expect(trasFallo.conectar).toBe("/api/auth/drive?from=x");
  });

  it("solo un 'conectado: true' literal de la respuesta actual conecta", () => {
    const base = estadoInicial(true);
    expect(alResponder(base, { conectado: true }).conectado).toBe(true);
    expect(alResponder(base, { conectado: "true" }).conectado).toBe(false);
    expect(alResponder(base, { conectado: 1 }).conectado).toBe(false);
    expect(alResponder(base, {}).conectado).toBe(false);
  });

  it("el ciclo que motivó esto: sesión conectada → cerrar → reabrir con permiso revocado", () => {
    // Sesión que en su día listó archivos con permiso.
    let s = alResponder(estadoInicial(true), { conectado: true });
    expect(s.conectado).toBe(true);
    // Se cierra el explorador sin más.
    s = alApagar(s);
    // Se reabre: la revalidación arranca cerrada…
    s = alComprobar(s);
    expect(s.conectado).toBe(false);
    // …y el permiso ya no está (409/500/red caída): sigue cerrada.
    s = alResponder(s, null);
    expect(s).toMatchObject({ conectado: false, cargando: false });
  });
});
