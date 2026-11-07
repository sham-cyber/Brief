// Copyright 2026 Sham Mohite
// Author: Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { timingSafeEqual } from "node:crypto";

const START_PIN_MAX_ATTEMPTS = 5;
const START_PIN_ATTEMPT_WINDOW_MS = 15 * 60_000;
const START_PIN_LOCKOUT_MS = 15 * 60_000;

const startPinFailures = new Map<
  string,
  { attempts: number; windowStartedAt: number; lockedUntil: number }
>();

export type StartPinCheck =
  | { valid: true }
  | {
      valid: false;
      status: 403 | 429 | 503;
      message: string;
      retryAfterSeconds?: number;
    };

function lockSeconds(userId: string): number {
  const now = Date.now();
  const state = startPinFailures.get(userId);
  if (!state) return 0;
  if (state.lockedUntil > now) return Math.ceil((state.lockedUntil - now) / 1000);
  if (
    now - state.windowStartedAt >= START_PIN_ATTEMPT_WINDOW_MS ||
    state.lockedUntil > 0
  ) {
    startPinFailures.delete(userId);
  }
  return 0;
}

function recordFailure(userId: string): number {
  const now = Date.now();
  const previous = startPinFailures.get(userId);
  const state =
    previous && now - previous.windowStartedAt < START_PIN_ATTEMPT_WINDOW_MS
      ? previous
      : { attempts: 0, windowStartedAt: now, lockedUntil: 0 };
  state.attempts += 1;
  if (state.attempts >= START_PIN_MAX_ATTEMPTS) {
    state.lockedUntil = now + START_PIN_LOCKOUT_MS;
  }
  startPinFailures.set(userId, state);
  return state.lockedUntil > now
    ? Math.ceil((state.lockedUntil - now) / 1000)
    : 0;
}

export function verifyBriefingStartPin(
  userId: string,
  suppliedValue: string,
): StartPinCheck {
  const expectedValue = process.env.BRIEFING_START_PIN?.trim();
  if (!expectedValue || !/^\d{4}$/.test(expectedValue)) {
    return {
      valid: false,
      status: 503,
      message: "The briefing start PIN is not configured in the API Server secrets.",
    };
  }

  const retryAfterSeconds = lockSeconds(userId);
  if (retryAfterSeconds > 0) {
    return {
      valid: false,
      status: 429,
      message: "Too many incorrect PIN attempts. Try again after the lockout period.",
      retryAfterSeconds,
    };
  }

  const supplied = Buffer.from(suppliedValue, "utf8");
  const expected = Buffer.from(expectedValue, "utf8");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    const lockout = recordFailure(userId);
    return lockout > 0
      ? {
          valid: false,
          status: 429,
          message: "Too many incorrect PIN attempts. Try again after the lockout period.",
          retryAfterSeconds: lockout,
        }
      : {
          valid: false,
          status: 403,
          message: "The start PIN is incorrect.",
        };
  }

  startPinFailures.delete(userId);
  return { valid: true };
}
