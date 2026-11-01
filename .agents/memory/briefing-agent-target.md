---
name: Existing briefing app
description: Identifies the app to extend and the intended research method.
---

The user means the existing Briefing Agent in this workspace when referring to the briefing bot; they are not referring to a separate Replit bot. The app should let a user choose Company or Person, enter a meeting time and optional stated priorities, then crawl relevant public sources for the rolling 30 days ending at generation time. Company briefs should include sourced share-price, material savings, profit/loss, and risks/mitigations where available. Person briefs should include only financial outcomes reliably attributable to the person or a clearly identified public role. The user wants category filters and read-aloud plus spoken Q&A. Keep routine speech low-cost and use AI only for user-requested, source-grounded answers. There is no email automation in scope. Video sources should appear in a playable inline box with citations; on mobile it should be a landscape rectangle 1.5 inches wide by 1 inch high. Keep the brief to five blocks—News, Hires, Launches, Financial Facts, and Risks & Open Questions—and cap the combined spoken brief at two minutes, with word/character and cost estimates before AI speech.

**Why:** The user clarified the 30-day crawler brief, Company/Person differences, category buttons, voice/Q&A features, cost controls, and explicitly removed email automation.

**How to apply:** Extend the existing Briefing Agent as a user-triggered web app. Prioritize only stated meeting context; do not infer private motives or finances, make investment recommendations, or add email integration unless the user changes direction.
