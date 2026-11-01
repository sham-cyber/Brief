# Briefing Agent

A pre-meeting research app that creates concise one-page briefs on a person or company from recent, source-linked news.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/briefing-agent run dev` — run the briefing app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/briefing-agent` — briefing app interface
- `artifacts/api-server/src/routes/briefings.ts` — research and brief-generation endpoint
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/integrations-openai-ai-server` — Replit-managed OpenAI client
- `lib/api-client-react` and `lib/api-zod` — generated API client and validation schemas

## Architecture decisions

- Search recent articles from Google News RSS and use the returned article URLs as the allowed citation set.
- Generate a concise structured brief through Replit AI Integrations; validate that every factual summary cites returned source IDs.
- Briefs are generated on demand and are not persisted.

## Product

- Enter a company or person's name, meeting date/time, and optional discussion context.
- Generate recent news, hiring, and launch highlights plus questions to bring into the meeting.
- Inspect source links, then copy or print the brief.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The briefing endpoint depends on the `AI_INTEGRATIONS_OPENAI_*` environment variables provisioned by the Replit AI integration.
- If no recent sources are returned, generation fails explicitly rather than producing an unsourced brief.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
