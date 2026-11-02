# Briefing Agent

A source-first pre-meeting briefing app. Choose a company or person, select the topics that matter, and manually gather public reporting from the 30 days ending when the briefing starts. Each factual item links to its source.

> **Hackathon prototype:** This repository has no published demo URL yet. Add the live demo and any required presentation links here before submitting.

## What it does

- Supports Company and Person briefs, with role context for Chairman / CEO, MP / public office, and Corporate person.
- Searches up to five selectable blocks: News, Hires, Launches, Financial Facts, and Risks & Open Questions.
- Uses Tavily for one news search per selected block; validates dates, links, subject match, and topic relevance before including results.
- Shows source links and, when Tavily returns them for an accepted source, a photo or supported video preview.
- Provides a concise brief, a one-page print layout, and browser read-aloud.

AI-generated summaries and AI API calls are **off**. Private Gmail, WhatsApp, and other private-source crawling are **not enabled**. Briefs are generated on demand and are not stored as research records.

## Sign-in, owner lock, and crawl procedure

1. Open the app and sign in through Clerk. Sign-up is available; signing in alone does not grant crawl permission.
2. Enter a company or person, complete the required role details, set the meeting time, and choose at least one topic. Context is optional.
3. Press **Start/Crawl**. The app prompts for the four-digit start PIN.
4. The server permits a crawl only for the account whose email matches `BRIEFING_OWNER_EMAIL` in that environment, and only when the PIN matches `BRIEFING_START_PIN`. Unauthorized accounts cannot use the project Tavily key or start a crawl.
5. After a successful crawl, follow source links to verify claims. Use Print for the one-page layout.

The PIN and owner email are server-side secrets. Do not put their values in this README, GitHub, screenshots, or a public issue. Repeated incorrect PIN attempts are temporarily rate-limited.

### Crawl guardrails

- No crawl starts automatically when a page loads or meeting time changes.
- One Tavily request is sent for each selected topic, up to five per crawl and eight results per topic.
- The configured developer account is limited to 10 crawl starts and 10 search requests per Asia/Kolkata calendar day.
- The app also enforces a shared 120-second crawl runtime per Asia/Kolkata calendar day, one active crawl at a time, a three-minute hard stop, and a maximum of 10 Tavily requests per five minutes.
- Provider usage is charged to the Tavily account whose key is used. Keep the project key private; do not commit it.

## Run in Replit

The project uses separate managed workflows for the web app and API server. Open the Repl and press **Run** to start them. Use the Replit Secrets pane for credentials; do not create or commit a `.env` file containing real values.

For a fresh development database, configure `DATABASE_URL`, then apply the development schema:

```sh
pnpm --filter @workspace/db run push
```

Run this schema command only against a development database—not production.

## Run locally

Requirements: Node.js 24, pnpm, PostgreSQL, and valid Clerk and Tavily configuration.

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
```

In two terminals, start the API and web app:

```sh
pnpm --filter @workspace/api-server run dev
```

```sh
pnpm --filter @workspace/briefing-agent run dev
```

The local API must be reachable by the web app through the configured workspace routing and environment. On Replit, prefer the managed workflows, which supply the required ports and routing.

Check the workspace packages:

```sh
pnpm run typecheck
```

The repository includes `pnpm-lock.yaml`; use `pnpm install --frozen-lockfile` so installs match the committed dependency versions.

## Environment variables

Set values in Replit Secrets or your hosting provider's secret manager. Names only are listed here; never commit actual values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `CLERK_PUBLISHABLE_KEY` | Server-side Clerk configuration |
| `CLERK_SECRET_KEY` | Server-side Clerk authentication |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk sign-in UI |
| `BRIEFING_OWNER_EMAIL` | Email allowed to start crawls |
| `BRIEFING_START_PIN` | Four-digit server-side crawl PIN |
| `TAVILY_API_KEY` | Project Tavily key, restricted to the configured owner |
| `USER_CREDENTIALS_ENCRYPTION_KEY` | Encryption key for securely saved user Tavily credentials |

Clerk development and production environments may have separate accounts. Create and test the owner account in the same environment where the corresponding owner email and PIN are configured. A fork or separate deployment must use its own database, Clerk configuration, owner email, PIN, and Tavily key.

## Hackathon submission checklist

Hackathon rules differ, so follow the event's submission form and deadline. A typical submission includes:

- The public GitHub repository URL.
- A working demo URL, if the event requires one.
- A short demo video or screenshots showing the workflow and cited sources.
- This README with setup, run, and test instructions.
- Any required team, project, and license information.
- Judge credentials, only if needed, shared through the event's private submission field—not in the repository. For judge-run crawls, use a dedicated demo account and key rather than personal credentials.

Before making the repository public, confirm that no secrets, user data, or private source material are tracked. No license has been selected in this repository; add one only if the team chooses it or the event requires it.

## Project layout

- `artifacts/briefing-agent` — React/Vite user interface.
- `artifacts/api-server` — Express API and Tavily-backed research flow.
- `lib/api-spec/openapi.yaml` — API contract source of truth.
- `lib/api-client-react` and `lib/api-zod` — generated API client and validation types.
- `lib/db` — PostgreSQL schema and database package.
