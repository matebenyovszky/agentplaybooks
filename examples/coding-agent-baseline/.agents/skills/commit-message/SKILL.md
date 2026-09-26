---
name: commit-message
description: Write a conventional, imperative git commit message from the staged diff. Use when committing, amending, or rewriting a commit message.
license: MIT
---

# Commit messages

Write commit messages from the staged diff, not from chat history.

- Subject: imperative, ~50 characters, no trailing period (`Add doctor starters`).
- Optional `type:` prefix when the repo already uses Conventional Commits (`fix:`, `docs:`, `feat:`).
- Body (when needed): why the change exists, not a file list.
- One logical change per commit. Do not mention that an AI wrote it unless the project asks for that.

Never put tokens, keys, or passwords in a commit message.
