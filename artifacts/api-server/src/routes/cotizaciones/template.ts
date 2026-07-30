import fs from "fs";
import path from "path";
import type { Cotizacion } from "./schema";
import { calcularFinanzas, clp, type FinanzasCotizacion } from "./finance";

/**
 * Plantilla HTML/CSS FIJA de la cotización (réplica píxel a píxel del PDF
 * de referencia M&M Moda). El LLM jamás toca esto: solo se inyectan textos
 * ya validados y montos calculados por el servidor.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

let logoCache: string | null = null;
export function logoDataUri(): string {
  if (logoCache) return logoCache;
  const candidates = [
    path.resolve("artifacts/api-server/assets/logo-fox.png"),
    path.resolve("assets/logo-fox.png"),
    path.join(process.cwd(), "assets/logo-fox.png"),
    ...(typeof __dirname !== "undefined" ? [path.join(__dirname, "../../../assets/logo-fox.png")] : []),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        logoCache = "data:image/png;base64," + fs.readFileSync(p).toString("base64");
        return logoCache;
      }
    } catch {
      /* try next */
    }
  }
  // Devolver "" en silencio dejaba el contrato SIN logo y sin que nadie se
  // enterara hasta ver el PDF ya enviado al cliente.
  console.warn("[cotizaciones] no se encontró assets/logo-fox.png: el PDF saldrá sin logo");
  logoCache = "";
  return logoCache;
}

