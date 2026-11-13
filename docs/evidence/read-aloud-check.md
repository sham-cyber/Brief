# Browser PDF read-aloud evidence

## Included PDF inputs

- `finolex-deepak-brief-2026-11-03.pdf` — two pages and 457 selectable words. This is a Deepak / Finolex Cables all-topics brief dated 3 Nov 2026, not the DKC Hires-only brief.
- `tavily-brief-2026-11-11-1940-IST.pdf` — one-page Tavily.com brief.
- `tavily-brief-2026-11-11-1955-IST.pdf` — one-page Tavily.com brief.

The PDFs are saved as test inputs so a signed-in user can select them in the app's **Read a saved PDF aloud** panel.

## What was checked

- PDF.js extracted selectable text from all three PDFs. The Finolex test input contains 457 words; the reader speaks at most its first 280 words.
- The application component uses the browser's `speechSynthesis` API and provides Read, Pause/Resume, and Stop controls. It processes the selected file in the browser, without uploading it to the app server or calling Tavily or Qwen.
- The API log for 13 Nov 2026 records a `POST /api/briefings` response with HTTP 200 in approximately 20.1 seconds. This is evidence of a successful briefing API request only.

## Playback and recording limits

Browser speech playback is client-side and is not written to API logs. The checked logs do not prove that a person heard the audio, and the browser feature does not save an audio file. A separate device/system-audio recording is required if a downloadable sound recording is needed.

The current browser preview was not signed in for an end-to-end playback check. Therefore this record does not claim that live audio playback was manually heard or recorded in that preview session.
