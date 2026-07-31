# Team Collaboration

AgentPlaybooks can support shared editing by treating a Playbook API key as a delegated access grant. Instead of copying a playbook into another account, a user can add a shared playbook to their own dashboard and operate on the original playbook with the role attached to the key.

## Goal

Let teams co-author one playbook while keeping ownership, permissions, and auditability clear:

- **Owner keeps ownership** of the canonical playbook.
- **Collaborators add the playbook to their workspace** using an invite link or API key.
- **Agents and humans use the same RBAC model**: Viewer, Coworker, and Admin.
- **No forced duplication**: edits update the shared playbook, not a stale copy.
- **Revocation is immediate** by rotating or deleting the shared key.

## Current Building Block

Playbook API keys already carry a role:

| Role | Intended collaboration use |
| --- | --- |
| `viewer` | Read-only review, onboarding, or agent context sharing. |
| `coworker` | Day-to-day team editing: memory, skills, persona, canvas, and allowed secret writes. |
| `admin` | Trusted maintainer access: playbook settings, collaborator keys, and operational administration. |

The missing product layer is not a new permission primitive. It is a collaboration UX and persistence model around existing delegated keys.

## Proposed User Experience

### 1. Owner shares a playbook

In the playbook **Integrations** or future **Team** tab, the owner creates an invite:

1. Select role: Viewer, Coworker, or Admin.
2. Optional: add a label such as `Design team` or `Anna`.
3. Optional: set expiry and usage limits.
4. Copy invite link or raw API key.

Recommended default: create a `coworker` invite for editing, not an `admin` invite.

### 2. Collaborator accepts the invite

The collaborator opens an invite URL such as:

```text
https://apbks.com/dashboard/shared/accept?playbook=PLAYBOOK_GUID&token=INVITE_TOKEN
```

After login, AgentPlaybooks stores a reference in the collaborator workspace:

```json
{
  "playbook_id": "canonical-playbook-uuid",
  "user_id": "collaborator-user-uuid",
  "role": "coworker",
  "source": "api_key_invite",
  "display_name": "Marketing Playbook"
}
```

The playbook then appears under a new **Shared with me** section and can be opened like an owned playbook, with disabled controls for actions not allowed by the role.

### 3. Collaborator edits through delegated access

When a collaborator opens a shared playbook, backend routes should authorize the request through one of two mechanisms:

- A stored collaborator grant linked to a hashed invite/API key.
- A short-lived session-scoped access token minted from the accepted grant.

The frontend should not need to keep showing or storing the raw API key after acceptance.

## Data Model Proposal

Add an explicit collaboration table while preserving the existing `api_keys` table as the permission source:

```sql
create table playbook_collaborators (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references playbooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key_id uuid not null references api_keys(id) on delete cascade,
  role text not null check (role in ('viewer', 'coworker', 'admin')),
  display_name text,
  accepted_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (playbook_id, user_id)
);
```

Why keep a separate table?

- It lets the dashboard list shared playbooks without scanning raw keys.
- It supports user-specific display names and last-access timestamps.
- It provides a clean revocation cascade when the underlying API key is deleted.
- It keeps the existing API key authorization model compatible with agents.

## Permission Semantics

A collaborator's effective permission is the minimum of:

1. The role on the accepted key.
2. Any explicit collaborator-level downgrade.
3. The route-level capability being requested.

Suggested route behavior:

| Capability | Viewer | Coworker | Admin |
| --- | --- | --- | --- |
| Read playbook/persona/skills/memory/canvas | Yes | Yes | Yes |
| Create/update memory | No | Yes | Yes |
| Create/update canvas | No | Yes | Yes |
| Create/update skills | No | Yes | Yes |
| Update persona | No | Yes | Yes |
| Update playbook metadata/visibility | No | No | Yes |
| Create/rotate/revoke API keys | No | No | Yes |
| Delete playbook | No | No by default | Owner only by default |

Even for Admin collaborators, deleting the whole playbook should remain owner-only unless a separate `playbook:delete` permission is introduced.

## Security Considerations

- **Raw keys are one-time secrets**: display them once, then store only hashes.
- **Invite links should be redeemable tokens**, not long-lived visible API keys.
- **Admin sharing must be high-friction**: show warnings, require confirmation, and recommend expiry.
- **Secret reveal should stay restricted**: shared collaborators may use/proxy secrets according to role, but plaintext reveal should remain owner-only unless explicitly enabled per secret.
- **Audit events are required** for team use: accepted invite, role changes, writes, rotations, revocations, and failed authorization.
- **Revocation must be centralized**: deleting/rotating the backing key invalidates both agents and human collaborators using that grant.

## MVP Scope

1. Add `playbook_collaborators` table and RLS policies.
2. Add an accept-invite endpoint that binds an invite/API key to the logged-in user.
3. Add **Shared with me** to the dashboard list.
4. Teach playbook dashboard routes to authorize owner OR collaborator grant.
5. Add role-aware UI states so unavailable actions are hidden or disabled.
6. Add basic audit events for invite acceptance and write operations.

## Later Enhancements

- Named team spaces with many playbooks.
- Per-resource permissions, such as `skills:write` without `secrets:write`.
- Review workflow for high-risk changes.
- Presence, comments, and change history.
- Fork-and-merge flows for public templates.
- Organization-owned playbooks with billing and SCIM/SSO.

## Open Questions

- Should Coworker be allowed to edit persona by default, or should persona edits require Admin?
- Should collaborators see the playbook owner's secrets metadata, or only secret aliases exposed to tools?
- Should accepted grants survive API key rotation by being re-bound, or should rotation intentionally force re-invite?
- Do we need optimistic locking or versioning before enabling multi-user skill and canvas editing?
