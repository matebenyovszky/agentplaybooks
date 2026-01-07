# Permissions System

This document outlines the permission and visibility system for AgentPlaybooks.

## Visibility Levels

Playbooks now use a `visibility` setting instead of a simple boolean.

- **Private** (`private`): Only the owner and users with valid API keys can access.
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
    - Can manage API keys.
    - Reserved for highly trusted agents or the owner.

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