const CSS = `
:root {
  --bg: #0A0A0A;
  --surface: #141414;
  --surface-2: #1B1B1B;
  --border: #262626;
  --accent: #E87B3C;
  --accent-border: rgba(232, 123, 60, 0.35);
  --accent-glow: #24150E;
  --text: #F2F2F0;
  --text-muted: #A3A3A0;
  --text-dim: #6E6E6B;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: var(--bg); }
@page { size: A4; margin: 0; }
.page {
  width: 210mm;
  height: 297mm;
  background: var(--bg);
  position: relative;
  overflow: hidden;
  page-break-after: always;
  padding: 18mm 16mm 22mm 16mm;
  box-sizing: border-box;
  font-family: 'IBM Plex Sans', sans-serif;
  color: var(--text);
}
.page:last-child { page-break-after: auto; }
.mono { font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.12em; text-transform: uppercase; }

/* ---- Footer interior ---- */
.footer {
  position: absolute;
  left: 16mm; right: 16mm; bottom: 10mm;
  display: flex; justify-content: space-between; align-items: baseline;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 8pt; color: var(--text-dim); letter-spacing: 0.12em; text-transform: uppercase;
}

/* ---- Encabezado de sección ---- */
.sec-label { font-family: 'IBM Plex Mono', monospace; font-size: 8.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }
.sec-label .num { color: var(--accent); }
.sec-title { font-family: 'IBM Plex Sans', sans-serif; font-weight: 700; font-size: 18pt; line-height: 1.25; color: var(--text); max-width: 78%; margin-bottom: 8px; position: relative; z-index: 1; }
.sec-title .hl { color: var(--accent); }
.sec-intro { font-size: 10pt; color: var(--text-muted); margin-bottom: 18px; line-height: 1.5; position: relative; z-index: 1; }
.ghost {
  position: absolute; top: 16mm; right: 16mm;
  font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 58pt; line-height: 1;
  color: rgba(255, 255, 255, 0.055); letter-spacing: 0.02em; z-index: 0;
}

/* ---- Portada ---- */
.cover { display: flex; flex-direction: column; }
.cover::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 60% 45% at 30% 45%, rgba(232,123,60,0.10), transparent 70%);
  pointer-events: none;
}
.cover-header { display: flex; justify-content: space-between; align-items: flex-start; position: relative; }
.cover-brand { display: flex; align-items: center; gap: 10px; }
.cover-brand img { height: 30px; width: auto; display: block; }
.cover-brand-txt { display: flex; flex-direction: column; }
.cover-brand-name { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 8.5pt; letter-spacing: 0.08em; color: var(--text); line-height: 1.2; }
.cover-brand-name .hl { color: var(--accent); }
.cover-brand-tag { font-size: 8pt; color: var(--text-muted); max-width: 140px; line-height: 1.4; }
.cover-meta { text-align: right; font-family: 'IBM Plex Mono', monospace; font-size: 8pt; color: var(--text-muted); letter-spacing: 0.12em; text-transform: uppercase; line-height: 1.8; }
.cover-center { position: relative; margin-top: 46mm; }
.cover-badge {
  display: inline-block; border: 1px solid var(--accent-border); border-radius: 999px;
  padding: 6px 14px; font-family: 'IBM Plex Mono', monospace; font-size: 8.5pt;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 18px;
}
.cover-title { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 40pt; line-height: 1.06; text-transform: uppercase; color: var(--text); margin-bottom: 16px; max-width: 66%; }
.cover-title .hl { color: var(--accent); }
.cover-sub { font-size: 10.5pt; color: var(--text-muted); line-height: 1.65; max-width: 68%; }
.cover-cards { display: flex; gap: 14px; position: relative; margin-top: 15mm; }
.cover-card { width: 48%; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
.cover-card .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 8.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
.cover-card .ttl { font-weight: 700; font-size: 12.5pt; color: var(--text); margin-bottom: 6px; }
.cover-card .dsc { font-size: 9.5pt; color: var(--text-muted); line-height: 1.5; }
.cover-footer {
  position: absolute; left: 16mm; right: 16mm; bottom: 10mm;
  border-top: 1px solid #1F1F1F; padding-top: 12px;
  display: flex; justify-content: space-between; align-items: flex-start;
  font-family: 'IBM Plex Mono', monospace; font-size: 8pt; color: var(--text-dim);
  letter-spacing: 0.12em; text-transform: uppercase;
}
.cover-footer .right { text-align: right; line-height: 1.8; text-transform: none; }

/* ---- Contexto ---- */
.ctx-p { font-size: 9.5pt; color: var(--text-muted); line-height: 1.65; margin-bottom: 12px; position: relative; z-index: 1; }
.ctx-p strong { color: var(--text); font-weight: 700; }
.stats { display: flex; gap: 12px; margin: 20px 0 24px; }
.stat { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.stat .v { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 26pt; color: var(--accent); line-height: 1.1; margin-bottom: 6px; }
.stat .d { font-size: 8.5pt; color: var(--text-muted); line-height: 1.45; }
.solve-title { font-weight: 700; font-size: 10.5pt; color: var(--text); margin-bottom: 12px; }
.check { display: flex; gap: 10px; margin-bottom: 9px; font-size: 9.5pt; color: var(--text-muted); line-height: 1.5; }
.check .tick { color: var(--accent); font-weight: 700; }

/* ---- Alcance ---- */
.mod-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; margin-bottom: 11px; position: relative; z-index: 1; }
.mod-title { font-weight: 700; font-size: 11.5pt; color: var(--text); margin-bottom: 5px; }
.mod-title .n { color: var(--accent); }
.mod-desc { font-size: 9pt; color: var(--text-muted); line-height: 1.5; margin-bottom: 10px; }
.price-row { background: var(--surface-2); border-radius: 8px; padding: 9px 14px; display: grid; grid-template-columns: 1fr 1fr 1fr; }
.price-cell .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 7pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 4px; }
.price-cell .amt { font-family: 'IBM Plex Mono', monospace; font-weight: 500; font-size: 10pt; color: var(--text); letter-spacing: 0.02em; }
.price-cell .amt.total { color: var(--accent); font-weight: 700; }
.total-card { background: linear-gradient(90deg, #1A100A, var(--surface)); border: 1px solid var(--accent-border); border-radius: 10px; padding: 15px 18px; margin-top: 4px; position: relative; z-index: 1; }
.total-card .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text); margin-bottom: 10px; }
.total-card .price-row { background: transparent; padding: 0; }
.total-card .amt { font-size: 10.5pt; font-weight: 700; }
.total-card .amt.total { font-size: 12.5pt; }
.scope-note {
  background: var(--surface); border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0;
  padding: 10px 14px; font-size: 8.5pt; color: var(--text-muted); line-height: 1.55; margin-top: 12px;
  position: relative; z-index: 1;
}

/* ---- Cómo funciona / Incluido ---- */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; position: relative; z-index: 1; }
.how-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.how-card .actor { font-family: 'IBM Plex Mono', monospace; font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 7px; }
.how-card .ttl { font-weight: 700; font-size: 10.5pt; color: var(--text); margin-bottom: 5px; }
.how-card .dsc { font-size: 8.5pt; color: var(--text-muted); line-height: 1.5; }

/* ---- Cronograma ---- */
.phase { display: flex; gap: 14px; align-items: flex-start; border-bottom: 1px solid var(--border); padding: 13px 2px; position: relative; z-index: 1; }
.phase:first-of-type { padding-top: 4px; }
.phase-num {
  width: 26px; height: 26px; min-width: 26px; border: 1.5px solid var(--accent); border-radius: 50%;
  display: flex; align-items: center; justify-content: center; margin-top: 1px;
  font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 10pt; color: var(--accent);
}
.phase-body .ttl { font-weight: 700; font-size: 10.5pt; color: var(--text); margin-bottom: 3px; }
.phase-body .dsc { font-size: 9pt; color: var(--text-muted); line-height: 1.5; }
.page-note {
  background: var(--surface); border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0;
  padding: 10px 14px; font-size: 8.5pt; color: var(--text-muted); line-height: 1.55; margin-top: 18px;
  position: relative; z-index: 1;
}

/* ---- Mensualidad ---- */
.monthly-hero { background: linear-gradient(90deg, #1A100A, var(--surface)); border: 1px solid var(--accent-border); border-radius: 10px; padding: 18px 20px; margin-bottom: 13px; position: relative; z-index: 1; }
.monthly-hero .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; }
.monthly-hero .amt { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 30pt; color: var(--accent); line-height: 1.1; margin-bottom: 7px; }
.monthly-hero .note { font-family: 'IBM Plex Mono', monospace; font-size: 7.5pt; color: var(--text-muted); line-height: 1.6; letter-spacing: 0.02em; }
.nocover { margin-top: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; position: relative; z-index: 1; }
.nocover .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 9px; }
.nocover .item { display: flex; gap: 8px; font-size: 8.5pt; color: var(--text-muted); line-height: 1.5; margin-bottom: 6px; }
.nocover .item:last-child { margin-bottom: 0; }
.nocover .dash { color: var(--text-dim); }

/* ---- Pago ---- */
.pay-row { display: flex; gap: 14px; margin-bottom: 14px; position: relative; z-index: 1; }
.pay-block { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 18px; text-align: center; }
.pay-block .pct { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 32pt; color: var(--accent); line-height: 1.05; margin-bottom: 5px; }
.pay-block .lbl { font-family: 'IBM Plex Mono', monospace; font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; }
.pay-block .amt { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 13pt; color: var(--text); }
.pay-callout {
  background: var(--surface); border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0;
  padding: 10px 14px; font-size: 8.5pt; color: var(--text-muted); line-height: 1.6; margin-bottom: 10px;
  position: relative; z-index: 1;
}
.pay-personal {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 16px; font-size: 8.5pt; color: var(--text-muted); line-height: 1.6; margin-bottom: 10px;
  position: relative; z-index: 1;
}
.steps-title { font-weight: 700; font-size: 10.5pt; color: var(--text); margin: 16px 0 11px; }
.step { display: flex; gap: 12px; align-items: center; margin-bottom: 9px; }
.step-num {
  width: 22px; height: 22px; min-width: 22px; border: 1.5px solid var(--accent); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 9pt; color: var(--accent);
}
.step .txt { font-size: 9.5pt; color: var(--text-muted); line-height: 1.4; }

/* ---- Cierre ---- */
.final { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; padding-top: 105mm; }
.final img { height: 58px; width: auto; margin-bottom: 12px; }
.final .brand { font-family: 'Oswald', sans-serif; font-weight: 700; font-size: 14pt; letter-spacing: 0.1em; color: var(--text); }
.final .brand .hl { color: var(--accent); }
.final .brand-sub { font-family: 'IBM Plex Mono', monospace; font-size: 7pt; letter-spacing: 0.35em; color: var(--text-muted); margin: 3px 0 16px; }
.final .line { font-size: 9.5pt; color: var(--text-muted); margin-bottom: 20px; }
.final-card { max-width: 150mm; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px 26px; }
.final-card p { font-size: 9pt; color: var(--text-muted); line-height: 1.7; }
.final-card p + p { margin-top: 10px; }
`;

