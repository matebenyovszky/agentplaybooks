---
description: Check the AgentPlaybooks connection and identify the selected account
---

Use this only on request or after an AgentPlaybooks failure; never poll.

If hosted AgentPlaybooks tools are available, call `get_profile` once to show
which account this connection represents. Use `list_playbooks` only if requested.

If a local CLI is available, run `apb connection check --json` and explain the
stage that failed. HTTP 401 means authentication is required; it does not prove
the service is down. Never show a key or a server error body.

In ChatGPT/Codex cloud, a missing tool catalog is a host connection issue to
investigate, not proof of server failure. Reconnect or add the intended account
in plugin settings, Refresh the connection, then test `get_profile` in a new
conversation. CLI login does not change the host's OAuth connection.
