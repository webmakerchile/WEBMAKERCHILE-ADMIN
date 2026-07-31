// La página pública de firma, de punta a punta (con la base y el correo simulados).
//
// Lo que se defiende aquí:
//   1. El cliente ve el CONTRATO COMPLETO (módulos, precios con IVA, forma de
//      pago, mensualidad, notas) — no un resumen de dos líneas.
//   2. La firma se guarda tal como llegó, con su método y su constancia.
//   3. Los correos NUNCA deciden la suerte de la firma: si fallan, la firma
//      queda y el fallo queda ANOTADO en la fila, visible para el panel.

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

const TOKEN = "a1b2c3d4e5f6".repeat(4); // 48 hex

const SIGNATURES = { __table: "contract_signatures" };
vi.mock("@workspace/db/schema", () => ({ contractSignatures: SIGNATURES }));
vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  and: (...xs: unknown[]) => ({ and: xs }),
  or: (...xs: unknown[]) => ({ or: xs }),
  gt: (a: unknown, b: unknown) => ({ gt: [a, b] }),
  isNull: (x: unknown) => ({ isNull: x }),
}));

/* La fila del enlace, el tablero y lo que se escribió. */
let filas: Record<string, unknown>[] = [];
/** Lo que devuelve el SEGUNDO select (simula que la fila cambió entre medio). */
let filasDespues: Record<string, unknown>[] | null = null;
let selects = 0;
let boardData: Record<string, unknown> = {};
let actualizaciones: Record<string, unknown>[] = [];
/** Cuántas filas "afecta" el UPDATE condicionado (0 simula la doble pulsación). */
let updateAfecta = 1;

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => {
      selects++;
      return selects > 1 && filasDespues ? filasDespues : filas;
    } }) }) }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        actualizaciones.push(v);
        return {
          where: () => ({
            returning: async () => (updateAfecta > 0 ? [{ id: "s1" }] : []),
            // `await db.update(...).set(...).where(...)` sin returning:
            then: (resolve: (x: unknown) => unknown) => resolve(undefined),
          }),
        };
      },
    }),
  },
}));

vi.mock("../../lib/hub-board", () => ({
  resolveBoard: async () => ({ boardUserId: 1, data: boardData, owner: null, version: 0 }),
}));
vi.mock("../cotizaciones/template", () => ({ logoDataUri: () => "data:image/png;base64,LOGO" }));

/* La activación del contrato se prueba a fondo en activar-contrato.test.ts;
   aquí solo importa CUÁNDO se dispara: tras una firma que valió, nunca antes. */
const { activarMock } = vi.hoisted(() => ({
  activarMock: vi.fn(async () => "activado" as const),
}));
vi.mock("../../lib/activar-contrato", () => ({ activarContratoFirmado: activarMock }));

const { enviarCorreoMock } = vi.hoisted(() => ({ enviarCorreoMock: vi.fn() }));
vi.mock("../../lib/correo", () => ({
  CORREO_EQUIPO: "webmakerventas@gmail.com",
  enviarCorreo: enviarCorreoMock,
}));

async function llamar(
  method: string,
  path: string,
  opts: { json?: unknown; form?: string } = {},
) {
  const router = (await import("./index")).default;
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use("/api", router);
  const port = await new Promise<number>((resolve) => {
    const s = app.listen(0, () => {
      const a = s.address();
      if (typeof a === "object" && a) resolve(a.port);
    });
  });
  const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method,
    headers: opts.json !== undefined
      ? { "Content-Type": "application/json" }
      : opts.form !== undefined
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : undefined,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.form,
  });
  const texto = await res.text();
  let json: Record<string, any> | null = null;
  try { json = JSON.parse(texto); } catch { /* páginas HTML */ }
  return { status: res.status, texto, json };
}

const enlacePendiente = (): Record<string, unknown> => ({
  id: "s1",
  contractId: "c1",
  token: TOKEN,
  estado: "pendiente",
  expiresAt: new Date(Date.now() + 7 * 864e5),
  signedAt: null,
  signerName: null,
  signerEmail: null,
  signerIp: null,
});

