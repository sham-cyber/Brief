// Copyright 2026 Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { createHmac, randomUUID } from "node:crypto";

export type FraudGuardOperation = "model_summary" | "tavily_search";
export type FraudGuardEventType =
  | "start"
  | "completion"
  | "failure"
  | "cancellation"
  | "citation_guardrail";
export type FraudGuardValidationOutcome = "passed" | "failed" | "not_run";

export type FraudGuardEventInput = {
  userId: string;
  attemptId: string;
  operation: FraudGuardOperation;
  eventType: FraudGuardEventType;
  status: "started" | "completed" | "failed" | "cancelled" | FraudGuardValidationOutcome;
  provider: string;
  model?: string;
  durationMs?: number;
  resultCount?: number;
  validationOutcome?: FraudGuardValidationOutcome;
};

export type FraudGuardEventEmitter = (event: FraudGuardEventInput) => void;

type FraudGuardPayload = {
  event_id: string;
  attempt_id: string;
  profile_ref: string;
  operation: FraudGuardOperation;
  event_type: FraudGuardEventType;
  timestamp: string;
  status: FraudGuardEventInput["status"];
  provider: string;
  model?: string;
  token_count_source?: "unavailable";
  duration_ms?: number;
  result_count?: number;
  validation_outcome?: FraudGuardValidationOutcome;
};

export type FraudGuardSenderConfig = {
  enabled: boolean;
  apiUrl?: string;
  clientKey?: string;
  profileHmacKey?: string;
  queueCapacity?: number;
};

export type FraudGuardDeliveryStatus = {
  enabled: boolean;
  pendingEvents: number;
  droppedEvents: number;
};

const DEFAULT_QUEUE_CAPACITY = 512;
const DELIVERY_TIMEOUT_MS = 1_500;
const MAX_EVENT_DURATION_MS = 600_000;
const MAX_RESULT_COUNT = 1_000;

function safeEndpoint(apiUrl: string | undefined): string | null {
  if (!apiUrl) return null;
  try {
    const url = new URL(apiUrl);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      url.hostname.toLowerCase(),
    );
    const localDevelopmentHttp =
      url.protocol === "http:" &&
      isLoopback &&
      process.env.NODE_ENV !== "production";
    if (
      (url.protocol !== "https:" && !localDevelopmentHttp) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/api/v2/events"
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeLabel(value: string, fallback: string): string {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,63}$/.test(value)
    ? value
    : fallback;
}

function boundedInteger(value: number | undefined, maximum: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(maximum, Math.trunc(value)));
}

export class FraudGuardEventSender {
  private readonly endpoint: string | null;
  private readonly clientKey: string | null;
  private readonly profileHmacKey: string | null;
  private readonly queueCapacity: number;
  private readonly fetcher: typeof fetch;
  private readonly queue: FraudGuardPayload[] = [];
  private inFlight = 0;
  private draining = false;
  private droppedEvents = 0;

  constructor(
    config: FraudGuardSenderConfig,
    fetcher: typeof fetch = fetch,
  ) {
    this.endpoint = safeEndpoint(config.apiUrl);
    this.clientKey =
      config.clientKey && config.clientKey.length >= 24 &&
      !/[\s\r\n]/.test(config.clientKey)
        ? config.clientKey
        : null;
    this.profileHmacKey =
      config.profileHmacKey && config.profileHmacKey.length >= 32
        ? config.profileHmacKey
        : null;
    this.queueCapacity = Number.isSafeInteger(config.queueCapacity) &&
        (config.queueCapacity ?? 0) > 0
      ? Math.min(config.queueCapacity ?? DEFAULT_QUEUE_CAPACITY, 8_192)
      : DEFAULT_QUEUE_CAPACITY;
    this.fetcher = fetcher;
    this.enabled = Boolean(
      config.enabled && this.endpoint && this.clientKey && this.profileHmacKey,
    );
  }

  private readonly enabled: boolean;

  status(): FraudGuardDeliveryStatus {
    return {
      enabled: this.enabled,
      pendingEvents: this.queue.length + this.inFlight,
      droppedEvents: this.droppedEvents,
    };
  }

  enqueue(event: FraudGuardEventInput): boolean {
    if (!this.enabled || !event.userId || !event.attemptId) return false;
    if (this.queue.length + this.inFlight >= this.queueCapacity) {
      this.droppedEvents += 1;
      return false;
    }

    try {
      const profileRef = createHmac("sha256", this.profileHmacKey!)
        .update(event.userId)
        .digest("hex")
        .slice(0, 40);
      const payload: FraudGuardPayload = {
        event_id: randomUUID(),
        attempt_id: event.attemptId,
        profile_ref: profileRef,
        operation: event.operation,
        event_type: event.eventType,
        timestamp: new Date().toISOString(),
        status: event.status,
        provider: event.operation === "tavily_search"
          ? "tavily"
          : safeLabel(event.provider, "unknown"),
      };
      if (event.operation === "model_summary") {
        payload.model = safeLabel(event.model ?? "", "unknown");
        if (
          event.eventType === "completion" ||
          event.eventType === "failure" ||
          event.eventType === "cancellation"
        ) {
          payload.token_count_source = "unavailable";
        }
      }
      const durationMs = boundedInteger(event.durationMs, MAX_EVENT_DURATION_MS);
      if (durationMs !== undefined) payload.duration_ms = durationMs;
      const resultCount = boundedInteger(event.resultCount, MAX_RESULT_COUNT);
      if (resultCount !== undefined) payload.result_count = resultCount;
      if (event.validationOutcome) {
        payload.validation_outcome = event.validationOutcome;
      }

      this.queue.push(payload);
      void this.drain();
      return true;
    } catch {
      this.droppedEvents += 1;
      return false;
    }
  }

  async waitForIdle(): Promise<void> {
    while (this.draining || this.queue.length || this.inFlight) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const payload = this.queue.shift();
        if (!payload) continue;
        this.inFlight += 1;
        try {
          const response = await this.fetcher(this.endpoint!, {
            method: "POST",
            headers: {
              authorization: `Bearer ${this.clientKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
          });
          await response.body?.cancel();
          if (!response.ok) this.droppedEvents += 1;
        } catch {
          this.droppedEvents += 1;
        } finally {
          this.inFlight -= 1;
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length) void this.drain();
    }
  }
}

function createDefaultSender(env: NodeJS.ProcessEnv): FraudGuardEventSender {
  return new FraudGuardEventSender({
    enabled: env.FRAUDGUARD_ENABLED?.trim().toLowerCase() === "true",
    apiUrl: env.FRAUDGUARD_API_URL,
    clientKey: env.FRAUDGUARD_CLIENT_KEY,
    profileHmacKey: env.FRAUDGUARD_PROFILE_HMAC_KEY,
  });
}

const defaultSender = createDefaultSender(process.env);

export function emitFraudGuardEvent(event: FraudGuardEventInput): void {
  try {
    defaultSender.enqueue(event);
  } catch {
    // FraudGuard is optional telemetry; it must never affect Brief responses.
  }
}

export function getFraudGuardDeliveryStatus(): FraudGuardDeliveryStatus {
  return defaultSender.status();
}
