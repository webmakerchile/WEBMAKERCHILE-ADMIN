import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import { MMODA_EXAMPLE } from "./example-mmoda";
import type { Cotizacion } from "./schema";

const openaiCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
  },
}));

vi.mock("./pdf", () => ({
  htmlToPdf: vi.fn(async () => Buffer.from("pdf")),
}));

function cotConNetos(netos: number[], mensualidadNeto?: number): Cotizacion {
  const base = JSON.parse(JSON.stringify(MMODA_EXAMPLE)) as Cotizacion;
  base.modulos = base.modulos.slice(0, netos.length).map((m, i) => ({ ...m, neto: netos[i] }));
  if (mensualidadNeto !== undefined && base.mensualidad) base.mensualidad.neto = mensualidadNeto;
  return base;
}

function llmResponse(cot: Cotizacion) {
  return { choices: [{ message: { content: JSON.stringify(cot) } }] };
}

async function buildApp() {
  const mod = await import("./index");
  const app = express();
  app.use(express.json());
  app.use("/api/cotizaciones", mod.default);
  return app;
}

async function start(app: express.Express) {
  return new Promise<number>((resolve) => {
    const s = app.listen(0, () => {
      const a = s.address();
      if (typeof a === "object" && a) resolve(a.port);
    });
  });
}

const CONTEXTO = "Cliente: Botillería Don Pedro\nAlcance: tienda online con catálogo y pagos, quiere vender por WhatsApp también";

describe("generarContenidoCotizacion — estimación automática de precios", () => {
  beforeEach(() => {
    openaiCreate.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("reintenta con nudge cuando el LLM deja netos en -1 sin precios entregados", async () => {
    const { generarContenidoCotizacion } = await import("./llm");
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([-1, -1, -1])));
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([800000, 500000, 300000])));

    const { data, intentos } = await generarContenidoCotizacion({ contexto_cliente: CONTEXTO });

    expect(intentos).toBe(2);
    expect(data.modulos.every((m) => m.neto > 0)).toBe(true);
    const secondCall = openaiCreate.mock.calls[1][0] as { messages: Array<{ role: string; content: string }> };
    const nudge = secondCall.messages[secondCall.messages.length - 1];
    expect(nudge.role).toBe("user");
    expect(nudge.content).toContain("PRECIOS PENDIENTES");
    expect(nudge.content).toContain("GUÍA DE PRECIOS");
  });

  it("reintenta con nudge cuando la mensualidad queda en -1 sin precio entregado", async () => {
    const { generarContenidoCotizacion } = await import("./llm");
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([800000, 500000, 300000], -1)));
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([800000, 500000, 300000], 90000)));

    const { data, intentos } = await generarContenidoCotizacion({ contexto_cliente: CONTEXTO });

    expect(intentos).toBe(2);
    expect(data.mensualidad?.neto).toBe(90000);
    const secondCall = openaiCreate.mock.calls[1][0] as { messages: Array<{ role: string; content: string }> };
    expect(secondCall.messages[secondCall.messages.length - 1].content).toContain("mensualidad");
  });

  it("acepta -1 como pendiente en el último intento en vez de fallar", async () => {
    const { generarContenidoCotizacion } = await import("./llm");
    openaiCreate.mockResolvedValue(llmResponse(cotConNetos([-1, -1, -1])));

    const { data, intentos } = await generarContenidoCotizacion({ contexto_cliente: CONTEXTO });

    expect(intentos).toBe(3);
    expect(data.modulos.every((m) => m.neto === -1)).toBe(true);
  });

  it("reintenta cuando el LLM no respeta el esquema de pago solicitado", async () => {
    const { generarContenidoCotizacion } = await import("./llm");
    const cotMal = cotConNetos([800000, 500000, 300000]);
    cotMal.pago.esquema = [
      { porcentaje: 30, momento: "AL INICIAR" },
      { porcentaje: 70, momento: "CONTRA ENTREGA" },
    ];
    const cotBien = cotConNetos([800000, 500000, 300000]);
    cotBien.pago.esquema = [
      { porcentaje: 50, momento: "AL INICIAR" },
      { porcentaje: 50, momento: "CONTRA ENTREGA" },
    ];
    openaiCreate.mockResolvedValueOnce(llmResponse(cotMal));
    openaiCreate.mockResolvedValueOnce(llmResponse(cotBien));

    const { data, intentos } = await generarContenidoCotizacion({
      contexto_cliente: CONTEXTO,
      esquema_pago: [
        { porcentaje: 50, momento: "AL INICIAR" },
        { porcentaje: 50, momento: "CONTRA ENTREGA" },
      ],
    });

    expect(intentos).toBe(2);
    expect(data.pago.esquema.map((h) => h.porcentaje)).toEqual([50, 50]);
    const secondCall = openaiCreate.mock.calls[1][0] as { messages: Array<{ role: string; content: string }> };
    expect(secondCall.messages[secondCall.messages.length - 1].content).toContain("esquema de pago");
  });

  it("no reintenta cuando el usuario entregó precios y el LLM los respeta", async () => {
    const { generarContenidoCotizacion } = await import("./llm");
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([900000, 550000])));

    const { intentos } = await generarContenidoCotizacion({
      contexto_cliente: CONTEXTO,
      precios_netos: [900000, 550000],
    });

    expect(intentos).toBe(1);
    expect(openaiCreate).toHaveBeenCalledTimes(1);
  });

  /* ---------------- Precios parciales ----------------

     Antes esto no existía: o venían TODOS los precios o ninguno. El panel
     exigía que cada módulo tuviera precio para mandarlos, así que quien sabía
     el de tres de cuatro veía cómo la IA se inventaba también esos tres — y en
     una cotización eso no se nota hasta que el cliente la recibe. */

  it("respeta el precio dado y deja estimar solo el que falta", async () => {
    const { generarContenidoCotizacion } = await import("./llm");
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([900000, 420000])));

    const { data, intentos } = await generarContenidoCotizacion({
      contexto_cliente: CONTEXTO,
      precios_netos: [900000, null],
    });

    expect(intentos).toBe(1);
    expect(data.modulos[0].neto).toBe(900000);
    // El segundo lo puso el modelo: no se compara contra nada, solo se acepta.
    expect(data.modulos[1].neto).toBe(420000);
  });

  it("sigue exigiendo el precio dado aunque otro venga vacío", async () => {
    const { generarContenidoCotizacion } = await import("./llm");
    // El modelo cambia el precio que se le dio: eso tiene que reintentarse.
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([777000, 420000])));
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([900000, 420000])));

    const { data, intentos } = await generarContenidoCotizacion({
      contexto_cliente: CONTEXTO,
      precios_netos: [900000, null],
    });

    expect(intentos).toBe(2);
    expect(data.modulos[0].neto).toBe(900000);
    const reintento = openaiCreate.mock.calls[1][0] as { messages: Array<{ role: string; content: string }> };
    expect(reintento.messages[reintento.messages.length - 1].content).toContain("900000");
  });

  // El aviso de "estima este" solo miraba el caso sin ningún precio, así que
  // con precios parciales el módulo sin precio se quedaba en -1 y eso bloquea
  // la vista previa: la cotización salía sin poder verse y sin decir por qué.
  it("pide estimar el módulo que quedó pendiente", async () => {
    const { generarContenidoCotizacion } = await import("./llm");
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([900000, -1])));
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([900000, 380000])));

    const { data, intentos } = await generarContenidoCotizacion({
      contexto_cliente: CONTEXTO,
      precios_netos: [900000, null],
    });

    expect(intentos).toBe(2);
    expect(data.modulos[1].neto).toBe(380000);
    const reintento = openaiCreate.mock.calls[1][0] as { messages: Array<{ role: string; content: string }> };
    expect(reintento.messages[reintento.messages.length - 1].content).toContain("PRECIOS PENDIENTES");
  });

  it("el prompt dice a qué módulo va cada precio", async () => {
    const { generarContenidoCotizacion } = await import("./llm");
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([900000, 420000])));

    await generarContenidoCotizacion({ contexto_cliente: CONTEXTO, precios_netos: [900000, null] });

    const primera = openaiCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const prompt = primera.messages[1].content;
    // Una lista suelta ("900000") no dice a cuál de los módulos corresponde, y
    // el modelo los reordena.
    expect(prompt).toContain("Módulo 1: 900000");
    expect(prompt).toContain("Módulo 2: ESTÍMALO");
  });
});

