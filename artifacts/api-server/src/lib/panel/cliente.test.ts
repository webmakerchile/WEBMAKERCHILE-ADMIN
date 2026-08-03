import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { panelGet, panelPost, PanelError } from "./cliente";

/**
 * Cliente HTTP del panel: lo que importa es la política de reintentos.
 * - transitorios (red, 5xx, 429 con Retry-After) reintentan con espera
 * - 4xx es firme y llega con el código/mensaje original del panel
 * - sin llave configurada no se intenta nada
 */

const fetchMock = vi.fn();

const respuesta = (status: number, cuerpo: unknown, headers: Record<string, string> = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => cuerpo,
  }) as unknown as Response;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.WEBMAKER_PANEL_API_KEY = "llave-de-prueba";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("panel/cliente", () => {
  it("devuelve el cuerpo en un 200 y manda la llave como Bearer", async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { ok: true, datos: [1, 2] }));
    const r = await panelGet<{ ok: boolean; datos: number[] }>("/clientes");
    expect(r.datos).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer llave-de-prueba");
  });

  it("un 200 con cuerpo no-JSON es firme: respuesta_invalida (ruta que el panel aún no publica)", async () => {
    // El frontend del panel atrapa rutas inexistentes y devuelve su HTML con 200.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    } as unknown as Response);
    const err = await panelPost("/contratos-servicio/redactar-ia", {}).catch((e) => e as PanelError);
    expect(err).toBeInstanceOf(PanelError);
    expect((err as PanelError).status).toBe(502);
    expect((err as PanelError).codigo).toBe("respuesta_invalida");
    expect(fetchMock).toHaveBeenCalledTimes(1); // firme: sin reintentos
  });

  it("reintenta en 5xx y termina bien si el panel se recupera", async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta(500, null))
      .mockResolvedValueOnce(respuesta(502, null))
      .mockResolvedValueOnce(respuesta(200, { ok: true }));
    const promesa = panelGet<{ ok: boolean }>("/resumen");
    const atrapada = promesa.catch((e) => e as PanelError);
    await vi.advanceTimersByTimeAsync(1_000); // primera espera
    await vi.advanceTimersByTimeAsync(3_000); // segunda espera
    const r = await atrapada;
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("respeta Retry-After en un 429", async () => {
    fetchMock
      .mockResolvedValueOnce(respuesta(429, { error: "rate_limited" }, { "retry-after": "2" }))
      .mockResolvedValueOnce(respuesta(200, { ok: true }));
    const promesa = panelGet<{ ok: boolean }>("/clientes");
    const atrapada = promesa.catch((e) => e as PanelError);
    await vi.advanceTimersByTimeAsync(2_000);
    const r = await atrapada;
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("un 4xx es firme: sin reintentos y con el mensaje original del panel", async () => {
    fetchMock.mockResolvedValueOnce(
      respuesta(409, { ok: false, error: "transicion_no_permitida", mensaje: "El contrato ya está firmado." })
    );
    const err = (await panelPost("/contratos-servicio", {}).catch((e) => e)) as PanelError;
    expect(err).toBeInstanceOf(PanelError);
    expect(err.status).toBe(409);
    expect(err.codigo).toBe("transicion_no_permitida");
    expect(err.message).toBe("El contrato ya está firmado.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("con la red caída agota los reintentos y avisa panel_inalcanzable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const promesa = panelGet("/clientes");
    const atrapada: Promise<PanelError> = promesa.then(
      () => Promise.reject(new Error("no debía resolver")),
      (e) => e as PanelError
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(9_000);
    const err = await atrapada;
    expect(err).toBeInstanceOf(PanelError);
    expect(err.status).toBe(502);
    expect(err.codigo).toBe("panel_inalcanzable");
    expect(fetchMock).toHaveBeenCalledTimes(4); // intento + 3 reintentos
  });

  it("sin llave configurada corta al tiro con sin_credencial", async () => {
    delete process.env.WEBMAKER_PANEL_API_KEY;
    const err = (await panelGet("/clientes").catch((e) => e)) as PanelError;
    expect(err).toBeInstanceOf(PanelError);
    expect(err.status).toBe(503);
    expect(err.codigo).toBe("sin_credencial");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
