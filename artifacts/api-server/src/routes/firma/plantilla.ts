// Página pública del contrato: la cara de WebMaker ante el cliente.
//
// Misma identidad que la cotización PDF (routes/cotizaciones/template.ts):
// fondo #0A0A0A, naranja #F97015, Oswald para títulos y IBM Plex para el
// resto. Pero NO es el PDF: esto se lee en un teléfono, así que es una sola
// columna fluida y no páginas A4.
//
// Sin dependencias de frontend a propósito: el cliente no tiene cuenta y no
// debería cargar el panel entero para leer y firmar. Todo el JS que hay es el
// de la firma (canvas, subida, texto) escrito a mano aquí abajo.

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const CLP = (n: number): string => "$" + Math.round(n).toLocaleString("es-CL");

export interface ModuloFirma {
  nombre: string;
  desc: string;
  neto: number | null;
}

export interface DocumentoFirma {
  titulo: string;
  cliente: string;
  fecha: string;
  asesor: string;
  alcance: string;
  notas: string;
  modulos: ModuloFirma[];
  totalNeto: number | null;
  iva: number | null;
  totalConIva: number | null;
  downPct: number | null;
  monthly: string;
  monthlyPrice: number | null;
  /** Total formateado guardado en la ficha ("$1.234.567"), por si no hay precios por módulo. */
  valorFicha: string;
  /** Hasta cuándo es válida la propuesta (fecha del enlace o del contrato). */
  validaHasta: string;
}

const FUENTES = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=IBM+Plex+Sans:wght@400;600;700&family=Oswald:wght@600;700&family=Caveat:wght@600&display=swap" rel="stylesheet">`;

