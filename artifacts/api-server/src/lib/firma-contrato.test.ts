// Este enlace lo abre alguien SIN sesión y con él se da por aceptado un
// contrato. Los fallos que importan no son visuales: dejar firmar dos veces,
// aceptar un enlace caducado, o guardar la IP del proxy en vez de la del
// cliente — que vacía de sentido el único registro que esto produce.

import { describe, it, expect } from "vitest";
import {
  generarToken,
  tokenValido,
  motivoNoFirmable,
  TEXTO_RECHAZO,
  caducidad,
  DIAS_VIGENCIA,
  ipDeLaPeticion,
  limpiarNombreFirmante,
  nombreFirmanteValido,
  urlDeFirma,
  validarFirma,
  MAX_FIRMA_DATA,
  type EnlaceFirma,
} from "./firma-contrato.js";

const AHORA = new Date("2026-08-01T12:00:00Z");
const enlace = (p: Partial<EnlaceFirma> = {}): EnlaceFirma => ({
  token: generarToken(),
  estado: "pendiente",
  expiresAt: new Date("2026-09-01T12:00:00Z").toISOString(),
  signedAt: null,
  ...p,
});

describe("token del enlace", () => {
  // Quien recibe el enlace firma sin identificarse: adivinar el token
  // equivaldría a firmar en nombre de otro.
  it("es largo e impredecible", () => {
    const a = generarToken();
    const b = generarToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(tokenValido(a)).toBe(true);
  });

  it("no lleva caracteres que se rompan en una URL", () => {
    for (let i = 0; i < 40; i++) {
      expect(generarToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("rechaza tokens con otra forma", () => {
    for (const malo of ["", "corto", "12345", null, undefined, 42, "a".repeat(200), "con/barra"]) {
      expect(tokenValido(malo), String(malo)).toBe(false);
    }
  });
});

describe("cuándo se puede firmar", () => {
  it("un enlace pendiente y vigente sí", () => {
    expect(motivoNoFirmable(enlace(), AHORA)).toBeNull();
  });

  it("uno sin caducidad no caduca", () => {
    expect(motivoNoFirmable(enlace({ expiresAt: null }), AHORA)).toBeNull();
  });

  it("un enlace inexistente no firma nada", () => {
    expect(motivoNoFirmable(null, AHORA)).toBe("no_existe");
    expect(motivoNoFirmable(undefined, AHORA)).toBe("no_existe");
  });

  it("uno caducado se rechaza", () => {
    expect(motivoNoFirmable(enlace({ expiresAt: "2026-07-01T00:00:00Z" }), AHORA)).toBe("caducado");
  });

  // Firmar dos veces dejaría dos registros contradictorios del mismo documento.
  it("uno ya firmado no se vuelve a firmar", () => {
    expect(motivoNoFirmable(enlace({ estado: "firmado" }), AHORA)).toBe("ya_firmado");
  });

  // Si algo falló a medias, el estado puede no haberse actualizado pero la
  // fecha sí: mirar solo el estado dejaría firmar otra vez.
  it("con fecha de firma cuenta como firmado aunque el estado diga otra cosa", () => {
    expect(motivoNoFirmable(enlace({ estado: "pendiente", signedAt: "2026-07-20T10:00:00Z" }), AHORA))
      .toBe("ya_firmado");
  });

  it("uno anulado no firma, aunque siga vigente", () => {
    expect(motivoNoFirmable(enlace({ estado: "anulado" }), AHORA)).toBe("anulado");
  });

  it("cada rechazo tiene un texto para el cliente, no para el equipo", () => {
    for (const motivo of ["no_existe", "caducado", "ya_firmado", "anulado"] as const) {
      expect(TEXTO_RECHAZO[motivo].length).toBeGreaterThan(20);
    }
  });

  it("justo en el instante de caducar ya no se puede", () => {
    expect(motivoNoFirmable(enlace({ expiresAt: AHORA.toISOString() }), AHORA)).toBe("caducado");
  });
});

describe("vigencia", () => {
  it("por defecto dura los días previstos", () => {
    const d = caducidad(undefined, AHORA);
    expect(Math.round((d.getTime() - AHORA.getTime()) / 86400000)).toBe(DIAS_VIGENCIA);
  });

  it("un valor absurdo no crea enlaces eternos", () => {
    for (const dias of [0, -5, Number.NaN, 99999]) {
      const d = caducidad(dias, AHORA);
      const diff = (d.getTime() - AHORA.getTime()) / 86400000;
      expect(diff, String(dias)).toBeGreaterThan(0);
      expect(diff, String(dias)).toBeLessThanOrEqual(365);
    }
  });
});

describe("de dónde vino la aceptación", () => {
  // Detrás de un proxy, req.ip es la del proxy: registrarla no distingue a un
  // cliente de otro, que es lo único que este registro tiene que probar.
  it("toma la IP del cliente, no la del proxy", () => {
    expect(ipDeLaPeticion({ "x-forwarded-for": "200.10.1.5, 10.0.0.1, 10.0.0.2" })).toBe("200.10.1.5");
  });

  it("acepta la cabecera repetida como array", () => {
    expect(ipDeLaPeticion({ "x-forwarded-for": ["200.10.1.5", "10.0.0.1"] })).toBe("200.10.1.5");
  });

  it("cae a x-real-ip y luego al respaldo", () => {
    expect(ipDeLaPeticion({ "x-real-ip": "190.1.1.1" })).toBe("190.1.1.1");
    expect(ipDeLaPeticion({}, "127.0.0.1")).toBe("127.0.0.1");
    expect(ipDeLaPeticion({})).toBe("");
  });
});

describe("quién firma", () => {
  // "Alguien desde esta IP dijo que sí" no sirve para enseñárselo a nadie.
  it("exige un nombre reconocible", () => {
    expect(nombreFirmanteValido("Ana Pérez")).toBe(true);
    for (const malo of ["", "  ", "A", "ab", null, undefined]) {
      expect(nombreFirmanteValido(malo), String(malo)).toBe(false);
    }
  });

  it("normaliza espacios y acota el largo", () => {
    expect(limpiarNombreFirmante("  Ana   María  Pérez ")).toBe("Ana María Pérez");
    expect(limpiarNombreFirmante("x".repeat(300)).length).toBe(120);
  });
});

describe("url del enlace", () => {
  it("no duplica la barra de la base", () => {
    expect(urlDeFirma("https://admin.webmakerlatam.com/", "tok")).toBe("https://admin.webmakerlatam.com/api/firma/tok");
    expect(urlDeFirma("https://admin.webmakerlatam.com", "tok")).toBe("https://admin.webmakerlatam.com/api/firma/tok");
  });
});

describe("la firma que mandó el navegador", () => {
  const png = (n: number) => "data:image/png;base64," + "A".repeat(n);

  it("acepta las tres formas reales de firmar", () => {
    expect(validarFirma("dibujo", png(400))).toMatchObject({ ok: true, firma: { kind: "dibujo" } });
    expect(validarFirma("imagen", "data:image/jpeg;base64," + "B".repeat(300))).toMatchObject({ ok: true });
    expect(validarFirma("texto", "  María   José Soto ")).toEqual({
      ok: true,
      firma: { kind: "texto", data: "María José Soto" }, // normalizada, como el nombre
    });
  });

  it("una firma escrita de una letra no es una firma", () => {
    expect(validarFirma("texto", "M").ok).toBe(false);
    expect(validarFirma("texto", "   ").ok).toBe(false);
    expect(validarFirma("texto", "x".repeat(121)).ok).toBe(false);
  });

  it("dibujo/imagen: solo PNG o JPEG en data URI, y con contenido de verdad", () => {
    // Un canvas vacío o un data URI mínimo no prueban que alguien firmó.
    expect(validarFirma("dibujo", "data:image/png;base64,AAAA").ok).toBe(false);
    expect(validarFirma("imagen", "data:image/gif;base64," + "A".repeat(400)).ok).toBe(false);
    expect(validarFirma("imagen", "https://otro-sitio.com/firma.png").ok).toBe(false);
    expect(validarFirma("dibujo", null).ok).toBe(false);
  });

  it("corta las imágenes desmedidas antes de mirarles el formato", () => {
    const r = validarFirma("imagen", png(MAX_FIRMA_DATA + 10));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("pesa demasiado");
  });

  it("un método inventado se rechaza con las opciones reales", () => {
    const r = validarFirma("huella", "algo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("dibujarla");
  });
});
