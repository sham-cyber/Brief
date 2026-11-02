---
name: Existing briefing app
description: Identifies the app to extend and the intended research method.
---

The user means the existing Briefing Agent in this workspace when referring to the briefing bot; they are not referring to a separate Replit bot. The app should let a user choose Company or Person, enter a meeting time and optional stated priorities, then manually crawl relevant sources for the rolling 30 days ending at generation time. Company briefs are public-only. Person briefs offer Chairman / CEO, MP, or Corporate context, plus separate Public and Private source modes. Private mode is limited to an explicitly authorized Gmail/shared mailbox and WhatsApp Business account; personal WhatsApp history is excluded. The user chose both OAuth and user-owned provider credentials where supported, not developer/workspace credentials; provider charges should go to each user's own provider account. Keep private mode blocked until per-user access and secure credential handling are implemented. Gmail is a content source only; there is no inbox trigger or email delivery. Company briefs should include sourced share-price, material savings, profit/loss, and risks/mitigations where available. Person briefs should include only financial outcomes reliably attributable to the person or a clearly identified public role. The user wants category filters and read-aloud, and explicitly does not want AI integrated in the app; the Replit Agent can provide AI-assisted help in chat. Keep app briefs source-based and cited, with no AI-generated summaries, Q&A, or provider calls. Browser-native speech is acceptable. Video sources should appear in a playable inline box with citations; on mobile it should be a landscape rectangle 1.5 inches wide by 1 inch high. Keep the brief to five blocks—News, Hires, Launches, Financial Facts, and Risks & Open Questions—and cap the combined spoken brief at two minutes.

**Why:** The user clarified the 30-day crawler brief, Company/Person differences, role choices, private sources, user-owned connection methods and provider billing, and explicitly decided AI assistance should remain in chat rather than be integrated into the app.

**How to apply:** Extend the existing Briefing Agent as a user-triggered web app. Meeting time is context only; only the primary Start button may call the crawler. Date/time changes, status indicators, and retry text must never start a search. Keep Start disabled until the subject, required person details when applicable, meeting time, and at least one topic are complete; context remains optional. Allow users to select only the topic categories they want rather than requiring all five. Prioritize stated meeting context; do not infer private motives or finances or make investment recommendations. Each block should have a repeat action using browser-native speech. The whole app shares a 120-second Tavily runtime budget per rolling 24 hours, with a three-minute hard stop as backup; new accounts do not reset it. Crawling is never continuous. Keep Company briefs public-only. Do not read private accounts until the source owner or authorized delegate grants access and each user's data is isolated. Do not connect workspace credentials after the user declines; user-owned provider credentials may be supported only through secure per-user handling. Exclude personal WhatsApp history and personal/family health records. Keep the app's reports source-based with citations; keep AI-assisted questions and summaries in the Replit Agent chat, not inside the app. Present it as a source-first briefing assistant: explain its role-specific value and 30-day method, but do not claim active AI while AI is off.

The optional meeting-context note should prioritize matching public results (for example, “new cable plant”) without changing the 30-day window or selected categories.

**Why:** The user confirmed that meeting context should guide which collected results appear first.

**How to apply:** Use context for local relevance ranking; do not append raw free-text context to third-party search queries unless the user is clearly informed and consents.

Keep the Person role options at Chairman / CEO, MP, and Corporate. MP is the government/public-office path with an editable title such as Corporator; Chairman / CEO requires a company affiliation; Corporate means a private-entity person. Do not add Corporator as a separate role.

**Why:** The user confirmed the role flow and clarified that Corporator belongs under the existing MP/public-office choice.

**How to apply:** Preserve the three role choices. For MP, pass the entered public-office title into the search and show it in the brief. Require the associated company for Chairman / CEO briefs.

Person details may be saved for reuse only after the user explicitly presses Save. Keep saved profiles scoped to the signed-in account; briefing remains usable without saving or signing in.

**Why:** The user asked for a Save option so person details are not lost, but did not want automatic saving.

**How to apply:** Derive ownership from the signed-in Clerk user on the server, never from client-supplied IDs. Let the owner reload, update, and remove saved details; clear user-scoped UI state on sign-out.

When the user enters a direct public question (for example, “market condition” for Finolex Cables), the brief should give a concise source-based answer with clickable citations; if no report directly matches, say so rather than guessing.

**Why:** The user expects a CEO’s question to receive an answer with a source link.

**How to apply:** Build the answer from recent collected source titles/excerpts, attach the original links, and do not imply AI-generated synthesis while AI remains disabled.

Include one concise top-positive signal and one top-negative signal in each brief, each with its own source citation. These are source signals, not an AI sentiment judgment or investment recommendation; state when the selected reports do not support a clear signal.

**Why:** The user wants both sides of a company briefing visible at a glance, with one sourced line each.

**How to apply:** Use collected source headlines/excerpts and link each line to its supporting source; do not invent or infer missing positives or risks.

Do not mix results for similarly named people or companies. Require the selected subject name to appear in the source title or excerpt; omit ambiguous matches rather than attributing them.

**Why:** A live Finolex Cables crawl also returned Finolex Industries and unrelated companies.

**How to apply:** Prefer fewer exact-name results over broad fuzzy matches. Add ticker or legal-name aliases only through an explicit alias mechanism.

Topic tabs must filter the whole brief, not just the history cards. When Hire is active, the overview, positive/negative signals, speech, copy, and print must use hire evidence only; if none is found, show that clearly without substituting news.

**Why:** The user corrected that a CEO selecting the Hire tab wants hire-only information, not the all-topic News summary.

**How to apply:** Use the active category's own 30-day summary and signals. Return a valid empty state when that category has no matching reports.

The Hires tab must distinguish confirmed hiring reports from current open roles. The user wants both; when no jobs source is connected, do not imply that no vacancies exist—provide clearly labeled LinkedIn search links and state they are not crawled automatically.

**Why:** The user selected both open roles and confirmed hires, then declined the job-search integration.

**How to apply:** Keep open job listings separate from sourced hiring reports. Never treat a search link as a fetched job posting or citation.

For print, use a compact one-page A4 summary with the overview, one sourced leading item per selected category, an open question, and citation links; keep the complete multi-item source view on screen.

**Why:** The user explicitly requires the printed briefing to fit on one page.

**How to apply:** Preserve a concise print-only layout instead of shrinking or clipping the full interactive research view.

The project-level Tavily secret is a pilot-only search credential; it charges the project owner's Tavily balance and must not be presented as per-user billing.

**Why:** The user wants to use their Tavily trial credits now, while the intended multi-tenant product must keep each user's provider charges on that user's account.

**How to apply:** Keep the shared key server-side and disclose its project-wide billing during the pilot. Before public multi-tenant use, require securely isolated user-owned Tavily credentials or another explicit billing model.

The user clarified that all accounts share one 120-second rolling 24-hour crawl-time allowance, with a three-minute backup hard stop. Creating a new account does not reset the shared limit.

**Why:** The user clarified that the whole app, rather than each account, must stop after two minutes because all accounts spend the same Tavily balance.

**How to apply:** Keep the global budget persistent across restarts and reserve it atomically so accounts cannot exceed the combined limit through overlapping crawls. Continue to disclose that all accounts share the project-level provider bill.

The Brief status indicator glows green only when a successful briefing still matches the currently selected subject, meeting, and topics; entering meeting details alone does not mean the brief is ready.

**Why:** The user wants the green Brief indicator to mean the requested brief is ready for its selected goals.

**How to apply:** Derive green status from a completed result matching the current form, not from valid inputs or available crawl time alone.
