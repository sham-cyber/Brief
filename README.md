# Briefing Agent

**Author:** Sham Mohite

**Copyright:** © 2026 Sham Mohite

A source-first pre-meeting briefing app. Choose a company or person, select the topics that matter, and use Tavily's AI-powered search and retrieval to gather public reporting from the 30 days ending when the briefing starts. Each factual item links to its source.

**GitHub repository:** [sham-cyber/Brief](https://github.com/sham-cyber/Brief)

**Run mode:** Clone and run locally; each member uses their own credentials and local Ollama installation.

## Submission overview

| Requirement | Project information |
| --- | --- |
| Rules | Check the event organizer's current rules and submission form; add any event-specific requirements before submitting. |
| Working project or demo | Clone the repository and follow [the local setup steps](#clone-the-repository-and-run-it). |
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
- Accepts an optional open question about the selected company or person, guides the existing topic searches, and returns a cited source-based answer without adding Tavily requests.
- Shows source links and, when Tavily returns them for an accepted source, a photo or supported video preview.
- Provides a concise brief and a one-page print with up to 400 words of briefing text, plus its cited source list, and browser read-aloud.
- SAP briefs combine Tavily public research with approved, read-only SAP S/4HANA records; public links and internal records remain in separate sections.

The app includes Qwen summaries through Ollama. After Tavily results pass the source checks, a summary can run when the server switch, account PIN and activation, and per-brief opt-in are all satisfied. The example configuration keeps the server switch false until the operator enables it. SAP records and private sources are not sent to the model.

## Technologies used

- **Web app:** React, TypeScript, Vite, Tailwind CSS, Radix UI, and TanStack Query.
- **API:** Node.js and Express, with Clerk for sign-in and access control.
- **Database:** PostgreSQL with Drizzle ORM.
- **AI-powered retrieval:** Tavily Search API finds public reporting for selected topics; the app checks source links, date range, subject match, and relevance.
- **Optional local AI summaries:** Ollama using the configured local model; one request per selected topic when the user opts in.
- **SAP connection:** SAP S/4HANA business OData APIs using OAuth; SAP records remain separate from public search results.
- **Validation and API contracts:** Zod and an OpenAPI specification, with generated TypeScript API clients.
- **PDF and project tooling:** `pdf-lib`, pnpm workspaces, and TypeScript type checks.

## Sign-in, account PIN, and crawl procedure

The repository includes the Clerk sign-in and sign-up screens, browser session handling, API authentication middleware, and protected API routes. The Clerk tenant and its private keys are not stored in Git; each deployment must connect its own Clerk environment.

### Use your own clone

Each signed-in account uses its own PIN, Tavily key, and optional Ollama connection:

1. Configure Clerk and PostgreSQL for the clone; enable account creation in that Clerk environment if members need to register.
2. Set a unique `USER_CREDENTIALS_ENCRYPTION_KEY` in the clone's server-side secret manager.
3. Leave `TAVILY_API_KEY` unset for member accounts. Each person signs in and saves their own Tavily key in Settings; those searches are billed to that person's Tavily account.
4. Each person sets a four-digit account PIN in the AI control panel. That same PIN is checked for crawl starts and AI activation; it is stored as a salted hash, not in browser storage.
5. Each person may save and test their own Ollama-compatible endpoint, model name, and optional bearer token. The endpoint/token are encrypted on the server and scoped to the signed-in account.
6. Configure the clone's database and Clerk keys, apply the database schema, and start the app as described below.

The project-level `TAVILY_API_KEY` remains restricted to the account matching `BRIEFING_OWNER_EMAIL`; other accounts cannot use it and must save their own key. A member can use their own credentials in the same deployment without sharing another member's PIN or Tavily key.

1. Open the app and sign in through Clerk. Sign-up availability is controlled by the deployment's Clerk environment.
2. Enter a company or person, complete the required role details, set the meeting time, and choose at least one topic. Context is optional.
3. Press **Brief**. The app prompts for the four-digit start PIN.
4. The authenticated account and its own saved PIN are required to start a crawl. Use that account's saved Tavily key unless it is the configured owner using the project key.
5. After a successful crawl, follow source links to verify claims. Use Print for the one-page layout.

Repeated incorrect PIN attempts are temporarily rate-limited. The PIN is per account and is never put in the README, source code, or browser storage.

### Crawl guardrails

- Meeting-time edits prepare the brief; the search begins when the user presses **Brief**.
- One Tavily request is sent for each selected topic, up to five per event and eight results per topic. This applies to Public briefs and to the public-research part of SAP briefs.
- Each signed-in user can choose a daily limit of 1–10 complete briefing events; the default is 10. One event includes the selected topic searches and the resulting brief. The cap resets at midnight Asia/Kolkata time, and the daily topic-search allowance follows the selected event limit (up to five searches per event).
- Each event has a two-minute collection limit and a three-minute backup stop. Only one Tavily-backed event can run at a time; the app also limits Tavily to five search requests per rolling five minutes.
- Provider usage is charged to the Tavily account whose key is used. Store the project key in the hosting secret manager.
- The public landing page lets visitors draft an open question and carries it through sign-in. Searching requires an authenticated account, an effective Tavily key, completed briefing fields, and that account's PIN.
- A common **Stop Tavily + Qwen** button aborts the active request. Leaving the page also cancels it; the server independently stops the combined briefing at two minutes, with its three-minute backup stop.

### How AI is used

- **Tavily retrieval (default):** Tavily's AI-powered Search API finds public sources for the selected topics and returns cited research.
- **Qwen/Ollama summaries:** Included as a guarded AI step after Tavily results are ready. The example configuration keeps `AI_FEATURE_ENABLED=false`; the hosting operator can enable the switch, and each user must save their own Ollama connection, set their account PIN, activate AI, and opt in for a briefing.
- **Local Ollama:** For a local clone, run Ollama on the same computer as the API server. In the signed-in AI control panel, enter `http://127.0.0.1:11434` and the installed model name (for example, `qwen3:0.6b`), then save and test the connection. Inference uses that clone's computer resources.
- **Remote Ollama-compatible endpoint:** Use a public HTTPS endpoint protected by a bearer token. Enter the endpoint and token in the signed-in AI controls; the app encrypts the saved connection and scopes it to that account. Do not use an endpoint you do not control. A hosted API cannot reach a member's computer by entering `localhost`; use a secured, reachable endpoint if the app and model run on different computers.
- The selected model makes at most one request per selected topic in a briefing, with no automatic retries. It receives the subject, open question, selected topic, and accepted public-source titles and snippets. SAP records and private sources remain outside this AI step.
- Qwen starts only after all Tavily topic searches finish and accepted sources pass link, date, subject, and topic checks. Topics without stable cited text are skipped.
- Qwen allows up to five topic requests per signed-in account per rolling five minutes. All Qwen summaries in one briefing share a 400-word cap, whether the user selects one topic or combines several; each summary cites only source IDs returned for that topic.
- Local Ollama uses the computer running the clone. A missing or unavailable model leaves the source-based brief available.
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
- Ollama installed locally if you want optional AI summaries

### Clone and install

```sh
git clone https://github.com/sham-cyber/Brief.git
cd Brief
pnpm install --frozen-lockfile
```

Keep the committed lockfile. The frozen install uses its exact dependency resolutions.

### Run Ollama locally

1. Install Ollama on the same computer that will run the cloned app.
2. Start Ollama with `ollama serve`, then install the example model with `ollama pull qwen3:0.6b`. Confirm it appears in `ollama list`.
3. Copy `.env.example` to `.env` and fill in the app's own database, Clerk, owner, and encryption settings. Keep `AI_FEATURE_ENABLED=false` until the operator chooses to enable AI. Each account adds its own Tavily and Ollama connections in the app.
4. In each terminal, load the local environment before starting a service:

   ```sh
   set -a
   . ./.env
   set +a
   ```

   The `.env` file is ignored by Git. Never commit it or share its credential values.
5. After signing in, open the AI control in Settings. It displays the configured endpoint and model; **Test Ollama connection** checks `/api/tags` and confirms the model is installed. If Ollama is unavailable during a briefing, Tavily sources still render with a source-only notice.

### Configure secrets and initialize the database

For a local clone, copy `.env.example` to `.env` and fill in the values from [Required environment variables](#required-environment-variables). For a Replit workspace, add values through its **Secrets** pane; for another host, use that host's secret manager. Never commit secret values to source files or GitHub.

For a fresh development database, make sure `DATABASE_URL` points to that database, then apply the schema:

```sh
pnpm --filter @workspace/db run push
```

Run this command against a development database only. Production schema changes are handled separately.

### Start the app

Run the API and web app on the same computer as Ollama. In each separate terminal, load `.env` before starting the service:

```sh
set -a
. ./.env
set +a
PORT=8080 pnpm --filter @workspace/api-server run dev
```

```sh
set -a
. ./.env
set +a
PORT=21375 BASE_PATH=/ pnpm --filter @workspace/briefing-agent run dev
```

The web app proxies same-origin `/api` requests to `LOCAL_API_PROXY_TARGET` when configured. The example points it to the local API server on port `8080`. Keep the API server and Ollama running on the same computer; `localhost` always refers to the machine running the API server, not the browser visitor.

To check the workspace packages:

```sh
pnpm run typecheck
```

### Sign in and run a briefing

1. Open the development Preview and sign in through Clerk. Create an account first if needed.
2. Sign in with a Clerk account, save its own Tavily key, and set its own four-digit PIN in the AI control panel.
3. Enter the company or person, complete required details, select the meeting time and at least one topic, then press **Brief**.
4. Enter that account's PIN when prompted. It also protects AI activation for the same account.
5. After the crawl, check the source links and use **Print** for the one-page brief.

The Clerk account must exist in the same development or production Clerk environment used by the app. Sign-in alone does not grant permission to start a crawl.

### Local use by members

Each member clones the public repository, configures their own database and Clerk environment, then signs in and adds their own Tavily key, PIN, and optional Ollama connection. For local use, run the app and Ollama on the same computer. Do not point a remotely hosted API server at `localhost` expecting it to reach a member's computer.

### Optional brief-ready push alerts

There is no paid plan, checkout, or billing gate in this hackathon app. Push alerts are optional, free browser notifications; each signed-in user may opt in on a device or leave them off without affecting briefing access. The API stores each device subscription encrypted with `USER_CREDENTIALS_ENCRYPTION_KEY`. A notification is sent only after a manually started meeting briefing has finished; it never starts or repeats a Tavily search. The alert contains no company name, person name, source, or briefing content. Customer Search does not send a ready alert.

For a local clone, generate a VAPID key pair with:

```sh
pnpm --filter @workspace/api-server run web-push:keys
```

Put both generated values in the server's secret manager as `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY`. Set `WEB_PUSH_VAPID_SUBJECT` to a valid `mailto:` address or HTTPS contact URL. Never commit the private key. In the signed-in app, choose **Enable on this device** and grant browser notification permission. To revoke a device, choose **Turn off on this device**; browser permission can also be revoked in site settings.

The notification title says **AI OFF** to indicate that no Qwen generation remains active. Its message clarifies whether Qwen was not requested, completed a summary, or ended without producing one. The alert is sent only after the briefing response has finished Qwen processing or reached its existing timeout; it does not cancel Qwen early.

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
| `TAVILY_API_KEY` | Optional project Tavily key; only the account matching `BRIEFING_OWNER_EMAIL` can use it. Other accounts add their own key in Settings. |
| `USER_CREDENTIALS_ENCRYPTION_KEY` | Needed to save account Tavily keys, Ollama tokens, or SAP OAuth credentials; use a unique 64-character hexadecimal value. |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | Public VAPID key used by the browser when a signed-in user opts in to alerts. |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Secret server-side VAPID key used to send push alerts; never commit it. |
| `WEB_PUSH_VAPID_SUBJECT` | Optional `mailto:` or HTTPS contact for VAPID; defaults to the configured briefing owner email when available. |
| `AI_FEATURE_ENABLED` | Optional server switch for AI summaries; leave unset or set to `false` to keep AI off. |
| `LOCAL_API_PROXY_TARGET` | Optional local Vite proxy target, usually `http://127.0.0.1:8080`. |

Clerk development and production environments may have separate accounts. Create and test users in the Clerk environment connected to that app. Give each fork or separate deployment its own database, Clerk configuration, encryption key, and Tavily setup.

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
