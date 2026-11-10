# Briefing Agent

**Author:** Sham Mohite

**Copyright:** © 2026 Sham Mohite

A source-first pre-meeting briefing app. Choose a company or person, select the topics that matter, and use Tavily's AI-powered search and retrieval to gather public reporting from the 30 days ending when the briefing starts. Each factual item links to its source.

**GitHub repository:** [sham-cyber/Brief](https://github.com/sham-cyber/Brief)

**Published demo:** [pre-meeting-briefing-agent.replit.app](https://pre-meeting-briefing-agent.replit.app)

## Submission overview

| Requirement | Project information |
| --- | --- |
| Rules | Check the event organizer's current rules and submission form; add any event-specific requirements before submitting. |
| Working project or demo | [Open the published app](https://pre-meeting-briefing-agent.replit.app). Sign-in and a configured Tavily key are needed to run a briefing. |
| Source code or repository | [github.com/sham-cyber/Brief](https://github.com/sham-cyber/Brief) |
| Project description and problem | See [Project problem and solution](#project-problem-and-solution). |
| Technologies and tools | See [Technologies used](#technologies-used). |
| How AI is used | See [How AI is used](#how-ai-is-used). |

## Project problem and solution

Preparing for a meeting can mean searching across scattered company or person updates, hiring, launches, financial facts, and risks, then checking each claim against its original source. That takes time and makes it difficult to bring a concise, verifiable view into the meeting.

Briefing Agent gathers public reporting from the 30 days ending when the user starts a briefing. The user selects Company or Person, the topics, and optional meeting context. Tavily's AI-powered search and retrieval finds public material; the app checks it for relevance and recency, then presents source-linked findings in a compact brief that can be printed on one page.

## What it does

- Supports Company and Person briefs, with role context for Chairman / CEO, MP / public office, and Corporate person.
- Searches up to five selectable blocks: News, Hires, Launches, Financial Facts, and Risks & Open Questions.
- Uses Tavily for one basic search per selected topic, up to eight results per topic; validates dates, links, subject match, and topic relevance before including results.
- Shows source links and, when Tavily returns them for an accepted source, a photo or supported video preview.
- Provides a concise brief and a one-page print with up to 400 words of briefing text, plus its cited source list, and browser read-aloud.
- SAP briefs combine Tavily public research with approved, read-only SAP S/4HANA records; public links and internal records remain in separate sections.

The default research flow uses Tavily's AI-powered search and retrieval; it can return cited results without a generative OpenAI call. Optional OpenAI summaries are off by default. When enabled, an account can use its own OpenAI API key to summarize accepted public-source results; each generated summary links back to returned sources. SAP records and private sources are not sent to OpenAI.

## Technologies used

- **Web app:** React, TypeScript, Vite, Tailwind CSS, Radix UI, and TanStack Query.
- **API:** Node.js and Express, with Clerk for sign-in and access control.
- **Database:** PostgreSQL with Drizzle ORM.
- **AI-powered retrieval:** Tavily Search API finds public reporting for selected topics; the app checks source links, date range, subject match, and relevance.
- **Optional AI summaries:** OpenAI API using each account's own encrypted key and selected model ID; one call per selected topic when the user opts in.
- **SAP connection:** SAP S/4HANA business OData APIs using OAuth; SAP records remain separate from public search results.
- **Validation and API contracts:** Zod and an OpenAPI specification, with generated TypeScript API clients.
- **PDF and project tooling:** `pdf-lib`, pnpm workspaces, and TypeScript type checks.

## Sign-in, owner lock, and crawl procedure

The repository includes the Clerk sign-in and sign-up screens, browser session handling, API authentication middleware, and protected API routes. The Clerk tenant and its private keys are not stored in Git; each deployment must connect its own Clerk environment.

### Use your own clone

Each clone can be configured for its own operator. To let the person running a clone use their own Tavily account and PIN:

1. Configure Clerk for that clone and create an account in the same Clerk environment the app will use. Set `BRIEFING_OWNER_EMAIL` to that account's email.
2. Set a new four-digit `BRIEFING_START_PIN` in that clone's server-side secret manager. This clone's PIN is not included in the repository.
3. Set a unique `USER_CREDENTIALS_ENCRYPTION_KEY` in the clone's server-side secret manager.
4. Leave `TAVILY_API_KEY` unset in that clone. Sign in as its configured owner and save that owner's Tavily key in the app's Tavily settings. Searches then use that saved key and are billed by Tavily to that key's account.
5. Configure the clone's database and Clerk keys, apply the database schema, and start the app as described below.

The sign-up screen is in the repository, but account creation must also be enabled in that deployment's Clerk environment. The app intentionally permits only the single account named by `BRIEFING_OWNER_EMAIL` to start briefings on a deployment. Therefore, a member can run their own clone by configuring their own Clerk account as its owner; this is not a shared multi-member deployment with separate PINs.

1. Open the app and sign in through Clerk. Sign-up availability is controlled by the deployment's Clerk environment.
2. Enter a company or person, complete the required role details, set the meeting time, and choose at least one topic. Context is optional.
3. Press **Brief**. The app prompts for the four-digit start PIN.
4. The configured owner account and `BRIEFING_START_PIN` are required to start a crawl. In a personal clone with no project key configured, the owner uses their separately saved Tavily key.
5. After a successful crawl, follow source links to verify claims. Use Print for the one-page layout.

The PIN and owner email are server-side secrets. Configure their values in Replit Secrets or your hosting provider's secret manager; never put the PIN value in the README, source code, or Git history. Repeated incorrect PIN attempts are temporarily rate-limited.

### Crawl guardrails

- Meeting-time edits prepare the brief; the search begins when the user presses **Brief**.
- One Tavily request is sent for each selected topic, up to five per event and eight results per topic. This applies to Public briefs and to the public-research part of SAP briefs.
- The configured developer account is limited to 10 briefing events per Asia/Kolkata calendar day and up to 50 topic searches per day (10 events × five topics).
- Each event has a two-minute collection limit and a three-minute backup stop. Only one Tavily-backed event can run at a time; the app also limits Tavily to 10 requests per rolling five minutes.
- Provider usage is charged to the Tavily account whose key is used. Store the project key in the hosting secret manager.

### How AI is used

- **Tavily retrieval (default):** Tavily's AI-powered Search API finds public sources for the selected topics. Tavily can return the cited research without an OpenAI call.
- **OpenAI summaries (optional):** Off by default and run only after a successful Tavily crawl; without an active Tavily key, the crawl cannot start and OpenAI is not called. The hosting operator must explicitly set `AI_FEATURE_ENABLED=true`; each account must also save its own OpenAI API key and model ID, set an AI activation passcode, activate AI, and opt in on the briefing form.

- OpenAI makes at most one request for each selected topic in a briefing, with no automatic retries. The subject name, selected topic, and accepted public-source titles and snippets are sent to OpenAI. SAP records and private sources remain outside this AI step.
- Each generated topic summary is limited to 50 words and must cite source IDs returned for that topic. Invalid or unavailable summaries do not replace the source-based brief.
- OpenAI usage is billed to the account that owns the submitted API key. The key is encrypted at rest in the app database, is not returned to the browser, and is not end-to-end encrypted. Removing the saved copy does not revoke the provider key; revoke it separately in the OpenAI account.
- The existing read-aloud text has a separate 280-word cap (about two minutes at the app's estimate); AI summary generation does not start speech automatically.

### Personal Tavily key security

- A personal key is sent to the authenticated API server and encrypted at rest with AES-256-GCM, scoped to the signed-in account. The app returns connection status only; it never returns the saved key to the browser.
- This is not end-to-end encryption: the server decrypts a saved key to call Tavily. An app operator with access to both the database and server encryption secret could decrypt it, so users should save keys only when they trust the operator.
- The key is held temporarily in the entry field, is not saved in browser storage, and the field clears after a successful save. Credential responses are marked non-cacheable.
- **Remove saved key** deletes the app's encrypted copy only. It does not revoke or disable the provider key. To stop the key from working, delete it from the [Tavily dashboard](https://app.tavily.com/home), then remove its saved copy in the app. See [Tavily's key deletion instructions](https://help.tavily.com/articles/4695639825-how-can-i-delete-my-api-key).
- The configured owner's crawls use the project key when available. Removing a personal key will not disable that project key; remove it from Replit Secrets and revoke it in Tavily.

## Clone the repository and run it

### Requirements

- Git
- Node.js 24
- pnpm 10 (the committed `pnpm-lock.yaml` uses lockfile version 9)
- PostgreSQL 16 or a compatible PostgreSQL server
- Clerk credentials for the environment you will use
- A Tavily key for briefing searches

### Clone and install

```sh
git clone https://github.com/sham-cyber/Brief.git
cd Brief
pnpm install --frozen-lockfile
```

Keep the committed lockfile. The frozen install uses its exact dependency resolutions.

### Configure secrets and initialize the database

Before starting the app, set the environment values listed in [Required environment variables](#required-environment-variables). In Replit, add values through the **Secrets** pane. Outside Replit, use your operating system or hosting provider's secret manager and make the values available to the app processes. Do not put secret values in source files, this README, or GitHub.

For a fresh development database, make sure `DATABASE_URL` points to that database, then apply the schema:

```sh
pnpm --filter @workspace/db run push
```

Run this command against a development database only. Production schema changes are handled separately.

### Start the app

**Recommended for a new clone:** import/open the repository in Replit, configure its Secrets, and press **Run**. The project has managed web and API workflows; Replit supplies the required ports and routes `/api` requests to the API service.

For manual development, start the services in separate terminals with the required environment values available to each process:

```sh
PORT=8080 pnpm --filter @workspace/api-server run dev
```

```sh
PORT=21375 BASE_PATH=/ pnpm --filter @workspace/briefing-agent run dev
```

The web app expects API requests at the same-origin `/api` path. Outside Replit, configure a local reverse proxy to route `/api` to the API server on port `8080`; without that routing, the page may load but API-backed sign-in and briefing flows will not work.

To check the workspace packages:

```sh
pnpm run typecheck
```

### Sign in and run a briefing

1. Open the development Preview and sign in through Clerk. Create an account first if needed.
2. Use the Clerk account whose email matches `BRIEFING_OWNER_EMAIL`; other signed-in accounts cannot start crawls.
3. Enter the company or person, complete required details, select the meeting time and at least one topic, then press **Brief**.
4. Enter the owner-only start PIN when prompted. Its value is configured as `BRIEFING_START_PIN` in the secret manager; it is not included in the repository.
5. After the crawl, check the source links and use **Print** for the one-page brief.

The Clerk account must exist in the same development or production Clerk environment used by the app. Sign-in alone does not grant permission to start a crawl.

### Development Preview versus published app

- **Development Preview** is for testing changes. Its `.replit.dev` URL is private by default and temporary; do not use it as the permanent public demo link.
- **Published app** is the shareable app URL created through Replit Publish, typically on `.replit.app` or a connected custom domain. Publish again after code changes that should appear in the live version.

Use the Preview link while developing. Share the published URL with members or reviewers when the app is ready. This guide does not publish the project. See [Replit development URLs](https://docs.replit.com/core-concepts/project-editor/app-setup/development-urls) and [publishing overview](https://docs.replit.com/features/publishing/overview).

## Connect a clone to an SAP system

The repository contains application code only. Each clone must be configured for its own SAP system by an authorized administrator.

After the app is running:

1. Sign in with the account configured as `BRIEFING_OWNER_EMAIL`.
2. In the briefing form, click the gear beside the **SAP** source option to open SAP connection settings.
3. Enter the SAP S/4HANA OData service URL, OAuth token URL, SAP Fiori link base, approved company or plant values, and mappings for approved business areas.
4. Enter the OAuth client ID and secret issued by the SAP administrator. The app stores them encrypted on the server; they are not committed, saved in browser storage, or returned to the page.
5. Save the settings and press **Test connection**. This checks OAuth and the OData metadata endpoint; it does not fetch operational records.
6. Confirm the separate Tavily key is active, then select **SAP** and choose only configured data areas. Public and SAP results appear in separate cited sections.

SAP mode requires an active Tavily key and a complete SAP connection with at least one mapped data area. If either setup is incomplete, the app returns to Public and shows an alert. Until approved SAP details are supplied, a clone can run but cannot return live SAP data. This integration uses S/4HANA business OData APIs; direct SAP HANA SQL/JDBC/ODBC access is separate and is not enabled here.

## Required environment variables

Set values in Replit Secrets or your hosting provider's secret manager. This table lists names and purposes only—never publish the values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by the API and database setup command |
| `CLERK_PUBLISHABLE_KEY` | Clerk configuration used by the API |
| `CLERK_SECRET_KEY` | Clerk server authentication |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk sign-in UI |
| `BRIEFING_OWNER_EMAIL` | Clerk email allowed to start crawls and manage the SAP connection |
| `BRIEFING_START_PIN` | Four-digit server-side Brief PIN; keep its value only in the secret manager |
| `TAVILY_API_KEY` | Project Tavily key, if used; only the configured owner can use it. The owner may instead save a personal Tavily key in the app. |
| `USER_CREDENTIALS_ENCRYPTION_KEY` | Needed to save personal Tavily/OpenAI keys or SAP OAuth credentials; use a unique 64-character hexadecimal value. |
| `AI_FEATURE_ENABLED` | Optional server switch for AI summaries; leave unset or set to `false` to keep AI off. |

Clerk development and production environments may have separate accounts. Create and test the owner account in the environment where its owner email and PIN are configured. Give each fork or separate deployment its own database, Clerk configuration, owner email, PIN, and Tavily key.

## Hackathon submission checklist

Hackathon rules differ, so follow the event's submission form and deadline. A typical submission includes:

- The public GitHub repository URL.
- A working demo URL, if the event requires one.
- A short demo video or screenshots showing the workflow and cited sources.
- This README with setup, run, and test instructions.
- Project, team, and license information required by the event.
- If judges need access, share a dedicated demo account through the event's private submission field and configure its own key.

## License

This repository is licensed under the Apache License 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE). Third-party packages and assets remain subject to their respective licenses.

Before submission, review the repository contents and include any additional information required by the event.

## Project layout

- `artifacts/briefing-agent` — React/Vite user interface.
- `artifacts/api-server` — Express API and Tavily-backed research flow.
- `lib/api-spec/openapi.yaml` — API contract source of truth.
- `lib/api-client-react` and `lib/api-zod` — generated API client and validation types.
- `lib/db` — PostgreSQL schema and database package.
