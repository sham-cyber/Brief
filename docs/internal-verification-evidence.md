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
- OpenAI code, dependency, route, and credential schema are absent from the current source tree.
- The development database contains the Ollama connection table and has no OpenAI credential table.

## What this does not verify

- No live Tavily crawl was started. The briefing endpoint correctly returned HTTP 401 without a signed-in Clerk session, so no search request or Tavily credit was used.
- No company briefing or print PDF was generated. A real result requires signing in, using the account's PIN, and having its Tavily connection configured.
- The Qwen call used an internal software-test source, not company reporting. It proves the model-summary path responds; it is not evidence about any company or person.

## AI configuration

Qwen through Ollama is included in the app. The server feature switch, signed-in account setup, account PIN, and per-brief opt-in guard each summary request. The example configuration leaves the server switch false until the operator enables it. The workspace's installed example model is `qwen3:0.6b`.
