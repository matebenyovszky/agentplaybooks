---
title: Secrets Vault - Zero-Exposure Credential Management for AI Agents
description: AgentPlaybooks introduces an encrypted secrets vault with a unique proxy pattern that lets AI agents use API keys and credentials without ever seeing the plaintext values.
date: 2026-03-22
author: Mate Benyovszky
---

# Secrets Vault: Zero-Exposure Credential Management

We're excited to introduce **Secrets Vault** for AgentPlaybooks—a secure way for AI agents to call external APIs with real credentials, without those credentials ever appearing in prompts, logs, or agent-visible tool output. It is built for teams who want automation without trading away key hygiene.

## 🔑 The Problem: Credentials in the Agent Loop

Agents need **API keys and tokens** to reach LLM APIs, payment systems, webhooks, and more. Whenever a secret lands in the model's context, the risk rises: **logs**, **transcripts**, **context dumps**, or **memory** can expose it. You want agents to *act* with real credentials—not to *see* them.

## 🛡️ Our Solution: The Zero-Exposure Proxy Pattern

Secrets Vault solves this with a **proxy pattern** built around the `use_secret` tool.

The agent never reads the secret. It asks the server to **use** a named secret—for example: *"Use my `OPENAI_API_KEY` to call this URL."* The server decrypts inside the trusted boundary, injects the header (e.g. `Authorization: Bearer …`), and returns **only the HTTP response**. Plaintext never reaches the model.

## ⚙️ How It Works (Technical)

Defense in depth: **AES-256-GCM** with per-encrypt random IVs; **HKDF-derived per-user keys** so ciphertext is isolated by identity; **no plaintext at rest**. The **`use_secret`** path is agent → decrypt server-side → inject header → HTTP out → **response only** back. **SSRF rules** block private/internal targets. **Row Level Security (RLS)** restricts rows so playbook owners only see their own secrets—enforced in the database, not only in app code.

## Available MCP Tools

| Tool | What It Does |
|------|----------------|
| `list_secrets` | Lists secret **names and metadata** only—never values. |
| `use_secret` | Performs an HTTP request with a secret injected server-side; returns the remote response. |
| `store_secret` | Encrypts and stores a new secret. |
| `rotate_secret` | Replaces an existing secret with a new value. |
| `delete_secret` | Permanently removes a secret. |

Scoped permissions (`secrets:read` / `secrets:write`) keep integrations least-privilege.

## Example: Calling an API with `use_secret`

Example MCP `tools/call` payload (shape varies by client):

```json
{
  "name": "use_secret",
  "arguments": {
    "secret_name": "OPENAI_API_KEY",
    "url": "https://api.openai.com/v1/models",
    "method": "GET",
    "header_name": "Authorization",
    "header_prefix": "Bearer "
  }
}
```

The model sees the upstream JSON or error—**never** the token. Same pattern for any header-auth HTTPS API you have stored by name.

## Dashboard Management

In the dashboard, **Secrets** supports **create**, **metadata-only** viewing, **rotate**, and **delete**, with **categories** and **expiration** tracking—without showing raw values after you save.

## Getting Started

1. Add named secrets in the dashboard (`OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, etc.).
2. Point your MCP client at the playbook endpoint and confirm the secrets tools appear.
3. Use **`use_secret`** for outbound authenticated calls—never surface secret values in chat.

---

[Open a Playbook](/dashboard), store secrets once, and let agents integrate with external APIs—without the keys ever entering the model.
