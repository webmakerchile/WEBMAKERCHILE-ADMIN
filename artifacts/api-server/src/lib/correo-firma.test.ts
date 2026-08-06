// Contenido de los correos de confirmación de firma.
//
// Lo que se prueba es lo que le llega a gente real: que el cliente reciba SU
// constancia (nombre, total, fecha chilena) y que el buzón del equipo reciba
// los datos que después se buscan en una discusión (quién, cuándo, desde qué
// IP). El transporte no se toca aquí — estos builders son puros.

import { describe, expect, it } from "vitest";
import { correoParaCliente, correoParaEquipo, type DatosCorreoFirma } from "./correo-firma";

const base = (extra?: Partial<DatosCorreoFirma>): DatosCorreoFirma => ({
  titulo: "Plataforma de reservas",
  cliente: "Clínica Andes",
  firmante: "María José Soto",
  correoFirmante: "mjsoto@clinica-andes.cl",
  fechaFirma: new Date("2026-07-31T15:00:00Z"),
  metodo: "dibujo",
  ip: "200.1.2.3",
  userAgent: "Mozilla/5.0 (iPhone)",
  totalTexto: "$2.380.000 · IVA incluido",
  urlPanel: "https://panel.webmakerlatam.com/contratos",
  firmaAdjunta: true,
  ...extra,
});

describe("correoParaCliente", () => {
  it("es la constancia del cliente: nombre de pila, propuesta, total y fecha chilena", () => {
    const c = correoParaCliente(base());
    expect(c.subject).toContain("Plataforma de reservas");
    expect(c.html).toContain("¡Gracias, María!"); // saludo con el nombre de pila
    expect(c.html).toContain("$2.380.000 · IVA incluido");
    expect(c.html).toContain("2026"); // fecha en es-CL con zona Santiago
    expect(c.html).toContain("Dibujada a mano");
    // La versión texto existe para clientes de correo sin HTML.
    expect(c.text).toContain("Plataforma de reservas");
    expect(c.text).toContain("$2.380.000");
  });

  it("solo promete la firma adjunta cuando de verdad va adjunta", () => {
    expect(correoParaCliente(base()).html).toContain("Adjuntamos");
    expect(correoParaCliente(base({ metodo: "texto", firmaAdjunta: false })).html).not.toContain("Adjuntamos");
  });

  it("no deja pasar HTML del contrato al correo", () => {
    const c = correoParaCliente(base({ titulo: `<script>alert(1)</script>` }));
    expect(c.html).not.toContain("<script>alert(1)");
    expect(c.html).toContain("&lt;script&gt;");
  });

  it("sin total conocido, no inventa una fila de inversión", () => {
    const c = correoParaCliente(base({ totalTexto: null }));
    expect(c.html).not.toContain("Inversión");
  });
});

describe("correoParaEquipo", () => {
  it("lleva lo que el equipo busca meses después: quién, correo, cuándo, IP y enlace al panel", () => {
    const c = correoParaEquipo(base());
    expect(c.subject).toContain("Clínica Andes");
    expect(c.html).toContain("María José Soto");
    expect(c.html).toContain("mjsoto@clinica-andes.cl");
    expect(c.html).toContain("200.1.2.3");
    expect(c.html).toContain("https://panel.webmakerlatam.com/contratos");
    expect(c.text).toContain("200.1.2.3");
  });

  it("cuando el cliente no dejó correo, lo dice en vez de omitir la fila", () => {
    const c = correoParaEquipo(base({ correoFirmante: null }));
    expect(c.html).toContain("no dejó");
  });

  it("sin enlace al panel resuelto, no mete un botón roto", () => {
    const c = correoParaEquipo(base({ urlPanel: null }));
    expect(c.html).not.toContain("Ver en el panel");
  });
});
