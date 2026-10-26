# Selective skill context

Skill discovery previously selected every SKILL.md body, and `get_skill`
selected every attachment body. A question about one reference therefore
loaded an entire package. Metadata-first queries now avoid fetching those
columns from PostgREST in the first place.

- `list_skills` and the legacy Skills resource return metadata. Full main
  documents require `include_content=true` on the tool.
- `get_skill` returns SKILL.md plus attachment metadata. Use
  `include_content=false` for only the manifest, or `include_attachments=true`
  for the previous full export.
- `get_skill_reference` reads one file, including SKILL.md, with optional ATX
  heading selection and a resumable character budget (12,000 by default,
  maximum 32,000). It does not fall back to all files when a selector fails.
- Account `get_playbook` returns skill metadata, memory summaries without
  values, and connected-server metadata without transport configuration.
  `include_content=true` restores the earlier complete nested records.
  Persona and project fields remain unchanged.

The canonical tool catalog projects these operations into account MCP,
playbook MCP, stdio and OpenAPI. Existing REST exports / CLI backups retain
their full-package semantics. Clients must refresh tool definitions to see
new arguments and the new reference tool.

## Size evidence

Read-only SQL measured two representative skill packages without sending any
document or script bodies into the agent context. SKILL.md plus attachments
contained 107,976 and 24,613 characters. Comparing serialized JSONB skill
definitions from the same rows:

| Payload | Previous full files | Attachment manifest |
| --- | ---: | ---: |
| Package A | 116,965 bytes | 15,538 bytes |
| Package B | 26,888 bytes | 3,414 bytes |
| Combined | 143,853 bytes | 18,952 bytes |

This is an approximately 86.8% reduction in these definition payloads, not
measured token billing, network latency, CPU usage or universal task savings.
The model can request less again by reading only a section. MCP text and
structured result envelopes add their own overhead.

## Access boundaries and verification

The new tool uses the existing `skills:read` gate. It resolves the parent skill
inside the authorized playbook before selecting a file. The legacy attachment
resource path now performs the same parent ownership check; knowing another
playbook's skill and attachment IDs does not grant access to them.

Regression coverage exercises metadata defaults, explicit full exports,
manifest-only reads, bounded sections, fenced headings, Unicode continuation,
invalid selectors/budgets, cross-playbook denial through both tools and legacy
resources, and the private scoped-key gate. TypeScript, targeted lint and docs
checks are run separately; the existing CI suite runs before merge.

## Follow-ups

- Skills have `created_at`, not a revision that covers every skill and file
  write. Add a reliable revision before content caching, with fresh permission
  checks and immediate visibility/revocation handling. No private content cache
  is introduced here.
- `skills/list` in the MCP Skills extension still builds file bundles to
  calculate their manifests. Its cached representation needs the same revision
  prerequisite; it is distinct from the now-small `list_skills` tool.
- The CLI already preserves remote config alongside its own agentplaybook
  entry. Do not replace that merge with a wholesale config write.
- A discovered server tool may be absent from a client's fixed callable
  manifest. This session exposed that distinction for memory writes. Server
  support already exists; validate plugin/client manifest refresh and coverage
  before claiming the client can invoke it.
- Upload-limit preflight, additional file types, task-scoped context assembly,
  and cache/retry/success instrumentation remain separate work items in the
  roadmap.
