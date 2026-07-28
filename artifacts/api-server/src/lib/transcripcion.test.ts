import { describe, it, expect } from "vitest";
import {
  decidirArchivo,
  explicarFalloTranscripcion,
  requiereIntervencion,
  LIMITE_SUBIDA_BYTES,
} from "./transcripcion";

const UN_MB = 1024 * 1024;

describe("decidirArchivo", () => {
  it("acepta los formatos de siempre por su extensión", () => {
    for (const nombre of ["reunion.mp3", "nota.m4a", "audio.OGG", "voz.opus", "clip.mp4"]) {
      const d = decidirArchivo({ nombre, mime: null, bytes: UN_MB });
      expect(d.ok, `rechazó ${nombre}`).toBe(true);
    }
  });

  // El fallo que se veía como "a veces falla": una nota de voz descargada de
  // WhatsApp llega sin extensión y se rechazaba con "formato desconocido"
  // aunque el MIME la identificara perfectamente.
  it("acepta por MIME cuando el nombre no trae extensión, renombrando", () => {
    const d = decidirArchivo({ nombre: "audio", mime: "audio/ogg; codecs=opus", bytes: UN_MB });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.nombre).toBe("audio.ogg");
      expect(d.renombrado).toBe(true);
    }
  });

  it("acepta por MIME cuando la extensión es la equivocada", () => {
    // Los mensajeros guardan m4a como ".bin" más veces de las que parece.
    const d = decidirArchivo({ nombre: "grabacion.bin", mime: "audio/mp4", bytes: UN_MB });
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.nombre).toBe("grabacion.m4a");
  });

  it("ignora los parámetros del MIME en vez de descartar por ellos", () => {
    const d = decidirArchivo({ nombre: "x", mime: "audio/webm;codecs=opus", bytes: UN_MB });
    expect(d.ok).toBe(true);
  });

  it("rechaza lo que de verdad no se puede transcribir, diciendo qué sí vale", () => {
    const d = decidirArchivo({ nombre: "informe.pdf", mime: "application/pdf", bytes: UN_MB });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.motivo).toContain(".mp3");
      expect(d.motivo).toContain("pdf");
    }
  });

  it("explica el rechazo por tamaño con la cifra real", () => {
    const d = decidirArchivo({ nombre: "largo.mp3", mime: null, bytes: LIMITE_SUBIDA_BYTES + UN_MB });
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.motivo).toContain("151 MB");
      expect(d.motivo).toContain("150");
    }
  });

  it("rechaza el archivo vacío en vez de mandarlo al servicio", () => {
    expect(decidirArchivo({ nombre: "a.mp3", mime: null, bytes: 0 }).ok).toBe(false);
  });

  it("no revienta con un nombre raro", () => {
    expect(decidirArchivo({ nombre: "  ", mime: "audio/mpeg", bytes: UN_MB }).ok).toBe(true);
    expect(decidirArchivo({ nombre: ".mp3", mime: null, bytes: UN_MB }).ok).toBe(true);
  });
});

describe("explicarFalloTranscripcion", () => {
  it("convierte los fallos conocidos en algo accionable", () => {
    expect(explicarFalloTranscripcion("Groq error 401: Invalid API Key")).toMatch(/clave de Groq/);
    expect(explicarFalloTranscripcion("Groq respondió 429")).toMatch(/limitando/);
    expect(explicarFalloTranscripcion("ffmpeg falló (código 1): moov atom not found")).toMatch(/dañado/);
    expect(explicarFalloTranscripcion("ENOSPC: no space left on device")).toMatch(/espacio/);
  });

  // Inventar una explicación manda a la persona a arreglar lo que no está roto.
  it("deja pasar tal cual lo que no reconoce", () => {
    const raro = "Algo muy específico que nadie previó";
    expect(explicarFalloTranscripcion(raro)).toBe(raro);
  });

  it("dice algo útil cuando no hay mensaje", () => {
    expect(explicarFalloTranscripcion("")).toMatch(/sin decir por qué/);
  });
});

describe("requiereIntervencion", () => {
  it("distingue lo que se arregla reintentando de lo que no", () => {
    expect(requiereIntervencion("Groq error 401: Invalid API Key")).toBe(true);
    expect(requiereIntervencion("ENOSPC: no space left")).toBe(true);
    expect(requiereIntervencion("Groq respondió 429")).toBe(false);
    expect(requiereIntervencion("Error de red: fetch failed")).toBe(false);
  });
});
