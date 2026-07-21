---
title: Share Playbooks Safely — Team Editing Without Sharing API Keys
description: AgentPlaybooks now lets owners invite human editors with secure, one-time links while keeping secrets, API keys, visibility, and deletion owner-only.
date: 2026-07-21
author: Mate Benyovszky
---

# Share Playbooks Safely With Your Team

Playbooks are rarely built in isolation. A useful agent setup combines domain knowledge, a carefully tuned persona, skills, tools, memory, and working documents—often contributed by more than one person.

AgentPlaybooks now supports **human editor collaboration**. An owner can invite a teammate, the teammate accepts with their own account, and the shared playbook appears directly on their dashboard. No shared passwords, no ownership transfer, and no need to treat an agent API key as a human login.

## Why not just share an Admin API key?

API keys are excellent machine credentials, but poor human identities. A bearer key can be copied, forwarded, embedded in a script, or used by several people without a reliable way to tell them apart. Removing one person can also mean rotating a key for every integration using it.

An editor invitation solves a different problem. Access is bound to the authenticated account that accepts the link, is visible to the owner, and can be revoked independently. Playbook API keys remain available for agents and integrations; team membership remains a human access decision.

## A deliberately simple role model

We chose a KISS-friendly model for the first release: every playbook has one **Owner** and collaborators have one role, **Editor**.

Editors can update the material that makes the agent useful:

- name, description, configuration, and tags;
- persona and system instructions;
- skills and skill attachments;
- MCP server definitions;
- canvas documents and memory.

The owner keeps exclusive control over the security boundary:

- visibility and publication;
- invitations and collaborator removal;
- playbook API keys;
- encrypted secrets;
- ownership and deletion.

This avoids a sprawling permission matrix while preventing an editor from escalating their own access or exposing credentials.

## How invitations work

Open a playbook, choose **Sharing**, and create an editor link. The link is shown once, expires after **72 hours**, and can be accepted by only one account. Send it through a trusted private channel.

Under the hood, each invite uses 256 bits of cryptographic randomness. AgentPlaybooks stores only a SHA-256 digest, not the raw token. Acceptance is atomic, so two simultaneous requests cannot successfully reuse the same link. The owner can revoke a pending link or remove an active editor at any time.

After acceptance, the playbook appears on the editor's dashboard with a **Shared** badge. The owner remains the owner throughout the process.

## What this enables

- A developer and domain expert can maintain the same agent instructions.
- A small team can improve skills and MCP integrations without exporting and re-importing files.
- An editor can keep memory and canvas documents current while the owner protects credentials and publication settings.
- Access can be removed without disturbing the API keys used by production agents.

Collaboration is available in the dashboard today. Read the complete [Team Collaboration guide](/docs/team-collaboration), then [open your dashboard](/dashboard) and invite your first editor.
