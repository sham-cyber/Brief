---
name: Existing briefing app
description: Identifies the app to extend and the intended research method.
---

The user means the existing Briefing Agent in this workspace when referring to the briefing bot; they are not referring to a separate Replit bot. The app should let a user choose Company or Person, enter a meeting time and optional stated priorities, then manually crawl relevant sources for the rolling 30 days ending at generation time. Send one Tavily request per selected topic tab, up to five per crawl; reject duplicate topic values. Company briefs are public-only. Person briefs offer Chairman / CEO, MP, or Corporate context, plus separate Public and Private source modes. Private mode is limited to an explicitly authorized Gmail/shared mailbox and WhatsApp Business account; personal WhatsApp history is excluded. Use account-owned credentials for private sources where supported. For Tavily, the configured developer may use the existing project key only for their own account; other accounts must never use that key. Keep private mode blocked until per-user access and secure credential handling are implemented. Gmail is a content source only; there is no inbox trigger or email delivery. Company briefs should include sourced share-price, material savings, profit/loss, and risks/mitigations where available. Chairman / CEO Person briefs may include the associated company's sourced financial and business outcomes when clearly labeled company-level, not as personal outcomes. The user wants category filters and read-aloud. Optional source-grounded Ollama summaries are approved inside the app, but AI remains off by default and the source-only briefing must work without AI or a model request. Each signed-in account can set one four-digit PIN used for crawl starts and AI activation, and can configure its own Ollama-compatible endpoint/model/token. The endpoint and token are encrypted and account-scoped. AI requires the server feature switch, account PIN, and per-brief opt-in. Allow one Qwen request per accepted topic, cap the combined Qwen summaries at 400 words per briefing, and accept only source IDs returned for that topic. Start Qwen only after Tavily completes and a topic has stable, linked, source-checked text; skip unsupported topics. Limit Qwen to five topic requests per signed-in account per rolling five minutes. Send only the subject name, selected topic, and accepted public-source titles/snippets; never send SAP/private records. Do not add sentiment labels, AI voice, or AI Q&A without new approval. Keep existing read-aloud capped at two minutes; AI summaries do not start speech automatically. Video sources should appear in a playable inline box with citations; on mobile it should be a landscape rectangle 1.5 inches wide by 1 inch high. Keep the brief to five blocks—News, Hires, Launches, Financial Facts, and Risks & Open Questions.

**Why:** The user approved optional, off-by-default summaries with source-only guardrails, selected local Ollama, then explicitly made it the only summary provider.

**Current AI runtime:** Ollama is the only summary provider. Keep AI off by default; when the local model is unavailable, preserve Tavily sources and show a source-only notice. Do not add a second provider or automatic fallback.

**How to apply:** Keep clone setup local-first. A local clone may use its own loopback Ollama endpoint; a hosted API cannot use `localhost` to reach a member's computer. Keep each saved model connection encrypted and isolated to its signed-in account; require HTTPS and authentication for remote endpoints.

**How to apply:** Extend the existing Briefing Agent as a user-triggered web app. Meeting time is context only; only the primary Brief button may call the crawler. Date/time changes, status indicators, and retry text must never start a search. Keep Start disabled until the subject, required person details when applicable, meeting time, and at least one topic are complete; context remains optional. Allow users to select only the topic categories they want rather than requiring all five. Prioritize stated meeting context; do not infer private motives or finances or make investment recommendations. Each block should have a repeat action. Each signed-in user defaults to 10 complete briefing events per Asia/Kolkata calendar day and may select a lower limit from 1–10; reset at midnight IST. One event is one crawl plus its resulting brief; each selected topic uses one Tavily request (up to five), and printing/copying do not spend another event. The daily topic-search cap equals the selected event limit times five. Allow up to 120 seconds per event, with a three-minute backup hard stop; keep the separate app-wide rolling limit of five Tavily requests per five minutes and serialize concurrent crawls. Crawling is never continuous. Keep Company briefs public-only. Do not read private accounts until the source owner or authorized delegate grants access and each user's data is isolated. Do not connect workspace credentials after the user declines; user-owned provider credentials may be supported only through secure per-user handling. Exclude personal WhatsApp history and personal/family health records. Keep original source findings and citations visible alongside any optional AI summary. Keep AI activation controls inside authenticated pages, never on the public landing page. Present the product as source-first and do not imply AI is active while its server switch or account activation is off.

The optional meeting-context note should prioritize matching public results (for example, “new cable plant”) without changing the 30-day window or selected categories.

**Why:** The user set an app-wide limit of five Tavily requests per rolling five minutes.

**How to apply:** Count each selected topic tab as one request and reserve the full set atomically before sending any Tavily calls.

