# Hosted OpenAI directory package

Build the complete hosted directory package from the repository root:

```bash
node scripts/pack-openai-directory.mjs --output=.tmp/agentplaybooks-openai.zip
```

The package uses shared release metadata and the website's logo, a hosted-only
playbook skill, and the account MCP endpoint with OAuth dynamic registration.
It includes no local CLI dependency, fixed bearer token, authentication headers
or reviewer credentials. The packer rejects unexpected endpoints and server
settings rather than copying credentials into a public archive.

The initial 0.8.0 draft was uploaded on 2026-10-28. Upload does not mean review
approval or publication. Track actual status in the
[release issue](https://github.com/matebenyovszky/agentplaybooks/issues/243).

Complete domain verification, OAuth connection, automated findings and reviewer
materials in the portal before submitting. The public domain challenge is in
`public/.well-known/openai-apps-challenge`; it is an ownership proof, not an
API key. Keep private reviewer credentials out of this repository and ZIP.

`plugins/openai/review-cases.json` contains the five positive and three negative
review scenarios imported by the package. These are planned scenarios, not a
record of successful execution. Seed a dedicated reviewer account with the
private `AgentPlaybooks Review Demo` playbook, a `release-checklist` skill and
the `demo/release-policy` memory entry described by those cases, then execute
the cases against that account. Add an accessible recording URL before review.

This is separate from the [skills-only archive](./openai-skills-directory-zip.md).
Include MCP from the initial upload for a hosted integration; OpenAI currently
does not support adding MCP to an existing skills-only listing.

Sources: [OpenAI packaging and authentication](https://developers.openai.com/plugins/build/plugins),
[submission guide](https://developers.openai.com/plugins/deploy/submission).
