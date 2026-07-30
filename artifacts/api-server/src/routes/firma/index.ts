// Página pública de aceptación de una cotización o contrato.
//
// La abre el CLIENTE, que no tiene cuenta en el panel, así que va montada
// FUERA del `requireAuth` — igual que el enlace temporal de video de Instagram.
// Todo lo que se muestra aquí sale del token: no hay forma de listar, buscar ni
// enumerar documentos desde esta ruta.
//
// Se sirve HTML desde el servidor en vez de una ruta del panel a propósito:
// quien la abre no debería tener que cargar la aplicación entera para pulsar un
// botón, y así el enlace sigue funcionando aunque el panel se esté desplegando.

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { contractSignatures } from "@workspace/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  motivoNoFirmable,
  TEXTO_RECHAZO,
  tokenValido,
  ipDeLaPeticion,
  limpiarNombreFirmante,
  nombreFirmanteValido,
} from "../../lib/firma-contrato";

const router: IRouter = Router();

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Envoltura mínima, sin dependencias externas: tiene que abrir en cualquier sitio. */
function pagina(titulo: string, cuerpo: string, estado = 200): { html: string; estado: number } {
  return {
    estado,
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(titulo)}</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
background:#141210;color:#F3F4F6;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}
.caja{width:100%;max-width:560px;background:#1C1917;border:1px solid #2E2A26;border-radius:16px;padding:28px}
h1{margin:0 0 4px;font-size:20px}
.sub{color:#A8A29E;font-size:13px;margin:0 0 20px}
.fila{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid #2E2A26;font-size:14px}
.fila:last-of-type{border-bottom:0}
.fila span:first-child{color:#A8A29E}
.total{font-weight:700;font-size:16px;color:#FB923C}
label{display:block;font-size:13px;color:#A8A29E;margin:16px 0 6px}
input{width:100%;padding:11px 13px;border-radius:10px;border:1px solid #3F3A35;background:#141210;color:#F3F4F6;font-size:15px}
input:focus{outline:none;border-color:#FB923C}
button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:10px;background:#FB923C;color:#141210;
font-size:15px;font-weight:700;cursor:pointer}
button:disabled{opacity:.5;cursor:default}
.nota{margin-top:14px;font-size:11.5px;color:#78716C}
.ok{color:#34D399;font-weight:600}
.err{color:#F87171;font-weight:600}
</style></head><body><div class="caja">${cuerpo}</div></body></html>`,
  };
}

function responder(res: Response, p: { html: string; estado: number }): void {
  res.status(p.estado).type("html").send(p.html);
}

async function buscarEnlace(token: string) {
  const [fila] = await db.select().from(contractSignatures)
    .where(eq(contractSignatures.token, token)).limit(1);
  return fila ?? null;
}

const CLP = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? "$" + Math.round(v).toLocaleString("es-CL") : null;
};

/** GET /api/firma/:token — el cliente ve el documento y puede aceptarlo. */
router.get("/firma/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "");
  if (!tokenValido(token)) {
    responder(res, pagina("Enlace no válido", `<h1>Enlace no válido</h1><p class="sub">${esc(TEXTO_RECHAZO.no_existe)}</p>`, 404));
    return;
  }
  try {
    const enlace = await buscarEnlace(token);
    const motivo = motivoNoFirmable(
      enlace && {
        token: enlace.token,
        estado: enlace.estado as "pendiente" | "firmado" | "anulado",
        expiresAt: enlace.expiresAt ? enlace.expiresAt.toISOString() : null,
        signedAt: enlace.signedAt ? enlace.signedAt.toISOString() : null,
      },
    );

    if (motivo === "ya_firmado" && enlace?.signedAt) {
      // Ya aceptado NO es un error: se le confirma, con la fecha, para que no
      // se quede con la duda de si su "sí" llegó.
      responder(res, pagina("Documento aceptado", `
        <h1 class="ok">Ya está aceptado</h1>
        <p class="sub">Lo aceptó ${esc(enlace.signerName || "el cliente")} el
        ${esc(enlace.signedAt.toLocaleDateString("es-CL", { timeZone: "America/Santiago" }))}.
        No hace falta que hagas nada más.</p>`));
      return;
    }
    if (motivo) {
      responder(res, pagina("Enlace no disponible", `<h1>No se puede continuar</h1><p class="sub">${esc(TEXTO_RECHAZO[motivo])}</p>`, motivo === "no_existe" ? 404 : 410));
      return;
    }

    const doc = await documentoDe(enlace!.contractId);
    const total = CLP(doc?.total);
    responder(res, pagina("Aceptar propuesta", `
      <h1>${esc(doc?.titulo || "Propuesta de trabajo")}</h1>
      <p class="sub">WebMakerLatam · para ${esc(doc?.cliente || "tu empresa")}</p>
      ${(doc?.modulos ?? []).map((m) => `<div class="fila"><span>${esc(m.nombre)}</span><span>${esc(CLP(m.precio) ?? "")}</span></div>`).join("")}
      ${total ? `<div class="fila"><span>Total</span><span class="total">${esc(total)}</span></div>` : ""}
      <form method="POST" action="/api/firma/${esc(token)}/aceptar">
        <label for="nombre">Tu nombre y apellido</label>
        <input id="nombre" name="nombre" required minlength="3" maxlength="120" autocomplete="name">
        <label for="email">Tu correo (opcional)</label>
        <input id="email" name="email" type="email" maxlength="160" autocomplete="email">
        <button type="submit">Aceptar la propuesta</button>
      </form>
      <p class="nota">Al aceptar se registra tu nombre, la fecha y la dirección desde la que
      lo haces, como constancia de la aceptación.</p>`));
  } catch (err) {
    console.error("[firma GET]", err);
    responder(res, pagina("Error", `<h1 class="err">Algo falló</h1><p class="sub">Vuelve a intentarlo en unos minutos o escríbele al equipo de WebMakerLatam.</p>`, 500));
  }
});

/** POST /api/firma/:token/aceptar — registra la aceptación. */
router.post("/firma/:token/aceptar", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "");
  if (!tokenValido(token)) {
    responder(res, pagina("Enlace no válido", `<h1>Enlace no válido</h1><p class="sub">${esc(TEXTO_RECHAZO.no_existe)}</p>`, 404));
    return;
  }
  const nombre = limpiarNombreFirmante((req.body ?? {}).nombre);
  if (!nombreFirmanteValido(nombre)) {
    responder(res, pagina("Falta tu nombre", `<h1>Falta tu nombre</h1><p class="sub">Necesitamos saber quién acepta la propuesta. Vuelve atrás y escríbelo.</p>`, 400));
    return;
  }

  try {
    const enlace = await buscarEnlace(token);
    const motivo = motivoNoFirmable(
      enlace && {
        token: enlace.token,
        estado: enlace.estado as "pendiente" | "firmado" | "anulado",
        expiresAt: enlace.expiresAt ? enlace.expiresAt.toISOString() : null,
        signedAt: enlace.signedAt ? enlace.signedAt.toISOString() : null,
      },
    );
    if (motivo) {
      responder(res, pagina("Enlace no disponible", `<h1>No se puede continuar</h1><p class="sub">${esc(TEXTO_RECHAZO[motivo])}</p>`, motivo === "no_existe" ? 404 : 410));
      return;
    }

    // La condición `signed_at IS NULL` va en el UPDATE, no solo en la
    // comprobación de arriba: dos pulsaciones a la vez pasarían las dos
    // comprobaciones y se registrarían dos aceptaciones del mismo documento.
    const actualizadas = await db.update(contractSignatures)
      .set({
        estado: "firmado",
        signedAt: new Date(),
        signerName: nombre,
        signerEmail: String((req.body ?? {}).email ?? "").trim().slice(0, 160) || null,
        signerIp: ipDeLaPeticion(req.headers as Record<string, unknown>, req.ip) || null,
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 400) || null,
      })
      .where(and(eq(contractSignatures.token, token), isNull(contractSignatures.signedAt)))
      .returning({ id: contractSignatures.id });

    if (actualizadas.length === 0) {
      responder(res, pagina("Ya aceptado", `<h1 class="ok">Ya está aceptado</h1><p class="sub">${esc(TEXTO_RECHAZO.ya_firmado)}</p>`));
      return;
    }

    console.log(`[firma] contrato ${enlace!.contractId} aceptado por "${nombre}"`);
    responder(res, pagina("Propuesta aceptada", `
      <h1 class="ok">¡Listo, ${esc(nombre.split(" ")[0])}!</h1>
      <p class="sub">Quedó registrada tu aceptación. El equipo de WebMakerLatam se pondrá en
      contacto contigo para los siguientes pasos.</p>`));
  } catch (err) {
    console.error("[firma POST]", err);
    responder(res, pagina("Error", `<h1 class="err">No se pudo registrar</h1><p class="sub">Vuelve a intentarlo en unos minutos o escríbele al equipo de WebMakerLatam.</p>`, 500));
  }
});

/* ==================== Datos del documento =============================== */

interface DocumentoFirma {
  titulo: string;
  cliente: string;
  total: number | null;
  modulos: Array<{ nombre: string; precio: number | null }>;
}

/**
 * Lo que se le enseña al cliente del contrato que va a aceptar.
 *
 * Deliberadamente escueto: título, cliente, módulos y total. Los contratos
 * viven en un blob sin esquema y volcarlo entero en una página pública sería
 * exponer notas internas sin saberlo.
 */
async function documentoDe(contractId: string): Promise<DocumentoFirma | null> {
  const { resolveBoard } = await import("../../lib/hub-board");
  const board = await resolveBoard();
  const contratos = board && Array.isArray(board.data.contracts) ? (board.data.contracts as Array<Record<string, unknown>>) : [];
  const c = contratos.find((x) => String(x.id ?? "") === contractId);
  if (!c) return null;

  const doc = (c.doc ?? {}) as Record<string, unknown>;
  const modulos = Array.isArray(doc.modulos) ? (doc.modulos as Array<Record<string, unknown>>) : [];
  return {
    titulo: String(c.title ?? doc.titulo ?? "Propuesta de trabajo"),
    cliente: String(c.client ?? ""),
    total: Number(c.value ?? doc.total ?? 0) || null,
    modulos: modulos.slice(0, 12).map((m) => ({
      nombre: String(m.name ?? m.nombre ?? ""),
      precio: Number(m.price ?? m.neto ?? 0) || null,
    })).filter((m) => m.nombre),
  };
}

export default router;
