// Copyright 2026 Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import type { TavilyResult } from "./tavily";

export const CUSTOMER_SEARCH_EXCLUDED_DOMAINS = ["justdial.com", "indiamart.com"];

const ROLE_EMAIL_LOCALS = new Set([
  "admin",
  "business",
  "contact",
  "customerservice",
  "enquiries",
  "enquiry",
  "export",
  "hello",
  "info",
  "marketing",
  "office",
  "orders",
  "procurement",
  "purchase",
  "sales",
  "service",
  "support",
]);

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "live.com",
  "outlook.com",
  "protonmail.com",
  "rediffmail.com",
  "yahoo.com",
  "yahoo.co.in",
]);

export function buildCustomerSearchQuery(
  productOrCategory: string,
  city: string,
  state: string,
): string {
  return `Relevant businesses, potential customers, suppliers, or service providers for ${productOrCategory.trim()} in ${city.trim()}, ${state.trim()}; official business websites and publicly listed business phone or role-based email contact details.`;
}

export function isAllowedCustomerSearchSource(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return !CUSTOMER_SEARCH_EXCLUDED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export function extractPublicBusinessContacts(text: string): {
  phone: string | null;
  email: string | null;
} {
  const phoneMatch = text.match(
    /\b(?:phone|telephone|tel|mobile|call|contact(?:\s+(?:us|number|no\.?))?)\b\s*(?:(?:is|at|no\.?|number)\s*)?[:\-]?\s*(\+?[\d][\d\s().-]{8,24}\d)/i,
  );
  const phoneCandidate = phoneMatch?.[1]?.trim().replace(/[.,\s-]+$/, "") ?? "";
  const phoneDigits = phoneCandidate.replace(/\D/g, "");
  const phone =
    phoneDigits.length >= 10 && phoneDigits.length <= 13
      ? phoneCandidate.slice(0, 32)
      : null;

  const emailMatches = text.match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  ) ?? [];
  let email: string | null = null;
  for (const candidate of emailMatches) {
    const [localPart, domain] = candidate.toLowerCase().split("@");
    const normalizedLocal = localPart.replace(/[._+-]\d+$/, "").replace(/[._+-]/g, "");
    if (
      ROLE_EMAIL_LOCALS.has(normalizedLocal) &&
      !PERSONAL_EMAIL_DOMAINS.has(domain)
    ) {
      email = candidate.toLowerCase();
      break;
    }
  }

  return { phone, email };
}

export type CustomerSearchSource = {
  id: string;
  businessName: string;
  sourceUrl: string;
  publisher: string;
  excerpt: string;
  phone: string | null;
  email: string | null;
  publishedAt: string | null;
};

export function normalizeCustomerSearchResults(
  results: TavilyResult[],
): CustomerSearchSource[] {
  const seenUrls = new Set<string>();
  const normalized: CustomerSearchSource[] = [];

  for (const result of results) {
    if (typeof result.url !== "string" || !isAllowedCustomerSearchSource(result.url)) {
      continue;
    }

    const sourceUrl = new URL(result.url).toString();
    if (seenUrls.has(sourceUrl)) continue;

    const businessName =
      typeof result.title === "string" ? result.title.trim().slice(0, 180) : "";
    const content = typeof result.content === "string" ? result.content.trim() : "";
    if (!businessName || !content) continue;

    const parsedUrl = new URL(sourceUrl);
    const contacts = extractPublicBusinessContacts(content);
    const published =
      typeof result.published_date === "string"
        ? new Date(result.published_date)
        : null;
    const publishedAt =
      published && Number.isFinite(published.getTime())
        ? published.toISOString()
        : null;

    seenUrls.add(sourceUrl);
    normalized.push({
      id: `customer-${normalized.length + 1}`,
      businessName,
      sourceUrl,
      publisher: parsedUrl.hostname.replace(/^www\./i, ""),
      excerpt: content.slice(0, 700),
      phone: contacts.phone,
      email: contacts.email,
      publishedAt,
    });
  }

  return normalized;
}
