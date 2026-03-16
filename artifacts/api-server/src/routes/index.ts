import { Router, type IRouter } from "express";
import healthRouter from "./health";
import geminiRouter from "./gemini";
import driveRouter from "./drive";
import contentRouter from "./content";

const router: IRouter = Router();

router.use(healthRouter);
router.use(geminiRouter);
router.use(driveRouter);
router.use(contentRouter);

export default router;