/** Contrato del wizard: módulos con precio NETO, 60% al iniciar, mensualidad. */
const contratoCompleto = (): Record<string, unknown> => ({
  id: "c1",
  title: "Plataforma de reservas",
  client: "Clínica Andes",
  status: "borrador",
  value: "$2.380.000",
  doc: {
    client: "Clínica Andes",
    project: "Plataforma de reservas",
    scope: "Sistema de reservas online con recordatorios.",
    date: "2026-07-15",
    advisor: "Vale",
    modules: [
      { id: "m1", name: "Página web", desc: "Sitio corporativo", price: 1000000 },
      { id: "m2", name: "Motor de reservas", desc: "Agenda y pagos", price: 1000000 },
    ],
    downPct: 60,
    notes: "El contenido lo entrega el cliente.",
    monthly: "Incluye hosting y soporte.",
    monthlyPrice: 25000,
    validityDays: 15,
  },
});

const FIRMA_PNG = "data:image/png;base64," + "A".repeat(400);

beforeEach(() => {
  filas = [];
  filasDespues = null;
  selects = 0;
  boardData = {};
  actualizaciones = [];
  updateAfecta = 1;
  enviarCorreoMock.mockReset();
  enviarCorreoMock.mockResolvedValue({ ok: true });
});

describe("GET /firma/:token — el contrato que ve el cliente", () => {
  it("token con mala pinta → 404 sin tocar la base", async () => {
    const r = await llamar("GET", "/firma/xx");
    expect(r.status).toBe(404);
  });

  it("enlace desconocido → 404", async () => {
    const r = await llamar("GET", `/firma/${TOKEN}`);
    expect(r.status).toBe(404);
  });

  it("enlace caducado → 410 y no se puede firmar", async () => {
    filas = [{ ...enlacePendiente(), expiresAt: new Date(Date.now() - 864e5) }];
    expect((await llamar("GET", `/firma/${TOKEN}`)).status).toBe(410);
    expect((await llamar("POST", `/firma/${TOKEN}/aceptar`, { json: { nombre: "Ana Pérez" } })).status).toBe(410);
  });

  it("ya firmado: se le confirma con nombre y fecha, no se le da error", async () => {
    filas = [{ ...enlacePendiente(), estado: "firmado", signedAt: new Date("2026-07-20T15:00:00Z"), signerName: "Ana Pérez" }];
    const r = await llamar("GET", `/firma/${TOKEN}`);
    expect(r.status).toBe(200);
    expect(r.texto).toContain("Ya está aceptado");
    expect(r.texto).toContain("Ana Pérez");
  });

  it("muestra el contrato COMPLETO: módulos, IVA, forma de pago, mensualidad, notas y firma", async () => {
    filas = [enlacePendiente()];
    boardData = { contracts: [contratoCompleto()] };
    const r = await llamar("GET", `/firma/${TOKEN}`);
    expect(r.status).toBe(200);
    // Identidad y encabezado
    expect(r.texto).toContain("Plataforma de reservas");
    expect(r.texto).toContain("Clínica Andes");
    expect(r.texto).toContain("MAKER"); // marca WebMaker
    // Módulos con el desglose de plata: neto 2.000.000 → total 2.380.000
    expect(r.texto).toContain("Página web");
    expect(r.texto).toContain("Motor de reservas");
    expect(r.texto).toContain("$2.380.000");
    // Forma de pago 60/40 sobre el total con IVA
    expect(r.texto).toContain("60%");
    expect(r.texto).toContain("AL INICIAR");
    expect(r.texto).toContain("$1.428.000");
    // Mensualidad con IVA: 25.000 → 29.750
    expect(r.texto).toContain("$29.750");
    // Notas y vigencia
    expect(r.texto).toContain("El contenido lo entrega el cliente.");
    expect(r.texto).toContain("válida hasta");
    // La firma: las tres formas y el botón
    expect(r.texto).toContain('id="btn-firmar"');
    expect(r.texto).toContain("Dibujar");
    expect(r.texto).toContain("Subir imagen");
    expect(r.texto).toContain("Escribir");
  });

  it("contrato viejo sin doc: usa título y valor de la ficha, sin NaN ni undefined", async () => {
    filas = [enlacePendiente()];
    boardData = { contracts: [{ id: "c1", title: "Mantención anual", client: "ACME", status: "borrador", value: "$500.000" }] };
    const r = await llamar("GET", `/firma/${TOKEN}`);
    expect(r.status).toBe(200);
    expect(r.texto).toContain("Mantención anual");
    expect(r.texto).toContain("$500.000");
    expect(r.texto).toContain('id="btn-firmar"');
    expect(r.texto).not.toContain("NaN");
    expect(r.texto).not.toContain("undefined");
  });
});

