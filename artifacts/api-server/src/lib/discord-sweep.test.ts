import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));
vi.mock("./discord", () => ({
  discordConfigured: vi.fn(() => true),
  voiceStatus: vi.fn(async () => null),
}));

import { db } from "@workspace/db";
import { discordConfigured, voiceStatus } from "./discord";
import { sweepOnce } from "./discord-sweep";

function mockOpenSessions(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "where"]) chain[m] = vi.fn().mockReturnValue(chain);
  chain["then"] = (onF: (v: unknown[]) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onF, onR);
  vi.mocked(db.select).mockReturnValue(chain as never);
}

function mockUpdate() {
  const setFn = vi.fn();
  const whereResult: Record<string, unknown> = {};
  whereResult["then"] = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(undefined).then(onF, onR);
  vi.mocked(db.update).mockReturnValue({
    set: setFn.mockReturnValue({ where: vi.fn().mockReturnValue(whereResult) }),
  } as never);
  return setFn;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(discordConfigured).mockReturnValue(true);
  vi.mocked(voiceStatus).mockResolvedValue(null);
});

describe("sweepOnce (barrido de verificación de voz)", () => {
  const now = new Date("2026-07-24T15:00:00Z");

  it("no hace nada sin token configurado", async () => {
    vi.mocked(discordConfigured).mockReturnValue(false);
    await sweepOnce(now);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("acumula check y hit cuando el usuario está en un canal de voz", async () => {
    mockOpenSessions([{ id: 1, checkIn: new Date("2026-07-24T13:00:00Z"), discordUserId: "42" }]);
    vi.mocked(voiceStatus).mockResolvedValue(true);
    const setFn = mockUpdate();
    await sweepOnce(now);
    expect(voiceStatus).toHaveBeenCalledWith("42", { fresh: true });
    expect(setFn).toHaveBeenCalledTimes(1);
    const arg = (setFn.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    expect(arg).toHaveProperty("discordChecks");
    expect(arg).toHaveProperty("discordHits");
    expect(arg["discordLastSeenAt"]).toEqual(now);
  });

  it("cuenta el check sin hit cuando no está en voz", async () => {
    mockOpenSessions([{ id: 1, checkIn: new Date("2026-07-24T13:00:00Z"), discordUserId: "42" }]);
    vi.mocked(voiceStatus).mockResolvedValue(false);
    const setFn = mockUpdate();
    await sweepOnce(now);
    expect(setFn).toHaveBeenCalledTimes(1);
    const arg = (setFn.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    expect(arg).toHaveProperty("discordChecks");
    expect(arg).not.toHaveProperty("discordHits");
    expect(arg).not.toHaveProperty("discordLastSeenAt");
  });

  it("no solapa dos barridos simultáneos", async () => {
    mockOpenSessions([{ id: 1, checkIn: new Date("2026-07-24T13:00:00Z"), discordUserId: "42" }]);
    vi.mocked(voiceStatus).mockResolvedValue(true);
    mockUpdate();
    await Promise.all([sweepOnce(now), sweepOnce(now)]);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("omite sesiones sin emparejar, las de más de 16 h y las no verificables", async () => {
    mockOpenSessions([
      { id: 1, checkIn: new Date("2026-07-24T13:00:00Z"), discordUserId: null }, // sin emparejar
      { id: 2, checkIn: new Date("2026-07-23T10:00:00Z"), discordUserId: "42" }, // 29 h abierta
      { id: 3, checkIn: new Date("2026-07-24T13:00:00Z"), discordUserId: "77" }, // no verificable (null)
    ]);
    const setFn = mockUpdate();
    await sweepOnce(now);
    expect(voiceStatus).toHaveBeenCalledTimes(1);
    expect(voiceStatus).toHaveBeenCalledWith("77", { fresh: true });
    expect(setFn).not.toHaveBeenCalled();
  });
});
