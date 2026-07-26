import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendDirectMessage, _resetDiscordCache } from "./discord";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DISCORD_BOT_TOKEN", "test-token");
  fetchMock.mockReset();
  _resetDiscordCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function jsonResponse(status: number, body: unknown = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("sendDirectMessage", () => {
  it("crea el canal DM y envía el mensaje", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "ch1" })) // create DM channel
      .mockResolvedValueOnce(jsonResponse(200, { id: "m1" })); // send message
    expect(await sendDirectMessage("u1", "hola")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("NO cachea fallos transitorios al crear el canal: el siguiente aviso reintenta", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500)); // fallo transitorio
    expect(await sendDirectMessage("u1", "hola")).toBe(false);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "ch1" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "m1" }));
    expect(await sendDirectMessage("u1", "hola de nuevo")).toBe(true);
    // 1 (fallo) + 2 (create + send): el create se reintentó, no quedó null cacheado.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("descarta el canal cacheado si el envío devuelve 404 y recrea al siguiente intento", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "ch-viejo" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "m1" }));
    expect(await sendDirectMessage("u1", "primero")).toBe(true);

    // Canal cacheado ya no existe → 404 al enviar.
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { code: 10003 }));
    expect(await sendDirectMessage("u1", "segundo")).toBe(false);

    // Tercer intento: debe RECREAR el canal (no reutilizar el inválido).
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: "ch-nuevo" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "m2" }));
    expect(await sendDirectMessage("u1", "tercero")).toBe(true);
    const createCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/users/@me/channels"));
    expect(createCalls.length).toBe(2);
  });

  it("devuelve false sin token y no llama a la red", async () => {
    vi.stubEnv("DISCORD_BOT_TOKEN", "");
    expect(await sendDirectMessage("u1", "hola")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
