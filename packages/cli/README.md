# AgentPlaybooks CLI

Local-first CLI for auditing and synchronizing portable agent configuration.

```bash
node ./bin/agentplaybooks.js doctor ../my-project
node ./bin/agentplaybooks.js doctor ../my-project --json
node ./bin/agentplaybooks.js doctor ../my-project --strict

node ./bin/agentplaybooks.js sync ../my-project
node ./bin/agentplaybooks.js sync ../my-project --apply
```

`doctor` does not write files or use the network. `sync` is plan-only unless
`--apply` is supplied. The alpha release only creates the canonical local
`agentplaybook.json`; platform adapters and authenticated remote sync follow.
