import { describe, expect, it } from "vitest";
import { AUTO_RESTART_GRACE_MS, shouldAutoStart } from "./discord-sweep";

const now = new Date("2026-07-26T13:00:00Z");

describe("shouldAutoStart", () => {
  it("abre jornada si está en voz, sin sesión abierta y sin salida reciente", () => {
    expect(shouldAutoStart({ inVoice: true, hasOpenSession: false, lastCheckOutAt: null, now })).toBe(true);
  });

  it("no abre si no está en voz", () => {
    expect(shouldAutoStart({ inVoice: false, hasOpenSession: false, lastCheckOutAt: null, now })).toBe(false);
  });

  it("no abre si Discord no es verificable (null ≠ false)", () => {
    expect(shouldAutoStart({ inVoice: null, hasOpenSession: false, lastCheckOutAt: null, now })).toBe(false);
  });

  it("no abre si ya tiene una jornada abierta", () => {
    expect(shouldAutoStart({ inVoice: true, hasOpenSession: true, lastCheckOutAt: null, now })).toBe(false);
  });

  it("respeta la gracia tras marcar salida (no reabre enseguida)", () => {
    const lastCheckOutAt = new Date(now.getTime() - AUTO_RESTART_GRACE_MS + 60_000);
    expect(shouldAutoStart({ inVoice: true, hasOpenSession: false, lastCheckOutAt, now })).toBe(false);
  });

  it("pasada la gracia vuelve a abrir (regreso de almuerzo)", () => {
    const lastCheckOutAt = new Date(now.getTime() - AUTO_RESTART_GRACE_MS - 60_000);
    expect(shouldAutoStart({ inVoice: true, hasOpenSession: false, lastCheckOutAt, now })).toBe(true);
  });
});
