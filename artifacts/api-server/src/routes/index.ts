import { Router, type IRouter } from "express";
import healthRouter from "./health";
import briefingsRouter from "./briefings";
import aiGuardrailsRouter from "./ai-guardrails";

const router: IRouter = Router();

router.use(healthRouter);
router.use(briefingsRouter);
router.use(aiGuardrailsRouter);

export default router;
