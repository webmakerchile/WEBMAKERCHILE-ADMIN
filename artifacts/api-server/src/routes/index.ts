import { Router, type IRouter } from "express";
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
import credentialsRouter from "./credentials";
import calendarRouter from "./calendar";
import hubRouter from "./hub";
import hrRouter from "./hr";
import ticketsRouter from "./tickets";
import goalsRouter from "./goals";
import hubTasksRouter from "./hub/tasks";
import hubServicesRouter from "./hub/services";
import jornadaRouter from "./jornada";
import cotizacionesRouter from "./cotizaciones";
import adminUsersRouter from "./admin-users";
import { requireArea } from "../lib/require-area";

const router: IRouter = Router();

router.use(healthRouter);
router.use(geminiRouter);
router.use(driveRouter);
router.use(contentRouter);

// Studio + transcriber: edicion area only (+ ceo/superadmin bypassed inside requireArea)
router.use("/studio", requireArea("ceo", "edicion"));
router.use(studioRouter);
router.use("/transcriber", requireArea("ceo", "edicion"));
router.use(transcriberRouter);

router.use(youtubeRouter);
router.use(tiktokRouter);
router.use(instagramRouter);
router.use(linkedinRouter);
router.use(xRouter);
router.use(facebookRouter);

// Community + analytics + inspirations: marketing area only
router.use("/community", requireArea("ceo", "marketing"));
router.use(communityRouter);
router.use("/analytics", requireArea("ceo", "marketing"));
router.use(analyticsRouter);
router.use("/inspirations", requireArea("ceo", "marketing"));
router.use(inspirationsRouter);

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

// Hub routes: ejecutivo area only
// hubTasksRouter/hubServicesRouter must be before hubRouter so /hub/tasks/* y
// /hub/services/* NO queden bajo el middleware CEO (gestión gateada por ruta).
router.use("/hub", requireArea("ceo", "ejecutivo", "rrhh"));
router.use(hubTasksRouter);
router.use(hubServicesRouter);
router.use(hubRouter);
router.use(hrRouter);
router.use(ticketsRouter);
router.use(goalsRouter);

// Cotizaciones: generador de cotizaciones PDF (hub ejecutivo)
router.use("/cotizaciones", requireArea("ceo", "ejecutivo"));
router.use("/cotizaciones", cotizacionesRouter);

router.use(adminUsersRouter);

export default router;