const ESTILO = `
:root{color-scheme:dark;--bg:#0A0A0A;--surface:#141414;--surface2:#1B1B1B;--border:#262626;
--accent:#F97015;--accent-border:rgba(249,112,21,.35);--text:#F2F2F0;--muted:#A3A3A0;--dim:#6E6E6B}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'IBM Plex Sans',system-ui,sans-serif;line-height:1.55;
-webkit-font-smoothing:antialiased}
.mono{font-family:'IBM Plex Mono',monospace;letter-spacing:.12em;text-transform:uppercase}
.wrap{max-width:760px;margin:0 auto;padding:20px 18px 60px}
header.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 0 18px;border-bottom:1px solid var(--border)}
.brand{display:flex;align-items:center;gap:10px}
.brand img{height:30px;width:auto;display:block}
.brand-name{font-family:'Oswald',sans-serif;font-weight:700;font-size:13px;letter-spacing:.08em}
.brand-name .hl{color:var(--accent)}
.top-meta{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;text-align:right;line-height:1.7}
.hero{padding:30px 0 8px}
.badge{display:inline-block;border:1px solid var(--accent-border);border-radius:999px;padding:5px 13px;
font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:16px}
h1.titulo{font-family:'Oswald',sans-serif;font-weight:700;font-size:clamp(26px,6vw,40px);line-height:1.1;text-transform:uppercase;margin-bottom:12px}
.hero-sub{color:var(--muted);font-size:14px}
.hero-sub b{color:var(--text)}
section.bloque{margin-top:34px}
.sec-label{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:14px}
.sec-label .num{color:var(--accent)}
.parrafo{color:var(--muted);font-size:14.5px;white-space:pre-line}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:12px}
.mod-title{font-weight:700;font-size:15px;margin-bottom:4px}
.mod-title .n{color:var(--accent)}
.mod-desc{color:var(--muted);font-size:13px;margin-bottom:12px}
.precios{background:var(--surface2);border-radius:8px;padding:10px 14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.precio .lbl{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin-bottom:3px}
.precio .amt{font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:500}
.precio .amt.total{color:var(--accent);font-weight:700}
.card.total-card{background:linear-gradient(90deg,#1A100A,var(--surface));border-color:var(--accent-border)}
.total-card .lbl-total{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px}
.total-card .precios{background:transparent;padding:0}
.total-card .amt{font-size:15px;font-weight:700}
.total-solo{font-family:'Oswald',sans-serif;font-weight:700;font-size:28px;color:var(--accent)}
.nota-borde{background:var(--surface);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:12px 15px;color:var(--muted);font-size:13px;white-space:pre-line}
.pagos{display:flex;gap:12px;flex-wrap:wrap}
.pago{flex:1;min-width:130px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px;text-align:center}
.pago .pct{font-family:'Oswald',sans-serif;font-weight:700;font-size:30px;color:var(--accent);line-height:1.05;margin-bottom:4px}
.pago .lbl{font-family:'IBM Plex Mono',monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
.pago .amt{font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:14px}
.mensual{background:linear-gradient(90deg,#1A100A,var(--surface));border:1px solid var(--accent-border);border-radius:12px;padding:18px}
.mensual .lbl{font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:8px}
.mensual .amt{font-family:'Oswald',sans-serif;font-weight:700;font-size:26px;color:var(--accent);margin-bottom:6px}
.mensual .desc{color:var(--muted);font-size:13px;white-space:pre-line}
.vigencia{margin-top:14px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--dim);letter-spacing:.06em}
/* ---- Firma ---- */
.firmar{margin-top:40px;background:var(--surface);border:1px solid var(--accent-border);border-radius:14px;padding:22px 18px}
label{display:block;font-size:12.5px;color:var(--muted);margin:14px 0 6px}
input[type=text],input[type=email]{width:100%;padding:12px 13px;border-radius:10px;border:1px solid #3a3a38;background:var(--bg);color:var(--text);font-size:15px}
input:focus{outline:none;border-color:var(--accent)}
.tabs{display:flex;gap:6px;margin-top:18px}
.tab{flex:1;padding:9px 4px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);border-radius:9px;
font-size:12.5px;font-weight:600;cursor:pointer;text-align:center}
.tab[aria-selected=true]{border-color:var(--accent);color:var(--text);background:#1f150e}
.panel{margin-top:12px}
.lienzo{width:100%;height:170px;background:#fff;border-radius:10px;touch-action:none;display:block;cursor:crosshair}
.panel-hint{font-size:11.5px;color:var(--dim);margin-top:7px}
.btn-sec{margin-top:8px;padding:8px 14px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);border-radius:8px;font-size:12px;cursor:pointer}
.preview-img{margin-top:10px;background:#fff;border-radius:10px;padding:8px;max-width:100%;text-align:center;display:none}
.preview-img img{max-width:100%;max-height:140px}
.preview-texto{margin-top:10px;background:#fff;border-radius:10px;min-height:74px;display:none;align-items:center;justify-content:center;
font-family:'Caveat',cursive;font-size:34px;color:#16130f;padding:10px}
input[type=file]{width:100%;color:var(--muted);font-size:13px;margin-top:4px}
.btn-firmar{width:100%;margin-top:22px;padding:15px;border:0;border-radius:11px;background:var(--accent);color:#141210;
font-size:15.5px;font-weight:700;cursor:pointer;font-family:'IBM Plex Sans',sans-serif}
.btn-firmar:disabled{opacity:.5;cursor:default}
.legal{margin-top:14px;font-size:11.5px;color:var(--dim);line-height:1.6}
.error-firma{display:none;margin-top:12px;color:#F87171;font-size:13px;font-weight:600}
.exito{background:var(--surface);border:1px solid rgba(52,211,153,.4);border-radius:14px;padding:26px 20px;margin-top:40px}
.exito h2{color:#34D399;font-family:'Oswald',sans-serif;font-size:22px;margin-bottom:8px;text-transform:uppercase}
.exito p{color:var(--muted);font-size:14px;margin-top:6px}
footer.pie{margin-top:46px;border-top:1px solid var(--border);padding-top:16px;display:flex;justify-content:space-between;gap:10px;
font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:var(--dim);letter-spacing:.1em;text-transform:uppercase;flex-wrap:wrap}
/* Mensajes sueltos (error / ya firmado) */
.caja-msg{max-width:560px;margin:8vh auto 0;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px}
.caja-msg h1{font-size:20px;margin-bottom:6px}
.caja-msg .sub{color:var(--muted);font-size:13.5px}
.ok{color:#34D399}.err{color:#F87171}
`;

