// El fallo que esto arregla no daba ningún error: la fecha se guardaba, el
// calendario la mostraba, llegaba la hora y no se publicaba nada. Por eso los
// tests miran justo la transición de estado, que es lo único que decide si el
// publicador va a mirar ese video o no.

import { describe, it, expect } from "vitest";
import {
  cambioAlProgramar,
  avisosDeProgramacion,
  resumirAvisos,
} from "./promover-programado.js";

const MANANA = new Date("2026-08-01T15:00:00Z");

describe("poner fecha deja el video programado", () => {
  // El caso exacto del calendario: se arrastra un borrador a otro día.
  it("un borrador con fecha pasa a programado", () => {
    const r = cambioAlProgramar("draft", MANANA);
    expect(r.status).toBe("scheduled");
    expect(r.motivo).toContain("draft");
  });

  it("uno que falló y se reprograma vuelve a la cola", () => {
    expect(cambioAlProgramar("error", MANANA).status).toBe("scheduled");
  });

  it("si ya estaba programado no se toca", () => {
    expect(cambioAlProgramar("scheduled", MANANA).status).toBeNull();
  });

  // Volver a programar algo ya publicado lo publicaría dos veces.
  it("lo ya publicado o subido NO se reprograma solo", () => {
    expect(cambioAlProgramar("published", MANANA).status).toBeNull();
    expect(cambioAlProgramar("uploaded", MANANA).status).toBeNull();
  });

  it("quitar la fecha no degrada el estado", () => {
    // Alguien puede estar limpiando el calendario de algo que ya salió.
    expect(cambioAlProgramar("published", null).status).toBeNull();
    expect(cambioAlProgramar("draft", null).status).toBeNull();
    expect(cambioAlProgramar("scheduled", undefined).status).toBeNull();
  });
});

describe("avisos antes de programar", () => {
  const conTodo = {
    videoFileDriveId: "abc123",
    youtubeTitle: "Título",
    tiktokDescription: "Texto",
    instagramDescription: "Texto",
    linkedinDescription: "Texto",
  };

  it("con todo listo no avisa de nada", () => {
    expect(avisosDeProgramacion(conTodo, ["youtube", "tiktok", "instagram", "linkedin"])).toEqual([]);
  });

  // Sin archivo el publicador marca `skipped` en silencio y la editora se
  // entera cuando ya pasó la hora.
  it("sin archivo avisa de las redes que lo necesitan", () => {
    const avisos = avisosDeProgramacion({ ...conTodo, videoFileDriveId: "" }, ["youtube", "tiktok", "instagram", "linkedin"]);
    expect(avisos.map((a) => a.red).sort()).toEqual(["instagram", "tiktok", "youtube"]);
    expect(avisos.every((a) => a.falta === "el archivo de video")).toBe(true);
  });

  it("LinkedIn no necesita archivo pero sí su propia descripción", () => {
    // No cae a la descripción base: si falta la suya, se omite.
    const avisos = avisosDeProgramacion({ videoFileDriveId: "", description: "base" }, ["linkedin"]);
    expect(avisos).toEqual([{ red: "linkedin", falta: "la descripción" }]);
  });

  it("YouTube se conforma con el título o con la descripción", () => {
    expect(avisosDeProgramacion({ videoFileDriveId: "x", youtubeTitle: "T" }, ["youtube"])).toEqual([]);
    expect(avisosDeProgramacion({ videoFileDriveId: "x", youtubeDescription: "D" }, ["youtube"])).toEqual([]);
    expect(avisosDeProgramacion({ videoFileDriveId: "x" }, ["youtube"])).toHaveLength(1);
  });

  it("un texto en blanco cuenta como que falta", () => {
    expect(avisosDeProgramacion({ videoFileDriveId: "x", tiktokDescription: "   " }, ["tiktok"])).toHaveLength(1);
  });

  it("una red desconocida no inventa avisos", () => {
    expect(avisosDeProgramacion({ videoFileDriveId: "x" }, ["threads"])).toEqual([]);
  });

  it("el resumen agrupa por lo que falta", () => {
    const avisos = avisosDeProgramacion({ videoFileDriveId: "" }, ["youtube", "tiktok", "linkedin"]);
    const texto = resumirAvisos(avisos);
    expect(texto).toContain("youtube, tiktok: falta el archivo de video");
    expect(texto).toContain("linkedin: falta la descripción");
  });

  it("sin avisos el resumen es vacío, no una frase rara", () => {
    expect(resumirAvisos([])).toBe("");
  });
});
