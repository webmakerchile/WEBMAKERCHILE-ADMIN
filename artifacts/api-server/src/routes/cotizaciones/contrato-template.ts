/**
 * Documentos del contrato con el sistema visual WebMaker.
 *
 * Del mismo trato salen dos PDFs:
 *  - CLIENTE  (renderContratoClienteHTML): la cotización comercial que se
 *    regenera desde el documento estructurado (WizData) cuando el contrato
 *    cambia. Antes esto lo dibujaba jspdf en el navegador con otra pinta;
 *    ahora comparte tipografía, colores y logo con la cotización original.
 *  - TÉCNICO  (renderContratoTecnicoHTML): "Documento interno" para quien
 *    construye. Misma línea gráfica y NI UN SOLO monto: además de no leer
 *    campos de dinero, todo texto pasa por stripMoneyFromText.
 *
 * Toda la matemática de dinero vive AQUÍ (servidor): neto por módulos,
 * IVA 19%, total, anticipo/saldo según downPct y mensualidad. El frontend
 * solo refleja estos mismos redondeos.
 *
 * Layout: flujo normal + @page con márgenes (preferCSSPageSize en pdf.ts),
 * porque el brief tiene largo variable — nada de páginas de alto fijo que
 * corten contenido.
 */

import { esc, logoDataUri } from "./template";
import { clp, calcIva } from "./finance";
import { stripMoneyFromText } from "../../lib/contract-view";

export interface ModuloContratoDoc {
  name: string;
  desc: string;
  price: number;
}

export interface DocContrato {
  client: string;
  project: string;
  scope: string;
  date: string;
  advisor: string;
  modules: ModuloContratoDoc[];
  downPct: number;
  notes: string;
  monthly: string;
  monthlyPrice: string;
  validityDays: number;
}

export interface BriefContrato {
  objetivo: string;
  contexto: string;
  alcance: { modulo: string; descripcion: string; entregables: string[]; requisitos: string[] }[];
  criteriosAceptacion: string[];
  fueraDeAlcance: string[];
  stackSugerido: string[];
  hitos: { nombre: string; detalle: string }[];
}

export interface FinanzasContrato {
  neto: number;
  iva: number;
  total: number;
  downPct: number;
  abono: number;
  saldo: number;
  mensualidadNeto: number;
  mensualidadIva: number;
  mensualidadTotal: number;
  /** YYYY-MM-DD o "" si no aplica. */
  vencimiento: string;
}

/** Módulos que cuentan: con nombre. El resto es ruido del formulario. */
export function modulosValidos(doc: DocContrato): ModuloContratoDoc[] {
  return (doc.modules || []).filter((m) => (m.name || "").trim() !== "");
}

/**
 * Matemática de dinero del contrato — misma fórmula que muestra el panel:
 * IVA = round(neto·0.19) · abono = round(total·downPct/100) · saldo = resto.
 */
export function finanzasContratoDoc(doc: DocContrato): FinanzasContrato {
  const neto = modulosValidos(doc).reduce((a, m) => a + (Number(m.price) || 0), 0);
  const iva = calcIva(neto);
  const total = neto + iva;
  const downPct = Math.min(100, Math.max(0, Math.round(Number(doc.downPct) || 0)));
  const abono = Math.round((total * downPct) / 100);
  const saldo = total - abono;
  const mensualidadNeto = Number(doc.monthlyPrice) || 0;
  const mensualidadIva = mensualidadNeto > 0 ? calcIva(mensualidadNeto) : 0;

  let vencimiento = "";
  const dias = Number(doc.validityDays) || 0;
  if (dias > 0) {
    const base = doc.date || new Date().toISOString().slice(0, 10);
    const exp = new Date(base + "T12:00:00");
    if (!isNaN(exp.getTime())) {
      exp.setDate(exp.getDate() + dias);
      vencimiento = exp.toISOString().slice(0, 10);
    }
  }

  return {
    neto, iva, total, downPct, abono, saldo,
    mensualidadNeto, mensualidadIva,
    mensualidadTotal: mensualidadNeto + mensualidadIva,
    vencimiento,
  };
}

/* ------------------------------------------------------------------ */

const fechaLarga = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
};

const mesAnio = (iso: string): string => {
  const d = iso ? new Date(iso + "T12:00:00") : new Date();
  const txt = isNaN(d.getTime()) ? new Date() : d;
  return txt.toLocaleDateString("es-CL", { month: "long", year: "numeric" }).toUpperCase();
};