**Why:** The user clarified that a daily allowance counts whole briefings, not individual topic searches, resets on the IST calendar date, and should be adjustable by each user up to 10.

**How to apply:** Count one successful crawl reservation as one event, show used/remaining events, let each account choose 1–10 events per day (default 10), and reset at midnight IST. Do not combine event timing into a shared daily two-minute pool.

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

**How to apply:** Build the answer from recent collected source titles/excerpts and attach the original links. If the user opts into AI and all guards pass, show its separately labeled, source-linked topic summary; do not imply AI was used while it remains disabled.

Do not mix results for similarly named people or companies. Company matching may ignore legal suffixes and accept a strong brand match with one missing descriptor; keep the leading brand and multiple identifying words for longer names, and reject a conflicting business qualifier. Treat “and” and “&” as equivalent. Keep person-name matching exact and omit ambiguous matches rather than attributing them.

**Why:** A live Finolex Cables crawl also returned Finolex Industries and unrelated companies.

**How to apply:** Prefer fewer exact-name results over broad fuzzy matches. Add ticker or legal-name aliases only through an explicit alias mechanism.

Topic tabs must filter the whole brief, not just the history cards. When Hire is active, the overview, positive/negative signals, speech, copy, and print must use hire evidence only; if none is found, show that clearly without substituting news.

**Why:** The user corrected that a CEO selecting the Hire tab wants hire-only information, not the all-topic News summary.

**How to apply:** Use the active category's own 30-day summary and signals. Return a valid empty state when that category has no matching reports.

The Hires tab must distinguish confirmed hiring reports from current open roles. In Chairman / CEO person briefs, use the associated company for current-role search links. When no jobs source is connected, do not imply that no vacancies exist; clearly label LinkedIn links as searches, not crawled listings.

**Why:** The user selected both open roles and confirmed hires, then declined the job-search integration.

**How to apply:** Keep open job listings separate from sourced hiring reports. Include company-based Sales and Maintenance searches for a Chairman / CEO profile, and never treat a search link as a fetched job posting or citation.

For print, use a compact one-page A4 summary with the overview, up to two sourced items per selected category, an open question, and citations on the same page. Label scheduled meeting time separately from crawl start; keep the complete multi-item source view on screen.

**Why:** The user reviewed a trial printout, found it too sparse, noted that Hires had no useful path, and asked for the meeting and crawl times to be clear while retaining one-page printing.

**How to apply:** Show no more than two sourced highlights per category in the print view, keep source links visible on that page, and never invent hiring items to fill space.

The configured developer may use the existing project-level Tavily key only on their own account. Other signed-in accounts may start crawls only with their own saved Tavily key and their own account PIN. AI remains off by default; each account may save its own Ollama-compatible connection and use it only after activation and per-brief opt-in.

**Why:** The user clarified that the old project-wide Tavily key should remain available for the developer's own sign-in only, while other accounts' credentials stay separate, then selected per-clone local Ollama and later directed removal of the temporary provider.

**How to apply:** Verify the signed-in account is the configured owner before selecting the project Tavily key; all other accounts must use their own encrypted key. The same account PIN is checked for crawl starts and AI activation. Store personal provider keys and Ollama-compatible settings encrypted at rest and account-scoped, but disclose that server-side encryption is not end-to-end: an operator with access to the database and server encryption secret can decrypt them. Distinguish deleting the app's saved copy from deleting/revoking the provider key, and link to the provider's instructions. Disabling the project key requires removing its server secret and deleting the key at Tavily. For AI, require the server switch, per-account PIN, saved connection, and explicit per-brief opt-in; do not add an external model API key.

Add relevant photos alongside video previews within existing topic results; do not create a media tab or extra Tavily search. Media must come from an accepted source for the selected topic, and the user chooses whether to open or play it.

**Why:** The user wants photos and videos to make the short briefing faster to scan while keeping media relevant to the selected topic.

**How to apply:** Request source-associated images in the existing per-topic Tavily call, keep source citations visible, and avoid adding separate media searches.

The app still has one shared 120-second crawl-runtime allowance per Asia/Kolkata calendar day, one active crawl at a time, and a three-minute backup hard stop, even though provider billing now follows each user's Tavily key.

**Why:** The user previously chose an app-wide runtime guardrail; switching to personal keys changed provider billing, not this separate usage limit.

**How to apply:** Keep the daily runtime and request-rate caps app-wide unless the user explicitly changes them. Tell users provider credits bill their own Tavily account, while the runtime allowance remains shared.

The configured developer account may use up to 10 crawl starts and 10 selected-tab Tavily search requests per Asia/Kolkata calendar day. These are separate limits and do not increase the shared runtime or rolling request-rate caps.

