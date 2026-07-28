import { describe, it, expect } from "vitest";
import {
  planReprogramacion,
  motivoReprogramacionInvalida,
  redesReprogramables,
  estadoDeRed,
  MOTIVO_FUERA_DE_REPROGRAMACION,
} from "./reprogramar";

const FUTURO = () => new Date(Date.now() + 60 * 60 * 1000);

/** Fila mínima: todo pendiente salvo lo que se sobrescriba. */
function video(over: Record<string, unknown> = {}) {
  return {
    youtubeStatus: "pending", tiktokStatus: "pending", instagramStatus: "pending",
    linkedinStatus: "pending", xStatus: "pending", facebookStatus: "pending",
    ...over,
  };
}

describe("estadoDeRed", () => {
  it("lee publicada del id del post, no solo del status", () => {
    expect(estadoDeRed(video({ xPostId: "123", xStatus: "pending" }), "x")).toBe("publicada");
  });

  // "uploaded" es el estado de TikTok/YouTube cuando el archivo ya se subió y
  // falta la confirmación. Volver a intentarlo sube el video una segunda vez.
  it("trata 'uploaded' como publicada", () => {
    expect(estadoDeRed(video({ tiktokStatus: "uploaded" }), "tiktok")).toBe("publicada");
    expect(estadoDeRed(video({ youtubeStatus: "uploaded" }), "youtube")).toBe("publicada");
  });

  it("distingue error, omitida, reintentando y pendiente", () => {
    expect(estadoDeRed(video({ xStatus: "error" }), "x")).toBe("error");
    expect(estadoDeRed(video({ xStatus: "skipped" }), "x")).toBe("omitida");
    expect(estadoDeRed(video({ xStatus: "retrying" }), "x")).toBe("reintentando");
    expect(estadoDeRed(video(), "x")).toBe("pendiente");
  });
});

describe("planReprogramacion", () => {
  it("deja la red marcada lista para un intento nuevo", () => {
    // El caso que importa: "error" bloquea la red de por vida vía
    // isTerminalError, así que reprogramar TIENE que limpiarlo.
    const v = video({ xStatus: "error", xError: "credits depleted", xRetries: 3, xNextRetryAt: new Date() });
    const plan = planReprogramacion(v, FUTURO(), ["x"]);
    expect(plan.cambios.xStatus).toBe("pending");
    expect(plan.cambios.xError).toBeNull();
    expect(plan.cambios.xRetries).toBe(0);
    expect(plan.cambios.xNextRetryAt).toBeNull();
    expect(plan.reintentadas).toEqual(["x"]);
  });

  it("recupera una red que quedó omitida por faltarle la descripción", () => {
    const v = video({ tiktokStatus: "skipped", tiktokError: "Falta la descripción de TikTok" });
    const plan = planReprogramacion(v, FUTURO(), ["tiktok"]);
    expect(plan.cambios.tiktokStatus).toBe("pending");
    expect(plan.cambios.tiktokError).toBeNull();
  });

  it("nunca reintenta una red ya publicada, aunque venga marcada", () => {
    const v = video({ instagramStatus: "published", instagramMediaId: "ig_1" });
    const plan = planReprogramacion(v, FUTURO(), ["instagram", "x"]);
    expect(plan.yaPublicadas).toEqual(["instagram"]);
    expect(plan.reintentadas).toEqual(["x"]);
    expect(plan.cambios.instagramStatus).toBeUndefined();
    expect(plan.cambios.instagramMediaId).toBeUndefined();
  });

  // Sin esto la casilla sin marcar sería decorativa: el scheduler publicaría
  // igual todo lo que siguiera en "pending".
  it("excluye con motivo escrito las redes vivas que no se marcaron", () => {
    const plan = planReprogramacion(video(), FUTURO(), ["x"]);
    expect(plan.excluidas.sort()).toEqual(["facebook", "instagram", "linkedin", "tiktok", "youtube"]);
    expect(plan.cambios.youtubeStatus).toBe("skipped");
    expect(plan.cambios.youtubeError).toBe(MOTIVO_FUERA_DE_REPROGRAMACION);
  });

  it("no reescribe el motivo de una red que ya estaba omitida", () => {
    const v = video({ facebookStatus: "skipped", facebookError: "Red no elegida por el usuario" });
    const plan = planReprogramacion(v, FUTURO(), ["x"]);
    expect(plan.cambios.facebookError).toBeUndefined();
    expect(plan.excluidas).not.toContain("facebook");
  });

  it("devuelve el video a estado programado y limpia el cooldown global", () => {
    const cuando = FUTURO();
    const plan = planReprogramacion(video({ status: "partial", nextRetryAt: new Date() }), cuando, ["x"]);
    expect(plan.cambios.status).toBe("scheduled");
    expect(plan.cambios.workflowStatus).toBe("programado");
    expect(plan.cambios.scheduledAt).toBe(cuando);
    expect(plan.cambios.nextRetryAt).toBeNull();
  });
});

describe("motivoReprogramacionInvalida", () => {
  it("acepta una reprogramación normal", () => {
    expect(motivoReprogramacionInvalida(video(), FUTURO(), ["x"])).toBeNull();
  });

  it("rechaza fechas pasadas, inválidas y sin redes", () => {
    expect(motivoReprogramacionInvalida(video(), new Date(Date.now() - 1000), ["x"])).toMatch(/futura/);
    expect(motivoReprogramacionInvalida(video(), new Date("no-es-fecha"), ["x"])).toMatch(/no es válida/);
    expect(motivoReprogramacionInvalida(video(), FUTURO(), [])).toMatch(/al menos una red/);
  });

  it("rechaza cuando todo lo marcado ya está publicado", () => {
    const v = video({ xPostId: "1", instagramMediaId: "2" });
    expect(motivoReprogramacionInvalida(v, FUTURO(), ["x", "instagram"])).toMatch(/ya están publicadas/);
  });
});

describe("redesReprogramables", () => {
  it("marca como no reprogramable solo lo ya publicado", () => {
    const v = video({ youtubeVideoId: "yt1", xStatus: "error", xError: "401" });
    const redes = redesReprogramables(v);
    expect(redes.find((r) => r.plataforma === "youtube")).toMatchObject({ estado: "publicada", reprogramable: false });
    expect(redes.find((r) => r.plataforma === "x")).toMatchObject({ estado: "error", reprogramable: true, detalle: "401" });
    expect(redes).toHaveLength(6);
  });
});
