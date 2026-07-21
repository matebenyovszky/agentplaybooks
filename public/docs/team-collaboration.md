# Team Collaboration

Playbook owners can invite other signed-in users to edit a playbook without sharing an API key or transferring ownership.

The permission model is intentionally small: one immutable owner and one collaborator role, **Editor**. This keeps everyday collaboration simple while reserving security-sensitive control-plane operations for the owner.

## Share a playbook

1. Open the playbook in the dashboard.
2. Open **Sharing**.
3. Create an invite link and copy it immediately.
4. Send the link to the intended collaborator through a trusted channel.
5. The collaborator opens the link, signs in if necessary, reviews the access summary, and accepts.

The shared playbook then appears on the editor's dashboard with a **Shared** badge.

The link expires after 72 hours, can be accepted once, and is stored only as a SHA-256 hash. The owner can revoke a pending link or remove an editor at any time.

Each playbook can have at most 25 active editors and pending invitations in total. Expired pending invitations are cleaned up when the owner creates a new link.

## Access boundaries

| Capability | Owner | Editor |
| --- | --- | --- |
| View and edit playbook content | Yes | Yes |
| Edit skills, MCP servers, persona, attachments, canvas, and memory | Yes | Yes |
| Change visibility | Yes | No |
| Manage collaborators | Yes | No |
| Manage playbook API keys | Yes | No |
| View or manage secrets | Yes | No |
| Delete the playbook | Yes | No |

Ownership always remains with the original owner.

An editor can also use their own account-level User API Key to automate the content operations that their account is allowed to perform. The same owner-only boundaries still apply. A playbook-scoped API key remains a separate machine credential and does not create collaborator membership.

## Why API keys are not used for people

Playbook API keys are bearer credentials intended for agents and integrations. They are not tied to a human identity and can be copied or forwarded. Collaboration invitations instead bind access to the authenticated account that accepts the one-time link, making access attributable and independently revocable.

## Security properties

- Invite tokens contain 256 bits of cryptographic randomness and are returned only when created.
- Only a SHA-256 digest is stored in the database; the raw link cannot be recovered later.
- Acceptance is atomic, so concurrent attempts cannot reuse the same invitation.
- Pending links expire after 72 hours and can be revoked before acceptance.
- An owner cannot accept their own invite.
- Removing an editor immediately removes membership-based access without rotating agent API keys.
- Secrets, API keys, visibility, sharing, ownership, and deletion remain owner-only even when the editor can change playbook content.

Treat an unexpired invitation link as a temporary credential. Send it privately, revoke it if it reaches the wrong person, and create a replacement.

## Collaboration API

The dashboard uses session-authenticated endpoints. Collaboration management is never authorized with a playbook API key.

| Method | Endpoint | Who | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/playbooks/:id/collaborators` | Owner | List editors and pending or expired invitations |
| `POST` | `/api/playbooks/:id/collaborators` | Owner | Create a one-time invitation |
| `DELETE` | `/api/playbooks/:id/collaborators/:collaboratorId` | Owner | Remove an editor or revoke an invitation |
| `GET` | `/api/collaboration-invites/:token` | Anyone with link | Preview a valid invitation |
| `POST` | `/api/collaboration-invites/:token` | Signed-in recipient | Accept the invitation |

The create response contains `invite_path` once. Build the full URL with your deployment origin and do not log or persist it as ordinary analytics data.

## Revoking access

Open **Sharing**, find the editor or invitation, and choose remove. Removing an active editor does not delete their account or any content they previously contributed; it only ends future membership access. If a person also received a separate playbook or User API Key, revoke that credential separately.

## Troubleshooting

- **Invite unavailable:** the link is invalid, expired, revoked, or already accepted. Ask the owner for a new link.
- **The owner opened their own link:** owners cannot join their own playbook as editors.
- **A removed editor still has agent access:** check whether they hold a separate API key; collaborator removal does not revoke unrelated credentials.
- **A shared playbook is missing:** confirm the invitation was accepted with the intended account, then refresh the dashboard.