/** Título con la última palabra en naranja, como la portada de cotizaciones. */
function tituloResaltado(titulo: string): string {
  const limpio = titulo.trim();
  const partes = limpio.split(/\s+/);
  if (partes.length < 2) return `<span class="hl">${esc(limpio)}</span>`;
  const ultima = partes.pop() as string;
  return `${esc(partes.join(" "))} <span class="hl">${esc(ultima)}</span>`;
}

/** CSS base compartido por ambos documentos (tokens del sistema WebMaker). */
const CT_CSS = `
:root {
  --bg: #0A0A0A;
  --surface: #141414;
  --surface-2: #1B1B1B;
  --border: #262626;
  --accent: #F97015;
  --accent-border: rgba(249, 112, 21, 0.35);
  --text: #F2F2F0;
  --text-muted: #A3A3A0;
  --text-dim: #6E6E6B;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
@page { size: A4; margin: 16mm 14mm 18mm 14mm; }
html { background: var(--bg); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
/* El padding lateral es OBLIGATORIO: Chromium pinta el fondo del body justo
   hasta el borde del margen de @page, y sin aire los glifos redondos (C, O, 0)
   quedan tocando la frontera blanco/negro y se ven "cortados". */
body { background: var(--bg); color: var(--text); font-family: 'IBM Plex Sans', sans-serif; font-size: 10pt; line-height: 1.5; padding: 0 10pt; }
p, li { orphans: 2; widows: 2; }
.mono { font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.12em; text-transform: uppercase; }
.hl { color: var(--accent); }
.no-break { break-inside: avoid; page-break-inside: avoid; }
/* Etiqueta + título de sección viajan juntos y pegados a su primer contenido:
   un título jamás queda huérfano al pie de una página. */
.sec-head { break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }

.ct-brand { display: flex; justify-content: space-between; align-items: flex-start; }
.ct-brand-left { display: flex; align-items: center; gap: 10px; }
.ct-brand-left img { height: 30px; width: auto; display: block; }
.ct-brand-name { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 9pt; letter-spacing: 0.08em; color: var(--text); line-height: 1.25; }
.ct-brand-tag { font-size: 7.5pt; color: var(--text-muted); max-width: 150px; line-height: 1.4; }
.ct-brand-meta { text-align: right; font-family: 'IBM Plex Mono', monospace; font-size: 7.5pt; color: var(--text-muted); letter-spacing: 0.12em; text-transform: uppercase; line-height: 1.9; }
.ct-brand-meta .top { color: var(--accent); }

.ct-badge { display: inline-block; border: 1px solid var(--accent-border); border-radius: 999px; padding: 5px 14px; font-family: 'IBM Plex Mono', monospace; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }

.ct-sec { margin-top: 26px; position: relative; }
.ct-sec-label { font-family: 'IBM Plex Mono', monospace; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
.ct-sec-label .num { color: var(--accent); }
.ct-sec-title { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 16pt; line-height: 1.25; text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 10px; }
.ct-rule { border: 0; border-top: 1px solid var(--border); margin: 14px 0; }

.ct-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.ct-muted { color: var(--text-muted); }
.ct-dim { color: var(--text-dim); }
.ct-small { font-size: 8.5pt; }

.ct-foot { margin-top: 30px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-family: 'IBM Plex Mono', monospace; font-size: 7.5pt; color: var(--text-dim); letter-spacing: 0.12em; text-transform: uppercase; break-inside: avoid; page-break-inside: avoid; break-before: avoid; page-break-before: avoid; }
`;

