# Hermes memory integration

The installable plugin and its user documentation are in
[`agentplaybooks/`](agentplaybooks/README.md). That directory is also the Hermes
catalog's monorepo `subdir`. `pyproject.toml` packages the same implementation for
Hermes's Python entry-point discovery. The AgentPlaybooks CLI bundles these files
at build time so npm and catalog installations use the same provider.
