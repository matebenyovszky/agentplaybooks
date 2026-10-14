---
description: Audit this project's agent configuration — instructions, skills, MCP servers, secrets, and drift between tools
argument-hint: "[path]"
---

Audit the project's agent configuration with the AgentPlaybooks doctor. It
only reads files and never writes.

1. Run: `npx --yes @agentplaybooks/cli@0.6.0 doctor $ARGUMENTS --json`
   (default to the current project root when no path is given).
2. Report the health score and the finding counts by severity.
3. For each finding, show the source file and line where present, and a
   concrete fix. Group findings with the same code.
4. A likely hard-coded credential is reported without its value. Do not open
   the file to look at it; suggest moving it to an environment variable or the
   playbook's secret vault instead.