/** CSS propio del documento cliente. */
const CLIENTE_CSS = `
.cv { height: 258mm; display: flex; flex-direction: column; page-break-after: always; position: relative; }
.cv::before { content: ''; position: absolute; inset: -16mm -14mm; background: radial-gradient(ellipse 60% 45% at 30% 42%, rgba(232,123,60,0.10), transparent 70%); pointer-events: none; }
.cv-center { position: relative; margin-top: 44mm; }
.cv-title { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 30pt; line-height: 1.12; text-transform: uppercase; letter-spacing: 0.02em; margin: 16px 0 12px; max-width: 92%; }
.cv-sub { color: var(--text-muted); font-size: 10pt; max-width: 78%; line-height: 1.6; }
.cv-cards { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; position: relative; }
.cv-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 13px 15px; }
.cv-card .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 7pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 7px; }
.cv-card .big { font-weight: 700; font-size: 11pt; }
.cv-card .sub { color: var(--text-muted); font-size: 8.5pt; margin-top: 3px; line-height: 1.5; }
.cv-strip { margin-top: 10px; display: flex; justify-content: space-between; font-family: 'IBM Plex Mono', monospace; font-size: 7.5pt; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-dim); border-top: 1px solid var(--border); padding-top: 9px; position: relative; }

.mod { display: flex; gap: 12px; align-items: flex-start; padding: 11px 0; border-bottom: 1px solid var(--border); }
.mod:last-child { border-bottom: 0; }
.mod .n { font-family: 'IBM Plex Mono', monospace; color: var(--accent); font-size: 9pt; padding-top: 1px; min-width: 22px; }
.mod .name { font-weight: 700; font-size: 10.5pt; }
.mod .desc { color: var(--text-muted); font-size: 9pt; margin-top: 2px; line-height: 1.5; }
.mod .price { margin-left: auto; font-family: 'IBM Plex Mono', monospace; font-size: 9.5pt; white-space: nowrap; padding-top: 1px; }
.mod .price .u { display: block; font-size: 6.5pt; color: var(--text-dim); text-align: right; letter-spacing: 0.1em; }

.inv-row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 10pt; }
.inv-row .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); }
.inv-row .amt { font-family: 'IBM Plex Mono', monospace; }
.inv-row.total { border-bottom: 0; padding-top: 12px; }
.inv-row.total .lbl { color: var(--text); }
.inv-row.total .amt { color: var(--accent); font-size: 15pt; font-weight: 700; }

.pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.pay-box { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 13px 15px; }
.pay-box .pct { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 17pt; color: var(--accent); }
.pay-box .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 7pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-muted); margin: 3px 0 7px; }
.pay-box .amt { font-family: 'IBM Plex Mono', monospace; font-size: 11pt; }

.cond li { list-style: none; padding-left: 16px; position: relative; margin-bottom: 7px; color: var(--text-muted); font-size: 9.5pt; }
.cond li::before { content: ''; position: absolute; left: 0; top: 7px; width: 6px; height: 6px; border-radius: 999px; background: var(--accent); }

.firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 34px; }
.firma { padding-top: 40px; border-top: 1px solid var(--text-dim); }
.firma .who { font-weight: 700; font-size: 9.5pt; }
.firma .rol { color: var(--text-dim); font-size: 8pt; margin-top: 2px; font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; }
`;

/** CSS propio del documento técnico. */
const TECNICO_CSS = `
.th-title { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 22pt; line-height: 1.15; text-transform: uppercase; letter-spacing: 0.02em; margin: 14px 0 6px; }
.th-meta { font-family: 'IBM Plex Mono', monospace; font-size: 8pt; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
.th-aviso { margin-top: 12px; border: 1px solid var(--accent-border); border-radius: 10px; padding: 9px 13px; font-size: 8.5pt; color: var(--text-muted); background: rgba(249, 112, 21, 0.05); }
.th-aviso b { color: var(--accent); }

/* La tarjeta de módulo SÍ puede partirse entre páginas (si no, un módulo largo
   salta entero y deja media página vacía); cada fragmento clona borde y fondo. */
.tmod { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 13px 15px; margin-bottom: 10px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.tmod .name { font-weight: 700; font-size: 11pt; break-after: avoid; page-break-after: avoid; }
.tmod .desc { color: var(--text-muted); font-size: 9pt; margin: 4px 0 10px; line-height: 1.55; }
.tmod-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.tmod-cols .h { font-family: 'IBM Plex Mono', monospace; font-size: 7pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 6px; break-after: avoid; page-break-after: avoid; }
.tmod-cols li { list-style: none; padding-left: 13px; position: relative; margin-bottom: 5px; font-size: 8.5pt; color: var(--text); line-height: 1.45; break-inside: avoid; page-break-inside: avoid; }
.tmod-cols li::before { content: ''; position: absolute; left: 0; top: 6px; width: 5px; height: 5px; border-radius: 999px; background: var(--accent); }

.chk li { list-style: none; padding-left: 22px; position: relative; margin-bottom: 8px; font-size: 9.5pt; break-inside: avoid; page-break-inside: avoid; }
.chk li::before { content: ''; position: absolute; left: 0; top: 3px; width: 11px; height: 11px; border: 1.5px solid var(--accent); border-radius: 3px; }

.fuera li { list-style: none; padding-left: 16px; position: relative; margin-bottom: 6px; color: var(--text-dim); font-size: 9pt; break-inside: avoid; page-break-inside: avoid; }
.fuera li::before { content: '×'; position: absolute; left: 0; top: 0; color: var(--text-dim); font-weight: 700; }

.chips { display: flex; flex-wrap: wrap; gap: 7px; break-inside: avoid; page-break-inside: avoid; }
.chip { border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 4px 12px; font-family: 'IBM Plex Mono', monospace; font-size: 8pt; letter-spacing: 0.06em; }

.hito { display: flex; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border); break-inside: avoid; page-break-inside: avoid; }
.hito:last-child { border-bottom: 0; }
.hito .n { font-family: 'IBM Plex Mono', monospace; color: var(--accent); font-size: 9pt; min-width: 22px; padding-top: 1px; }
.hito .name { font-weight: 700; font-size: 10pt; }
.hito .det { color: var(--text-muted); font-size: 8.5pt; margin-top: 2px; }
`;

