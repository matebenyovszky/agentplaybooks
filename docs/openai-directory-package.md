# Hosted OpenAI directory package

Build the complete hosted directory package from the repository root:

```bash
node scripts/pack-openai-directory.mjs --output=.tmp/agentplaybooks-openai.zip
```

The package uses shared publisher metadata, a hosted-only playbook skill, and
the account MCP endpoint with OAuth dynamic registration. The packer renders the
brand mark into a 512 px PNG for the directory and a 128 px PNG for the composer.
Both light and dark theme slots point to included assets.
Its package identifier is `agentplaybooks-hosted`, separate from the CLI package
and the earlier unpublished draft whose MCP configuration cannot be changed.
The hosted upload uses `?toolset=directory` so each of the 40 supported
knowledge/document operations is exposed upfront. This enforced allowlist excludes
generic third-party dispatchers, secret handling, discovery and legacy aliases.
Excluded calls, including federated tool names, are rejected before forwarding.
The standard core/full profiles keep their existing bridge functionality.
Existing OpenAI apps cannot change their MCP URL, including query parameters;
the portal also rejects nonempty server headers. A draft created with the compact
endpoint must be recreated before human review. Other clients may select a view
through `X-AgentPlaybooks-Toolset`; an explicit URL `toolset` takes precedence.
Every call still enforces the connected account's permissions.
It includes no local CLI dependency, fixed bearer token, authentication headers
or reviewer credentials. The packer rejects unexpected endpoints and server
settings rather than copying credentials into a public archive.

After producing and verifying a public walkthrough, import its URL with
`--recording-url=https://example.com/review.mp4`. Omit the flag for an initial
draft. The packer accepts HTTPS URLs without embedded credentials.

The initial 0.8.0 draft was uploaded on 2026-10-28. Upload does not mean review
approval or publication. Track actual status in the
[release issue](https://github.com/matebenyovszky/agentplaybooks/issues/245).

For the 0.10.2 update, deploy the server first and verify that the existing
listing's MCP scan picks up **Read skill references**. It accepts one to five
known files or headings from one playbook and returns results in request order,
including item errors and offsets for truncated text. Its REST equivalent is
`POST /api/v1/control/get_skill_references`. Use the existing listing to create
the package draft. Check its icon and starter prompts in the directory preview
and verify the composer icon on a narrow viewport in both themes.

Complete domain verification, OAuth connection, automated findings and reviewer
materials in the portal before submitting. The public domain challenge is in
`src/app/.well-known/openai-apps-challenge/route.ts`; it is an ownership proof, not an
API key. Keep private reviewer credentials out of this repository and ZIP.

The package requests OpenID, email, basic profile and offline access scopes;
it does not request phone access. A reviewer using email-link sign-in can open
the login page, choose **Sign in with an email link**, and use the invited email
address. This sign-in path never creates a new account automatically.

`plugins/openai/review-cases.json` contains the five positive and three negative
review scenarios imported by the package. These are planned scenarios, not a
record of successful execution. The existing `npm run seed:reviewer` script
populates a dedicated reviewer account with the two private `Reviewer demo:`
playbooks, skills and memory used by these cases. Run it only with that account's
API key, then execute the cases against the populated account. Add an accessible
recording URL before review.

This is separate from the [skills-only archive](./openai-skills-directory-zip.md).
Include MCP from the initial upload for a hosted integration; OpenAI currently
does not support adding MCP to an existing skills-only listing.

Sources: [OpenAI packaging and authentication](https://developers.openai.com/plugins/build/plugins),
[submission guide](https://developers.openai.com/plugins/deploy/submission).