describe("POST /firma/:token/aceptar — la firma y sus correos", () => {
  it("firma dibujada: guarda método, imagen y constancia; manda los dos correos con la firma adjunta", async () => {
    filas = [enlacePendiente()];
    boardData = { contracts: [contratoCompleto()] };
    const r = await llamar("POST", `/firma/${TOKEN}/aceptar`, {
      json: { nombre: "María Soto", email: "maria@clinica-andes.cl", firma: { kind: "dibujo", data: FIRMA_PNG } },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, correoCliente: "enviado" });

    // La fila quedó con la firma y su método
    const primera = actualizaciones[0];
    expect(primera.estado).toBe("firmado");
    expect(primera.signerName).toBe("María Soto");
    expect(primera.signatureKind).toBe("dibujo");
    expect(primera.signatureData).toBe(FIRMA_PNG);

    // Dos correos: cliente y buzón del equipo, con la firma adjunta (base64 pelado)
    expect(enviarCorreoMock).toHaveBeenCalledTimes(2);
    const [aCliente] = enviarCorreoMock.mock.calls[0] as [Record<string, any>];
    const [aEquipo] = enviarCorreoMock.mock.calls[1] as [Record<string, any>];
    expect(aCliente.to).toBe("maria@clinica-andes.cl");
    expect(aCliente.subject).toContain("Plataforma de reservas");
    expect(aEquipo.to).toBe("webmakerventas@gmail.com");
    expect(aEquipo.attachments[0].filename).toMatch(/^firma-/);
    expect(aEquipo.attachments[0].content).not.toContain("data:");

    // Y el resultado de los correos quedó anotado
    expect(actualizaciones[1]).toMatchObject({
      emailClienteEstado: "enviado",
      emailEquipoEstado: "enviado",
      emailDetalle: null,
    });
  });

  it("el formulario viejo (sin firma) sigue valiendo: cuenta como firma escrita con el nombre", async () => {
    filas = [enlacePendiente()];
    boardData = { contracts: [contratoCompleto()] };
    const r = await llamar("POST", `/firma/${TOKEN}/aceptar`, { form: "nombre=Ana+P%C3%A9rez" });
    expect(r.status).toBe(200);
    expect(r.texto).toContain("Listo, Ana");
    expect(actualizaciones[0].signatureKind).toBe("texto");
    expect(actualizaciones[0].signatureData).toBe("Ana Pérez");
    // Sin correo del cliente: solo se avisa al equipo y así queda anotado
    expect(enviarCorreoMock).toHaveBeenCalledTimes(1);
    expect(actualizaciones[1]).toMatchObject({ emailClienteEstado: "sin_correo", emailEquipoEstado: "enviado" });
  });

  it("si el correo falla, LA FIRMA NO SE PIERDE y el fallo queda anotado para el panel", async () => {
    filas = [enlacePendiente()];
    boardData = { contracts: [contratoCompleto()] };
    enviarCorreoMock.mockResolvedValue({ ok: false, motivo: "fallido", detalle: "Resend respondió 422" });
    const r = await llamar("POST", `/firma/${TOKEN}/aceptar`, {
      json: { nombre: "María Soto", email: "maria@clinica-andes.cl", firma: { kind: "texto", data: "María Soto" } },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, correoCliente: "fallido" });
    expect(actualizaciones[0].estado).toBe("firmado");
    const anotado = actualizaciones[1] as Record<string, string>;
    expect(anotado.emailClienteEstado).toBe("fallido");
    expect(anotado.emailEquipoEstado).toBe("fallido");
    expect(anotado.emailDetalle).toContain("cliente:");
    expect(anotado.emailDetalle).toContain("equipo:");
  });

  it("dos pulsaciones a la vez: la segunda no duplica ni manda correos otra vez", async () => {
    filas = [enlacePendiente()];
    updateAfecta = 0; // el UPDATE condicionado ya no encuentra la fila sin firmar
    const r = await llamar("POST", `/firma/${TOKEN}/aceptar`, {
      json: { nombre: "María Soto", firma: { kind: "texto", data: "María Soto" } },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, yaFirmado: true });
    expect(enviarCorreoMock).not.toHaveBeenCalled();
  });

  it("si ANULAN el enlace justo mientras el cliente firma, no queda firmado", async () => {
    filas = [enlacePendiente()];
    filasDespues = [{ ...enlacePendiente(), estado: "anulado" }];
    updateAfecta = 0; // el UPDATE exige estado pendiente y ya no encontró la fila
    const r = await llamar("POST", `/firma/${TOKEN}/aceptar`, {
      json: { nombre: "María Soto", firma: { kind: "texto", data: "María Soto" } },
    });
    expect(r.status).toBe(410);
    expect(enviarCorreoMock).not.toHaveBeenCalled();
  });

  it("rechaza firmas que no son firmas", async () => {
    filas = [enlacePendiente()];
    // Sin nombre no hay constancia
    expect((await llamar("POST", `/firma/${TOKEN}/aceptar`, { json: { nombre: "A", firma: { kind: "texto", data: "A" } } })).status).toBe(400);
    // Formato de imagen que no es PNG/JPG
    const gif = await llamar("POST", `/firma/${TOKEN}/aceptar`, { json: { nombre: "Ana Pérez", firma: { kind: "imagen", data: "data:image/gif;base64," + "A".repeat(400) } } });
    expect(gif.status).toBe(400);
    expect(gif.json?.error).toContain("PNG o JPG");
    // Dibujo vacío (data URI demasiado corto para ser un trazo real)
    expect((await llamar("POST", `/firma/${TOKEN}/aceptar`, { json: { nombre: "Ana Pérez", firma: { kind: "dibujo", data: "data:image/png;base64,AAAA" } } })).status).toBe(400);
    // Método inventado
    expect((await llamar("POST", `/firma/${TOKEN}/aceptar`, { json: { nombre: "Ana Pérez", firma: { kind: "voz", data: "x" } } })).status).toBe(400);
    // Nada de esto llegó a escribir
    expect(actualizaciones).toHaveLength(0);
  });

  it("al firmar, el contrato pasa a activo; un enlace ya usado no lo re-activa", async () => {
    filas = [enlacePendiente()];
    boardData = { contracts: [contratoCompleto()] };
    activarMock.mockClear();

    const r = await llamar("POST", `/firma/${TOKEN}/aceptar`, { json: { nombre: "Rita Prueba" } });
    expect(r.status).toBe(200);
    expect(activarMock).toHaveBeenCalledTimes(1);
    expect(activarMock).toHaveBeenCalledWith(expect.objectContaining({ contractId: "c1" }));

    // Segunda visita al mismo enlace: la fila ya está firmada → ni se firma
    // ni se vuelve a activar nada.
    activarMock.mockClear();
    filasDespues = [{ ...enlacePendiente(), estado: "firmado", signedAt: new Date(), signerName: "Rita Prueba" }];
    const r2 = await llamar("POST", `/firma/${TOKEN}/aceptar`, { json: { nombre: "Rita Prueba" } });
    expect(r2.status).not.toBe(500);
    expect(activarMock).not.toHaveBeenCalled();
  });

  it("una imagen desmedida se rechaza con un mensaje humano", async () => {
    filas = [enlacePendiente()];
    const gorda = "data:image/png;base64," + "A".repeat(2_000_100);
    const r = await llamar("POST", `/firma/${TOKEN}/aceptar`, { json: { nombre: "Ana Pérez", firma: { kind: "imagen", data: gorda } } });
    expect(r.status).toBe(400);
    expect(r.json?.error).toContain("pesa demasiado");
  });
});
