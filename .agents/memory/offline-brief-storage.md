---
name: Offline brief storage
description: Privacy and scope rules for local offline brief copies.
---

Only save public-source briefs to browser-local storage after an explicit user action. Keep saved copies scoped to the signed-in account and app path, and provide a way to open and remove them. Do not store SAP records, private-source results, credentials, or API responses in the service-worker cache. Explain that browser-local storage is not encrypted or synced and is best used only on a trusted device.

**Why:** Offline use helps members prepare and read briefs without a connection, but this app can also handle internal and private information.

**How to apply:** Keep searches and source fetching online; allow only explicitly saved public briefings to remain available offline. Preserve source IDs and URLs, and clearly state that opening source links requires internet.
