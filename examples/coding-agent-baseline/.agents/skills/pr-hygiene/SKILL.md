---
name: pr-hygiene
description: Check a pull request is small, described, tested, and free of secrets before opening or reviewing it. Use when drafting a PR, reviewing a diff, or verifying a change is ready to share.
license: MIT
---

# PR hygiene

Use this before opening a pull request or when reviewing one.

1. **Scope** — one purpose. Split unrelated refactors into another PR.
2. **Title** — matches the change. Imperative mood (`Add`, `Fix`, `Document`).
3. **Description** — why the change exists, how to verify it, and any follow-ups.
4. **Tests** — name what you ran, or why the change cannot be tested yet.
5. **Secrets** — no API keys, tokens, `.env` files, or credential-looking strings.
6. **Noise** — no generated lockfile churn, editor junk, or unrelated formatting.

If any item fails, fix it before asking for review.
