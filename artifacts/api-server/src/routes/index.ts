import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import healthRouter from "./health";
import geminiRouter from "./gemini";
import driveRouter from "./drive";
import contentRouter from "./content";
import studioRouter from "./studio";
import youtubeRouter from "./youtube";
import tiktokRouter from "./tiktok";
import instagramRouter from "./instagram";
import linkedinRouter from "./linkedin";
import xRouter from "./x";
import facebookRouter from "./facebook";
import communityRouter from "./community";
import ideasRouter from "./ideas";
import personalTasksRouter from "./personal-tasks";
import analyticsRouter from "./analytics";
import inspirationsRouter from "./inspirations";
import onboardingRouter from "./onboarding";
import savedViewsRouter from "./saved-views";
import socialRouter from "./social";
import libraryRouter from "./library";
import notificationsRouter from "./notifications";
import collaborationRouter from "./collaboration";
import connectionsRouter from "./connections";
import settingsRouter from "./settings";
import transcriberRouter from "./transcriber";
import dictadoRouter from "./dictado";
import credentialsRouter from "./credentials";
import calendarRouter from "./calendar";
import hubRouter from "./hub";
import hrRouter from "./hr";
import hrOpsRouter from "./hr/ops";
import hrSelfRouter from "./hr/self";
import hrReportesRouter from "./hr/reportes";
import ticketsRouter from "./tickets";
import goalsRouter from "./goals";
import hubTasksRouter from "./hub/tasks";
import hubServicesRouter from "./hub/services";
import hubPlaybooksRouter from "./hub/playbooks";
import hubVentasRouter from "./hub/ventas";
import contratosDocsRouter from "./hub/contratos-docs";
import hubProyeccionesRouter from "./hub/proyecciones";
import hubTorreRouter from "./hub/torre";
import hubRecordatoriosRouter from "./hub/recordatorios";
import adjuntosRouter from "./adjuntos";
import jornadaRouter from "./jornada";
import redactarRouter from "./redactar";
import marketingRouter from "./marketing";
import slaRouter from "./sla";
import activityRouter from "./activity";
import cotizacionesRouter from "./cotizaciones";
import adminUsersRouter from "./admin-users";
import rolePermissionsRouter from "./role-permissions";
import panelRouter from "./panel";
import wmcRouter from "./wmc";
import { desglosarEnItems, PresupuestoIAError } from "../lib/presupuesto-ia";
import {
  recibirAudioWmc,
  transcribirAudioWmc,
  responderErrorAudio,
} from "./wmc-audio";
import {
  WmcIAError,
  generarMensaje,
  generarCorreo,
  corregirItems,
  itemsDeComplemento,
  generarAcuerdo,
  corregirAcuerdo,
} from "../lib/wmc-ia";
import { requireArea, requireAreaOSeccion } from "../lib/require-area";
import { hubNeedsAreaGate } from "../lib/hub-gate";
import { communityIsHistoriasOnly } from "../lib/community-gate";
import { requireIdeas } from "../lib/ideas-gate";

const router: IRouter = Router();

router.use(healthRouter);
// Asistente de redacción: lo usa TODO el equipo desde cualquier apartado, así
// que va fuera de cualquier gate de área.
router.use(redactarRouter);
router.use(geminiRouter);
// Espejo del panel de webmakerlatam.com (sección Agencia): gate propio por
// rol (ver dinero), sin gate de área — no cuelga de /hub.
router.use(panelRouter);
// Wmc: passthrough EN VIVO hacia el service API de webmakerlatam.com para las
// pantallas portadas 1:1 (propuestas/proyectos) bajo /wmc/*. Este panel no
// guarda datos propios de esto — el origen sigue siendo el dueño de todo.
// Gate propio por ROL (dev/ventas/ceo, los tres sin diferencias — ver
// lib/wmc/access.ts), sin gate de área: no cuelga de /hub. Sistema aparte
// del "Agencia" de arriba, que es un espejo con caché local y gate por rol.
// El panel wmc ofrece "Generar Items (IA)" pero ese endpoint nunca existio del
// otro lado: el proxy devolvia el HTML del SPA y el navegador moria al
// parsearlo. Se atiende aca, ANTES del proxy, porque este server ya tiene la
// clave de OpenAI. El resto de /wmc/* sigue viajando al panel sin cambios.
router.post("/wmc/proposals/generate-items-ai", async (req, res) => {
  const cuerpo = (req.body ?? {}) as { text?: unknown; clientName?: unknown };
  const texto = typeof cuerpo.text === "string" ? cuerpo.text : "";
  const cliente = typeof cuerpo.clientName === "string" ? cuerpo.clientName : undefined;
  try {
    const items = await desglosarEnItems(texto, cliente);
    res.json({ items });
  } catch (e) {
    if (e instanceof PresupuestoIAError) {
      res.status(422).json({ error: e.message });
      return;
    }
    console.error("[generate-items-ai]", e instanceof Error ? e.message : e);
    res.status(500).json({ error: "No se pudo generar la lista de items." });
  }
});

