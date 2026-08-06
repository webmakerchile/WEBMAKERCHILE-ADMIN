// Contenido de los correos de confirmación de firma (cliente y equipo).
//
// Builders puros: reciben datos ya resueltos y devuelven asunto + HTML + texto.
// El transporte (Resend) vive en lib/correo.ts; separarlo permite probar el
// contenido sin tocar la red y mantener una sola fuente para "qué se dice".
//
// Los correos van sobre fondo claro a propósito: el modo oscuro del panel no
// sobrevive a los clientes de correo (Gmail reescribe estilos), y una
// confirmación ilegible es peor que una sosa.

import type { MetodoFirma, MotivoFirma } from "./firma-contrato";
import { METODO_FIRMA_LABEL } from "./firma-contrato";

export interface DatosCorreoFirma {
  /** Qué se firmó: cambia el asunto y el texto, no la mecánica del correo. Sin valor = "contrato" (compatibilidad). */
  motivo?: MotivoFirma;
  titulo: string;
  cliente: string;
  firmante: string;
  correoFirmante: string | null;
  fechaFirma: Date;
  metodo: MetodoFirma;
  ip: string | null;
  userAgent: string | null;
  /** Total ya formateado ("$1.234.567 · IVA incluido") o null si no se conoce. */
  totalTexto: string | null;
  /** Enlace al panel para el equipo; null si no se pudo resolver la base. */
  urlPanel: string | null;
  /** true cuando la firma va como imagen adjunta. */
  firmaAdjunta: boolean;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const fechaLarga = (d: Date): string =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "long", timeStyle: "short" }).format(d);

/** Fila etiqueta/valor de las tablas de resumen. */
const fila = (k: string, v: string): string =>
  `<tr><td style="padding:6px 14px 6px 0;color:#8a8a86;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
  `<td style="padding:6px 0;color:#1c1c1a;font-size:13px;font-weight:600">${esc(v)}</td></tr>`;

function envoltura(cuerpo: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#F6F5F2;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e6e1;border-radius:12px;overflow:hidden">
<div style="padding:18px 26px;border-bottom:3px solid #F97015">
  <span style="font-size:15px;font-weight:800;letter-spacing:.06em;color:#1c1c1a">WEB<span style="color:#F97015">MAKER</span> LATAM</span>
</div>
<div style="padding:26px">${cuerpo}</div>
<div style="padding:14px 26px;background:#FAFAF8;border-top:1px solid #e8e6e1;color:#a0a09a;font-size:11px">
  WebMaker Latam · webmakerlatam.com · agencia@webmakerlatam.com
</div>
</div></body></html>`;
}