interface Section {
  key: string;
  label: string;
}

function footer(empresa: string, anio: string, n: number, total: number): string {
  return `<div class="footer"><span>WEBMAKER LATAM · COTIZACIÓN · ${esc(empresa.toUpperCase())} · ${esc(anio)}</span><span>${n} / ${total}</span></div>`;
}

function heroTitle(titulo: string, resaltado?: string): string {
  const t = esc(titulo);
  if (!resaltado) return t;
  const r = esc(resaltado);
  const idx = t.lastIndexOf(r);
  if (idx === -1) return t;
  return `${t.slice(0, idx)}<span class="hl">${r}</span>${t.slice(idx + r.length)}`;
}

function secHeader(num: string, label: string, titulo: string, intro?: string, resaltado?: string): string {
  return `
    <div class="ghost">${num}</div>
    <div class="sec-label"><span class="num">${num}</span> · ${esc(label)}</div>
    <div class="sec-title">${heroTitle(titulo, resaltado)}</div>
    ${intro ? `<div class="sec-intro">${esc(intro)}</div>` : ""}`;
}

function priceRow(neto: number, iva: number, total: number): string {
  return `<div class="price-row">
    <div class="price-cell"><div class="lbl">NETO</div><div class="amt">${clp(neto)}</div></div>
    <div class="price-cell"><div class="lbl">IVA 19%</div><div class="amt">${clp(iva)}</div></div>
    <div class="price-cell"><div class="lbl">TOTAL</div><div class="amt total">${clp(total)}</div></div>
  </div>`;
}