function shell(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(titulo)}</title>
${FUENTES}
<style>${ESTILO}</style></head><body>${cuerpo}</body></html>`;
}

/** Mensaje suelto con la marca (enlace inválido, caducado, ya firmado, error). */
export function paginaMensaje(titulo: string, cuerpoHtml: string, estado = 200): { html: string; estado: number } {
  return {
    estado,
    html: shell(titulo, `<div class="wrap"><div class="caja-msg">
      <div class="brand" style="margin-bottom:18px"><span class="brand-name" style="font-size:15px">WEB<span class="hl">MAKER</span> LATAM</span></div>
      ${cuerpoHtml}</div></div>`),
  };
}

/**
 * Bloque de aceptación y firma, compartido por la página del contrato y la
 * del proyecto: mismos campos, mismas pestañas (dibujo/imagen/texto), mismo
 * botón. Solo cambian el texto legal y el placeholder de "quién firma",
 * porque lo que se está aceptando no es lo mismo.
 */
function seccionFirma(numero: string, legal: string, placeholderNombre: string): string {
  return `<section class="bloque" id="firmar">
  <div class="sec-label"><span class="num">${numero}</span> · ACEPTACIÓN Y FIRMA</div>
  <div class="firmar">
    <label for="f-nombre">Tu nombre y apellido</label>
    <input type="text" id="f-nombre" maxlength="120" autocomplete="name" placeholder="${esc(placeholderNombre)}">
    <label for="f-email">Tu correo — te enviaremos la constancia (opcional)</label>
    <input type="email" id="f-email" maxlength="160" autocomplete="email" placeholder="nombre@empresa.com">

    <div class="tabs" role="tablist">
      <button type="button" class="tab" data-tab="dibujo" aria-selected="true">✍️ Dibujar</button>
      <button type="button" class="tab" data-tab="imagen" aria-selected="false">🖼️ Subir imagen</button>
      <button type="button" class="tab" data-tab="texto" aria-selected="false">⌨️ Escribir</button>
    </div>

    <div class="panel" id="panel-dibujo">
      <canvas class="lienzo" id="lienzo"></canvas>
      <div class="panel-hint">Dibuja tu firma con el dedo o el mouse.</div>
      <button type="button" class="btn-sec" id="btn-limpiar">Borrar y dibujar de nuevo</button>
    </div>
    <div class="panel" id="panel-imagen" style="display:none">
      <input type="file" id="f-archivo" accept="image/png,image/jpeg">
      <div class="panel-hint">Una foto o imagen de tu firma (PNG o JPG).</div>
      <div class="preview-img" id="preview-imagen"><img alt="Tu firma" id="img-firma"></div>
    </div>
    <div class="panel" id="panel-texto" style="display:none">
      <input type="text" id="f-texto" maxlength="120" placeholder="Escribe tu firma">
      <div class="preview-texto" id="preview-texto"></div>
    </div>

    <button type="button" class="btn-firmar" id="btn-firmar" data-testid="btn-firmar">Aceptar y firmar</button>
    <div class="error-firma" id="error-firma"></div>
    <p class="legal">${legal}</p>
  </div>
