import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashBriefingPin(pin: string, salt: string): Promise<string> {
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  return derived.toString("hex");
}

export async function verifyPinHash(
  suppliedValue: string,
  salt: string,
  storedHash: string,
): Promise<boolean> {
  const candidate = Buffer.from(await hashBriefingPin(suppliedValue, salt), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return candidate.length === expected.length &&
    candidate.length > 0 &&
    timingSafeEqual(candidate, expected);
}
