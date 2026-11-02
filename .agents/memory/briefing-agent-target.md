---
name: Existing briefing app
description: Identifies the app to extend and the intended research method.
---

The user means the existing Briefing Agent in this workspace when referring to the briefing bot; they are not referring to a separate Replit bot. The app should let a user choose Company or Person, enter a meeting time and optional stated priorities, then manually crawl relevant sources for the rolling 30 days ending at generation time. Company briefs are public-only. Person briefs offer Chairman / CEO, MP, or Corporate context, plus separate Public and Private source modes. Private mode is limited to an explicitly authorized Gmail/shared mailbox and WhatsApp Business account; personal WhatsApp history is excluded. The user chose both OAuth and user-owned provider credentials where supported, not developer/workspace credentials; provider charges should go to each user's own provider account. Keep private mode blocked until per-user access and secure credential handling are implemented. Gmail is a content source only; there is no inbox trigger or email delivery. Company briefs should include sourced share-price, material savings, profit/loss, and risks/mitigations where available. Person briefs should include only financial outcomes reliably attributable to the person or a clearly identified public role. The user wants category filters and read-aloud plus spoken Q&A. Do not connect or integrate AI until the user explicitly instructs; future AI credentials belong to each app user, not the workspace. AI must stay unavailable by default behind a server-side switch; each signed-in user gets a separate activation passcode, with no phone number used as a password or SMS OTP. The user chose one AI request total per briefing. Do not enable provider calls until per-user credential handling and an AI route exist. Browser-native speech is acceptable for now. Video sources should appear in a playable inline box with citations; on mobile it should be a landscape rectangle 1.5 inches wide by 1 inch high. Keep the brief to five blocks—News, Hires, Launches, Financial Facts, and Risks & Open Questions—and cap the combined spoken brief at two minutes, with word/character and cost estimates before any future AI speech.

**Why:** The user clarified the 30-day crawler brief, Company/Person differences, role choices, private sources, user-owned connection methods and provider billing, voice/Q&A features, AI activation controls, and cost limits; they distinguished Gmail as an on-demand source from email automation.

**How to apply:** Extend the existing Briefing Agent as a user-triggered web app. Meeting time is context only; the user must press the crawl button. Prioritize stated meeting context; do not infer private motives or finances or make investment recommendations. Each block should have a repeat action using browser-native speech for now. Crawling is capped at 2 minutes and never continuous. Keep Company briefs public-only. Do not read private accounts until the source owner or authorized delegate grants access and each user's data is isolated. Do not connect workspace credentials after the user declines; user-owned provider credentials may be supported only through secure per-user handling. Exclude personal WhatsApp history and personal/family health records. Keep AI calls blocked until the user-owned provider path exists and the server switch is explicitly enabled; require each signed-in user’s activation passcode and enforce one AI request per briefing. If AI speech/Q&A is explicitly authorized later, use the app user's credentials, keep the separate spoken-brief cap at 2 minutes, and show word/character and cost estimates first.

The optional meeting-context note should prioritize matching public results (for example, “new cable plant”) without changing the 30-day window or selected categories.

**Why:** The user confirmed that meeting context should guide which collected results appear first.

**How to apply:** Use context for local relevance ranking; do not append raw free-text context to third-party search queries unless the user is clearly informed and consents.

When the user enters a direct public question (for example, “market condition” for Finolex Cables), the brief should give a concise source-based answer with clickable citations; if no report directly matches, say so rather than guessing.

**Why:** The user expects a CEO’s question to receive an answer with a source link.

**How to apply:** Build the answer from recent collected source titles/excerpts, attach the original links, and do not imply AI-generated synthesis while AI remains disabled.

For print, use a compact one-page A4 summary with the overview, one sourced leading item per selected category, an open question, and citation links; keep the complete multi-item source view on screen.

**Why:** The user explicitly requires the printed briefing to fit on one page.

**How to apply:** Preserve a concise print-only layout instead of shrinking or clipping the full interactive research view.
