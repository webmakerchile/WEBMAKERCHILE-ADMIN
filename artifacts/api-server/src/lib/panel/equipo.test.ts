import { describe, it, expect } from "vitest";
import { vi } from "vitest";

/**
 * Saneo para el modo EQUIPO de Agencia. Lo que importa:
 * - nada que huela a plata sobrevive (lista blanca + depuración profunda)
 * - lo operativo SÍ pasa: contactos, estados, fechas, links de trabajo
 * - _enlaces queda reducido al link de firma (herramienta del equipo)
 * - proyectos terminados solo si están compartidos
 * Los fixtures usan las claves REALES del espejo (inventario de la base dev).
 */

vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("@workspace/db/schema", () => ({ panelEspejo: {}, panelVisibilidad: {} }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn(), inArray: vi.fn() }));
vi.mock("./espejo", () => ({
  ESTADOS_PROYECTO_FINAL: ["COMPLETED", "CANCELLED", "DELIVERED", "ARCHIVED"],
  leerRegistro: vi.fn(async () => null),
}));

import {
  depurarProfundo,
  esEstadoFinalProyecto,
  esRecursoEquipo,
  mantenimientoParaEquipo,
  plantillasParaEquipo,
  resumenParaEquipo,
  sanearListadoEquipo,
  sanearRegistroEquipo,
} from "./equipo";

describe("recursos del equipo", () => {
  it("los recursos de dirección no están en la lista", () => {
    expect(esRecursoEquipo("clientes")).toBe(true);
    expect(esRecursoEquipo("leads")).toBe(true);
    expect(esRecursoEquipo("pagos-mantenimiento")).toBe(false);
    expect(esRecursoEquipo("finanzas")).toBe(false);
  });

  it("estados finales de proyecto", () => {
    expect(esEstadoFinalProyecto("COMPLETED")).toBe(true);
    expect(esEstadoFinalProyecto("QA")).toBe(false);
    expect(esEstadoFinalProyecto(undefined)).toBe(false);
  });
});