function docHtml(titulo: string, extraCss: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${esc(titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
<style>${CT_CSS}${extraCss}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function brandHeader(rightTop: string, rightBottom: string): string {
  const logo = logoDataUri();
  return `<div class="ct-brand">
    <div class="ct-brand-left">
      ${logo ? `<img src="${logo}" alt="WebMaker" />` : ""}
      <div>
        <div class="ct-brand-name">WEBMAKER <span class="hl">LATAM</span></div>
        <div class="ct-brand-tag">Diseño y desarrollo de plataformas</div>
      </div>
    </div>
    <div class="ct-brand-meta"><span class="top">${esc(rightTop)}</span><br/>${esc(rightBottom)}</div>
  </div>`;
}

function ctFoot(centro: string): string {
  return `<div class="ct-foot"><span>WEBMAKER LATAM · ${esc(centro)}</span><span>agencia@webmakerlatam.com</span></div>`;
}

function secHead(num: string, label: string, titulo: string): string {
  return `<div class="sec-head"><div class="ct-sec-label"><span class="num">${num}</span> · ${esc(label)}</div>
  <div class="ct-sec-title">${tituloResaltado(titulo)}</div></div>`;
}

/* ------------------------------------------------------------------
   Documento CLIENTE (cotización comercial regenerable)
   ------------------------------------------------------------------ */

export function renderContratoClienteHTML(doc: DocContrato): string {
  const mods = modulosValidos(doc);
  if (mods.length === 0) {
    throw new Error("El documento no tiene módulos con nombre: complétalo antes de generar el PDF.");
  }
  if (!(doc.client || "").trim() && !(doc.project || "").trim()) {
    throw new Error("El documento necesita al menos cliente o proyecto para generar el PDF.");
  }

  const fin = finanzasContratoDoc(doc);
  const cliente = (doc.client || "Cliente").trim();
  const proyecto = (doc.project || "Propuesta de servicios").trim();
  const scope = (doc.scope || "").trim();
  const asesor = (doc.advisor || "WebMaker Latam").trim() || "WebMaker Latam";
  const emision = doc.date || new Date().toISOString().slice(0, 10);

  const portada = `<div class="cv">
    ${brandHeader("Cotización comercial", mesAnio(doc.date))}
    <div class="cv-center">
      <span class="ct-badge">Cotización · ${esc(cliente)}</span>
      <div class="cv-title">${tituloResaltado(proyecto)}</div>
      ${scope ? `<p class="cv-sub">${esc(scope.length > 340 ? scope.slice(0, 337).trimEnd() + "…" : scope)}</p>` : ""}
    </div>
    <div class="cv-cards">
      <div class="cv-card">
        <div class="lbl">Preparado para</div>
        <div class="big">${esc(cliente)}</div>
        <div class="sub">Atiende: ${esc(asesor)}</div>
      </div>
      <div class="cv-card">
        <div class="lbl">Alcance de la propuesta</div>
        <div class="big">${mods.length} módulo${mods.length !== 1 ? "s" : ""}</div>
        <div class="sub">${esc(mods.map((m) => m.name.trim()).join(" · ").slice(0, 120))}</div>
      </div>
    </div>
    <div class="cv-strip">
      <span>Emisión · ${esc(fechaLarga(emision))}</span>
      <span>${fin.vencimiento ? `Válida hasta · ${esc(fechaLarga(fin.vencimiento))}` : "Validez por confirmar"}</span>
    </div>
  </div>`;

  const alcance = `<div class="ct-sec">
    ${secHead("01", "Alcance", "Qué incluye este proyecto")}
    <div class="ct-card">
      ${mods.map((m, i) => `<div class="mod no-break">
        <span class="n">${String(i + 1).padStart(2, "0")}</span>
        <div>
          <div class="name">${esc(m.name.trim())}</div>
          ${m.desc && m.desc.trim() ? `<div class="desc">${esc(m.desc.trim())}</div>` : ""}
        </div>
        <div class="price">${clp(Number(m.price) || 0)}<span class="u">neto</span></div>
      </div>`).join("")}
    </div>
  </div>`;

  const mensualidad = fin.mensualidadNeto > 0 || (doc.monthly || "").trim()
    ? `<div class="ct-card no-break" style="margin-top: 12px;">
        <div class="ct-sec-label" style="margin-bottom: 6px;"><span class="num">+</span> · Mensualidad</div>
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <div style="font-weight: 700;">${esc((doc.monthly || "Servicio mensual").trim() || "Servicio mensual")}</div>
          ${fin.mensualidadNeto > 0
            ? `<div class="mono" style="font-size: 10pt;">${clp(fin.mensualidadNeto)} <span class="ct-dim">neto</span> · ${clp(fin.mensualidadTotal)} <span class="ct-dim">/mes con IVA</span></div>`
            : `<div class="ct-dim ct-small">valor por definir</div>`}
        </div>
      </div>`
    : "";

  const inversion = `<div class="ct-sec no-break">
    ${secHead("02", "Inversión", "Valores y forma de pago")}
    <div class="ct-card">
      <div class="inv-row"><span class="lbl">Neto</span><span class="amt">${clp(fin.neto)}</span></div>
      <div class="inv-row"><span class="lbl">IVA 19%</span><span class="amt">${clp(fin.iva)}</span></div>
      <div class="inv-row total"><span class="lbl">Total proyecto</span><span class="amt">${clp(fin.total)}</span></div>
    </div>
    <div class="pay-grid">
      <div class="pay-box">
        <div class="pct">${fin.downPct}%</div>
        <div class="lbl">Al iniciar</div>
        <div class="amt">${clp(fin.abono)}</div>
      </div>
      <div class="pay-box">
        <div class="pct">${100 - fin.downPct}%</div>
        <div class="lbl">A la entrega</div>
        <div class="amt">${clp(fin.saldo)}</div>
      </div>
    </div>
    ${mensualidad}
  </div>`;

  const condiciones: string[] = [];
  if (fin.vencimiento) {
    condiciones.push(`Cotización válida por ${Number(doc.validityDays) || 0} días, hasta el ${fechaLarga(fin.vencimiento)}.`);
  }
  condiciones.push("Valores en pesos chilenos (CLP). El IVA (19%) se detalla por separado.");
  condiciones.push(`Forma de pago: ${fin.downPct}% al iniciar y ${100 - fin.downPct}% contra entrega.`);
  const notas = (doc.notes || "").trim();

  const cierre = `<div class="ct-sec">
    ${secHead("03", "Condiciones", "Acuerdo y aceptación")}
    <ul class="cond">
      ${condiciones.map((c) => `<li>${esc(c)}</li>`).join("")}
      ${notas ? `<li>${esc(notas)}</li>` : ""}
    </ul>
    <div class="no-break">
      <div class="firmas">
        <div class="firma">
          <div class="who">${esc(asesor)}</div>
          <div class="rol">WebMaker Latam</div>
        </div>
        <div class="firma">
          <div class="who">${esc(cliente)}</div>
          <div class="rol">Cliente · acepta la propuesta</div>
        </div>
      </div>
      ${ctFoot(`Cotización · ${cliente.toUpperCase()}`)}
    </div>
  </div>`;

  return docHtml(`Cotización · ${cliente}`, CLIENTE_CSS, portada + alcance + inversion + cierre);
}

/* ------------------------------------------------------------------
   Documento TÉCNICO (interno, sin montos)
   ------------------------------------------------------------------ */

/** Limpia cualquier monto que se haya colado en un texto del brief. */
const sm = (s: string): string => stripMoneyFromText(String(s || "")).trim();

export function renderContratoTecnicoHTML(brief: BriefContrato, doc?: Partial<DocContrato> | null): string {
  const alcance = Array.isArray(brief.alcance) ? brief.alcance : [];
  if (!sm(brief.objetivo) && alcance.length === 0) {
    throw new Error("El brief técnico está vacío: genera la versión técnica antes de pedir su PDF.");
  }

  const proyecto = sm(doc?.project || "") || "Documento técnico";
  const cliente = sm(doc?.client || "");
  const fecha = (doc?.date || "").trim() || new Date().toISOString().slice(0, 10);
  let n = 0;
  const num = () => String(++n).padStart(2, "0");
  const partes: string[] = [];

  partes.push(`<div>
    ${brandHeader("Documento interno", mesAnio(doc?.date || ""))}
    <div style="margin-top: 22px;"><span class="ct-badge">Versión técnica · sin montos</span></div>
    <div class="th-title">${tituloResaltado(proyecto)}</div>
    <div class="th-meta">${cliente ? `Cliente · ${esc(cliente)} &nbsp;·&nbsp; ` : ""}${esc(fechaLarga(fecha))}</div>
    <div class="th-aviso"><b>Para quien construye.</b> Este documento describe el trabajo sin valores comerciales; la cara comercial vive en la cotización del cliente.</div>
  </div>`);

  const objetivo = sm(brief.objetivo);
  const contexto = sm(brief.contexto);
  if (objetivo || contexto) {
    partes.push(`<div class="ct-sec">
      ${secHead(num(), "Objetivo", "Qué se quiere lograr")}
      ${objetivo ? `<p style="margin-bottom: 8px;">${esc(objetivo)}</p>` : ""}
      ${contexto ? `<p class="ct-muted ct-small">${esc(contexto)}</p>` : ""}
    </div>`);
  }

  if (alcance.length > 0) {
    partes.push(`<div class="ct-sec">
      ${secHead(num(), "Alcance", "Módulos y entregables")}
      ${alcance.map((a) => {
        const entregables = (a.entregables || []).map(sm).filter(Boolean);
        const requisitos = (a.requisitos || []).map(sm).filter(Boolean);
        return `<div class="tmod">
          <div class="name">${esc(sm(a.modulo) || "Módulo")}</div>
          ${sm(a.descripcion) ? `<div class="desc">${esc(sm(a.descripcion))}</div>` : ""}
          ${entregables.length || requisitos.length ? `<div class="tmod-cols">
            <div>${entregables.length ? `<div class="h">Entregables</div><ul>${entregables.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}</div>
            <div>${requisitos.length ? `<div class="h">Requisitos</div><ul>${requisitos.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}</div>
          </div>` : ""}
        </div>`;
      }).join("")}
    </div>`);
  }

  const criterios = (brief.criteriosAceptacion || []).map(sm).filter(Boolean);
  if (criterios.length) {
    partes.push(`<div class="ct-sec">
      ${secHead(num(), "Aceptación", "Criterios para dar por cumplido")}
      <ul class="chk">${criterios.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
    </div>`);
  }

  const fuera = (brief.fueraDeAlcance || []).map(sm).filter(Boolean);
  if (fuera.length) {
    partes.push(`<div class="ct-sec">
      ${secHead(num(), "Límites", "Fuera de alcance")}
      <ul class="fuera">${fuera.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    </div>`);
  }

  const stack = (brief.stackSugerido || []).map(sm).filter(Boolean);
  if (stack.length) {
    partes.push(`<div class="ct-sec">
      ${secHead(num(), "Stack", "Tecnologías sugeridas")}
      <div class="chips">${stack.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>
    </div>`);
  }

  const hitos = (brief.hitos || []).filter((h) => sm(h?.nombre) || sm(h?.detalle));
  if (hitos.length) {
    partes.push(`<div class="ct-sec">
      ${secHead(num(), "Hitos", "Cómo avanza el proyecto")}
      <div class="ct-card">${hitos.map((h, i) => `<div class="hito">
        <span class="n">${String(i + 1).padStart(2, "0")}</span>
        <div>
          <div class="name">${esc(sm(h.nombre) || `Hito ${i + 1}`)}</div>
          ${sm(h.detalle) ? `<div class="det">${esc(sm(h.detalle))}</div>` : ""}
        </div>
      </div>`).join("")}</div>
    </div>`);
  }

  // El pie se ancla por CSS (.ct-foot con break-before: avoid): viaja con la
  // última línea de contenido sin obligar a que TODA la sección final sea un
  // bloque indivisible (eso saltaba secciones enteras y dejaba páginas a medias).
  partes.push(ctFoot("Documento interno · versión técnica"));

  return docHtml(`Documento técnico · ${proyecto}`, TECNICO_CSS, partes.join("\n"));
}
