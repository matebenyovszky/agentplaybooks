---
title: Python Examples - Secrets API
---

# Secrets API: Python Examples

Ready-to-use Python code for integrating with the AgentPlaybooks Secrets API. These examples cover the **Proxy** (zero-exposure) pattern, the optional **Reveal** pattern, and full CRUD operations.

## Prerequisites

```bash
pip install requests
```

All examples use the `requests` library. Replace the placeholders:

| Placeholder | Value |
|-------------|-------|
| `YOUR_PLAYBOOK_GUID` | Your playbook's GUID (from the dashboard URL) |
| `YOUR_API_KEY` | Your playbook API key (`apb_live_...`) |
| `BASE_URL` | `https://apbks.com` or your self-hosted domain |

```python
import requests

BASE_URL = "https://apbks.com"
PLAYBOOK_GUID = "YOUR_PLAYBOOK_GUID"
API_KEY = "YOUR_API_KEY"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}
```

---

## 🛡️ Proxy Pattern (Recommended — Zero Exposure)

The proxy pattern lets your agent use secrets **without ever seeing the raw value**. The server decrypts the secret, injects it into your HTTP request as a header, and returns only the response.

### Via REST API (`/proxy`)

```python
def use_secret_proxy(
    secret_name: str,
    target_url: str,
    method: str = "GET",
    header_name: str = "Authorization",
    header_prefix: str = "Bearer ",
    body: dict | None = None,
    extra_headers: dict | None = None,
    timeout_ms: int = 30000,
) -> dict:
    """
    Make an HTTP request with a secret injected server-side.
    The secret value never leaves the server.
    """
    payload = {
        "secret_name": secret_name,
        "url": target_url,
        "method": method,
        "header_name": header_name,
        "header_prefix": header_prefix,
        "timeout_ms": timeout_ms,
    }
    if body:
        payload["body"] = body
    if extra_headers:
        payload["extra_headers"] = extra_headers

    resp = requests.post(
        f"{BASE_URL}/api/playbooks/{PLAYBOOK_GUID}/secrets/proxy",
        headers=HEADERS,
        json=payload,
    )
    resp.raise_for_status()
    return resp.json()


# Example: Call OpenAI API using a stored secret
result = use_secret_proxy(
    secret_name="OPENAI_API_KEY",
    target_url="https://api.openai.com/v1/models",
    method="GET",
)
print(f"Status: {result['status']}")
print(f"Models: {result['body']}")
# The agent NEVER sees the actual API key!
```

### Via MCP (`use_secret` tool)

If your agent connects via MCP, use the `use_secret` tool:

```python
import json

def call_mcp_tool(tool_name: str, arguments: dict) -> dict:
    """Call an MCP tool on the playbook's MCP server."""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
    }
    resp = requests.post(
        f"{BASE_URL}/api/mcp/{PLAYBOOK_GUID}",
        headers=HEADERS,
        json=payload,
    )
    resp.raise_for_status()
    return resp.json()


# Example: Use stored secret to call an external API
result = call_mcp_tool("use_secret", {
    "secret_name": "OPENAI_API_KEY",
    "url": "https://api.openai.com/v1/models",
    "method": "GET",
    "header_name": "Authorization",
    "header_prefix": "Bearer ",
})
# Parse the MCP response
content = json.loads(result["result"]["content"][0]["text"])
print(f"Status: {content['status']}")
print(f"Note: {content['note']}")
# Output: "Request made with secret 'OPENAI_API_KEY' injected as 
#          Authorization header. Secret value was NOT exposed to the agent."
```

---

## 🔓 Reveal Pattern (Optional — Raw Access)

If you explicitly need the raw secret value (e.g., for a local SDK that requires the key directly), you can enable **Reveal** for specific secrets.

> ⚠️ **Security Note:** Reveal must be explicitly enabled per-secret via the `allow_api_key_reveal` flag. By default, all secrets are **Proxy Only**.

### Enable Reveal on a Secret

When creating or updating a secret, set `allow_api_key_reveal` to `true`:

```python
# Create a secret with reveal enabled
requests.post(
    f"{BASE_URL}/api/playbooks/{PLAYBOOK_GUID}/secrets",
    headers=HEADERS,
    json={
        "name": "GITHUB_TOKEN",
        "value": "ghp_xxxxxxxxxxxx",
        "description": "GitHub personal access token",
        "category": "token",
        "allow_api_key_reveal": True,  # ← Enable reveal for API keys
    },
).raise_for_status()
```

### Read the Raw Secret Value

```python
def reveal_secret(secret_name: str) -> str:
    """
    Get the decrypted raw value of a secret.
    Only works if allow_api_key_reveal is True for this secret.
    Returns 403 "Proxy Only" if reveal is not enabled.
    """
    resp = requests.get(
        f"{BASE_URL}/api/playbooks/{PLAYBOOK_GUID}/secrets/reveal/{secret_name}",
        headers=HEADERS,
    )
    if resp.status_code == 403:
        data = resp.json()
        raise PermissionError(
            f"Reveal blocked: {data.get('error', 'Proxy Only mode')}"
        )
    resp.raise_for_status()
    return resp.json()["value"]


# Example
try:
    token = reveal_secret("GITHUB_TOKEN")
    print(f"Token (first 10 chars): {token[:10]}...")
except PermissionError as e:
    print(f"Cannot reveal: {e}")
    print("Use the proxy pattern instead, or enable allow_api_key_reveal.")
```

