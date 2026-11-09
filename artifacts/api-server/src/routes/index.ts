import { Router, type IRouter } from "express";
import healthRouter from "./health";
import briefingsRouter from "./briefings";
import aiGuardrailsRouter from "./ai-guardrails";
import aiCredentialsRouter from "./ai-credentials";
import personProfilesRouter from "./person-profiles";
import tavilyCredentialsRouter from "./tavily-credentials";
import sapConnectionRouter from "./sap-connection";
import telegramRouter from "./telegram";

const router: IRouter = Router();

router.use(healthRouter);
router.use(briefingsRouter);
router.use(aiGuardrailsRouter);
router.use(aiCredentialsRouter);
router.use(personProfilesRouter);
router.use(tavilyCredentialsRouter);
router.use(sapConnectionRouter);
router.use(telegramRouter);

export default router;
