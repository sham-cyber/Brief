import { Router, type IRouter } from "express";
import healthRouter from "./health";
import briefingsRouter from "./briefings";
import aiGuardrailsRouter from "./ai-guardrails";
import personProfilesRouter from "./person-profiles";

const router: IRouter = Router();

router.use(healthRouter);
router.use(briefingsRouter);
router.use(aiGuardrailsRouter);
router.use(personProfilesRouter);

export default router;
