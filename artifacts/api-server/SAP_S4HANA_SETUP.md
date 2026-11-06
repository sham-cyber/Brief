# Generic SAP S/4HANA business-data connection

The SAP source uses an administrator-configured, read-only OData business API. It is not tied to a specific company. The app requests data only after the configured owner presses **Brief**; opening the app, loading the settings page, and checking status do not read SAP business records.

## Configure the connection

Sign in with the account configured as `BRIEFING_OWNER_EMAIL`. In the app's **Settings**, open **SAP connection settings** and enter:

- The HTTPS OData service root from the SAP API documentation.
- The OAuth token URL and client-credentials scope, if required.
- The SAP Fiori base URL used for source links.
- The exact company codes or plant identifiers allowed for this connection.
- The OAuth client ID and client secret issued for the integration.
- Each approved business-area mapping: OData entity path, date/organization filter, date field, record ID field, title field, summary fields, and associated briefing topic.

The first save requires both OAuth credentials. On later edits, leave those fields empty to retain the saved values. Credentials are encrypted on the server with `USER_CREDENTIALS_ENCRYPTION_KEY`; they are not stored in browser storage or returned to the page. The app's **Test connection** action checks OAuth and the OData `$metadata` endpoint only; it does not read business records. Removing the saved copy here does not revoke the OAuth client in SAP.

The connection uses OAuth 2.0 client credentials by default. API-key authentication is not enabled because SAP HANA database authentication and SAP S/4HANA API gateway authentication are different; use an API key only if the SAP gateway administrator confirms support for the selected API.

## HANA database vs. S/4HANA business APIs

This integration reads released SAP S/4HANA OData business APIs. It does **not** open a direct SQL connection to SAP HANA. Direct HANA database access is a separate JDBC/ODBC integration that requires its own approved endpoint, database identity, network access, TLS configuration, and least-privilege authorization.

For operational records such as store, production, maintenance, inventory, sales, HR, and power/electrical/solar, use the released business APIs and field mappings documented for the connected SAP system. The available APIs, entity sets, field names, filters, and OAuth scopes depend on the SAP release and its communication arrangements; do not copy placeholder mappings into a live connection.

## Areas, access, and limits

Available areas are `store`, `production`, `maintenance`, `inventory`, `sales`, `hr`, and `power_electrical_solar`. Only areas with valid mappings appear as selectable. Each area is requested only if its mapped briefing topic is selected. Each filter must contain `{start}`, `{end}`, and `{organization}`; the app supplies the rolling 30-day window and requires the company or plant to exactly match the administrator's allowlist. The service path stays under the configured HTTPS origin, and each area returns at most 20 records.

Use a dedicated SAP integration identity with read-only permissions restricted to the intended company/plant and approved data areas. Do not configure HR unless the SAP administrator explicitly approves that access. The app currently restricts briefing starts to its configured owner; a multi-user rollout needs SAP-side user/role enforcement before it is opened to other accounts.

## Official SAP references

- [APIs for SAP S/4HANA](https://help.sap.com/doc/57063b559ae04c86a281dc626f474091/2008.500/en-US/APIsforSAPS4HANA.pdf)
- [SAP S/4HANA Cloud APIs for Sales](https://help.sap.com/docs/SAP_S4HANA_CLOUD/03c04db2a7434731b7fe21dca77440da/3bac8c01d7024ae1b15cf848ce12544e.html)
- [SAP HANA Cloud database connection via JDBC](https://help.sap.com/docs/hana-cloud/sap-hana-cloud-getting-started-guide/connect-to-sap-hana-database-in-sap-hana-cloud-via-jdbc)
- [SAP HANA Cloud authentication mechanisms](https://help.sap.com/docs/hana-cloud-database/sap-hana-cloud-sap-hana-database-security-guide/user-authentication-mechanisms)