const NUM_WORDS = ["", "Una pieza", "Dos piezas", "Tres piezas", "Cuatro piezas"];

export function renderCotizacionHTML(data: Cotizacion): string {
  const fin: FinanzasCotizacion = calcularFinanzas({
    modulos: data.modulos,
    mensualidadNeto: data.mensualidad ? data.mensualidad.neto : null,
    esquema: data.pago.esquema,
  });
  return renderWithFinanzas(data, fin);
}

function renderWithFinanzas(data: Cotizacion, fin: FinanzasCotizacion): string {
  const { meta } = data;
  const logo = logoDataUri();
  const hasMensualidad = !!data.mensualidad;

  // Secciones interiores en orden, con numeración dinámica
  const sections: Section[] = [
    { key: "contexto", label: "CONTEXTO" },
    { key: "alcance", label: "ALCANCE E INVERSIÓN" },
    { key: "como", label: "CÓMO FUNCIONA" },
    { key: "cronograma", label: "CRONOGRAMA" },
    ...(hasMensualidad ? [{ key: "mensualidad", label: "MENSUALIDAD" }] : []),
    { key: "pago", label: "CONDICIONES DE PAGO" },
  ];
  const secNum = (key: string) => "0" + (sections.findIndex((s) => s.key === key) + 1);

  // Alcance puede necesitar página de continuación (máx 3 módulos por página)
  const MODS_PER_PAGE = 3;
  const modChunks: typeof fin.modulos[] = [];
  for (let i = 0; i < fin.modulos.length; i += MODS_PER_PAGE) {
    modChunks.push(fin.modulos.slice(i, i + MODS_PER_PAGE));
  }
  // La card de total va en la última página de alcance; si el último chunk está
  // lleno con 3 módulos y hay más de un chunk, el total cabe igual (chunk corto).
  const totalPages = 1 + sections.length + (modChunks.length - 1) + 1; // portada + secciones + cont. + cierre

  const pages: string[] = [];
  let pageNo = 1;

  /* ---------- PORTADA ---------- */
  pages.push(`
  <div class="page cover">
    <div class="cover-header">
      <div class="cover-brand">
        ${logo ? `<img src="${logo}" alt="WebMaker Latam" />` : ""}
        <div class="cover-brand-txt">
          <div class="cover-brand-name">WEB<span class="hl">MAKER</span> LATAM</div>
          <div class="cover-brand-tag">Diseño y desarrollo de plataformas</div>
        </div>
      </div>
      <div class="cover-meta">COTIZACIÓN COMERCIAL<br/>${esc(meta.mes_anio)}</div>
    </div>
    <div class="cover-center">
      <div class="cover-badge">COTIZACIÓN · ${esc(meta.empresa.toUpperCase())}</div>
      <div class="cover-title">${heroTitle(data.portada.titulo, data.portada.titulo_resaltado)}</div>
      <div class="cover-sub">${esc(data.portada.subtitulo)}</div>
    </div>
    <div class="cover-cards">
      <div class="cover-card">
        <div class="lbl">PREPARADO PARA</div>
        <div class="ttl">${esc(meta.cliente_nombre)} · ${esc(meta.empresa)}</div>
        <div class="dsc">${esc(meta.empresa_descripcion)}</div>
      </div>
      <div class="cover-card">
        <div class="lbl">ALCANCE DE LA COTIZACIÓN</div>
        <div class="ttl">${esc(data.portada.alcance_titulo)}</div>
        <div class="dsc">${esc(data.portada.alcance_detalle)}</div>
      </div>
    </div>
    <div class="cover-footer">
      <span>WEBMAKER LATAM · WEBMAKERLATAM.COM</span>
      <span class="right">agencia@webmakerlatam.com<br/>webmakerlatam.com</span>
    </div>
  </div>`);
  pageNo++;

  /* ---------- 01 CONTEXTO ---------- */
  pages.push(`
  <div class="page">
    ${secHeader(secNum("contexto"), "CONTEXTO", data.contexto.titulo, undefined, data.contexto.titulo_resaltado)}
    ${data.contexto.parrafos.map((p) => `<p class="ctx-p">${esc(p)}</p>`).join("")}
    <div class="stats">
      ${data.contexto.stats
        .map((s) => `<div class="stat"><div class="v">${esc(s.valor)}</div><div class="d">${esc(s.descripcion)}</div></div>`)
        .join("")}
    </div>
    <div class="solve-title">Lo que resolvemos con este proyecto:</div>
    ${data.contexto.soluciones.map((s) => `<div class="check"><span class="tick">✓</span><span>${esc(s)}</span></div>`).join("")}
    ${footer(meta.empresa, meta.anio, pageNo, totalPages)}
  </div>`);
  pageNo++;

  /* ---------- 02 ALCANCE E INVERSIÓN ---------- */
  const nWord = NUM_WORDS[data.modulos.length] || `${data.modulos.length} piezas`;
  const alcanceIntro = `${nWord}, cada una con precio cerrado e IVA incluido y desglosado:`.replace(/^(\w)/, (c) =>
    c.toUpperCase()
  );
  const alcanceTitulo = data.alcance_titulo || "Lo que incluye tu proyecto, con precio cerrado.";
  modChunks.forEach((chunk, ci) => {
    const isLast = ci === modChunks.length - 1;
    const header =
      ci === 0
        ? secHeader(secNum("alcance"), "ALCANCE E INVERSIÓN", alcanceTitulo, alcanceIntro, data.alcance_titulo_resaltado)
        : `<div class="sec-label"><span class="num">${secNum("alcance")}</span> · ALCANCE E INVERSIÓN (CONT.)</div>`;
    pages.push(`
  <div class="page">
    ${header}
    ${chunk
      .map((m, i) => {
        const idx = ci * MODS_PER_PAGE + i + 1;
        return `<div class="mod-card">
        <div class="mod-title"><span class="n">${idx} ·</span> ${esc(m.nombre)}</div>
        <div class="mod-desc">${esc(m.descripcion)}</div>
        ${priceRow(m.neto, m.iva, m.total)}
      </div>`;
      })
      .join("")}
    ${
      isLast
        ? `<div class="total-card">
        <div class="lbl">INVERSIÓN TOTAL DEL PROYECTO</div>
        ${priceRow(fin.proyectoNeto, fin.proyectoIva, fin.proyectoTotal)}
      </div>
      <div class="scope-note">${esc(data.nota_alcance)}</div>`
        : ""
    }
    ${footer(meta.empresa, meta.anio, pageNo, totalPages)}
  </div>`);
    pageNo++;
  });

  /* ---------- 03 CÓMO FUNCIONA ---------- */
  pages.push(`
  <div class="page">
    ${secHeader(secNum("como"), "CÓMO FUNCIONA", data.como_funciona.titulo, data.como_funciona.intro || "Así se ve en el día a día:", data.como_funciona.titulo_resaltado)}
    <div class="grid2">
      ${data.como_funciona.items
        .map(
          (it) => `<div class="how-card">
        <div class="actor">${esc(it.actor)}</div>
        <div class="ttl">${esc(it.titulo)}</div>
        <div class="dsc">${esc(it.descripcion)}</div>
      </div>`
        )
        .join("")}
    </div>
    ${footer(meta.empresa, meta.anio, pageNo, totalPages)}
  </div>`);
  pageNo++;

  /* ---------- 04 CRONOGRAMA ---------- */
  pages.push(`
  <div class="page">
    ${secHeader(secNum("cronograma"), "CRONOGRAMA", data.cronograma.titulo, data.cronograma.intro, data.cronograma.titulo_resaltado)}
    ${data.cronograma.fases
      .map(
        (f, i) => `<div class="phase">
      <div class="phase-num">${i + 1}</div>
      <div class="phase-body"><div class="ttl">${esc(f.titulo)}</div><div class="dsc">${esc(f.descripcion)}</div></div>
    </div>`
      )
      .join("")}
    <div class="page-note">${esc(data.cronograma.nota)}</div>
    ${footer(meta.empresa, meta.anio, pageNo, totalPages)}
  </div>`);
  pageNo++;

  /* ---------- 05 MENSUALIDAD (opcional) ---------- */
  if (data.mensualidad && fin.mensualidad) {
    const m = data.mensualidad;
    pages.push(`
  <div class="page">
    ${secHeader(
      secNum("mensualidad"),
      "MENSUALIDAD",
      m.titulo || "Mantención y soporte, todo en un solo pago.",
      m.intro || "Para que todo siga funcionando sin que te preocupes:",
      m.titulo_resaltado
    )}
    <div class="monthly-hero">
      <div class="lbl">MENSUALIDAD · HOSTING Y MANTENCIÓN</div>
      <div class="amt">${clp(fin.mensualidad.total)}</div>
      <div class="note">Neto ${clp(fin.mensualidad.neto)} + IVA 19% (${clp(fin.mensualidad.iva)}) — precio cerrado, se factura mes a mes desde el mes siguiente a la entrega.</div>
    </div>
    <div class="grid2">
      ${m.incluye
        .map(
          (it) => `<div class="how-card">
        <div class="actor">INCLUIDO</div>
        <div class="ttl">${esc(it.titulo)}</div>
        <div class="dsc">${esc(it.descripcion)}</div>
      </div>`
        )
        .join("")}
    </div>
    <div class="nocover">
      <div class="lbl">QUÉ NO CUBRE LA MENSUALIDAD</div>
      ${m.no_cubre.map((n) => `<div class="item"><span class="dash">–</span><span>${esc(n)}</span></div>`).join("")}
    </div>
    ${footer(meta.empresa, meta.anio, pageNo, totalPages)}
  </div>`);
    pageNo++;
  }

  /* ---------- 06 CONDICIONES DE PAGO ---------- */
  pages.push(`
  <div class="page">
    ${secHeader(
      secNum("pago"),
      "CONDICIONES DE PAGO",
      data.pago.titulo || "Cuando quieras partir, está todo listo.",
      "Simple y directo, sin sorpresas:",
      data.pago.titulo_resaltado
    )}
    <div class="pay-row">
      ${fin.pagos
        .map(
          (h) => `<div class="pay-block">
        <div class="pct">${h.porcentaje}%</div>
        <div class="lbl">${esc(h.momento)}</div>
        <div class="amt">${clp(h.monto)}</div>
      </div>`
        )
        .join("")}
    </div>
    <div class="pay-callout">${
      fin.pagos.length > 1 ? "Ambos montos con IVA incluido." : "Monto con IVA incluido."
    } El proyecto arranca con el primer abono; el saldo se paga cuando ${esc(data.pago.condicion_saldo)}.</div>
    <div class="pay-personal">${esc(data.pago.nota_personal)}</div>
    <div class="steps-title">Próximos pasos, cuando quieran partir:</div>
    ${data.pago.proximos_pasos
      .map((s, i) => `<div class="step"><div class="step-num">${i + 1}</div><div class="txt">${esc(s)}</div></div>`)
      .join("")}
    ${footer(meta.empresa, meta.anio, pageNo, totalPages)}
  </div>`);
  pageNo++;

  /* ---------- CIERRE ---------- */
  pages.push(`
  <div class="page final">
    ${logo ? `<img src="${logo}" alt="WebMaker Latam" />` : ""}
    <div class="brand">WEB<span class="hl">MAKER</span></div>
    <div class="brand-sub">LATAM</div>
    <div class="line">${esc(data.portada.alcance_titulo)} · ${esc(meta.empresa)}</div>
    <div class="final-card">
      <p>${esc(data.cierre.linea1)}</p>
      <p>${esc(data.cierre.linea2)}</p>
    </div>
    ${footer(meta.empresa, meta.anio, totalPages, totalPages)}
  </div>`);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Cotización · ${esc(meta.empresa)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
<style>${CSS}</style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;
}
