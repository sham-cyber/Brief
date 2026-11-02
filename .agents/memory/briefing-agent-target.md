---
name: Existing briefing app
description: Identifies the app to extend and the intended research method.
---

The user means the existing Briefing Agent in this workspace when referring to the briefing bot; they are not referring to a separate Replit bot. The app should let a user choose Company or Person, enter a meeting time and optional stated priorities, then manually crawl relevant sources for the rolling 30 days ending at generation time. Send one Tavily request per selected topic tab, up to five per crawl; reject duplicate topic values. Positive/negative signals are scored locally from cited source text with no extra fragmentation API call. Company briefs are public-only. Person briefs offer Chairman / CEO, MP, or Corporate context, plus separate Public and Private source modes. Private mode is limited to an explicitly authorized Gmail/shared mailbox and WhatsApp Business account; personal WhatsApp history is excluded. Use account-owned credentials for private sources where supported. For Tavily, the configured developer may use the existing project key only for their own account; other accounts must never use that key. Keep private mode blocked until per-user access and secure credential handling are implemented. Gmail is a content source only; there is no inbox trigger or email delivery. Company briefs should include sourced share-price, material savings, profit/loss, and risks/mitigations where available. Chairman / CEO Person briefs may include the associated company's sourced financial and business outcomes when clearly labeled company-level, not as personal outcomes. The user wants category filters and read-aloud, and explicitly does not want AI integrated in the app; the Replit Agent can provide AI-assisted help in chat. Keep app briefs source-based and cited, with no AI-generated summaries, Q&A, or provider calls. If AI is approved later, allow one request per selected topic tab per briefing; cap the combined spoken brief at two minutes. Browser-native speech is acceptable. Video sources should appear in a playable inline box with citations; on mobile it should be a landscape rectangle 1.5 inches wide by 1 inch high. Keep the brief to five blocks—News, Hires, Launches, Financial Facts, and Risks & Open Questions.

**Why:** The user clarified the 30-day crawler brief, Company/Person differences, role choices, private sources, user-owned connection methods and provider billing, and explicitly decided AI assistance should remain in chat rather than be integrated into the app.

**How to apply:** Extend the existing Briefing Agent as a user-triggered web app. Meeting time is context only; only the primary Start button may call the crawler. Date/time changes, status indicators, and retry text must never start a search. Keep Start disabled until the subject, required person details when applicable, meeting time, and at least one topic are complete; context remains optional. Allow users to select only the topic categories they want rather than requiring all five. Prioritize stated meeting context; do not infer private motives or finances or make investment recommendations. Each block should have a repeat action using browser-native speech. The whole app shares a 120-second Tavily runtime budget per calendar day in Asia/Kolkata, resetting at local midnight; new accounts do not reset it, and concurrent starts must not bypass the limit. Keep the three-minute hard stop as backup. Crawling is never continuous. Keep Company briefs public-only. Do not read private accounts until the source owner or authorized delegate grants access and each user's data is isolated. Do not connect workspace credentials after the user declines; user-owned provider credentials may be supported only through secure per-user handling. Exclude personal WhatsApp history and personal/family health records. Keep the app's reports source-based with citations; keep AI-assisted questions and summaries in the Replit Agent chat, not inside the app. Keep AI activation and voice controls inside authenticated pages, never on the public landing page. Present it as a source-first briefing assistant: explain its role-specific value and 30-day method, but do not claim active AI while AI is off.

The optional meeting-context note should prioritize matching public results (for example, “new cable plant”) without changing the 30-day window or selected categories.

**Why:** The user set an app-wide limit of 10 Tavily requests per rolling five minutes.

**How to apply:** Count each selected topic tab as one request and reserve the full set atomically before sending any Tavily calls.

**Why:** The user clarified the daily crawl allowance is tied to the calendar date, not a rolling 24-hour window, and concurrent starts must not bypass it.

**How to apply:** Use the Asia/Kolkata calendar day, reset the 120-second allowance at midnight IST, and keep the app-wide active-crawl lock effective across midnight.

**Why:** The user confirmed that meeting context should guide which collected results appear first.

**How to apply:** Use context for local relevance ranking; do not append raw free-text context to third-party search queries unless the user is clearly informed and consents.

Keep the Person role options at Chairman / CEO, MP, and Corporate. MP is the government/public-office path with an editable title such as Corporator; Chairman / CEO requires a company affiliation; Corporate means a private-entity person. Do not add Corporator as a separate role.

