---
name: agentplaybooks-cli
description: Audit and synchronize local agent configuration — AGENTS.md / CLAUDE.md instructions, Agent Skills, and MCP server definitions — across Claude Code, Cursor, Codex, Antigravity, Grok Bot, and Hermes with the AgentPlaybooks CLI, and back a project up to or restore it from a hosted playbook. Use only where a terminal with Node.js 20+ is available, such as Claude Code; for working with playbook contents from chat, use the playbooks skill instead.
---

# AgentPlaybooks CLI

The CLI works on files in the user's project and home directory, so it needs a
terminal. Run it through npm with the version pinned, which is the version
this plugin was released and tested with:

```
npx --yes @agentplaybooks/cli@0.10.1 <command>
```

In chat or Cowork, where there is no project directory, use the connected
AgentPlaybooks tools (see the playbooks skill) instead of this CLI.

## Commands

| Command | What it does | Writes? |
|---|---|---|
| `doctor [path] --json` | Health report: inventory, spec violations, likely hard-coded secrets, insecure MCP URLs, drift between tools, a 0–100 score | Never |
| `sync [path] --json` | Plan the canonical `agentplaybook.json` plus the platform files missing from enabled targets | Plan only |
| `sync [path] --target=claude,cursor --apply` | Write those targets, with backups under `.agentplaybooks/backups/` | Yes |
| `playbooks --json` | List the hosted playbooks the stored key can reach | Never |
| `pull <guid> [path] --json` | Plan restoring a hosted playbook into the project | Plan only |
| `push [path] --json` | Plan uploading local instructions, skills, and MCP servers, plus a private versioned backup | Plan only |
| `backups <guid> --json` | List the backups of a hosted playbook | Never |

Every writing command plans first. Run it without `--apply`, show the user the
plan — files created or merged, conflicts, secret references found — and run
it again with `--apply` only after the user agrees.

## Credentials

- `doctor` and `sync` are local and need no account.
- `playbooks`, `pull`, `push`, and `backups` need a stored key. If one is
  missing, the user runs `npx --yes @agentplaybooks/cli@0.10.1 login` in their
  own terminal; it prompts for the key and stores it in the user's private
  credential file. Never ask for the key in chat, and never print, read, or
  copy that file.
- Against a self-hosted server, add `--url=<server base URL>` to `login` and
  to the account commands, or set `AGENTPLAYBOOKS_URL`. A server whose
  certificate comes from a private CA also needs `NODE_EXTRA_CA_CERTS` set to
  that CA's file in the user's terminal.
- Secret values never move. The CLI writes `${VAR}` references, and `doctor`
  reports a credential that is hard-coded in a config file without printing it.

For a new vault credential, prepare a small program that reads it without echo
and uploads directly to the selected playbook, or reuse the reviewed helper in
the [secure input guide](https://agentplaybooks.ai/docs/secure-secret-input).
The user runs it in their own trusted terminal, outside the agent session.
Abort if hidden input is unavailable; verify HTTPS certificates, refuse redirects,
and print no credential, request/response body or raw exception. No values in
chat, agent tool arguments, terminal-input tools, argv, plaintext files or logs.
Confirm the destination and create/rotate choice using metadata; check success
with metadata rather than reveal. Use the vault web UI when no local terminal
is available. An existing password-manager value can instead go through a direct
pipe to `apb secrets push`, after the user reviews its possible rotation behavior.

## Typical requests

- **"Is my agent config healthy?"** → `doctor . --json`, then explain the
  findings by severity with file and line.
- **"Make my Claude skills available in Cursor / Codex"** → `sync --target=<tools>`,
  show the plan, then `--apply`.
- **"Back this project up" / "set this machine up from our playbook"** →
  `push` or `pull <guid>`, plan first.

Full reference: https://agentplaybooks.ai/docs/cli
