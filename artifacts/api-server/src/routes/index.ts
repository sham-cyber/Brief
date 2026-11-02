import { Router, type IRouter } from "express";
import healthRouter from "./health";
import briefingsRouter from "./briefings";
import aiGuardrailsRouter from "./ai-guardrails";
import personProfilesRouter from "./person-profiles";
import tavilyCredentialsRouter from "./tavily-credentials";

const router: IRouter = Router();

router.use(healthRouter);
router.use(briefingsRouter);
router.use(aiGuardrailsRouter);
router.use(personProfilesRouter);
router.use(tavilyCredentialsRouter);

export default router;