// El panel wmc ofrece dictar audio en Propuestas y en Complementos, pero esos
// endpoints nunca existieron del otro lado: el proxy devolvia el HTML del SPA
// con 200 y el navegador no encontraba el texto. Se atienden aca, ANTES del
// proxy, igual que "generate-items-ai".
async function transcribirYResponder(req: Request, res: Response) {
  try {
    const text = await transcribirAudioWmc(req);
    res.json({ text });
  } catch (e) {
    responderErrorAudio(res, e, "transcribe-audio", "No se pudo transcribir el audio.");
  }
}
router.post("/wmc/proposals/transcribe-audio", recibirAudioWmc, transcribirYResponder);
router.post("/wmc/addons/transcribe-audio", recibirAudioWmc, transcribirYResponder);

/** Audio -> texto -> items, para armar la propuesta completa de una sola vez. */
router.post(
  "/wmc/proposals/auto-fill-from-audio",
  recibirAudioWmc,
  async (req: Request, res: Response) => {
    try {
      const text = await transcribirAudioWmc(req);
      const cuerpo = (req.body ?? {}) as { clientName?: unknown };
      const cliente =
        typeof cuerpo.clientName === "string" ? cuerpo.clientName : undefined;
      const items = await desglosarEnItems(text, cliente);
      res.json({ text, items });
    } catch (e) {
      if (e instanceof PresupuestoIAError) {
        res.status(422).json({ error: e.message });
        return;
      }
      responderErrorAudio(
        res,
        e,
        "auto-fill-from-audio",
        "No se pudo armar la propuesta desde el audio.",
      );
    }
  },
);

// Generadores de texto del panel wmc. Todos caian en el proxy ciego, que
// devolvia el HTML del SPA con 200, asi que el panel fallaba sin decir por que.
// Van ANTES del proxy; el resto de /wmc/* sigue viajando a wmc sin cambios.
function errorIA(res: Response, e: unknown, etiqueta: string, generico: string) {
  if (e instanceof WmcIAError) {
    res.status(422).json({ error: e.message });
    return;
  }
  console.error("[" + etiqueta + "]", e instanceof Error ? e.message : e);
  res.status(500).json({ error: generico });
}

const MENSAJES = [
  ["/wmc/proposals/generate-whatsapp-message", "whatsapp"],
  ["/wmc/proposals/generate-cold-outreach", "frio"],
  ["/wmc/proposals/generate-drive-message", "drive"],
] as const;

for (const [ruta, canal] of MENSAJES) {
  router.post(ruta, async (req: Request, res: Response) => {
    try {
      res.json({ message: await generarMensaje(canal, req.body) });
    } catch (e) {
      errorIA(res, e, canal, "No se pudo generar el mensaje.");
    }
  });
}

router.post("/wmc/proposals/generate-email-message", async (req: Request, res: Response) => {
  try {
    res.json(await generarCorreo(req.body));
  } catch (e) {
    errorIA(res, e, "email-message", "No se pudo generar el correo.");
  }
});

router.post("/wmc/proposals/correct-items-ai", async (req: Request, res: Response) => {
  try {
    res.json({ items: await corregirItems(req.body) });
  } catch (e) {
    errorIA(res, e, "correct-items-ai", "No se pudo corregir la lista de items.");
  }
});

router.post("/wmc/addons/generate-items-ai", async (req: Request, res: Response) => {
  try {
    res.json(await itemsDeComplemento(req.body));
  } catch (e) {
    errorIA(res, e, "addons-items-ai", "No se pudo generar la lista de items.");
  }
});

router.post("/wmc/service-agreements/generate-ai-content", async (req: Request, res: Response) => {
  try {
    res.json({ sections: await generarAcuerdo(req.body) });
  } catch (e) {
    errorIA(res, e, "acuerdo-generar", "No se pudo generar el acuerdo.");
  }
});

router.post("/wmc/service-agreements/correct-ai-content", async (req: Request, res: Response) => {
  try {
    res.json({ sections: await corregirAcuerdo(req.body) });
  } catch (e) {
    errorIA(res, e, "acuerdo-corregir", "No se pudo corregir el acuerdo.");
  }
});

router.use("/wmc", wmcRouter);
router.use(driveRouter);
router.use(contentRouter);

// Studio + transcriber: edicion area only (+ ceo/superadmin bypassed inside requireArea)
router.use("/studio", requireAreaOSeccion(["/estudio", "/ideas"], "ceo", "edicion"));
router.use(studioRouter);
router.use("/transcriber", requireAreaOSeccion(["/transcriptor"], "ceo", "edicion"));
router.use(transcriberRouter);
router.use(dictadoRouter);

router.use(youtubeRouter);
router.use(tiktokRouter);
router.use(instagramRouter);
router.use(linkedinRouter);
router.use(xRouter);
router.use(facebookRouter);