</section>`;
}

/** La página completa: contrato + firma. */
export function paginaContrato(opts: { token: string; logo: string; doc: DocumentoFirma; anio: string }): string {
  const { doc, logo, token, anio } = opts;
  const conPrecios = doc.modulos.some((m) => (m.neto ?? 0) > 0);

  // Numeración dinámica, como en el PDF: solo cuentan las secciones presentes.
  const secciones: Array<{ id: string; label: string; html: string }> = [];
  const add = (id: string, label: string, html: string) => { if (html) secciones.push({ id, label, html }); };

  add("alcance", "ALCANCE DEL PROYECTO", doc.alcance ? `<p class="parrafo">${esc(doc.alcance)}</p>` : "");

  const mods = doc.modulos.map((m, i) => `<div class="card">
      <div class="mod-title"><span class="n">${i + 1} ·</span> ${esc(m.nombre)}</div>
      ${m.desc ? `<div class="mod-desc">${esc(m.desc)}</div>` : ""}
      ${(m.neto ?? 0) > 0 ? filaPrecios(m.neto!) : ""}
    </div>`).join("");
  let totalHtml = "";
  if (conPrecios && doc.totalNeto && doc.totalConIva) {
    totalHtml = `<div class="card total-card" data-testid="total-contrato">
      <div class="lbl-total">Inversión total del proyecto</div>${filaPrecios(doc.totalNeto)}</div>`;
  } else if (doc.valorFicha) {
    totalHtml = `<div class="card total-card" data-testid="total-contrato">
      <div class="lbl-total">Inversión total · IVA incluido</div>
      <div class="total-solo">${esc(doc.valorFicha)}</div></div>`;
  }
  add("modulos", "MÓDULOS E INVERSIÓN", (mods || totalHtml) ? mods + totalHtml : "");

  if (doc.downPct != null && (doc.totalConIva || doc.valorFicha)) {
    const pct = Math.max(0, Math.min(100, Math.round(doc.downPct)));
    const tramos = pct >= 100 ? [{ pct: 100, momento: "AL INICIAR" }]
      : pct <= 0 ? [{ pct: 100, momento: "CONTRA ENTREGA" }]
      : [{ pct, momento: "AL INICIAR" }, { pct: 100 - pct, momento: "CONTRA ENTREGA" }];
    add("pago", "FORMA DE PAGO", `<div class="pagos">${tramos.map((t) => `<div class="pago">
        <div class="pct">${t.pct}%</div><div class="lbl">${t.momento}</div>
        ${doc.totalConIva ? `<div class="amt">${CLP(doc.totalConIva * t.pct / 100)}</div>` : ""}
      </div>`).join("")}</div>`);
  }

  if (doc.monthly || doc.monthlyPrice) {
    add("mensualidad", "MENSUALIDAD", `<div class="mensual">
      <div class="lbl">Hosting y mantención</div>
      ${doc.monthlyPrice ? `<div class="amt">${CLP(Math.round(doc.monthlyPrice * 1.19))}</div>
      <div class="desc">Neto ${CLP(doc.monthlyPrice)} + IVA 19% — se factura mes a mes desde la entrega.</div>` : ""}
      ${doc.monthly ? `<div class="desc" style="margin-top:8px">${esc(doc.monthly)}</div>` : ""}
    </div>`);
  }

  add("notas", "CONDICIONES Y NOTAS", doc.notas ? `<div class="nota-borde">${esc(doc.notas)}</div>` : "");

  const cuerpoSecciones = secciones.map((s, i) => `<section class="bloque" id="${s.id}">
    <div class="sec-label"><span class="num">0${i + 1}</span> · ${s.label}</div>${s.html}</section>`).join("");

  const nFirma = `0${secciones.length + 1}`;

  return shell(`${doc.titulo} · WebMaker Latam`, `<div class="wrap">
<header class="top">
  <div class="brand">${logo ? `<img src="${logo}" alt="WebMaker Latam">` : ""}
    <span class="brand-name">WEB<span class="hl">MAKER</span> LATAM</span></div>
  <div class="top-meta">Propuesta comercial<br>${esc(anio)}</div>