/** Confirmación para quien firmó: su constancia de la aceptación. */
export function correoParaCliente(d: DatosCorreoFirma): { subject: string; html: string; text: string } {
  const nombrePila = d.firmante.split(" ")[0] || d.firmante;

  if (d.motivo === "aprobacion_proyecto" || d.motivo === "cierre_proyecto") {
    const esCierre = d.motivo === "cierre_proyecto";
    const accion = esCierre ? "confirmación de conformidad" : "aprobación";
    const cierre = esCierre
      ? "El equipo de WebMaker Latam da por cerrado el proyecto."
      : "El equipo de WebMaker Latam comenzará el trabajo según lo acordado.";
    const filas = [
      fila("Proyecto", d.titulo),
      d.cliente ? fila("Empresa", d.cliente) : "",
      fila(esCierre ? "Confirmada el" : "Aprobada el", fechaLarga(d.fechaFirma)),
      fila("Firma", METODO_FIRMA_LABEL[d.metodo]),
    ].join("");
    const html = envoltura(`
<h1 style="margin:0 0 6px;font-size:19px;color:#1c1c1a">¡Gracias, ${esc(nombrePila)}!</h1>
<p style="margin:0 0 18px;color:#55554f;font-size:13.5px;line-height:1.6">
Tu ${accion} quedó registrada. Este correo es tu constancia: guárdalo.</p>
<table style="border-collapse:collapse;width:100%">${filas}</table>
${d.firmaAdjunta ? `<p style="margin:16px 0 0;color:#8a8a86;font-size:12px">Adjuntamos la imagen de tu firma tal como quedó registrada.</p>` : ""}
<p style="margin:18px 0 0;color:#55554f;font-size:13.5px;line-height:1.6">${esc(cierre)}</p>`);
    const text = [
      `¡Gracias, ${nombrePila}!`,
      `Tu ${accion} de "${d.titulo}" quedó registrada el ${fechaLarga(d.fechaFirma)}.`,
      `Firma: ${METODO_FIRMA_LABEL[d.metodo]}`,
      cierre,
    ].filter(Boolean).join("\n");
    return {
      subject: esCierre
        ? `Confirmaste el cierre de "${d.titulo}" — constancia de firma · WebMaker Latam`
        : `Aprobaste el inicio de "${d.titulo}" — constancia de firma · WebMaker Latam`,
      html,
      text,
    };
  }

  const filas = [
    fila("Propuesta", d.titulo),
    d.cliente ? fila("Empresa", d.cliente) : "",
    d.totalTexto ? fila("Inversión", d.totalTexto) : "",
    fila("Firmada el", fechaLarga(d.fechaFirma)),
    fila("Firma", METODO_FIRMA_LABEL[d.metodo]),
  ].join("");
  const html = envoltura(`
<h1 style="margin:0 0 6px;font-size:19px;color:#1c1c1a">¡Gracias, ${esc(nombrePila)}!</h1>
<p style="margin:0 0 18px;color:#55554f;font-size:13.5px;line-height:1.6">
Tu aceptación quedó registrada. Este correo es tu constancia: guárdalo.</p>
<table style="border-collapse:collapse;width:100%">${filas}</table>
${d.firmaAdjunta ? `<p style="margin:16px 0 0;color:#8a8a86;font-size:12px">Adjuntamos la imagen de tu firma tal como quedó registrada.</p>` : ""}
<p style="margin:18px 0 0;color:#55554f;font-size:13.5px;line-height:1.6">
El equipo de WebMaker Latam se pondrá en contacto contigo para los siguientes pasos.</p>`);
  const text = [
    `¡Gracias, ${nombrePila}!`,
    `Tu aceptación de "${d.titulo}" quedó registrada el ${fechaLarga(d.fechaFirma)}.`,
    d.totalTexto ? `Inversión: ${d.totalTexto}` : "",
    `Firma: ${METODO_FIRMA_LABEL[d.metodo]}`,
    "El equipo de WebMaker Latam se pondrá en contacto contigo.",
  ].filter(Boolean).join("\n");
  return { subject: `Aceptaste "${d.titulo}" — constancia de firma · WebMaker Latam`, html, text };
}