**Why:** The user confirmed the role flow and clarified that Corporator belongs under the existing MP/public-office choice.

**How to apply:** Preserve the three role choices. For MP, pass the entered public-office title into the search and show it in the brief. Require the associated company for Chairman / CEO briefs.

For Chairman / CEO Person briefs, include exact matches for the associated company as well as the person's name. Label company matches throughout the brief and print view as company-level; never attribute them to the person unless the source names them.

**Why:** The user clarified that a person briefing must include the person's company and specifically named Finolex Cables as the associated company.

**How to apply:** Make the associated company the primary Tavily target for Chairman / CEO topic searches, retain exact company matching and the rolling 30-day/date/link/topic checks, and keep clear company-level attribution.

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

The configured developer may use the existing project-level Tavily key only on their own account. Other app accounts must never use that key; when they are permitted to crawl, they use their own saved key. Keep AI keys and model calls off until separately approved.

**Why:** The user clarified that the old project-wide key should remain available for the developer's own sign-in only, while other accounts' credentials stay separate.

**How to apply:** Verify the signed-in account is the configured owner before selecting the project key. Keep personal keys encrypted, account-scoped, and hidden from the browser. Preserve the owner-only crawl restriction unless the user changes it.

Add relevant photos alongside video previews within existing topic results; do not create a media tab or extra Tavily search. Media must come from an accepted source for the selected topic, and the user chooses whether to open or play it.

**Why:** The user wants photos and videos to make the short briefing faster to scan while keeping media relevant to the selected topic.

**How to apply:** Request source-associated images in the existing per-topic Tavily call, keep source citations visible, and avoid adding separate media searches.

The app still has one shared 120-second crawl-runtime allowance per Asia/Kolkata calendar day, one active crawl at a time, and a three-minute backup hard stop, even though provider billing now follows each user's Tavily key.

**Why:** The user previously chose an app-wide runtime guardrail; switching to personal keys changed provider billing, not this separate usage limit.

**How to apply:** Keep the daily runtime and request-rate caps app-wide unless the user explicitly changes them. Tell users provider credits bill their own Tavily account, while the runtime allowance remains shared.

The configured developer account may use up to 10 crawl starts and 10 selected-tab Tavily search requests per Asia/Kolkata calendar day. These are separate limits and do not increase the shared runtime or rolling request-rate caps.

**Why:** The user explicitly set both daily developer limits to 10.

**How to apply:** Count one start per valid crawl and one search per selected tab. Keep the counts only when owner, PIN, form, key, and rolling rate checks pass; cancel reservations when preflight checks reject a crawl.

Legacy crawl rows from before daily search counting was added do not record selected-tab totals, so treat each such completed crawl as the maximum five searches for that IST day.

**Why:** The exact earlier request count cannot be recovered; undercounting could exceed the new 10-search daily cap.

**How to apply:** Include this conservative estimate only for legacy rows with no saved search count and positive reserved runtime; it stops affecting usage after midnight.

The Brief status indicator glows green only when a successful briefing still matches the currently selected subject, meeting, and topics; entering meeting details alone does not mean the brief is ready.

**Why:** The user wants the green Brief indicator to mean the requested brief is ready for its selected goals.

**How to apply:** Derive green status from a completed result matching the current form, not from valid inputs or available crawl time alone.

The Start action requires both the approved owner account and a four-digit PIN on every crawl. The API resolves the configured owner email in the active Clerk environment and compares its user ID before any Tavily work.

**Why:** The user requested that only their account can start crawls, in addition to the per-crawl PIN gate, while the app still allows account self-signup.

**How to apply:** Store the PIN and approved owner email only as Replit Secrets; never put either in source, client storage, logs, or responses. Keep owner and PIN checks server-side before reserving Tavily quota.

Anyone may sign in or create an account to inspect the app, but only the configured developer owner account plus the PIN may start a crawl or use the project Tavily key.

**Why:** The user clarified that open sign-in is acceptable for testing because Tavily key use remains restricted to the developer.

**How to apply:** Keep sign-up open for reviewers; do not weaken the server-side owner and PIN checks or include their values in the repository.

No real crawl trial has been completed yet, so a sample briefing is not ready.

**Why:** The user clarified that there is no actual trial evidence to use for a sample.

**How to apply:** Do not present invented or unverified content as a real sample brief. Wait until a real, source-verified trial is available, or label any later mock clearly as fictional.