describe("sanearRegistroEquipo (lista blanca por recurso)", () => {
  it("presupuesto: estado sí, plata/notas/links de dirección no", () => {
    const salida = sanearRegistroEquipo("presupuestos", {
      id: "p1",
      clientId: "c1",
      status: "SENT",
      subtotal: 100000,
      iva: 19000,
      total: 119000,
      discount: 5000,
      monthlyMaintenance: 30000,
      maintenanceType: "WEB_FULL",
      notes: "cerrar con 10% dcto",
      customPaymentTerms: "50/50",
      paymentModality: "INSTALLMENTS",
      installmentCount: 2,
      hasIVA: true,
      validUntil: "2026-08-30",
      includeContract: true,
      tokenUrl: "https://panel/x/tok",
      _enlaces: { propuesta: "https://panel/prop", pdf: "https://panel/pdf" },
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    });
    expect(salida).toEqual({
      id: "p1",
      clientId: "c1",
      status: "SENT",
      maintenanceType: "WEB_FULL",
      validUntil: "2026-08-30",
      includeContract: true,
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    });
  });

  it("contrato de servicio: conserva SOLO el link de firma en _enlaces", () => {
    const salida = sanearRegistroEquipo("contratos-servicio", {
      id: "cs1",
      proposalId: "p1",
      status: "PENDING_SIGNATURE",
      clientCompanyName: "ACME",
      clientRepresentativeName: "Juan Pérez",
      clientRepresentativeRut: "11.111.111-1",
      signedByName: null,
      signedByRut: null,
      signedPdfUrl: "https://panel/firmado.pdf",
      tokenUrl: "https://panel/x/tok",
      contenido: "CONTRATO ENTRE ... $1.190.000 ...",
      total: 1190000,
      _enlaces: { contrato: "https://panel/firma/abc", propuesta: "https://panel/prop", pdf: "https://panel/pdf" },
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    });
    expect(salida._enlaces).toEqual({ contrato: "https://panel/firma/abc" });
    expect(salida).not.toHaveProperty("contenido");
    expect(salida).not.toHaveProperty("total");
    expect(salida).not.toHaveProperty("tokenUrl");
    expect(salida).not.toHaveProperty("signedPdfUrl");
    expect(salida).not.toHaveProperty("clientRepresentativeRut");
    expect(salida.clientCompanyName).toBe("ACME");
    expect(salida.clientRepresentativeName).toBe("Juan Pérez");
  });

  it("lead: serviceInterest y notes sobreviven (ventas trabaja con eso)", () => {
    const salida = sanearRegistroEquipo("leads", {
      id: "l1",
      name: "María",
      company: "Tienda",
      email: "m@t.cl",
      phone: "+56 9",
      status: "NEW",
      serviceInterest: "ecommerce",
      requestType: "WEB",
      notes: "llamar el lunes",
      messageOmitido: true,
      createdAt: "2026-08-01",
    });
    expect(salida.serviceInterest).toBe("ecommerce");
    expect(salida.notes).toBe("llamar el lunes");
    expect(salida.name).toBe("María");
  });

  it("cliente: contactos completos, sin métricas de negocio", () => {
    const salida = sanearRegistroEquipo("clientes", {
      id: "c1",
      companyName: "ACME",
      rut: "76.111.111-1",
      billingRut: "76.111.111-1",
      contactName: "Juan",
      contactEmail: "j@acme.cl",
      contactPhone: "+56 9",
      address: "Stgo",
      closerId: "u3",
      totalFacturado: 999999,
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    });
    expect(salida.billingRut).toBe("76.111.111-1");
    expect(salida.contactPhone).toBe("+56 9");
    expect(salida).not.toHaveProperty("totalFacturado");
  });

  it("proyecto: sin totalValue ni presupuestos internos", () => {
    const salida = sanearRegistroEquipo("proyectos", {
      id: "pr1",
      proposalId: "p1",
      clientId: "c1",
      name: "Sitio ACME",
      status: "QA",
      deadlineDays: 30,
      deadlineStartDate: "2026-07-01",
      driveFolderUrl: "https://drive/x",
      repositoryUrl: "https://github/x",
      totalValue: 1190000,
      aiCostBudget: 20000,
      developerPayment: 300000,
      createdAt: "2026-07-01",
      updatedAt: "2026-08-01",
    });
    expect(salida.name).toBe("Sitio ACME");
    expect(salida.driveFolderUrl).toBe("https://drive/x");
    expect(salida).not.toHaveProperty("totalValue");
    expect(salida).not.toHaveProperty("aiCostBudget");
    expect(salida).not.toHaveProperty("developerPayment");
  });

  it("sanearListadoEquipo sanea cada fila y respeta la paginación", () => {
    const listado = sanearListadoEquipo("tareas", {
      total: 1,
      limite: 100,
      offset: 0,
      datos: [{ id: "t1", projectId: "pr1", title: "Deploy", status: "DOING", phase: "DEV", weight: 3, freelancerCost: 50000 }],
    });
    expect(listado.total).toBe(1);
    expect(listado.datos[0]).toEqual({ id: "t1", projectId: "pr1", title: "Deploy", status: "DOING", phase: "DEV", weight: 3 });
  });
});

describe("depurarProfundo (red de seguridad para vistas en vivo)", () => {
  it("mata claves de plata a cualquier profundidad", () => {
    const salida = depurarProfundo({
      ok: true,
      datos: {
        presupuesto: { id: "p1", total: 119000, calculo: { subtotal: 100000, iva: 19000 } },
        negocio: { mrrNeto: 1, arrEstimadoNeto: 12, pipelineCotizado: 5, ticketPromedio: 9 },
        finanzas: { ingresos: 1 },
        cobranza: { montoImpago: 2 },
      },
    }) as Record<string, any>;
    const texto = JSON.stringify(salida);
    for (const feo of ["total", "subtotal", "iva", "mrr", "arrEstimado", "pipeline", "ticketPromedio", "finanzas", "cobranza", "monto"]) {
      expect(texto).not.toContain(feo);
    }
    expect(salida.datos.presupuesto.id).toBe("p1");
  });

  it("interest inglés pasa, interés en plata no; arrays intactos", () => {
    const salida = depurarProfundo({
      lead: { serviceInterest: "web", interesMoraPorcentaje: 3 },
      etiquetas: ["a", "b"],
    }) as Record<string, any>;
    expect(salida.lead.serviceInterest).toBe("web");
    expect(salida.lead).not.toHaveProperty("interesMoraPorcentaje");
    expect(salida.etiquetas).toEqual(["a", "b"]);
  });

  it("items queda en id/nombre/cantidad, sin unitPrice", () => {
    const salida = depurarProfundo({
      items: [{ id: "i1", name: "Sitio web", quantity: 1, unitPrice: 100000, subtotal: 100000 }],
    }) as Record<string, any>;
    expect(salida.items).toEqual([{ id: "i1", name: "Sitio web", quantity: 1 }]);
  });

  it("_enlaces queda solo con el link de firma", () => {
    const salida = depurarProfundo({
      _enlaces: { contrato: "https://f/abc", propuesta: "https://p/1", pdf: "https://p/2" },
    }) as Record<string, any>;
    expect(salida._enlaces).toEqual({ contrato: "https://f/abc" });
    const sinFirma = depurarProfundo({ _enlaces: { propuesta: "https://p/1" } }) as Record<string, any>;
    expect(sinFirma).not.toHaveProperty("_enlaces");
  });

  it("con compartidos filtra proyectos terminados no compartidos", () => {
    const comp = { todos: false, ids: new Set(["pr2"]) };
    const salida = depurarProfundo(
      {
        proyectos: [
          { id: "pr1", status: "COMPLETED", name: "viejo", totalValue: 1 },
          { id: "pr2", status: "COMPLETED", name: "compartido" },
          { id: "pr3", status: "QA", name: "en curso" },
        ],
      },
      comp
    ) as Record<string, any>;
    expect(salida.proyectos.map((p: any) => p.id)).toEqual(["pr2", "pr3"]);
    expect(salida.proyectos[0]).not.toHaveProperty("totalValue");
  });
});

