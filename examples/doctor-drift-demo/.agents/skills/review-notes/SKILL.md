---
name: review-notes
description: Write a focused code review covering correctness, tests, and follow-ups. Use when reviewing a diff or summarizing review comments.
license: MIT
---

# Review notes

Read the diff and the `references/checklist.md` file in this skill, then write
review notes the author can act on.

- Lead with blocking issues, then suggestions, then nits.
- Cite files and symbols, not line numbers that will drift.
- Ask for tests when behavior changed and none were added.
- Do not request unrelated refactors.

Keep the tone specific and kind.
