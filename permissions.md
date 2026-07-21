# Permissions System

This document outlines the permission and visibility system for AgentPlaybooks.

## Visibility Levels

Playbooks now use a `visibility` setting instead of a simple boolean.

- **Private** (`private`): Only the owner, accepted human editors, and clients with valid API keys can access.
- **Public** (`public`): Visible to everyone, appears in "Explore" and search results.
- **Unlisted** (`unlisted`): Accessible by anyone who has the link (GUID/ID) but hidden from search and lists.

## Role-Based Access Control (RBAC)

API Keys are now assigned a **Role**, which determines their permissions.

### Roles

1.  **Viewer** (`viewer`)
    - Read-only access to Playbook data (Memories, Skills, Personas).
    - Cannot modify data.
    - Default for new keys.

2.  **Coworker** (`coworker`)
    - Read and Write access.
    - Can list, create, update, and delete memories and skills.
    - Suitable for collaborative agents.

3.  **Admin** (`admin`)
    - Full access to everything.
    - Can modify Playbook settings (name, description, visibility).
    - Has full agent/API access within the playbook permission model.
    - Human-only control-plane actions such as deleting the playbook, managing collaborators, and managing API keys remain owner-only.

## Human Collaboration

- Human access is stored separately in `playbook_collaborators`; an API key is never converted into a user session.
- The MVP has one collaborator role: `editor`.
- Editors can update playbook content, personas, skills, MCP servers, attachments, canvas, and memory.
- Editors cannot access secrets, manage API keys or collaborators, change visibility, or delete the playbook.
- Invitations use a one-time random token, stored only as a SHA-256 hash, and expire after 72 hours.

### Implementation Details

- **Database**:
    - `playbooks` table: `visibility` (enum: public, private, unlisted).
    - `api_keys` table: `role` (text/enum: viewer, coworker, admin).
- **API Headers**:
    - `Authorization: Bearer apb_<key>` used for API access.
    - `validateApiKey` checks the key's role against the requested operation.

## Migration Guide

- Existing public playbooks (`is_public = true`) are migrated to `visibility = 'public'`.
- Existing private playbooks are migrated to `visibility = 'private'`.
- Existing API keys default to `viewer` role unless manually updated.