describe("vistas armadas para el equipo (shape explícito)", () => {
  it("resumen: conteos sí, negocio en plata no", () => {
    const salida = resumenParaEquipo({
      ok: true,
      generadoEn: "2026-08-02T12:00:00Z",
      registros: { clientes: 12, presupuestos: 7, "pagos-mantenimiento": 40, leads: 71 },
      negocio: {
        mrrNeto: 1000000,
        arrEstimadoNeto: 12000000,
        pipelineCotizado: 3000000,
        ticketPromedio: 500000,
        contratosMantenimientoActivos: 9,
        proyectosActivos: 12,
        presupuestosAbiertos: 4,
      },
      cobranza: { montoImpago: 1, pagosImpagos: 2 },
    });
    const texto = JSON.stringify(salida);
    expect(texto).not.toMatch(/mrr|arr|pipeline|ticket|cobranza|monto|impago/i);
    expect(salida).toEqual({
      ok: true,
      generadoEn: "2026-08-02T12:00:00Z",
      registros: { clientes: 12, presupuestos: 7, leads: 71 },
      negocio: { contratosMantenimientoActivos: 9, proyectosActivos: 12, presupuestosAbiertos: 4 },
    });
  });

  it("mantenimiento: conteos y vencimientos sin monto ni MRR", () => {
    const salida = mantenimientoParaEquipo({
      ok: true,
      contratos: {
        total: 10,
        activos: 8,
        pausados: 1,
        cancelados: 1,
        porTipo: { WEB_FULL: { contratos: 6, mrrNeto: 900000 }, HOSTING: { contratos: 4, mrrNeto: 100000 } },
        mrrNeto: 1000000,
      },
      proximosVencimientos: [
        { pagoId: "pm1", contratoId: "cm1", cliente: "ACME", tipoServicio: "WEB_FULL", periodo: "2026-08", vence: "2026-08-05", estado: "PENDING", monto: 119000 },
      ],
      cobranza: { impagos: 2, montoImpago: 238000 },
    }) as Record<string, any>;
    const texto = JSON.stringify(salida);
    expect(texto).not.toMatch(/mrr|monto|cobranza/i);
    expect(salida.contratos.porTipo.WEB_FULL).toEqual({ contratos: 6 });
    expect(salida.proximosVencimientos[0]).toEqual({
      pagoId: "pm1",
      contratoId: "cm1",
      cliente: "ACME",
      tipoServicio: "WEB_FULL",
      periodo: "2026-08",
      vence: "2026-08-05",
      estado: "PENDING",
    });
  });

  it("plantillas: solo id y nombre para el selector", () => {
    const salida = plantillasParaEquipo({
      ok: true,
      datos: [{ id: "t1", nombre: "Contrato web", contenido: "CLÁUSULA $$", precioBase: 1 }],
    }) as Record<string, any>;
    expect(salida.datos).toEqual([{ id: "t1", nombre: "Contrato web" }]);
  });
});
