# Briefing Agent

**Author:** Sham Mohite

**Copyright:** © 2026 Sham Mohite

A source-first pre-meeting briefing app. Choose a company or person, select the topics that matter, and manually gather public reporting from the 30 days ending when the briefing starts. Each factual item links to its source.

> **Hackathon prototype:** Add the demo URL and presentation links here when they are ready for submission.

## What it does

- Supports Company and Person briefs, with role context for Chairman / CEO, MP / public office, and Corporate person.
- Searches up to five selectable blocks: News, Hires, Launches, Financial Facts, and Risks & Open Questions.
- Uses Tavily for one basic search per selected topic, up to eight results per topic; validates dates, links, subject match, and topic relevance before including results.
- Shows source links and, when Tavily returns them for an accepted source, a photo or supported video preview.
- Provides a concise brief and a one-page print with up to 400 words of briefing text, plus its cited source list, and browser read-aloud.

Current flow centers on cited public-source results, on-demand briefings, and transient output. Separate future work may cover AI and user-authorized private-source connections.

## Sign-in, owner lock, and crawl procedure

1. Open the app and sign in through Clerk. Sign-up is available for reviewers.
2. Enter a company or person, complete the required role details, set the meeting time, and choose at least one topic. Context is optional.
3. Press **Brief**. The app prompts for the four-digit start PIN.
4. The configured developer account and `BRIEFING_START_PIN` are required to start a crawl. This keeps use of the project Tavily key with its owner.
5. After a successful crawl, follow source links to verify claims. Use Print for the one-page layout.

The PIN and owner email are server-side secrets. Configure their values in Replit Secrets or your hosting provider's secret manager; never put the PIN value in the README, source code, or Git history. Repeated incorrect PIN attempts are temporarily rate-limited.

### Crawl guardrails

- Meeting-time edits prepare the brief; the search begins when the user presses **Brief**.
- One Tavily request is sent for each selected topic, up to five per crawl and eight results per topic.
- The configured developer account is limited to 10 crawl starts and 10 search requests per Asia/Kolkata calendar day.
- The app also enforces a shared 120-second crawl runtime per Asia/Kolkata calendar day, one active crawl at a time, a three-minute hard stop, and a maximum of 10 Tavily requests per five minutes.
- Provider usage is charged to the Tavily account whose key is used. Store the project key in the hosting secret manager.

### Personal Tavily key security

- A personal key is sent to the authenticated API server and encrypted at rest with AES-256-GCM, scoped to the signed-in account. The app returns connection status only; it never returns the saved key to the browser.
- This is not end-to-end encryption: the server decrypts a saved key to call Tavily. An app operator with access to both the database and server encryption secret could decrypt it, so users should save keys only when they trust the operator.
- The key is held temporarily in the entry field, is not saved in browser storage, and the field clears after a successful save. Credential responses are marked non-cacheable.
- **Remove saved key** deletes the app's encrypted copy only. It does not revoke or disable the provider key. To stop the key from working, delete it from the [Tavily dashboard](https://app.tavily.com/home), then remove its saved copy in the app. See [Tavily's key deletion instructions](https://help.tavily.com/articles/4695639825-how-can-i-delete-my-api-key).
- The configured owner's crawls use the project key when available. Removing a personal key will not disable that project key; remove it from Replit Secrets and revoke it in Tavily.

## Run in Replit

The project uses separate managed workflows for the web app and API server. Open the Repl and press **Run** to start them. Store credentials in the Replit Secrets pane.

For a fresh development database, configure `DATABASE_URL`, then apply the development schema:

```sh
pnpm --filter @workspace/db run push
```

Run this schema command against a development database. Handle production schema changes separately.

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

Set values in Replit Secrets or your hosting provider's secret manager. This table lists variable names; keep actual values in the secret manager.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `CLERK_PUBLISHABLE_KEY` | Server-side Clerk configuration |
| `CLERK_SECRET_KEY` | Server-side Clerk authentication |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk sign-in UI |
| `BRIEFING_OWNER_EMAIL` | Email allowed to start crawls |
| `BRIEFING_START_PIN` | Four-digit server-side crawl PIN; store its value only in the secret manager |
| `TAVILY_API_KEY` | Project Tavily key, restricted to the configured owner |
| `USER_CREDENTIALS_ENCRYPTION_KEY` | Encryption key for securely saved user Tavily credentials |

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

Before public release, review the repository contents and include the information required by the event.

## Project layout

- `artifacts/briefing-agent` — React/Vite user interface.
- `artifacts/api-server` — Express API and Tavily-backed research flow.
- `lib/api-spec/openapi.yaml` — API contract source of truth.
- `lib/api-client-react` and `lib/api-zod` — generated API client and validation types.
- `lib/db` — PostgreSQL schema and database package.
