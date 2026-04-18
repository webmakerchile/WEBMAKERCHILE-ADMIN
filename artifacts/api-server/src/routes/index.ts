import { Router, type IRouter } from "express";
import healthRouter from "./health";
import geminiRouter from "./gemini";
import driveRouter from "./drive";
import contentRouter from "./content";
import studioRouter from "./studio";
import youtubeRouter from "./youtube";
import tiktokRouter from "./tiktok";
import instagramRouter from "./instagram";
import communityRouter from "./community";

const router: IRouter = Router();

router.use(healthRouter);
router.use(geminiRouter);
router.use(driveRouter);
router.use(contentRouter);
router.use(studioRouter);
router.use(youtubeRouter);
router.use(tiktokRouter);
router.use(instagramRouter);
router.use(communityRouter);

export default router;