/** Aviso al buzón de ventas: quién firmó, cuándo, desde dónde. */
export function correoParaEquipo(d: DatosCorreoFirma): { subject: string; html: string; text: string } {
  if (d.motivo === "aprobacion_proyecto" || d.motivo === "cierre_proyecto") {
    const esCierre = d.motivo === "cierre_proyecto";
    const verbo = esCierre ? "confirmó la conformidad de" : "aprobó el inicio de";
    const filas = [
      fila("Proyecto", d.titulo),
      d.cliente ? fila("Empresa", d.cliente) : "",
      fila("Firmó", d.firmante),
      d.correoFirmante ? fila("Correo", d.correoFirmante) : fila("Correo", "no dejó"),
      fila("Cuándo", fechaLarga(d.fechaFirma)),
      fila("Método", METODO_FIRMA_LABEL[d.metodo]),
      d.ip ? fila("Desde (IP)", d.ip) : "",
      d.userAgent ? fila("Navegador", d.userAgent.slice(0, 120)) : "",
    ].join("");
    const html = envoltura(`
<h1 style="margin:0 0 6px;font-size:19px;color:#1c1c1a">Firma registrada ✍️</h1>
<p style="margin:0 0 18px;color:#55554f;font-size:13.5px;line-height:1.6">
${esc(d.firmante)} ${verbo} el proyecto.</p>
<table style="border-collapse:collapse;width:100%">${filas}</table>
${d.firmaAdjunta ? `<p style="margin:16px 0 0;color:#8a8a86;font-size:12px">La firma va adjunta a este correo.</p>` : ""}
${d.urlPanel ? `<p style="margin:20px 0 0"><a href="${esc(d.urlPanel)}" style="display:inline-block;background:#F97015;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:8px">Ver en el panel</a></p>` : ""}`);
    const text = [
      `Firma registrada: ${d.firmante} ${verbo} "${d.titulo}"${d.cliente ? ` (${d.cliente})` : ""}.`,
      d.correoFirmante ? `Correo: ${d.correoFirmante}` : "Sin correo del firmante.",
      `Cuándo: ${fechaLarga(d.fechaFirma)} · Método: ${METODO_FIRMA_LABEL[d.metodo]}${d.ip ? ` · IP: ${d.ip}` : ""}`,
      d.urlPanel ? `Panel: ${d.urlPanel}` : "",
    ].filter(Boolean).join("\n");
    return {
      subject: esCierre
        ? `✍️ Cierre: ${d.cliente || d.firmante} confirmó "${d.titulo}"`
        : `✍️ Aprobación: ${d.cliente || d.firmante} aprobó "${d.titulo}"`,
      html,
      text,
    };
  }

  const filas = [
    fila("Propuesta", d.titulo),
    d.cliente ? fila("Empresa", d.cliente) : "",
    fila("Firmó", d.firmante),
    d.correoFirmante ? fila("Correo", d.correoFirmante) : fila("Correo", "no dejó"),
    d.totalTexto ? fila("Inversión", d.totalTexto) : "",
    fila("Cuándo", fechaLarga(d.fechaFirma)),
    fila("Método", METODO_FIRMA_LABEL[d.metodo]),
    d.ip ? fila("Desde (IP)", d.ip) : "",
    d.userAgent ? fila("Navegador", d.userAgent.slice(0, 120)) : "",
  ].join("");
  const html = envoltura(`
<h1 style="margin:0 0 6px;font-size:19px;color:#1c1c1a">Firma registrada ✍️</h1>
<p style="margin:0 0 18px;color:#55554f;font-size:13.5px;line-height:1.6">
${esc(d.firmante)} aceptó y firmó la propuesta.</p>
<table style="border-collapse:collapse;width:100%">${filas}</table>
${d.firmaAdjunta ? `<p style="margin:16px 0 0;color:#8a8a86;font-size:12px">La firma va adjunta a este correo.</p>` : ""}
${d.urlPanel ? `<p style="margin:20px 0 0"><a href="${esc(d.urlPanel)}" style="display:inline-block;background:#F97015;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:8px">Ver en el panel</a></p>` : ""}`);
  const text = [
    `Firma registrada: ${d.firmante} aceptó "${d.titulo}"${d.cliente ? ` (${d.cliente})` : ""}.`,
    d.correoFirmante ? `Correo: ${d.correoFirmante}` : "Sin correo del firmante.",
    d.totalTexto ? `Inversión: ${d.totalTexto}` : "",
    `Cuándo: ${fechaLarga(d.fechaFirma)} · Método: ${METODO_FIRMA_LABEL[d.metodo]}${d.ip ? ` · IP: ${d.ip}` : ""}`,
    d.urlPanel ? `Panel: ${d.urlPanel}` : "",
  ].filter(Boolean).join("\n");
  return { subject: `✍️ Firma: ${d.cliente || d.firmante} aceptó "${d.titulo}"`, html, text };
}
