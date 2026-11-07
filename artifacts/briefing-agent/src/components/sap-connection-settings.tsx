// Copyright 2026 Sham Mohite
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, Settings2, X } from "lucide-react";

type SapArea =
  | "store"
  | "production"
  | "maintenance"
  | "inventory"
  | "sales"
  | "hr"
  | "power_electrical_solar"
  | "purchase"
  | "scrap"
  | "order"
  | "delivery";

type Topic = "news" | "hire" | "launch" | "financial" | "risk";

type AreaMapping = {
  area: SapArea;
  resourcePath: string;
  filterTemplate: string;
  dateField: string;
  idField: string;
  titleField: string;
  summaryFields: string[];
  topic: Topic;
};

type SapSettings = {
  configured: boolean;
  storageReady: boolean;
  clientCredentialsConfigured: boolean;
  hasSavedConnection: boolean;
  legacyEnvironmentConfig: boolean;
  legacyEnvironmentConfigActive: boolean;
  legacyEnvironmentConfigSuppressed: boolean;
  serviceRoot: string | null;
  tokenUrl: string | null;
  fioriUrl: string | null;
  scope: string | null;
  organizations: string[];
  areas: AreaMapping[];
  updatedAt: string | null;
};

type Draft = {
  serviceRoot: string;
  tokenUrl: string;
  fioriUrl: string;
  scope: string;
  organizationsText: string;
  areas: Record<SapArea, AreaMapping | null>;
};

const AREAS: { value: SapArea; label: string }[] = [
  { value: "store", label: "Store" },
  { value: "production", label: "Production" },
  { value: "maintenance", label: "Maintenance" },
  { value: "inventory", label: "Inventory" },
  { value: "sales", label: "Sales" },
  { value: "hr", label: "HR" },
  { value: "power_electrical_solar", label: "Power / Electrical / Solar" },
  { value: "purchase", label: "Purchase" },
  { value: "scrap", label: "Scrap" },
  { value: "order", label: "Order" },
  { value: "delivery", label: "Delivery" },
];

const TOPICS: { value: Topic; label: string }[] = [
  { value: "news", label: "News" },
  { value: "hire", label: "Hires" },
  { value: "launch", label: "Launches" },
  { value: "financial", label: "Financial facts" },
  { value: "risk", label: "Risks & open questions" },
];

function emptyDraft(): Draft {
  return {
    serviceRoot: "",
    tokenUrl: "",
    fioriUrl: "",
    scope: "",
    organizationsText: "",
    areas: Object.fromEntries(AREAS.map(({ value }) => [value, null])) as Draft["areas"],
  };
}

function mapSettingsToDraft(settings: SapSettings): Draft {
  const draft = emptyDraft();
  draft.serviceRoot = settings.serviceRoot ?? "";
  draft.tokenUrl = settings.tokenUrl ?? "";
  draft.fioriUrl = settings.fioriUrl ?? "";
  draft.scope = settings.scope ?? "";
  draft.organizationsText = settings.organizations.join("\n");
  for (const mapping of settings.areas) draft.areas[mapping.area] = mapping;
  return draft;
}

function fieldClass() {
  return "mt-1 h-12 w-full rounded-lg border border-[#cfc9d7] bg-white px-3 text-base text-[#292e46] placeholder:text-[#898392] focus:border-[#594b87] focus:outline-none focus:ring-2 focus:ring-[#594b87]/20";
}

