// Copyright 2026 Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { clerkClient } from "@clerk/express";

let ownerIdentityCache:
  | { email: string; userId: string; expiresAt: number }
  | null = null;

export async function resolveOwnerUserId(email: string): Promise<string | null> {
  if (
    ownerIdentityCache?.email === email &&
    ownerIdentityCache.expiresAt > Date.now()
  ) {
    return ownerIdentityCache.userId;
  }
  const result = await clerkClient.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  const owner = result.data.find((user) =>
    user.emailAddresses.some(
      (address) => address.emailAddress.trim().toLowerCase() === email,
    ),
  );
  if (!owner) return null;
  ownerIdentityCache = {
    email,
    userId: owner.id,
    expiresAt: Date.now() + 5 * 60_000,
  };
  return owner.id;
}
