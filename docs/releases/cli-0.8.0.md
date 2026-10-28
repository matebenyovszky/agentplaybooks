# AgentPlaybooks CLI 0.8.0

The published CLI now includes the audit commands and security fixes that
previously existed only on `main`.

- Export audit evidence as JSONL or CSV with `apb audit export`.
- Verify the per-playbook hash chain with `apb audit verify`.
- Apply an explicitly confirmed retention purge with `apb audit purge`.
- Include the reviewed text-processing fixes in plugin naming, snapshot paths
  and Hermes setup, and the latest bundled Hermes tools instructions.
- Align the portable plugin, Claude/Cursor/Codex manifests, marketplace metadata,
  Claude local server and all pinned CLI commands at 0.8.0.

Install with `npm install -g @agentplaybooks/cli@0.8.0`. Existing configuration
and credentials remain compatible. The Claude plugin's local stdio bridge
continues to connect every server registered through the CLI; it refuses
redirects when forwarding the stored API key.

The accompanying website update explains an empty Dashboard and offers a first
playbook action in English, Hungarian, German and Spanish. The security pack
and its blog translations now describe the shipped account offboarding,
memory/canvas auditing, enforced CSP and authenticated backups.

Publication is verified separately in the versioned distribution issue:
npm provenance, MCP Registry active/latest status, skills and plugin metadata,
and the live or pending state of each externally reviewed store listing.