**Why:** The user explicitly set both daily developer limits to 10.

**How to apply:** Count one start per valid crawl and one search per selected tab. Keep the counts only when owner, PIN, form, key, and rolling rate checks pass; cancel reservations when preflight checks reject a crawl.

The app follows a bring-your-own-device model: it does not provide Tavily credits or an AI service/model to members. Each user supplies and configures their own provider access and runtime for their deployment.

**Why:** The user clarified that members bring their own device and that Tavily or AI is not provided to them by the app.

**How to apply:** Describe the app as software that connects to user-configured services, not as a provider of search credits or hosted AI. Do not imply that a clone includes funded Tavily usage or a bundled model.

Legacy crawl rows from before daily search counting was added do not record selected-tab totals, so treat each such completed crawl as the maximum five searches for that IST day.

**Why:** The exact earlier request count cannot be recovered; undercounting could exceed the new 10-search daily cap.

**How to apply:** Include this conservative estimate only for legacy rows with no saved search count and positive reserved runtime; it stops affecting usage after midnight.

The Brief status indicator glows green only when a successful briefing still matches the currently selected subject, meeting, and topics; entering meeting details alone does not mean the brief is ready.

**Why:** The user wants the green Brief indicator to mean the requested brief is ready for its selected goals.

**How to apply:** Derive green status from a completed result matching the current form, not from valid inputs or available crawl time alone.

The Start action requires a signed-in account, that account's own four-digit PIN, and an effective Tavily key. Only the configured developer account may use the project Tavily key; other accounts use their saved personal key.

**Why:** The user most recently asked members to configure their own PIN and provider connection rather than sharing the developer's credentials.

**How to apply:** Store each PIN as a salted server-side hash and verify it before reserving Tavily quota. Keep the developer owner email and project API key in server secrets; never expose either in client code or responses.

Anyone may sign in or create an account if the connected Clerk environment permits it. Any signed-in account with its own PIN and Tavily key may crawl; only the configured developer account can use the project Tavily key.

**Why:** The user clarified that members should be able to use their own API key and PIN in a clone or shared deployment.

**How to apply:** Let Clerk control account creation. Enforce account ownership for each saved credential and require the account's own PIN before starting.

No real crawl trial has been completed yet, so a sample briefing is not ready.

**Why:** The user clarified that there is no actual trial evidence to use for a sample.

**How to apply:** Do not present invented or unverified content as a real sample brief. Wait until a real, source-verified trial is available, or label any later mock clearly as fictional.

Keep the README's wording positive and neutral while accurately describing the current prototype.

**Why:** The user asked not to put negative wording in the README.

**How to apply:** Describe current capabilities and setup affirmatively; preserve factual security, billing, and scope details without unnecessary negative phrasing.

The current Briefing Agent preview is the app being developed and will become the live app; there is no separate live app to target.

**Why:** The user clarified that work should be done in the current preview, not in a separate mockup.

**How to apply:** Make requested product UI changes in the existing Briefing Agent artifact and verify them in its preview. Do not treat a separate sandbox mockup as the product.

Keep the authenticated Settings screen high-contrast and easy for older users to read; the user supplied a dark navy and vivid-accent reference for this screen.

**Why:** The user asked for larger, clearer lettering for an older person and provided this visual reference for Settings.

**How to apply:** Keep labels and controls legible on mobile and desktop, and scope this treatment to signed-in Settings unless the user asks to extend it.

Treat SAP connection setup as generic per-clone configuration, not Finolex-specific. A GitHub clone provides code; its authorized owner connects that deployment to its own SAP system in app settings.

**Why:** The user corrected the scope to SAP HANA generally and said a cloned app should connect to its own SAP server.

**How to apply:** Do not hard-code company hosts or credentials. Use released S/4HANA OData business APIs by default; direct HANA SQL access is a separate connection type and is not enabled unless requested.

SAP briefs combine Tavily public research with read-only SAP records in distinct cited sections. Keep the user's Tavily key and SAP credentials separately stored and billed.

**Why:** The user clarified that SAP selection must use Tavily for public research as well as the SAP connection, with automatic fallback to Public when SAP setup is incomplete.

**How to apply:** For SAP briefs, check the active Tavily key and at least one valid SAP area mapping before collecting data; keep source sections and credentials distinct.

Removing the app-managed SAP connection must suppress any legacy server-managed SAP fallback instead of silently reactivating it.

**Why:** The user expects the in-app remove action to disconnect SAP for that deployment, even when an older server-managed configuration remains.

**How to apply:** If a legacy SAP config exists, persist an account-bound encrypted disable marker without retaining provider credentials; expose the suppressed state in settings and allow a new saved configuration to replace it.
