# Briefing Agent

A pre-meeting research app that creates concise one-page briefs on a person or company from recent, source-linked news.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server using the workflow-provided port
- `pnpm --filter @workspace/briefing-agent run dev` — run the briefing app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secrets include `DATABASE_URL`, Clerk keys, `TAVILY_API_KEY`, `BRIEFING_OWNER_EMAIL`, and `BRIEFING_START_PIN`.

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
- `lib/api-client-react` and `lib/api-zod` — generated API client and validation schemas

## Architecture decisions

- Run on-demand Tavily news searches, one request per selected topic, and use validated source URLs as the citation set.
- Build the source-based brief from returned titles and excerpts, with local positive/negative signal selection; no AI call is used.
- Request per-source images within the same topic search; keep photos and supported video previews attached to their accepted source.
- Briefs are generated on demand and are not persisted.

## Product

- Enter a company or person's name, meeting date/time, and optional discussion context.
- Select any of five blocks: News, Hires, Launches, Financial Facts, and Risks & Open Questions.
- Inspect cited source links, then read aloud or print the one-page brief.
- Sign-in is available, but only the configured owner email plus the four-digit server-side PIN may start a crawl.
- Public sources only; AI, Gmail, and WhatsApp crawling are disabled.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- If no recent sources are returned, generation fails explicitly rather than producing an unsourced brief.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
