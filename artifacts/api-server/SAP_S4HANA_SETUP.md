# SAP S/4HANA source setup

The SAP source is an optional, server-side OAuth 2.0 client-credentials connection. The app reads only configured OData areas and never writes to SAP. No SAP request is made while loading the app or checking connection status; SAP is accessed only after an owner presses **Brief** and passes the PIN check.

## Configure the API Server secret

Add one API Server secret named `SAP_S4HANA_CONFIG`. Its value must be JSON with:

- `serviceRoot`: HTTPS OData service root.
- `tokenUrl`: HTTPS OAuth token endpoint.
- `clientId` and `clientSecret`: credentials for the approved read-only SAP integration user.
- `fioriUrl`: HTTPS SAP Fiori entry point used as the source link.
- `organizations`: exact company or plant identifiers the app is allowed to query.
- `areas`: mappings for only the areas approved by the SAP administrator.
- Optional `scope`: OAuth scope requested from the token endpoint.

Example structure only; replace every placeholder with values supplied and approved by the S/4HANA administrator. Do not put real credentials in source control, chat, or this file.

```json
{
  "serviceRoot": "https://s4.example.invalid/sap/opu/odata/sap/",
  "tokenUrl": "https://identity.example.invalid/oauth/token",
  "clientId": "configured-in-Replit-Secrets",
  "clientSecret": "configured-in-Replit-Secrets",
  "scope": "approved-read-only-scope",
  "fioriUrl": "https://s4.example.invalid/sap/bc/ui2/flp",
  "organizations": ["approved-company-code", "approved-plant-code"],
  "areas": {
    "inventory": {
      "resourcePath": "API_EXAMPLE_SRV/ExampleSet",
      "filterTemplate": "ChangedAt ge datetimeoffset'{start}' and ChangedAt le datetimeoffset'{end}' and CompanyCode eq '{organization}'",
      "dateField": "ChangedAt",
      "idField": "RecordId",
      "titleField": "Description",
      "summaryFields": ["Status", "Quantity"],
      "topic": "news"
    }
  }
}
```

Each configured area (`store`, `production`, `maintenance`, `inventory`, `sales`, `hr`, `power_electrical_solar`) needs its own company-approved OData path, date filter, field mapping, and one existing briefing topic (`news`, `hire`, `launch`, `financial`, or `risk`). An area is queried only when its mapped topic is selected; if no selected area matches a selected topic, the app does not request an OAuth token or contact SAP. The filter template must include `{start}`, `{end}`, and `{organization}`; the app supplies the rolling 30-day range and an organization value that must exactly match the administrator's allowlist. The service path is relative to `serviceRoot` and is restricted to that HTTPS origin. Only mapped properties are requested, with a maximum of 20 records per area.

## Access and privacy

Use a dedicated SAP integration user with read-only permissions and only the approved company/plant and data areas. Do not add an HR area mapping unless the SAP administrator has approved that integration user's HR access. The app currently allows only its configured owner to start a briefing; SAP data returned by the integration is therefore visible to that authorized app account. A broader multi-user rollout needs per-user SAP identity/role enforcement before it is enabled.

Connection status reports whether the secret and at least one valid area mapping are present; it does not test the SAP host. The first SAP read occurs only when **Brief** is pressed. If the secret is absent, incomplete, or rejected, the app fails closed and does not substitute public web results.
