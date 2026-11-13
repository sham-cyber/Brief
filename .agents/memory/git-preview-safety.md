---
name: GitHub and Preview safety
description: The user requires GitHub and Preview changes to be transparent and non-destructive.
---

Never push, reset, or remove local project code unless the user explicitly authorizes that action. When changing the Preview base, preserve the previous local branch and state the exact base commit and any local-only changes.

**Why:** The user has repeatedly objected to mismatches between workspace Preview and GitHub and asked not to overwrite or lose saved ideas.

**How to apply:** Before branch switches, restores, commits, or pushes, explain the effects on the workspace and remote. Do not push without explicit approval.