</header>
<div class="hero">
  <span class="badge">Propuesta · ${esc((doc.cliente || "cliente").toUpperCase())}</span>
  <h1 class="titulo" data-testid="doc-titulo">${esc(doc.titulo)}</h1>
  <div class="hero-sub">Para <b>${esc(doc.cliente || "tu empresa")}</b>${doc.fecha ? ` · ${esc(doc.fecha)}` : ""}${doc.asesor ? ` · te acompaña <b>${esc(doc.asesor)}</b>` : ""}</div>
  ${doc.validaHasta ? `<div class="vigencia">Propuesta válida hasta el ${esc(doc.validaHasta)}</div>` : ""}
</div>
${cuerpoSecciones}
${seccionFirma(nFirma, "Al firmar aceptas esta propuesta. Como constancia se registran tu nombre, tu firma, la fecha y la dirección (IP) desde la que firmas. No es firma electrónica avanzada: es el registro de quién aceptó, cuándo y desde dónde.", "Quien acepta la propuesta")}
<footer class="pie"><span>WebMaker Latam · webmakerlatam.com</span><span>agencia@webmakerlatam.com</span></footer>
</div>
<script>${scriptFirma(token, "contrato")}</script>`);
}

/** Lo que se le enseña al cliente que va a aprobar el inicio de un proyecto o confirmar su cierre. */
export interface DocumentoProyecto {
  titulo: string;
  cliente: string;
  tipo: string;
  /** Alcance del contrato vinculado, si hay uno — ya es público porque el mismo cliente lo vio y aceptó ahí. */
  alcance: string;
  motivo: "aprobacion_proyecto" | "cierre_proyecto";
}

/**
 * La página completa: proyecto + firma.
 *
 * Deliberadamente más simple que la del contrato: sin módulos ni precios (no
 * hay cobro asociado a aprobar o cerrar un proyecto) y sin volcar las notas
 * internas del proyecto, que a diferencia del contrato no tiene un campo
 * "público" separado de las notas del equipo.
 */
export function paginaProyecto(opts: { token: string; logo: string; doc: DocumentoProyecto; anio: string }): string {
  const { doc, logo, token, anio } = opts;
  const esCierre = doc.motivo === "cierre_proyecto";

  const explicacion = esCierre
    ? "Con tu firma confirmas que este proyecto fue entregado y quedó a tu conformidad."
    : "Con tu firma apruebas el inicio de este proyecto. El equipo de WebMaker Latam comenzará el trabajo según lo acordado.";
  const legal = esCierre
    ? "Al firmar confirmas la conformidad de este proyecto. Como constancia se registran tu nombre, tu firma, la fecha y la dirección (IP) desde la que firmas. No es firma electrónica avanzada: es el registro de quién confirmó, cuándo y desde dónde."
    : "Al firmar apruebas el inicio de este proyecto. Como constancia se registran tu nombre, tu firma, la fecha y la dirección (IP) desde la que firmas. No es firma electrónica avanzada: es el registro de quién aprobó, cuándo y desde dónde.";
  const placeholder = esCierre ? "Quien confirma la conformidad" : "Quien aprueba el proyecto";

  const secciones: Array<{ id: string; label: string; html: string }> = [];
  const add = (id: string, label: string, html: string) => { if (html) secciones.push({ id, label, html }); };
  add("resumen", esCierre ? "CONFORMIDAD DE CIERRE" : "APROBACIÓN DE INICIO", `<p class="parrafo">${esc(explicacion)}</p>`);
  add("alcance", "ALCANCE ACORDADO", doc.alcance ? `<p class="parrafo">${esc(doc.alcance)}</p>` : "");

  const cuerpoSecciones = secciones.map((s, i) => `<section class="bloque" id="${s.id}">
    <div class="sec-label"><span class="num">0${i + 1}</span> · ${s.label}</div>${s.html}</section>`).join("");
  const nFirma = `0${secciones.length + 1}`;

  return shell(`${doc.titulo} · WebMaker Latam`, `<div class="wrap">
<header class="top">
  <div class="brand">${logo ? `<img src="${logo}" alt="WebMaker Latam">` : ""}
    <span class="brand-name">WEB<span class="hl">MAKER</span> LATAM</span></div>
  <div class="top-meta">${esCierre ? "Cierre de proyecto" : "Aprobación de proyecto"}<br>${esc(anio)}</div>
