"""Hermes Desktop's native memory-provider settings panel (no runtime imports)."""
from plugins.memory.config_schema import KIND_SECRET, KIND_TEXT, ProviderConfigSchema, ProviderField

CONFIG_SCHEMA = ProviderConfigSchema(
    name="agentplaybooks",
    label="AgentPlaybooks",
    docs_url="https://github.com/matebenyovszky/agentplaybooks/tree/main/packages/hermes-memory",
    fields=(
        ProviderField(key="playbook_guid", label="Private memory playbook GUID", kind=KIND_TEXT,
                      description="Use a separate private playbook for each Hermes profile.", inline=True),
        ProviderField(key="api_key", label="Memory API key", kind=KIND_SECRET,
                      env_key="AGENTPLAYBOOKS_MEMORY_API_KEY", inline=True,
                      description="Playbook-scoped key with memory:read and memory:write permissions."),
        ProviderField(key="base_url", label="Service URL", kind=KIND_TEXT,
                      default="https://agentplaybooks.ai"),
        ProviderField(key="shared_playbooks", label="Shared playbook GUIDs", kind=KIND_TEXT,
                      description="Optional comma-separated read-only sources."),
    ),
)
