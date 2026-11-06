import assert from "node:assert/strict";
import test from "node:test";
import {
  getSapConfigurationStatus,
  searchSapS4Hana,
} from "./sap-s4hana.ts";

const makeConfig = (overrides = {}) => JSON.stringify({
  serviceRoot: "https://s4.example.invalid/sap/opu/odata/sap/",
  tokenUrl: "https://identity.example.invalid/oauth/token",
  clientId: "test-client",
  clientSecret: "test-secret",
  fioriUrl: "https://s4.example.invalid/sap/bc/ui2/flp",
  organizations: ["ACME O'Neil"],
  areas: {
    inventory: {
      resourcePath: "API_EXAMPLE_SRV/InventorySet",
      filterTemplate: "ChangedAt ge datetimeoffset'{start}' and ChangedAt le datetimeoffset'{end}' and CompanyCode eq '{organization}'",
      dateField: "ChangedAt",
      idField: "RecordId",
      titleField: "MaterialDescription",
      summaryFields: ["Status", "Quantity"],
      topic: "news",
    },
  },
  ...overrides,
});

test("SAP S/4HANA source stays idle until an explicit read", async (t) => {
  const originalConfig = process.env.SAP_S4HANA_CONFIG;
  const originalFetch = globalThis.fetch;
  t.after(() => {
    if (originalConfig === undefined) delete process.env.SAP_S4HANA_CONFIG;
    else process.env.SAP_S4HANA_CONFIG = originalConfig;
    globalThis.fetch = originalFetch;
  });

  await t.test("reports missing or malformed setup without making requests", () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("Unexpected network request");
    };
    delete process.env.SAP_S4HANA_CONFIG;
    assert.deepEqual(getSapConfigurationStatus(), {
      configured: false,
      availableAreas: [],
    });
    assert.equal(calls, 0);

    process.env.SAP_S4HANA_CONFIG = makeConfig({
      serviceRoot: "http://s4.example.invalid/odata/",
    });
    assert.deepEqual(getSapConfigurationStatus(), {
      configured: false,
      availableAreas: [],
    });
    assert.equal(calls, 0);
  });

  await t.test("shows only areas explicitly configured by the SAP administrator", () => {
    process.env.SAP_S4HANA_CONFIG = makeConfig();
    assert.deepEqual(getSapConfigurationStatus(), {
      configured: true,
      availableAreas: ["inventory"],
    });
  });

  await t.test("uses OAuth, company/date filters, mapped fields, and cited S/4HANA records", async () => {
    process.env.SAP_S4HANA_CONFIG = makeConfig();
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      if (url.pathname.endsWith("/oauth/token")) {
        assert.equal(init.method, "POST");
        assert.match(init.headers.authorization, /^Basic /);
        assert.equal(new URLSearchParams(init.body).get("grant_type"), "client_credentials");
        return Response.json({ access_token: "test-access-token", token_type: "Bearer" });
      }

      assert.equal(url.origin, "https://s4.example.invalid");
      assert.equal(init.headers.authorization, "Bearer test-access-token");
      assert.equal(url.searchParams.get("$top"), "20");
      assert.equal(url.searchParams.get("$select"), "ChangedAt,RecordId,MaterialDescription,Status,Quantity");
      const filter = url.searchParams.get("$filter");
      assert.ok(filter.includes("datetimeoffset'2026-10-01T00:00:00.000Z'"));
      assert.ok(filter.includes("datetimeoffset'2026-10-31T00:00:00.000Z'"));
      assert.ok(filter.includes("CompanyCode eq 'ACME O''Neil'"));

      return Response.json({
        value: [
          {
            ChangedAt: "2026-10-12T08:15:00.000Z",
            RecordId: "INV-17",
            MaterialDescription: "Cable stock",
            Status: "Available",
            Quantity: 125,
          },
          {
            ChangedAt: "2026-09-01T08:15:00.000Z",
            RecordId: "OLD-1",
            MaterialDescription: "Outside window",
            Status: "Archived",
            Quantity: 0,
          },
        ],
      });
    };

    const result = await searchSapS4Hana({
      areas: ["inventory"],
      topics: ["news"],
      organization: "ACME O'Neil",
      windowStart: new Date("2026-10-01T00:00:00.000Z"),
      windowEnd: new Date("2026-10-31T00:00:00.000Z"),
      affiliatedCompanyReport: false,
      signal: new AbortController().signal,
    });

    assert.equal(calls.length, 2);
    assert.equal(result.requestsCompleted, 1);
    assert.equal(result.resultsReturned, 2);
    assert.equal(result.sapData.length, 1);
    assert.equal(result.sapData[0].recordId, "INV-17");
    assert.equal(result.sapData[0].detail, "Status: Available · Quantity: 125");
    assert.equal(result.sapData[0].sourceIds[0], result.sources[0].source.id);
    assert.equal(result.sources[0].source.publisher, "SAP S/4HANA · Inventory · INV-17");
    assert.equal(result.sources[0].source.url, "https://s4.example.invalid/sap/bc/ui2/flp/");
  });

  await t.test("rejects an area that the configured SAP connection does not expose", async () => {
    process.env.SAP_S4HANA_CONFIG = makeConfig();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("Unexpected network request");
    };

    await assert.rejects(
      searchSapS4Hana({
        areas: ["hr"],
        topics: ["news"],
        organization: "ACME O'Neil",
        windowStart: new Date("2026-10-01T00:00:00.000Z"),
        windowEnd: new Date("2026-10-31T00:00:00.000Z"),
        affiliatedCompanyReport: false,
        signal: new AbortController().signal,
      }),
      /HR area is not enabled/,
    );
    assert.equal(calls, 0);
  });

  await t.test("rejects a company or plant outside the administrator allowlist", async () => {
    process.env.SAP_S4HANA_CONFIG = makeConfig();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("Unexpected network request");
    };

    await assert.rejects(
      searchSapS4Hana({
        areas: ["inventory"],
        topics: ["news"],
        organization: "Another Company",
        windowStart: new Date("2026-10-01T00:00:00.000Z"),
        windowEnd: new Date("2026-10-31T00:00:00.000Z"),
        affiliatedCompanyReport: false,
        signal: new AbortController().signal,
      }),
      /not approved for the SAP connection/,
    );
    assert.equal(calls, 0);
  });

  await t.test("does not contact SAP when no selected topic is mapped to an area", async () => {
    process.env.SAP_S4HANA_CONFIG = makeConfig();
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("Unexpected network request");
    };

    const result = await searchSapS4Hana({
      areas: ["inventory"],
      topics: ["hire"],
      organization: "ACME O'Neil",
      windowStart: new Date("2026-10-01T00:00:00.000Z"),
      windowEnd: new Date("2026-10-31T00:00:00.000Z"),
      affiliatedCompanyReport: false,
      signal: new AbortController().signal,
    });
    assert.equal(result.requestsCompleted, 0);
    assert.equal(result.sapData.length, 0);
    assert.equal(calls, 0);
  });
});
