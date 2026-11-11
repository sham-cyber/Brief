# Internal Verification Evidence

**Date:** 11 November 2026

**Environment:** Replit development workspace; not a production deployment.

## Checks completed

- API TypeScript typecheck passed.
- AI and Ollama tests passed: 31 tests.
- Briefing-question tests passed: 3 tests.
- Web app TypeScript typecheck passed.
- Vite production build completed.
- API health endpoint returned HTTP 200.
- The production `requestOllamaSummary` helper sent a test prompt to Workspace Ollama using Qwen3 0.6B. It returned a valid JSON summary citing the supplied test source in about 6.6 seconds.
- Two user-supplied, one-page Letter briefs were generated for Tavily.com for the 30-day window 12 Oct–11 Nov 2026. The 19:40 IST run shows 7 sourced records; the 19:55 IST run shows 8. Both PDFs include a Sources section with URLs.
- The API log records successful `POST /api/briefings` responses: HTTP 200 at 14:10:22.433 with a 19,323 ms response time and at 14:25:38.001 with a 5,808 ms response time. These UTC log times align with the two PDF crawl times.
- The route code calls Tavily search for public topics. An earlier unauthenticated request returned HTTP 401 before these successful runs; it is a separate request.
- OpenAI code, dependency, route, and credential schema are absent from the current source tree.
- The development database contains the Ollama connection table and has no OpenAI credential table.

## What this does not verify

- These runs were about Tavily.com, not Finolex.
- The API log records the briefing endpoint status but not Tavily's raw HTTP response, provider request ID, or billed-credit usage. The source-bearing PDFs and successful endpoint responses confirm that the app returned results, but do not establish exact provider billing.
- The logs do not show whether Qwen ran for either PDF. The separate Qwen helper test used an internal test source, not company reporting.

## AI configuration

Qwen through Ollama is included in the app. The server feature switch, signed-in account setup, account PIN, and per-brief opt-in guard each summary request. The example configuration leaves the server switch false until the operator enables it. The workspace's installed example model is `qwen3:0.6b`.
