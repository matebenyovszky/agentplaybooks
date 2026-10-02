# Proposals

Let people and agents suggest changes to a playbook without giving them write
access. A **proposal** is a skill change or a memory entry that waits for the
playbook's owner or an editor. Nothing is written until someone approves it.

Typical uses:

- A team's agents propose generalised lessons ("join EKR lots on the procedure
  id and the lot number") to a shared knowledge playbook, and a curator decides
  what becomes shared.
- Colleagues propose improvements to an organisation's skills, and the skill's
  maintainer reviews them.

## Who can do what

| | Submit | Read and decide |
|---|---|---|
| Playbook API key with the **Proposer** role (`proposals:write`) | ✅ | ❌ — not even its own proposals |
| Owner or editor (dashboard session, or a user API key) | ✅ | ✅ |
| Any other key or account | ❌ | ❌ |

Approving is a person's decision. Playbook API keys never approve, so an agent
holding a key cannot approve its own proposal.

## Submit

Create a key in the playbook's **Integrations** tab with the **Proposer** role.
Then:

```bash
curl -X POST https://agentplaybooks.ai/api/playbooks/GUID/proposals \
  -H "X-API-Key: apb_..." -H "Content-Type: application/json" \
  -d '{
        "kind": "memory",
        "payload": { "key": "lesson/ekr-natural-key",
                     "value": { "text": "Join EKR lots on (eljarasAzonosito, reszSzama)." },
                     "summary": "EKR natural key", "tier": "longterm", "tags": ["ekr"] },
        "rationale": "Found while reconciling lot-level contract values"
      }'
```

A skill proposal carries the whole skill:

```json
{ "kind": "skill",
  "payload": { "name": "ekr-data-gathering", "description": "…", "content": "# …" },
  "rationale": "Adds the date-array pitfall" }
```

The response is `{ "id", "status": "pending", "created_at" }`. A playbook holds
at most 500 pending proposals; after that, submissions get `429` until someone
reviews.

## Review

Proposals appear in the playbook's **Proposals** tab, for the owner and editors.
The tab shows the current version next to the proposed one. Approve or reject,
with an optional note.

- **Approving a skill** updates the skill of that name, or creates it. The
  previous text stays in the skill's version history, so the change can be
  rolled back.
- **Approving a memory** writes that key. The previous value stays in the
  memory history, and the entry records `metadata.source = "proposal"`.
- Two reviewers cannot apply the same proposal twice. If applying fails, the
  proposal goes back to pending.

Each submission and decision is recorded in the playbook's audit log
(`proposal.submit`, `proposal.approve`, `proposal.reject`). The log keeps the
kind and target (the skill name or memory key), never the proposed content.

### API

| Method | Path | Who |
|---|---|---|
| `POST` | `/api/playbooks/:guid/proposals` | `proposals:write` |
| `GET` | `/api/playbooks/:guid/proposals?status=pending\|approved\|rejected\|all` | owner, editor |
| `GET` | `/api/playbooks/:guid/proposals/:id` | owner, editor; includes `current` |
| `PATCH` | `/api/playbooks/:guid/proposals/:id` `{ "decision": "approve"\|"reject", "note" }` | owner, editor |

With a user API key, reading needs `playbooks:read`. Deciding needs
`skills:write` or `memory:write`, depending on the proposal's kind, the same as
writing directly.
