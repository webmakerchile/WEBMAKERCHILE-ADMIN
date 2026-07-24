import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { _resetDiscordCache, listGuildMembers, resolveGuild, voiceStatus } from "./discord";

const fetchMock = vi.fn();

function jsonRes(status: number, body: unknown) {
  return { status, json: async () => body };
}

const GUILDS_OK = jsonRes(200, [{ id: "g1", name: "WebMakerHub" }]);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env["DISCORD_BOT_TOKEN"] = "aaa.bbb.ccc";
  delete process.env["DISCORD_GUILD_ID"];
  _resetDiscordCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["DISCORD_BOT_TOKEN"];
  delete process.env["DISCORD_GUILD_ID"];
});

describe("voiceStatus (semántica verificable vs no verificable)", () => {
  it("200 con channel_id → true", async () => {
    fetchMock.mockResolvedValueOnce(GUILDS_OK).mockResolvedValueOnce(jsonRes(200, { channel_id: "c9" }));
    expect(await voiceStatus("42")).toBe(true);
  });

  it("200 con channel_id null → false", async () => {
    fetchMock.mockResolvedValueOnce(GUILDS_OK).mockResolvedValueOnce(jsonRes(200, { channel_id: null }));
    expect(await voiceStatus("42")).toBe(false);
  });

  it("404 Unknown Voice State (10065) → false: no está en voz", async () => {
    fetchMock.mockResolvedValueOnce(GUILDS_OK).mockResolvedValueOnce(jsonRes(404, { code: 10065 }));
    expect(await voiceStatus("42")).toBe(false);
  });

  it("404 Unknown Guild (10004) → null: NO verificable, nunca false", async () => {
    fetchMock.mockResolvedValueOnce(GUILDS_OK).mockResolvedValueOnce(jsonRes(404, { code: 10004 }));
    expect(await voiceStatus("42")).toBeNull();
  });

  it("429 rate limit → null (no cuenta como check)", async () => {
    fetchMock.mockResolvedValueOnce(GUILDS_OK).mockResolvedValueOnce(jsonRes(429, { retry_after: 1 }));
    expect(await voiceStatus("42")).toBeNull();
  });

  it("sin token → null sin llamar a la red", async () => {
    delete process.env["DISCORD_BOT_TOKEN"];
    expect(await voiceStatus("42")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveGuild (override por env)", () => {
  it("DISCORD_GUILD_ID presente en la lista del bot → lo usa con nombre", async () => {
    process.env["DISCORD_GUILD_ID"] = "g1";
    fetchMock.mockResolvedValueOnce(GUILDS_OK);
    expect(await resolveGuild()).toEqual({ id: "g1", name: "WebMakerHub" });
  });

  it("DISCORD_GUILD_ID apunta a un servidor donde el bot NO está → null", async () => {
    process.env["DISCORD_GUILD_ID"] = "otro";
    fetchMock.mockResolvedValueOnce(GUILDS_OK);
    expect(await resolveGuild()).toBeNull();
  });

  it("si la lista no se pudo consultar, confía en la env", async () => {
    process.env["DISCORD_GUILD_ID"] = "g9";
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(await resolveGuild()).toEqual({ id: "g9", name: null });
  });

  it("sin env: bot en varios servidores → null (exige la env)", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, [{ id: "a" }, { id: "b" }]));
    expect(await resolveGuild()).toBeNull();
  });
});

describe("listGuildMembers", () => {
  it("filtra bots y pagina cuando hay más de 1000 miembros", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      user: { id: String(i + 1), username: `u${i + 1}` },
    }));
    const page2 = [
      { user: { id: "1001", username: "humana" } },
      { user: { id: "1002", username: "boty", bot: true } },
    ];
    fetchMock
      .mockResolvedValueOnce(GUILDS_OK)
      .mockResolvedValueOnce(jsonRes(200, page1))
      .mockResolvedValueOnce(jsonRes(200, page2));
    const res = await listGuildMembers();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.members).toHaveLength(1001); // 1002 filas − 1 bot
      expect(res.members.at(-1)?.username).toBe("humana");
    }
    const secondUrl = String(fetchMock.mock.calls[2]?.[0] ?? "");
    expect(secondUrl).toContain("after=1000");
  });

  it("403 → reason intent (falta Server Members Intent)", async () => {
    fetchMock.mockResolvedValueOnce(GUILDS_OK).mockResolvedValueOnce(jsonRes(403, { code: 50001 }));
    const res = await listGuildMembers();
    expect(res).toEqual({ ok: false, reason: "intent" });
  });
});
