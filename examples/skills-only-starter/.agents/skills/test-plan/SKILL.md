---
name: test-plan
description: Turn a code change into a short manual and automated test plan. Use when a feature, fix, or refactor needs verification steps.
license: MIT
---

# Test plan

Given the change, list:

1. **Happy path** — one command or click path that must work.
2. **Regression** — the nearest existing behavior that must still work.
3. **Edge** — empty input, error, or permission failure if the change touches those.
4. **Automated** — which test file to add or extend. If none fits, say so.

Keep it to a short checklist. Do not claim tests passed unless they were run.
