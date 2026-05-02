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

const router: IRouter = Router();

router.use(healthRouter);
router.use(geminiRouter);
router.use(driveRouter);
router.use(contentRouter);
router.use(studioRouter);
router.use(youtubeRouter);
router.use(tiktokRouter);
router.use(instagramRouter);
router.use(linkedinRouter);
router.use(xRouter);
router.use(facebookRouter);
router.use(communityRouter);
router.use(ideasRouter);
router.use(analyticsRouter);
router.use(inspirationsRouter);
router.use(onboardingRouter);

export default router;
