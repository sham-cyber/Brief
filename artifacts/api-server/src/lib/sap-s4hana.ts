// Copyright 2026 Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import type {
  BriefingInputTopicsItem,
  SapBriefingDataItem,
  SapDataArea,
} from "@workspace/api-zod";

export const SAP_DATA_AREAS: SapDataArea[] = [
  "store",
  "production",
  "maintenance",
  "inventory",
  "sales",
  "hr",
  "power_electrical_solar",
];

export const SAP_AREA_LABELS: Record<SapDataArea, string> = {
  store: "Store",
  production: "Production",
  maintenance: "Maintenance",
  inventory: "Inventory",
  sales: "Sales",
  hr: "HR",
  power_electrical_solar: "Power / Electrical / Solar",
};

type SapAreaMapping = {
  resourcePath: string;
  filterTemplate: string;
  dateField: string;
  idField: string;
  titleField: string;
  summaryFields: string[];
  topic: BriefingInputTopicsItem;
};

type SapConfig = {
  serviceRoot: URL;
  tokenUrl: URL;
  clientId: string;
  clientSecret: string;
  scope?: string;
  fioriUrl: URL;
  organizations: string[];
  areas: Partial<Record<SapDataArea, SapAreaMapping>>;
};

export type SapSource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
  snippet: string;
  images: [];
  affiliatedCompanyReport: boolean;
};

export type SapSearchResult = {
  sources: { source: SapSource; searchedAs: BriefingInputTopicsItem }[];
  sapData: SapBriefingDataItem[];
  resultsReturned: number;
  requestsCompleted: number;
};

const TOPICS = new Set<BriefingInputTopicsItem>([
  "news",
  "hire",
  "launch",
  "financial",
  "risk",
]);
const SAP_MAX_RECORDS_PER_AREA = 20;
const SAP_REQUEST_TIMEOUT_MS = 25_000;
export const SAP_BRIEFING_LIMIT_MS = 120_000;
export const SAP_BRIEFING_HARD_STOP_MS = 180_000;

function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function parseAreaMapping(value: unknown): SapAreaMapping | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const mapping = value as Record<string, unknown>;
  const resourcePath = mapping.resourcePath;
  const filterTemplate = mapping.filterTemplate;
  const dateField = mapping.dateField;
  const idField = mapping.idField;
  const titleField = mapping.titleField;
  const summaryFields = mapping.summaryFields;
  const topic = mapping.topic;
  const filterWithoutSupportedTokens =
    typeof filterTemplate === "string"
      ? filterTemplate
          .replaceAll("{start}", "")
          .replaceAll("{end}", "")
          .replaceAll("{organization}", "")
      : "";

  if (
    typeof resourcePath !== "string" ||
    !resourcePath ||
    resourcePath.startsWith("/") ||
    resourcePath.includes("..") ||
    !/^[A-Za-z0-9/_-]+$/.test(resourcePath) ||
    typeof filterTemplate !== "string" ||
    filterTemplate.length > 1000 ||
    !filterTemplate.includes("{start}") ||
    !filterTemplate.includes("{end}") ||
    !filterTemplate.includes("{organization}") ||
    /[{}]/.test(filterWithoutSupportedTokens) ||
    !safeIdentifier(dateField) ||
    !safeIdentifier(idField) ||
    !safeIdentifier(titleField) ||
    !Array.isArray(summaryFields) ||
    summaryFields.length > 12 ||
    !summaryFields.every(safeIdentifier) ||
    typeof topic !== "string" ||
    !TOPICS.has(topic as BriefingInputTopicsItem)
  ) {
    return null;
  }

  return {
    resourcePath,
    filterTemplate,
    dateField,
    idField,
    titleField,
    summaryFields,
    topic: topic as BriefingInputTopicsItem,
  };
}