// Community + analytics + inspirations: marketing area only — excepto Posts
// IA (descripciones/interactivo), que edición también necesita.
// Historias sigue exclusivo de marketing/dirección: ver community-gate.ts.
const communityMarketingOnly = requireAreaOSeccion(["/historias"], "ceo", "marketing");
const communityWithEdicion = requireAreaOSeccion(["/descripciones", "/historias"], "ceo", "marketing", "edicion");
router.use("/community", (req, res, next) => {
  if (communityIsHistoriasOnly(req.path)) { communityMarketingOnly(req, res, next); return; }
  communityWithEdicion(req, res, next);
});
router.use(communityRouter);
// Cuentas publicitarias de clientes: del área de marketing (y dirección).
router.use("/marketing", requireAreaOSeccion(["/marketing"], "ceo", "marketing"));
router.use(marketingRouter);
router.use("/analytics", requireAreaOSeccion(["/schedule", "/insights"], "ceo", "marketing"));
router.use(analyticsRouter);
router.use("/inspirations", requireAreaOSeccion(["/ideas", "/historias"], "ceo", "marketing"));
router.use(inspirationsRouter);

// Ideas: tablero de EQUIPO de Editora + Redes sociales. Gate por ROL, no
// por área (Redes y Marketing comparten área "marketing" y Marketing NO
// debe entrar) — ver ideas-gate.ts.
router.use("/ideas", requireIdeas);
router.use(ideasRouter);
router.use(onboardingRouter);
router.use(savedViewsRouter);
router.use(socialRouter);
router.use(libraryRouter);
router.use(notificationsRouter);
router.use(collaborationRouter);
router.use(connectionsRouter);
router.use(settingsRouter);
router.use(credentialsRouter);
router.use(calendarRouter);

// Jornada / asistencia: self-service (check-in/out + checklist diario) para
// TODAS las áreas aprobadas — por eso va FUERA del gate de /hub. La
// supervisión (overview/historial de terceros) se gatea por rol en el router.
router.use(jornadaRouter);

// RRHH self-service (vacaciones/permisos, onboarding y evaluaciones PROPIAS):
// para todas las áreas aprobadas — por eso va fuera de los gates de área,
// igual que jornada. La gestión de terceros vive en hrOpsRouter (/hr/*).
router.use(hrSelfRouter);

// Bitácora de actividad: la propia para todos; la global gateada por rol
// dentro del router (dirección/ventas/rrhh) — mismo patrón que jornada.
router.use(activityRouter);

// "Mis pendientes": tareas y checklists 100% privados por usuario, para
// TODAS las áreas aprobadas — mismo patrón que jornada. Sin relación con
// hub/tasks.ts (el tablero compartido detrás de la página "Mis tareas") ni
// con Ideas (que es compartido por rol, no privado por usuario).
router.use(personalTasksRouter);

// Adjuntos: transversal a proyectos, tareas, tickets y contratos, que son de
// areas distintas. El router se guarda solo (autenticacion + dueño al borrar).
router.use(adjuntosRouter);

// Hub routes: ejecutivo area only
// hubTasksRouter/hubServicesRouter must be before hubRouter so /hub/tasks/* y
// /hub/services/* NO queden bajo el middleware CEO (gestión gateada por ruta).
//
// El tablero (`/hub`, `/hub/owner`) y las tareas (`/hub/tasks*`) los gatea el
// ROL, no el área: ver lib/hub-gate.ts. El resto de /hub sigue por área.
const hubAreaGate = requireAreaOSeccion(["/dashboard-ejecutivo", "/torre-ceo", "/proyectos", "/clientes", "/ventas", "/cobros", "/reportes", "/proyecciones", "/rrhh", "/tickets", "/metas"], "ceo", "ejecutivo", "rrhh");
router.use("/hub", (req, res, next) => {
  if (!hubNeedsAreaGate(req.path)) { next(); return; }
  hubAreaGate(req, res, next);
});
router.use(hubTasksRouter);
router.use(hubServicesRouter);
router.use(hubPlaybooksRouter);
router.use(hubVentasRouter);
router.use(contratosDocsRouter);
router.use(hubProyeccionesRouter);
router.use(hubTorreRouter);
router.use(hubRecordatoriosRouter);
router.use(slaRouter);
router.use(hubRouter);
router.use(hrRouter);
router.use(hrOpsRouter);
router.use(hrReportesRouter);
router.use(ticketsRouter);
router.use(goalsRouter);

// Cotizaciones: generador de cotizaciones PDF (hub ejecutivo)
router.use("/cotizaciones", requireAreaOSeccion(["/ventas", "/cotizaciones"], "ceo", "ejecutivo"));
router.use("/cotizaciones", cotizacionesRouter);

router.use(adminUsersRouter);
router.use(rolePermissionsRouter);

export default router;
