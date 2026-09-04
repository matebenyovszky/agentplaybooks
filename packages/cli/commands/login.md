---
description: Verify and store an AgentPlaybooks user API key without printing it
argument-hint: "[--url=https://agentplaybooks.ai]"
---

Authenticate the local AgentPlaybooks CLI for account-level operations.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/agentplaybooks.js" login $ARGUMENTS` in
   an interactive terminal. The command reads `AGENTPLAYBOOKS_API_KEY` first or
   prompts securely, verifies the key with the server, then stores it in the
   user's private AgentPlaybooks credential store.
2. Never ask the user to paste the key into chat and never print or inspect the
   credential store.
3. Explain that CLI login enables `playbooks`, `pull`, and `push`. A generated
   MCP connection still reads the named environment variable at agent startup;
   the CLI never copies a secret into an MCP config.
4. After login, run `playbooks --json` to verify account access and report only
   playbook names/identifiers, never credentials.

For a published ChatGPT/Codex account connector, use standards-compliant OAuth
linking rather than distributing a user API key. API-key login remains useful
for local clients, CI, and Hermes Agent.
