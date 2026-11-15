import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getFraudGuardDeliveryStatus } from "../lib/fraudguard-events.ts";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({
    ...data,
    fraudguard: getFraudGuardDeliveryStatus(),
  });
});

export default router;