function readSapConfig(): SapConfig | null {
  const raw = process.env.SAP_S4HANA_CONFIG?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const serviceRoot = httpsUrl(parsed.serviceRoot);
    const tokenUrl = httpsUrl(parsed.tokenUrl);
    const fioriUrl = httpsUrl(parsed.fioriUrl);
    const organizations = Array.isArray(parsed.organizations)
      ? [...new Set(parsed.organizations
          .filter((organization): organization is string =>
            typeof organization === "string" &&
            organization.trim().length > 0 &&
            organization.trim().length <= 120,
          )
          .map((organization) => organization.replace(/[\u0000-\u001f\u007f]/g, " ").trim()))]
      : [];
    if (
      !serviceRoot ||
      !tokenUrl ||
      !fioriUrl ||
      typeof parsed.clientId !== "string" ||
      !parsed.clientId.trim() ||
      typeof parsed.clientSecret !== "string" ||
      !parsed.clientSecret ||
      organizations.length === 0 ||
      !parsed.areas ||
      typeof parsed.areas !== "object" ||
      Array.isArray(parsed.areas)
    ) {
      return null;
    }

    serviceRoot.hash = "";
    serviceRoot.search = "";
    if (!serviceRoot.pathname.endsWith("/")) serviceRoot.pathname += "/";
    fioriUrl.hash = "";
    fioriUrl.search = "";
    if (!fioriUrl.pathname.endsWith("/")) fioriUrl.pathname += "/";

    const rawAreas = parsed.areas as Record<string, unknown>;
    const areas: Partial<Record<SapDataArea, SapAreaMapping>> = {};
    for (const area of SAP_DATA_AREAS) {
      const mapping = parseAreaMapping(rawAreas[area]);
      if (mapping) areas[area] = mapping;
    }
    if (Object.keys(areas).length === 0) return null;

    return {
      serviceRoot,
      tokenUrl,
      clientId: parsed.clientId.trim(),
      clientSecret: parsed.clientSecret,
      ...(typeof parsed.scope === "string" && parsed.scope.trim()
        ? { scope: parsed.scope.trim() }
        : {}),
      fioriUrl,
      organizations,
      areas,
    };
  } catch {
    return null;
  }
}

export function getSapConfigurationStatus(): {
  configured: boolean;
  availableAreas: SapDataArea[];
} {
  const config = readSapConfig();
  const availableAreas = config
    ? SAP_DATA_AREAS.filter((area) => Boolean(config.areas[area]))
    : [];
  return {
    configured: availableAreas.length > 0,
    availableAreas,
  };
}

function organizationFilterValue(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/'/g, "''");
}

