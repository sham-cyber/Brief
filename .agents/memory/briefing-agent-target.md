---
name: Existing briefing app
description: Identifies the app to extend and the intended research method.
---

The user means the existing Briefing Agent in this workspace when referring to the briefing bot; they are not referring to a separate Replit bot. The app should let a user choose Company or Person, enter a meeting time and optional stated priorities, then crawl relevant public sources for the preceding 30 days. Company briefs should include sourced share-price and profit/loss facts where available. Person briefs should include only financial outcomes reliably attributable to the person or a clearly identified public role. The user wants no email automation in the current scope. The UI should offer All, News, Hires, Launches, and Open Questions filters, and the crawl window is a rolling 30-day period ending at the time the briefing is generated. Start with crawler/bot-based collection and deterministic assembly; AI integration may be added later.

**Why:** The user clarified the source-backed 30-day scope, Company/Person differences, bot-first approach, and explicitly removed email automation.

**How to apply:** Extend the existing Briefing Agent as a user-triggered web app. Prioritize only stated meeting context; do not infer private motives or finances, make investment recommendations, or add email/AI integration unless the user changes direction.
