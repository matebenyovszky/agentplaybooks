---
description: Sync the playbook manifest and platform files across agent tools — plan first, apply on approval
argument-hint: "[path] [--target=claude,cursor,codex]"
---

Synchronize the project's portable agent configuration across tools.

1. Run: `npx --yes @agentplaybooks/cli@0.6.0 sync $ARGUMENTS --json`
2. Summarize the plan: manifest create or update, platform files to be written
   per target, secret references found, and any conflicts. If
   `suggestedTargets` is non-empty, no target is enabled yet — name the agent
   tools that were detected and offer `--target=<their tools>`.
3. Conflicts mean two tools hold different definitions under one name. Report
   them and ask which should win; do not resolve them yourself.
4. Only after the user confirms, run the same command with `--apply` and report
   what was written. Backups land in `.agentplaybooks/backups/`.