describe("POST /api/cotizaciones/generar — esquema de pago por defecto", () => {
  beforeEach(() => {
    openaiCreate.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("aplica 50/50 cuando no llega esquema_pago", async () => {
    openaiCreate.mockResolvedValueOnce(llmResponse(cotConNetos([800000, 500000, 300000])));
    const port = await start(await buildApp());

    const r = await fetch(`http://127.0.0.1:${port}/api/cotizaciones/generar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contexto_cliente: CONTEXTO }),
    });

    expect(r.status).toBe(200);
    const body = (await r.json()) as { cotizacion?: Cotizacion; html?: string | null };
    expect(body.cotizacion).toBeTruthy();
    expect(body.html).toBeTruthy();

    const call = openaiCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMsg = call.messages.find((m) => m.role === "user")!;
    expect(userMsg.content).toContain("ESQUEMA DE PAGO ENTREGADO");
    expect(userMsg.content).toContain('"porcentaje":50');
    expect(userMsg.content).toContain("AL INICIAR");
    expect(userMsg.content).toContain("CONTRA ENTREGA");
  });

  it("respeta el esquema_pago entregado por el cliente", async () => {
    const cot = cotConNetos([800000, 500000, 300000]);
    cot.pago.esquema = [
      { porcentaje: 30, momento: "AL INICIAR" },
      { porcentaje: 70, momento: "CONTRA ENTREGA" },
    ];
    openaiCreate.mockResolvedValueOnce(llmResponse(cot));
    const port = await start(await buildApp());

    const r = await fetch(`http://127.0.0.1:${port}/api/cotizaciones/generar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contexto_cliente: CONTEXTO,
        esquema_pago: [
          { porcentaje: 30, momento: "AL INICIAR" },
          { porcentaje: 70, momento: "CONTRA ENTREGA" },
        ],
      }),
    });

    expect(r.status).toBe(200);
    const call = openaiCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMsg = call.messages.find((m) => m.role === "user")!;
    expect(userMsg.content).toContain('"porcentaje":30');
    expect(userMsg.content).toContain('"porcentaje":70');
  });
});