export function SapConnectionSettings({
  basePath,
  onChanged,
}: {
  basePath: string;
  onChanged: () => void;
}) {
  const [settings, setSettings] = useState<SapSettings | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [loadError, setLoadError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const infoDialogRef = useRef<HTMLDialogElement>(null);
  const endpoint = useMemo(
    () => `${basePath}/api/sap-connection`,
    [basePath],
  );

  const loadSettings = async () => {
    setLoadError("");
    const response = await fetch(endpoint, {
      credentials: "include",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const payload = await response.json().catch(() => ({})) as SapSettings & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "SAP settings could not be loaded.");
    setSettings(payload);
    setDraft(mapSettingsToDraft(payload));
  };

  useEffect(() => {
    let active = true;
    fetch(endpoint, {
      credentials: "include",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as SapSettings & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "SAP settings could not be loaded.");
        if (active) {
          setSettings(payload);
          setDraft(mapSettingsToDraft(payload));
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "SAP settings could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  const updateArea = (
    area: SapArea,
    field: keyof Omit<AreaMapping, "area">,
    value: string,
  ) => {
    setDraft((previous) => {
      const current = previous.areas[area] ?? {
        area,
        resourcePath: "",
        filterTemplate: "",
        dateField: "",
        idField: "",
        titleField: "",
        summaryFields: [],
        topic: "news" as Topic,
      };
      const nextValue = field === "summaryFields"
        ? value.split(",").map((item) => item.trim()).filter(Boolean)
        : value;
      return {
        ...previous,
        areas: {
          ...previous.areas,
          [area]: { ...current, [field]: nextValue },
        },
      };
    });
  };

  const toggleArea = (area: SapArea, enabled: boolean) => {
    setDraft((previous) => ({
      ...previous,
      areas: {
        ...previous.areas,
        [area]: enabled
          ? previous.areas[area] ?? {
              area,
              resourcePath: "",
              filterTemplate: "",
              dateField: "",
              idField: "",
              titleField: "",
              summaryFields: [],
              topic: "news",
            }
          : null,
      },
    }));
  };

  const save = async () => {
    setBusy(true);
    setMessage("");
    const organizations = [...new Set(
      draft.organizationsText
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    )];
    const areas = AREAS.flatMap(({ value }) => {
      const mapping = draft.areas[value];
      return mapping ? [mapping] : [];
    });
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        credentials: "include",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceRoot: draft.serviceRoot.trim(),
          tokenUrl: draft.tokenUrl.trim(),
          fioriUrl: draft.fioriUrl.trim(),
          ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
          ...(clientSecret ? { clientSecret } : {}),
          ...(draft.scope.trim() ? { scope: draft.scope.trim() } : {}),
          organizations,
          areas,
        }),
      });
      const payload = await response.json().catch(() => ({})) as SapSettings & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "SAP settings could not be saved.");
      setSettings(payload);
      setDraft(mapSettingsToDraft(payload));
      setClientId("");
      setClientSecret("");
      setConfirmRemove(false);
      setMessage("Saved. OAuth credentials are encrypted on the server and never returned to this page.");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SAP settings could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${endpoint}/test`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      const payload = await response.json().catch(() => ({})) as {
        connected?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "SAP connection test failed.");
      setMessage(payload.message ?? (payload.connected ? "SAP connection succeeded." : "SAP connection failed."));
      if (payload.connected) onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SAP connection test failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "SAP settings could not be removed.");
      setClientId("");
      setClientSecret("");
      setConfirmRemove(false);
      setMessage("The encrypted SAP connection saved in this app was deleted.");
      await loadSettings();
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SAP settings could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {typeof document !== "undefined" && createPortal(
        <>
          <dialog
            ref={infoDialogRef}
            aria-labelledby="sap-info-dialog-title"
            data-testid="sap-info-dialog"
            onClick={(event) => {
              if (event.target === event.currentTarget) event.currentTarget.close();
            }}
            className="m-auto max-h-[90dvh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[#c2ddda] bg-[#f2f9f8] p-0 text-left shadow-2xl backdrop:bg-[#12201f]/60"
          >
            <div className="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[.12em] text-[#277b77]">SAP source guide</p>
                  <h2 id="sap-info-dialog-title" className="mt-1 text-2xl font-bold text-[#173f3d]">How SAP briefing works</h2>
                </div>
                <button
                  type="button"
                  onClick={() => infoDialogRef.current?.close()}
                  aria-label="Close SAP information"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#9bc4c0] bg-white text-[#245d5b] hover:bg-[#e8f5f3] focus:outline-none focus:ring-2 focus:ring-[#277b77]/40"
                  data-testid="button-close-sap-info"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-4 text-base leading-relaxed text-[#334e4c]">
                A GitHub clone is the briefing app, not software installed inside SAP. The running app connects to your SAP system through administrator-approved, read-only S/4HANA OData APIs.
              </p>
              <ol className="mt-5 space-y-3 text-base leading-relaxed text-[#334e4c]">
                <li><strong>1. Clone and run the app.</strong> Each GitHub clone or deployment is configured separately for its own SAP tenant.</li>
                <li><strong>2. Get SAP administrator details.</strong> Request the approved OData service URL, OAuth token URL, client ID and secret, Fiori link base, permitted company/plant scope, and allowed business areas.</li>
                <li><strong>3. Open SAP settings.</strong> Use the gear beside the SAP source. Add the endpoints, scope, and mappings for Store, Production, Maintenance, Inventory, Sales, HR, Power/Electrical/Solar, Purchase, Scrap, Order, and Delivery as authorized.</li>
                <li><strong>4. Save and test.</strong> OAuth credentials are encrypted by the app server. Test checks the connection and metadata; the app requests operational records only when you press <strong>Brief</strong>.</li>
                <li><strong>5. Select and brief.</strong> Choose a company, meeting time, topics, and mapped SAP areas. SAP records and Tavily public research are shown in separate sections; each uses its own credentials and billing.</li>
              </ol>
              <div className="mt-5 rounded-xl border border-[#e2c88e] bg-[#fff8e9] p-4 text-sm leading-relaxed text-[#654d22]">
                <strong>Important:</strong> If SAP setup or the separate Tavily key is incomplete, SAP mode returns to Public and shows an alert. This setup does not enable direct HANA database SQL access or install the app in SAP. Do not paste credentials into GitHub, chat, or this help window.
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[#486d6b]">
                The SAP administrator must confirm the exact API, fields, permissions, company/plant values, and OAuth client for the target system. The app does not guess SAP endpoints or grant itself access.
              </p>
            </div>
          </dialog>
          <dialog
            ref={dialogRef}
            aria-labelledby="sap-settings-dialog-title"
            data-testid="sap-settings-dialog"
            onClick={(event) => {
              if (event.target === event.currentTarget) event.currentTarget.close();
            }}
            className="m-auto max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl overflow-hidden rounded-2xl border border-[#c2ddda] bg-[#f2f9f8] p-0 text-left shadow-2xl backdrop:bg-[#12201f]/60"
          >
            <div className="max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
              <section className="rounded-xl border border-[#c2ddda] bg-[#f2f9f8]" aria-label="SAP connection settings" data-testid="sap-connection-admin-settings">
                <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-3 border-b border-[#c2ddda] bg-[#f2f9f8] p-4 sm:p-5">
                  <div className="max-w-3xl">
                    <h2 id="sap-settings-dialog-title" className="text-lg font-semibold text-[#245d5b]">SAP HANA / S/4HANA connection settings</h2>
                    <p className="mt-2 text-base leading-relaxed text-[#486d6b]">
                      Configure this clone for its own SAP business-data system. Operational records use an approved S/4HANA OData API, not direct SQL access to the HANA database.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${settings?.configured ? "bg-[#e5f2e9] text-[#32634a]" : "bg-[#fff2de] text-[#79531f]"}`} data-testid="sap-admin-status">
                      {settings?.configured ? "Settings saved" : "Setup required"}
                    </span>
                    <button
                      type="button"
                      onClick={() => dialogRef.current?.close()}
                      aria-label="Close SAP settings"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#c7d9d6] bg-white text-[#315f5d] hover:bg-[#e8f5f3] focus:outline-none focus:ring-2 focus:ring-[#277b77]/30"
                      data-testid="button-close-sap-settings"
                    >
                      <X aria-hidden="true" className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="p-4 sm:p-5">

      <div className="mt-4 rounded-lg border border-[#d5e4e2] bg-white px-4 py-3 text-sm leading-relaxed text-[#405e5c]">
        <p><strong>Authentication:</strong> OAuth 2.0 client credentials. The client ID and secret are encrypted on the server, scoped to the configured app-owner account, and never saved in browser storage or returned to this page.</p>
        <p className="mt-2"><strong>API keys:</strong> not enabled; use them only if your SAP API gateway administrator confirms that the selected gateway supports that method.</p>
        <p className="mt-2">SAP API reference:{" "}
          <a className="font-semibold text-[#315c88] underline underline-offset-2" href="https://help.sap.com/doc/57063b559ae04c86a281dc626f474091/2008.500/en-US/APIsforSAPS4HANA.pdf" target="_blank" rel="noopener noreferrer">
            SAP S/4HANA APIs
          </a>
          {" · "}
          <a className="font-semibold text-[#315c88] underline underline-offset-2" href="https://help.sap.com/docs/SAP_S4HANA_CLOUD/03c04db2a7434731b7fe21dca77440da/3bac8c01d7024ae1b15cf848ce12544e.html" target="_blank" rel="noopener noreferrer">
            SAP OData APIs for Sales
          </a>
        </p>
      </div>

      {loadError && <p className="mt-3 text-sm font-medium text-[#8e3f39]" role="alert">{loadError}</p>}
      {!settings?.storageReady && (
        <p className="mt-3 rounded-lg border border-[#e5c5c0] bg-[#fff8f7] px-4 py-3 text-sm leading-relaxed text-[#713c38]" role="alert">
          Encrypted connection storage is unavailable. The app owner must configure the server encryption secret before saving SAP credentials.
        </p>
      )}
      {settings?.legacyEnvironmentConfig && (
        <p className="mt-3 rounded-lg border border-[#e8d9b8] bg-[#fff9ec] px-4 py-3 text-sm leading-relaxed text-[#79531f]" role="note">
          {settings.legacyEnvironmentConfigActive
            ? "A legacy server-managed SAP connection is active. Saving here creates an owner-scoped encrypted connection that takes priority."
            : settings.legacyEnvironmentConfigSuppressed
              ? "A legacy server-managed SAP connection still exists in Replit Secrets, but this app has disabled its fallback because the connection was removed."
              : "A legacy server-managed SAP connection is also configured. The saved app connection takes priority; removing it disconnects SAP for this app."}
          {" "}The legacy configuration itself is managed in Replit Secrets.
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-[#315f5d]">
          OData service root URL
          <input className={fieldClass()} type="url" value={draft.serviceRoot} onChange={(event) => setDraft({ ...draft, serviceRoot: event.target.value })} placeholder="https://sap.example.com/sap/opu/odata/..." autoComplete="url" data-testid="input-sap-service-root" />
        </label>
        <label className="block text-sm font-semibold text-[#315f5d]">
          OAuth token URL
          <input className={fieldClass()} type="url" value={draft.tokenUrl} onChange={(event) => setDraft({ ...draft, tokenUrl: event.target.value })} placeholder="https://identity.example.com/oauth/token" autoComplete="url" data-testid="input-sap-token-url" />
        </label>
        <label className="block text-sm font-semibold text-[#315f5d]">
          SAP Fiori / source link base
          <input className={fieldClass()} type="url" value={draft.fioriUrl} onChange={(event) => setDraft({ ...draft, fioriUrl: event.target.value })} placeholder="https://sap.example.com/" autoComplete="url" data-testid="input-sap-fiori-url" />
        </label>
        <label className="block text-sm font-semibold text-[#315f5d]">
          OAuth scope (if required)
          <input className={fieldClass()} value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })} placeholder="Optional SAP scope" autoComplete="off" data-testid="input-sap-oauth-scope" />
        </label>
        <label className="block text-sm font-semibold text-[#315f5d]">
          OAuth client ID
          <input className={fieldClass()} type="password" autoComplete="new-password" spellCheck={false} value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder={settings?.clientCredentialsConfigured ? "Saved; enter only to replace" : "Enter the client ID"} data-testid="input-sap-client-id" />
        </label>
        <label className="block text-sm font-semibold text-[#315f5d]">
          OAuth client secret
          <input className={fieldClass()} type="password" autoComplete="new-password" spellCheck={false} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={settings?.clientCredentialsConfigured ? "Saved; leave blank to keep" : "Enter the client secret"} data-testid="input-sap-client-secret" />
        </label>
      </div>

      <label className="mt-4 block text-sm font-semibold text-[#315f5d]">
        Approved companies / plants (one per line)
        <textarea className="mt-1 min-h-24 w-full rounded-lg border border-[#cfc9d7] bg-white px-3 py-3 text-base text-[#292e46] focus:border-[#594b87] focus:outline-none focus:ring-2 focus:ring-[#594b87]/20" value={draft.organizationsText} onChange={(event) => setDraft({ ...draft, organizationsText: event.target.value })} placeholder={"Company code or plant scope\nOne allowed value per line"} data-testid="input-sap-organizations" />
      </label>

      <fieldset className="mt-5 space-y-3">
        <legend className="text-base font-semibold text-[#245d5b]">OData mappings by business area</legend>
        <p className="text-sm leading-relaxed text-[#486d6b]">Only the areas configured below can be selected in a brief. Use the released entity set and field names from your SAP system’s API documentation.</p>
        {AREAS.map(({ value, label }) => {
          const mapping = draft.areas[value];
          return (
            <details key={value} className="rounded-lg border border-[#d5e4e2] bg-white px-4 py-3">
              <summary className="cursor-pointer list-none">
                <label className="inline-flex min-h-8 items-center gap-3 text-base font-semibold text-[#315f5d]">
                  <input type="checkbox" checked={Boolean(mapping)} onChange={(event) => toggleArea(value, event.target.checked)} className="h-5 w-5 accent-[#277b77]" data-testid={`checkbox-sap-admin-${value}`} />
                  {label}
                </label>
              </summary>
              {mapping && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-[#315f5d]">
                    OData entity-set path
                    <input className={fieldClass()} value={mapping.resourcePath} onChange={(event) => updateArea(value, "resourcePath", event.target.value)} placeholder="Entity set path from SAP API docs" data-testid={`input-sap-path-${value}`} />
                  </label>
                  <label className="text-sm font-medium text-[#315f5d]">
                    Brief topic
                    <select className={fieldClass()} value={mapping.topic} onChange={(event) => updateArea(value, "topic", event.target.value)}>
                      {TOPICS.map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-[#315f5d] sm:col-span-2">
                    OData date / organization filter
                    <input className={fieldClass()} value={mapping.filterTemplate} onChange={(event) => updateArea(value, "filterTemplate", event.target.value)} placeholder="Use {start}, {end}, and {organization}" data-testid={`input-sap-filter-${value}`} />
                  </label>
                  <label className="text-sm font-medium text-[#315f5d]">
                    Date field
                    <input className={fieldClass()} value={mapping.dateField} onChange={(event) => updateArea(value, "dateField", event.target.value)} placeholder="SAP date field name" />
                  </label>
                  <label className="text-sm font-medium text-[#315f5d]">
                    Record ID field
                    <input className={fieldClass()} value={mapping.idField} onChange={(event) => updateArea(value, "idField", event.target.value)} placeholder="SAP record ID field" />
                  </label>
                  <label className="text-sm font-medium text-[#315f5d]">
                    Title field
                    <input className={fieldClass()} value={mapping.titleField} onChange={(event) => updateArea(value, "titleField", event.target.value)} placeholder="SAP title field" />
                  </label>
                  <label className="text-sm font-medium text-[#315f5d]">
                    Summary fields (comma-separated)
                    <input className={fieldClass()} value={mapping.summaryFields.join(", ")} onChange={(event) => updateArea(value, "summaryFields", event.target.value)} placeholder="FieldA, FieldB" />
                  </label>
                </div>
              )}
            </details>
          );
        })}
      </fieldset>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => void save()} disabled={busy || !settings?.storageReady} className="min-h-12 rounded-lg bg-[#245d5b] px-5 text-base font-semibold text-white hover:bg-[#1d4e4c] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-save-sap-connection">
          {busy ? "Working…" : "Save SAP settings"}
        </button>
        <button type="button" onClick={() => void test()} disabled={busy || !settings?.configured} className="min-h-12 rounded-lg border border-[#82b3ae] bg-white px-5 text-base font-semibold text-[#245d5b] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-test-sap-connection">
          Test connection
        </button>
        {settings?.hasSavedConnection && !confirmRemove && (
          <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy} className="min-h-12 rounded-lg border border-[#c98e87] bg-white px-5 text-base font-semibold text-[#8e3f39] disabled:opacity-50" data-testid="button-remove-sap-connection">
            Remove saved connection
          </button>
        )}
      </div>
      {confirmRemove && (
        <div className="mt-4 rounded-lg border border-[#e4b7b2] bg-[#fff8f7] p-4" role="alert">
          <p className="text-base font-semibold text-[#713c38]">Delete the encrypted SAP connection saved in this app?</p>
          <p className="mt-1 text-sm text-[#713c38]">This does not revoke the OAuth client in SAP. Revoke it in SAP as well if you want to disable it.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConfirmRemove(false)} disabled={busy} className="min-h-10 rounded-lg border border-[#d9d4df] bg-white px-4 text-sm font-semibold text-[#35364a]">Keep connection</button>
            <button type="button" onClick={() => void remove()} disabled={busy} className="min-h-10 rounded-lg bg-[#8e3f39] px-4 text-sm font-semibold text-white disabled:opacity-50">Delete saved copy</button>
          </div>
        </div>
      )}
      {settings?.configured && settings.updatedAt && (
        <p className="mt-3 text-sm text-[#486d6b]">Saved on {new Date(settings.updatedAt).toLocaleString()}.</p>
      )}
      {message && <p className="mt-3 text-base text-[#405e5c]" role="status" aria-live="polite" data-testid="status-sap-connection-message">{message}</p>}
              </div>
            </section>
            </div>
          </dialog>
        </>,
        document.body,
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => infoDialogRef.current?.showModal()}
          aria-label="SAP briefing information and setup procedure"
          title="SAP information and setup procedure"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#82b3ae] bg-white text-[#245d5b] shadow-sm transition hover:bg-[#e8f5f3] focus:outline-none focus:ring-2 focus:ring-[#277b77]/30"
          data-testid="button-open-sap-info"
        >
          <Info aria-hidden="true" className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          aria-label="Open SAP connection settings"
          title="SAP connection settings"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#82b3ae] bg-white text-[#245d5b] shadow-sm transition hover:bg-[#e8f5f3] focus:outline-none focus:ring-2 focus:ring-[#277b77]/30"
          data-testid="button-open-sap-settings"
        >
          <Settings2 aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
    </>
  );
}