</header>
<div class="hero">
  <span class="badge">${esCierre ? "Cierre de proyecto" : "Aprobación de inicio"} · ${esc((doc.cliente || "cliente").toUpperCase())}</span>
  <h1 class="titulo" data-testid="doc-titulo">${esc(doc.titulo)}</h1>
  <div class="hero-sub">Para <b>${esc(doc.cliente || "tu empresa")}</b>${doc.tipo ? ` · ${esc(doc.tipo)}` : ""}</div>
</div>
${cuerpoSecciones}
${seccionFirma(nFirma, legal, placeholder)}
<footer class="pie"><span>WebMaker Latam · webmakerlatam.com</span><span>agencia@webmakerlatam.com</span></footer>
</div>
<script>${scriptFirma(token, doc.motivo)}</script>`);
}

function filaPrecios(neto: number): string {
  const iva = Math.round(neto * 0.19);
  return `<div class="precios">
    <div class="precio"><div class="lbl">Neto</div><div class="amt">${CLP(neto)}</div></div>
    <div class="precio"><div class="lbl">IVA 19%</div><div class="amt">${CLP(iva)}</div></div>
    <div class="precio"><div class="lbl">Total</div><div class="amt total">${CLP(neto + iva)}</div></div>
  </div>`;
}

/**
 * El JS de la firma. Vanilla y sin template literals internos para no pelear
 * con el template literal exterior de TypeScript.
 *
 * El mensaje de éxito se arma en el navegador (no en el servidor) porque
 * reemplaza la sección sin recargar la página, así que también necesita
 * saber el motivo para no decirle "aceptaste la propuesta" a alguien que
 * acaba de aprobar o cerrar un proyecto.
 */
function scriptFirma(token: string, motivo: "contrato" | "aprobacion_proyecto" | "cierre_proyecto"): string {
  return `(function(){
var motivo='${motivo}';
var activo='dibujo';
var tabs=document.querySelectorAll('.tab');
function muestra(t){activo=t;tabs.forEach(function(b){b.setAttribute('aria-selected',String(b.dataset.tab===t))});
['dibujo','imagen','texto'].forEach(function(p){document.getElementById('panel-'+p).style.display=p===t?'':'none'});}
tabs.forEach(function(b){b.addEventListener('click',function(){muestra(b.dataset.tab)})});

/* --- dibujo --- */
var cv=document.getElementById('lienzo'),cx=cv.getContext('2d'),trazos=0,pintando=false;
function inicia(){var dpr=window.devicePixelRatio||1,r=cv.getBoundingClientRect();
cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);
cx.fillStyle='#ffffff';cx.fillRect(0,0,cv.width,cv.height);
cx.strokeStyle='#16130f';cx.lineWidth=2.5*dpr;cx.lineCap='round';cx.lineJoin='round';trazos=0;}
function xy(e){var r=cv.getBoundingClientRect();
return{x:(e.clientX-r.left)*cv.width/r.width,y:(e.clientY-r.top)*cv.height/r.height};}
cv.addEventListener('pointerdown',function(e){e.preventDefault();cv.setPointerCapture(e.pointerId);
pintando=true;var p=xy(e);cx.beginPath();cx.moveTo(p.x,p.y);cx.lineTo(p.x+.1,p.y+.1);cx.stroke();trazos++;});
cv.addEventListener('pointermove',function(e){if(!pintando)return;var p=xy(e);cx.lineTo(p.x,p.y);cx.stroke();});
['pointerup','pointercancel'].forEach(function(ev){cv.addEventListener(ev,function(){pintando=false;})});
document.getElementById('btn-limpiar').addEventListener('click',inicia);
inicia();

/* --- imagen --- */
var dataImagen='';
document.getElementById('f-archivo').addEventListener('change',function(){
var f=this.files&&this.files[0];if(!f)return;
var img=new Image();var url=URL.createObjectURL(f);
img.onload=function(){var MAX=900,esc=Math.min(1,MAX/Math.max(img.width,img.height));
var c=document.createElement('canvas');c.width=Math.round(img.width*esc);c.height=Math.round(img.height*esc);
var g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);
dataImagen=c.toDataURL('image/png');
if(dataImagen.length>1400000)dataImagen=c.toDataURL('image/jpeg',0.85);
var el=document.getElementById('img-firma');el.src=dataImagen;
document.getElementById('preview-imagen').style.display='block';URL.revokeObjectURL(url);};
img.onerror=function(){muestraError('No pudimos leer esa imagen. Prueba con otra en PNG o JPG.');URL.revokeObjectURL(url);};
img.src=url;});

