import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerSearchQuery,
  extractPublicBusinessContacts,
  isAllowedCustomerSearchSource,
  normalizeCustomerSearchResults,
} from "./customer-search.ts";

test("customer search query includes category and full location", () => {
  const query = buildCustomerSearchQuery("BOPP tape", "Pune", "Maharashtra");
  assert.match(query, /BOPP tape/);
  assert.match(query, /Pune, Maharashtra/);
  assert.match(query, /publicly listed business phone/);
});

test("customer search excludes prohibited directory domains and non-HTTPS links", () => {
  assert.equal(isAllowedCustomerSearchSource("https://www.example.in/contact"), true);
  assert.equal(isAllowedCustomerSearchSource("https://justdial.com/company"), false);
  assert.equal(isAllowedCustomerSearchSource("https://listing.justdial.com/company"), false);
  assert.equal(isAllowedCustomerSearchSource("https://indiamart.com/product"), false);
  assert.equal(isAllowedCustomerSearchSource("http://example.in/contact"), false);
  assert.equal(isAllowedCustomerSearchSource("not a URL"), false);
});

test("contact extraction accepts only labeled phones and role-based business email", () => {
  const contacts = extractPublicBusinessContacts(
    "Contact phone: +91 98765 43210; email sales@acme.example.in or person@gmail.com",
  );
  assert.equal(contacts.phone, "+91 98765 43210");
  assert.equal(contacts.email, "sales@acme.example.in");

  const personalOnly = extractPublicBusinessContacts(
    "Call today at 9876543210 or mail person@gmail.com",
  );
  assert.equal(personalOnly.phone, null);
  assert.equal(personalOnly.email, null);
});

test("normalization returns cited public pages and filters blocked or incomplete results", () => {
  const sources = normalizeCustomerSearchResults([
    {
      title: "Acme Co. Contact",
      url: "https://www.acme.example.in/contact",
      content: "Phone: +91 98765 43210. Email: info@acme.example.in",
      published_date: "2026-11-01",
    },
    {
      title: "Directory listing",
      url: "https://www.justdial.com/acme",
      content: "Phone: +91 98765 43210",
    },
    {
      title: "No content",
      url: "https://example.in/empty",
      content: "",
    },
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].businessName, "Acme Co. Contact");
  assert.equal(sources[0].publisher, "acme.example.in");
  assert.equal(sources[0].phone, "+91 98765 43210");
  assert.equal(sources[0].email, "info@acme.example.in");
  assert.match(sources[0].sourceUrl, /^https:/);
  assert.equal(sources[0].publishedAt, "2026-11-01T00:00:00.000Z");
});