---

## 📦 Store, Rotate & Delete Secrets

### Store a New Secret

```python
def store_secret(
    name: str,
    value: str,
    description: str = "",
    category: str = "general",
    allow_reveal: bool = False,
    expires_at: str | None = None,
) -> dict:
    """Store a new encrypted secret."""
    payload = {
        "name": name,
        "value": value,
        "description": description,
        "category": category,
        "allow_api_key_reveal": allow_reveal,
    }
    if expires_at:
        payload["expires_at"] = expires_at

    resp = requests.post(
        f"{BASE_URL}/api/playbooks/{PLAYBOOK_GUID}/secrets",
        headers=HEADERS,
        json=payload,
    )
    resp.raise_for_status()
    return resp.json()


# Store an API key (Proxy Only — default & recommended)
store_secret(
    name="STRIPE_SECRET_KEY",
    value="sk_live_xxxxxxxxxxxxx",
    description="Stripe production key",
    category="api_key",
)

# Store a token with reveal enabled and expiration
store_secret(
    name="DEPLOY_TOKEN",
    value="deploy-xxxx",
    description="CI/CD deployment token",
    category="token",
    allow_reveal=True,
    expires_at="2027-01-01T00:00:00Z",
)
```

### Rotate (Update) a Secret

```python
def rotate_secret(name: str, new_value: str, description: str | None = None) -> dict:
    """Replace the value of an existing secret."""
    payload = {"value": new_value}
    if description is not None:
        payload["description"] = description

    resp = requests.put(
        f"{BASE_URL}/api/playbooks/{PLAYBOOK_GUID}/secrets/{name}",
        headers=HEADERS,
        json=payload,
    )
    resp.raise_for_status()
    return resp.json()


rotate_secret("STRIPE_SECRET_KEY", "sk_live_new_key_value")
```

### List Secrets (Metadata Only)

```python
def list_secrets(category: str | None = None) -> list[dict]:
    """List all secrets (metadata only — never returns values)."""
    params = {}
    if category:
        params["category"] = category

    resp = requests.get(
        f"{BASE_URL}/api/playbooks/{PLAYBOOK_GUID}/secrets",
        headers=HEADERS,
        params=params,
    )
    resp.raise_for_status()
    return resp.json()


secrets = list_secrets(category="api_key")
for s in secrets:
    mode = "🔓 Reveal Enabled" if s["allow_api_key_reveal"] else "🛡️ Proxy Only"
    print(f"  {s['name']} [{s['category']}] — {mode}")
    if s["expires_at"]:
        print(f"    Expires: {s['expires_at']}")
```

### Delete a Secret

```python
def delete_secret(name: str) -> bool:
    """Permanently delete a secret."""
    resp = requests.delete(
        f"{BASE_URL}/api/playbooks/{PLAYBOOK_GUID}/secrets/{name}",
        headers=HEADERS,
    )
    resp.raise_for_status()
    return True


delete_secret("DEPLOY_TOKEN")
```

---

## Complete Example: Agent Workflow

A typical agent workflow combining proxy calls with memory:

```python
import requests
import json

BASE_URL = "https://apbks.com"
GUID = "your-playbook-guid"
KEY = "apb_live_your_key"
HEADERS = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}


def agent_workflow():
    """Example: Agent uses stored OpenAI key to summarize text, saves result to memory."""

    # 1. Call OpenAI via proxy (agent never sees the API key)
    result = requests.post(
        f"{BASE_URL}/api/playbooks/{GUID}/secrets/proxy",
        headers=HEADERS,
        json={
            "secret_name": "OPENAI_API_KEY",
            "url": "https://api.openai.com/v1/chat/completions",
            "method": "POST",
            "body": {
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": "Summarize: AI agents need secure credential management."}],
                "max_tokens": 100,
            },
        },
    ).json()

    summary = result["body"]["choices"][0]["message"]["content"]
    print(f"Summary: {summary}")

    # 2. Save the result to playbook memory
    requests.put(
        f"{BASE_URL}/api/playbooks/{GUID}/memory/last_summary",
        headers=HEADERS,
        json={
            "value": {"summary": summary, "source": "openai"},
            "tags": ["summary", "ai"],
            "description": "Latest AI-generated summary",
        },
    ).raise_for_status()

    print("✅ Summary saved to memory!")


if __name__ == "__main__":
    agent_workflow()
```

---

## Security Best Practices

| Practice | Description |
|----------|-------------|
| **Default to Proxy Only** | Never enable `allow_api_key_reveal` unless absolutely necessary |
| **Use scoped API keys** | Create API keys with only `secrets:read` permission for agents that only need proxy access |
| **Set expiration dates** | Use `expires_at` for time-limited credentials |
| **Rotate regularly** | Use `rotate_secret()` to update values without downtime |
| **Monitor usage** | Check `use_count` and `last_used_at` in secret metadata |

## Next Steps

- [API Reference](./api-reference.md) — Full endpoint documentation
- [MCP Integration](./mcp-integration.md) — Connect via Model Context Protocol
- [Self-Hosting](./self-hosting.md) — Deploy on your own infrastructure