function odataDate(value: string): Date | null {
  if (typeof value !== "string") return null;
  const milliseconds = value.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/);
  const date = milliseconds
    ? new Date(Number(milliseconds[1]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function propertyText(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function parseRecords(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const direct = Array.isArray(root.value) ? root.value : null;
  const legacy =
    root.d && typeof root.d === "object" && Array.isArray((root.d as Record<string, unknown>).results)
      ? (root.d as Record<string, unknown>).results as unknown[]
      : null;
  return (direct ?? legacy ?? []).filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

async function fetchAccessToken(config: SapConfig, signal: AbortSignal): Promise<string> {
  const controller = AbortSignal.any([
    signal,
    AbortSignal.timeout(SAP_REQUEST_TIMEOUT_MS),
  ]);
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  if (config.scope) body.set("scope", config.scope);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
      "cache-control": "no-store",
    },
    body,
    signal: controller,
    redirect: "error",
  });
  if (!response.ok) throw new Error("SAP authorization was rejected.");
  const tokenPayload = await response.json() as { access_token?: unknown; token_type?: unknown };
  if (
    typeof tokenPayload.access_token !== "string" ||
    !tokenPayload.access_token ||
    (tokenPayload.token_type !== undefined &&
      typeof tokenPayload.token_type === "string" &&
      tokenPayload.token_type.toLowerCase() !== "bearer")
  ) {
    throw new Error("SAP authorization returned an invalid token response.");
  }
  return tokenPayload.access_token;
}

function makeFilter(
  template: string,
  start: Date,
  end: Date,
  organization: string,
): string {
  return template
    .replaceAll("{start}", start.toISOString())
    .replaceAll("{end}", end.toISOString())
    .replaceAll("{organization}", organizationFilterValue(organization));
}

function findRecordSourceUrl(config: SapConfig): string {
  return config.fioriUrl.toString();
}

export async function searchSapS4Hana(input: {
  areas: SapDataArea[];
  topics: BriefingInputTopicsItem[];
  organization: string;
  windowStart: Date;
  windowEnd: Date;
  affiliatedCompanyReport: boolean;
  signal: AbortSignal;
}): Promise<SapSearchResult> {
  const config = readSapConfig();
  if (!config) throw new Error("SAP S/4HANA is not configured.");
  if (!input.organization.trim()) throw new Error("An SAP company or plant scope is required.");
  const approvedOrganization = config.organizations.find(
    (organization) =>
      organization.toLocaleLowerCase("en-US") === input.organization.trim().toLocaleLowerCase("en-US"),
  );
  if (!approvedOrganization) {
    throw new Error("This company or plant is not approved for the SAP connection.");
  }

  for (const area of input.areas) {
    if (!config.areas[area]) {
      throw new Error(`The SAP ${SAP_AREA_LABELS[area]} area is not enabled for this connection.`);
    }
  }

  const queryAreas = input.areas.filter((area) =>
    input.topics.includes(config.areas[area]!.topic),
  );
  if (queryAreas.length === 0) {
    return { sources: [], sapData: [], resultsReturned: 0, requestsCompleted: 0 };
  }

  const token = await fetchAccessToken(config, input.signal);
  const areaResults = await Promise.all(queryAreas.map(async (area) => {
    const mapping = config.areas[area]!;
    const resourceUrl = new URL(mapping.resourcePath, config.serviceRoot);
    if (resourceUrl.origin !== config.serviceRoot.origin) {
      throw new Error("The configured SAP service path is outside its approved origin.");
    }

    const fields = [...new Set([
      mapping.dateField,
      mapping.idField,
      mapping.titleField,
      ...mapping.summaryFields,
    ])];
    resourceUrl.searchParams.set("$filter", makeFilter(
      mapping.filterTemplate,
      input.windowStart,
      input.windowEnd,
      approvedOrganization,
    ));
    resourceUrl.searchParams.set("$select", fields.join(","));
    resourceUrl.searchParams.set("$orderby", `${mapping.dateField} desc`);
    resourceUrl.searchParams.set("$top", String(SAP_MAX_RECORDS_PER_AREA));

    const response = await fetch(resourceUrl, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "cache-control": "no-store",
      },
      signal: AbortSignal.any([
        input.signal,
        AbortSignal.timeout(SAP_REQUEST_TIMEOUT_MS),
      ]),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`The SAP ${SAP_AREA_LABELS[area]} request failed.`);
    const records = parseRecords(await response.json());
    const sources: SapSearchResult["sources"] = [];
    const sapData: SapBriefingDataItem[] = [];

    for (const [index, record] of records.entries()) {
      const recordId = propertyText(record, mapping.idField).slice(0, 100);
      const title = propertyText(record, mapping.titleField).slice(0, 220);
      const recordedDate = odataDate(propertyText(record, mapping.dateField));
      if (!recordId || !title || !recordedDate) continue;
      if (recordedDate < input.windowStart || recordedDate > input.windowEnd) continue;

      const detail = mapping.summaryFields
        .map((field) => {
          const value = propertyText(record, field).replace(/\s+/g, " ");
          return value ? `${field}: ${value.slice(0, 120)}` : "";
        })
        .filter(Boolean)
        .join(" · ")
        .slice(0, 700);
      const sourceId = `SAP-${area.toUpperCase()}-${index + 1}`;
      const sourceTitle = `${SAP_AREA_LABELS[area]} · ${recordId} · ${title}`.slice(0, 240);
      const source = {
        id: sourceId,
        title: sourceTitle,
        url: findRecordSourceUrl(config),
        publisher: `SAP S/4HANA · ${SAP_AREA_LABELS[area]} · ${recordId}`,
        publishedAt: recordedDate.toISOString(),
        snippet: detail || `${SAP_AREA_LABELS[area]} record ${recordId}.`,
        images: [] as [],
        affiliatedCompanyReport: input.affiliatedCompanyReport,
      };

      sources.push({ source, searchedAs: mapping.topic });
      sapData.push({
        area,
        recordId,
        title,
        detail: detail || "No additional mapped fields were returned.",
        recordedAt: recordedDate,
        sourceIds: [sourceId],
      });
    }
    return { sources, sapData, resultsReturned: records.length };
  }));

  return {
    sources: areaResults.flatMap((result) => result.sources),
    sapData: areaResults.flatMap((result) => result.sapData),
    resultsReturned: areaResults.reduce((total, result) => total + result.resultsReturned, 0),
    requestsCompleted: areaResults.length,
  };
}
