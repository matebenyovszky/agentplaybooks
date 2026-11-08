# CLI and plugin 0.10.1

Adding or rotating a vault credential now has a documented path that keeps the
value out of agent chat and tool arguments. The CLI skill bundles reviewed
Python and PowerShell helpers: users run them in their own terminals, enter the
playbook key and value with hidden input, and upload directly over verified
HTTPS. Both helpers refuse redirects, suppress sensitive diagnostics and require
an explicit choice to rotate an existing secret. Agent instructions for Codex,
Claude and Hermes point to the same workflow and vault web UI alternative.

The web secret editor now keeps edits when the backdrop is clicked or a text
selection ends outside the modal. Explicit cancellation asks before discarding
changes, and closing is disabled during a save. Create fields follow name /
identifier, description, type, value and expiry; the modal scrolls in short
viewports.

Validation covers React dismissal/save behavior, offline Python transport/input
checks, PowerShell 7 and Windows PowerShell 5.1 checks, and inclusion of both
helpers in installable skill packages. The new guide explains transcript,
runtime-memory and logging boundaries; hidden input is not protection against
a compromised machine or a server recording request bodies.

Guide: https://agentplaybooks.ai/docs/secure-secret-input
