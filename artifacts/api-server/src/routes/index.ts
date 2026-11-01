import { Router, type IRouter } from "express";
import healthRouter from "./health";
import briefingsRouter from "./briefings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(briefingsRouter);

export default router;