/* --- texto --- */
var inTexto=document.getElementById('f-texto'),pvTexto=document.getElementById('preview-texto');
inTexto.addEventListener('input',function(){var v=this.value.trim();
pvTexto.textContent=v;pvTexto.style.display=v?'flex':'none';});

function muestraError(m){var e=document.getElementById('error-firma');e.textContent=m;e.style.display='block';}
function limpiaError(){document.getElementById('error-firma').style.display='none';}

/* --- enviar --- */
var btn=document.getElementById('btn-firmar');
btn.addEventListener('click',function(){
limpiaError();
var nombre=document.getElementById('f-nombre').value.replace(/\\s+/g,' ').trim();
if(nombre.length<3){muestraError('Escribe tu nombre y apellido: son parte de la constancia.');return;}
var firma=null;
if(activo==='dibujo'){if(trazos<2){muestraError('Dibuja tu firma en el recuadro blanco antes de confirmar.');return;}
firma={kind:'dibujo',data:cv.toDataURL('image/png')};}
else if(activo==='imagen'){if(!dataImagen){muestraError('Sube la imagen de tu firma antes de confirmar.');return;}
firma={kind:'imagen',data:dataImagen};}
else{var t=inTexto.value.replace(/\\s+/g,' ').trim();
if(t.length<2){muestraError('Escribe tu firma en el campo antes de confirmar.');return;}
firma={kind:'texto',data:t};}
btn.disabled=true;btn.textContent='Registrando tu firma…';
fetch('/api/firma/${token}/aceptar',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({nombre:nombre,email:document.getElementById('f-email').value.trim(),firma:firma})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(d){return{ok:r.ok,d:d}})})
.then(function(res){
if(!res.ok){muestraError(res.d.error||'No se pudo registrar. Vuelve a intentarlo en unos minutos.');
btn.disabled=false;btn.textContent='Aceptar y firmar';return;}
var pila=nombre.split(' ')[0];
var cuerpoExito=motivo==='cierre_proyecto'?'Tu confirmación y tu firma quedaron registradas.'
:motivo==='aprobacion_proyecto'?'Tu aprobación y tu firma quedaron registradas.'
:'Tu aceptación y tu firma quedaron registradas.';
var correoNota='';
if(res.d.correoCliente==='enviado'){correoNota='<p>Te enviamos la constancia a tu correo.</p>';}
else if(res.d.correoCliente==='fallido'||res.d.correoCliente==='sin_configurar'){correoNota='<p>No pudimos enviarte la copia por correo — guarda o imprime esta página como constancia.</p>';}
var s=document.createElement('div');s.className='exito';
s.innerHTML='<h2>¡Listo, '+pila.replace(/[<>&]/g,'')+'!</h2>'+
'<p>'+cuerpoExito+' El equipo de WebMaker Latam se pondrá en contacto contigo para los siguientes pasos.</p>'+correoNota;
var sec=document.getElementById('firmar');sec.innerHTML='';sec.appendChild(s);
s.scrollIntoView({behavior:'smooth',block:'center'});})
.catch(function(){muestraError('No hay conexión. Revisa tu internet y vuelve a intentarlo.');
btn.disabled=false;btn.textContent='Aceptar y firmar';});
});
})();`;
}
