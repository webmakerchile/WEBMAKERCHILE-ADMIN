import { describe, it, expect } from "vitest";
import {
  countSession, formatDuration, planSessionActions, sessionSeconds, sumSessions,
  DEFAULT_GRACE_MINUTES, MAX_SESSION_HOURS,
  type OpenSession, type VoicePresence,
} from "./jornada";

const AHORA = new Date("2026-07-27T15:00:00Z");
const min = (n: number) => n * 60_000;
const hace = (ms: number) => new Date(AHORA.getTime() - ms);

const abierta = (over: Partial<OpenSession> = {}): OpenSession => ({
  id: 1, userId: 7, channelId: "voz-1",
  startedAt: hace(min(120)), lastSeenAt: hace(min(1)),
  ...over,
});

const conectada = (channelId: string | null = "voz-1"): VoicePresence => ({ userId: 7, channelId, channelName: "Sala de trabajo" });

describe("jornada por presencia en Discord", () => {
  it("abre la jornada sola cuando la persona entra al canal de voz", () => {
    const acciones = planSessionActions([conectada()], [], AHORA);
    expect(acciones).toEqual([
      { kind: "open", userId: 7, channelId: "voz-1", channelName: "Sala de trabajo", at: AHORA },
    ]);
  });

  it("mientras sigue conectada solo confirma la presencia, no abre otra sesión", () => {
    const acciones = planSessionActions([conectada()], [abierta()], AHORA);
    expect(acciones).toHaveLength(1);
    expect(acciones[0].kind).toBe("touch");
  });

  it("un corte breve no parte la jornada en pedazos", () => {
    // Se desconectó hace 1 minuto: por debajo de la tolerancia, no se cierra.
    const acciones = planSessionActions([conectada(null)], [abierta({ lastSeenAt: hace(min(1)) })], AHORA);
    expect(acciones).toHaveLength(0);
  });

  it("cierra cuando la ausencia supera la tolerancia", () => {
    const sesion = abierta({ startedAt: hace(min(120)), lastSeenAt: hace(min(DEFAULT_GRACE_MINUTES + 1)) });
    const [accion] = planSessionActions([conectada(null)], [sesion], AHORA);
    expect(accion.kind).toBe("close");
    if (accion.kind !== "close") throw new Error("se esperaba un cierre");
    // Cuenta hasta la última presencia confirmada, no hasta ahora.
    expect(accion.endedAt).toEqual(sesion.lastSeenAt);
    expect(accion.durationSeconds).toBe(sessionSeconds(sesion.startedAt, sesion.lastSeenAt));
  });

  it("no cuenta el tiempo que la persona estuvo desconectada", () => {
    const sesion = abierta({ startedAt: hace(min(60)), lastSeenAt: hace(min(30)) });
    const [accion] = planSessionActions([conectada(null)], [sesion], AHORA);
    if (accion.kind !== "close") throw new Error("se esperaba un cierre");
    // Media hora trabajada, media hora ausente: se pagan 30 minutos.
    expect(accion.durationSeconds).toBe(30 * 60);
  });

  it("cierra la sesión de quien ya no se puede consultar (se desvinculó o salió del servidor)", () => {
    // No viene en `presences` en absoluto.
    const sesion = abierta({ lastSeenAt: hace(min(10)) });
    const [accion] = planSessionActions([], [sesion], AHORA);
    expect(accion?.kind).toBe("close");
  });

  it("un fallo de consulta no cierra una jornada viva", () => {
    // El sondeo omite a quien no pudo consultar; con presencia reciente, aguanta.
    const sesion = abierta({ lastSeenAt: hace(min(1)) });
    expect(planSessionActions([], [sesion], AHORA)).toHaveLength(0);
  });

  it("cierra sola la jornada de quien dejó Discord abierto toda la noche", () => {
    const sesion = abierta({
      startedAt: hace((MAX_SESSION_HOURS + 2) * 3_600_000),
      lastSeenAt: hace(min(1)), // sigue "conectado"
    });
    const acciones = planSessionActions([conectada()], [sesion], AHORA);
    expect(acciones.some(a => a.kind === "close")).toBe(true);
  });

  it("no cierra dos veces la misma sesión", () => {
    const sesion = abierta({
      startedAt: hace((MAX_SESSION_HOURS + 2) * 3_600_000),
      lastSeenAt: hace(min(30)),
    });
    const cierres = planSessionActions([conectada(null)], [sesion], AHORA).filter(a => a.kind === "close");
    expect(cierres).toHaveLength(1);
  });

  it("cada persona se resuelve por separado", () => {
    const acciones = planSessionActions(
      [{ userId: 1, channelId: "voz-1" }, { userId: 2, channelId: null }],
      [abierta({ id: 9, userId: 2, lastSeenAt: hace(min(10)) })],
      AHORA,
    );
    expect(acciones.find(a => a.kind === "open")).toBeTruthy();
    expect(acciones.find(a => a.kind === "close")).toBeTruthy();
  });
});

describe("conteo de tiempo", () => {
  it("una sesión cerrada usa su duración congelada", () => {
    expect(countSession(
      { startedAt: hace(min(60)), endedAt: hace(min(30)), lastSeenAt: hace(min(30)), durationSeconds: 1800 },
      AHORA,
    )).toBe(1800);
  });

  it("una sesión abierta corre en vivo", () => {
    const s = { startedAt: hace(min(45)), endedAt: null, lastSeenAt: hace(min(1)), durationSeconds: 0 };
    expect(countSession(s, AHORA)).toBe(45 * 60);
  });

  it("si el sondeo se cae, el reloj deja de correr solo", () => {
    // Última presencia hace 2 horas: solo se cuenta hasta esa marca + tolerancia.
    const s = { startedAt: hace(min(180)), endedAt: null, lastSeenAt: hace(min(120)), durationSeconds: 0 };
    const esperado = (180 - 120 + DEFAULT_GRACE_MINUTES) * 60;
    expect(countSession(s, AHORA)).toBe(esperado);
  });

  it("suma solo las sesiones del rango pedido", () => {
    const sesiones = [
      { startedAt: hace(min(30)), endedAt: hace(min(10)), lastSeenAt: hace(min(10)), durationSeconds: 1200 },
      { startedAt: new Date("2026-07-20T10:00:00Z"), endedAt: new Date("2026-07-20T12:00:00Z"), lastSeenAt: new Date("2026-07-20T12:00:00Z"), durationSeconds: 7200 },
    ];
    const desdeHoy = new Date("2026-07-27T00:00:00Z");
    expect(sumSessions(sesiones, desdeHoy, AHORA, AHORA)).toBe(1200);
  });

  it("formatea como en pantalla", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(59)).toBe("0m");
    expect(formatDuration(60 * 48)).toBe("48m");
    expect(formatDuration(3600 * 13 + 60 * 57)).toBe("13h 57m");
  });

  it("nunca devuelve tiempo negativo", () => {
    expect(sessionSeconds(AHORA, hace(min(10)))).toBe(0);
    expect(formatDuration(-500)).toBe("0m");
  });
});
