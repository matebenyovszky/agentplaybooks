# Security policy

AgentPlaybooks takes reports of security issues in this repository, the published
`@agentplaybooks/cli` package, the Python packages in `packages/`, and the
self-host Docker image (`Dockerfile`) seriously.

This file is the public vulnerability-handling policy (NIS2 Art. 21(2)(e);
CRA Annex I vulnerability handling; Hungarian Kiberbiztonsági tv. supplier
expectations). **Legal interpretations are marked *jogi ellenőrzés szükséges*
and are not legal advice.**

For operator incident response, 24h / 72h / 1-month reporting support, and
CRA Art. 14 manufacturer reporting, see
[`docs/security/incident-runbook.md`](docs/security/incident-runbook.md)
([Hungarian](docs/security/incident-runbook.hu.md)).
For SBOMs, npm provenance, and `cosign verify`, see
[`docs/security/supply-chain.md`](docs/security/supply-chain.md).

## Supported versions

We issue security fixes for the versions below. Older releases receive
best-effort advice to upgrade; we do not maintain long-term patch branches
unless a supported customer contract says otherwise.

| Component | Supported | Notes |
| --- | --- | --- |
| `@agentplaybooks/cli` | Latest `cli-v*` tag published to npm | Matches `packages/cli/package.json` |
| Hosted application | Current production on `main` | [agentplaybooks.ai](https://agentplaybooks.ai) |
| Self-hosted application | Latest `main` and the source of the latest `cli-v*` tag | Built from this repository (`Dockerfile`, Cloudflare Worker) |
| `agentplaybooks-secrets` (Python) | Latest `packages/python-secrets` on `main` | |
| `agentplaybooks-hermes-memory` (Python) | Latest `packages/hermes-memory` on `main` | |
| Container image | Image built from a supported source revision | This repository does not currently publish a signed registry image; a CycloneDX image SBOM is attached to `cli-v*` GitHub Releases |

Please upgrade before opening a vulnerability report against an unsupported
revision, unless the issue is still present on a supported version.

## How to report a vulnerability

**Do not file a public GitHub issue, discussion, or pull request for a
vulnerability.** Do not post exploit details on social media before a fix is
available.

The only security contact is GitHub private vulnerability reporting:

**[Report a vulnerability](https://github.com/matebenyovszky/agentplaybooks/security/advisories/new)**

That opens a draft [GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/about-repository-security-advisories)
visible only to maintainers until we publish it. There is no security email.

### What to include

- Affected component and version (`cli-v*`, git SHA, npm version, self-host
  image digest, or Python package version)
- Description of the issue and a proof of concept that does **not** destroy
  data or access third-party systems
- Impact (confidentiality of the secrets vault, integrity of playbooks,
  availability, privilege escalation, supply-chain)
- Whether you believe it is being **actively exploited**
- How you would like to be credited

We do not need customer personal data, live credentials, or a full database
dump.

## Response timelines

These are maintainer targets for this project, not statutory filing deadlines.
Statutory 24h / 72h / 1-month clocks belong to the **customer as reporting
entity** (see the [incident runbook](docs/security/incident-runbook.md)).
*jogi ellenőrzés szükséges*

| Step | Target |
| --- | --- |
| Acknowledge receipt | 2 business days (24 hours when the report says active exploitation or a secrets-vault compromise) |
| Initial triage and severity | 5 business days |
| Status update | At least every 14 days until a fix or a wontfix decision |
| Fix available (Critical, including active exploitation) | 7 days after triage, or sooner if a customer incident is open |
| Fix available (High) | 30 days after triage |
| Fix available (Medium) | 90 days after triage |
| Fix available (Low) | Next regular release |

If we cannot meet a target we will say so on the private advisory and give a
revised date.

## Coordinated disclosure

Default embargo is **90 days** from our acknowledgement, aligned with common
coordinated-vulnerability-disclosure practice. We may shorten it when:

- we have evidence of active exploitation;
- a customer incident requires operators to act;
- the issue is already public.

We may extend it by mutual agreement if a complete fix needs more time and
there is no evidence of exploitation.

Please do not publish exploit code, secrets, or customer-identifying details.
A short high-level description after the embargo (or after we publish the
advisory) is welcome.

We credit reporters in the advisory unless they ask otherwise.

## CVE handling

- We track issues as GitHub Security Advisories (GHSA).
- For qualifying issues we **request a CVE through GitHub** (GitHub is a CNA).
  We do not mint CVE IDs ourselves.
- The advisory lists affected versions, patched versions, and the SBOM /
  release tag that contains the fix.
- We do not reuse a CVE for a different root cause.
- If a dependency CVE (npm, Python, base image) affects us, we document the
  downstream impact in the advisory or in the release notes rather than
  requesting a duplicate CVE for our wrapper unless we introduced additional
  exposure.

*jogi ellenőrzés szükséges:* whether a given issue is also a reportable
incident under NIS2 Art. 23, 418/2024. (XII. 23.) Korm. r. 77. §, or a CRA
Art. 14 actively exploited vulnerability / severe incident is a legal and IBF
decision, not something this policy decides.

## Supply chain

Every `cli-v*` tag:

- publishes `@agentplaybooks/cli` to npm with **trusted publishing and
  provenance** (unchanged; see `.github/workflows/publish-cli.yml`);
- generates CycloneDX 1.6 SBOMs for the npm lockfiles, Python packages, and
  (on the tag) the container image, and attaches them to the GitHub Release;
- keyless-signs those SBOM files with **cosign** via GitHub OIDC.

PRs generate unsigned SBOMs as CI artifacts; signing runs **only on tags**.

Verify a release SBOM (replace the tag and filename):

```bash
# Download sbom-npm.cdx.json and sbom-npm.cdx.json.sigstore.json from the GitHub Release
cosign verify-blob sbom-npm.cdx.json \
  --bundle sbom-npm.cdx.json.sigstore.json \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp \
  '^https://github.com/matebenyovszky/agentplaybooks/\.github/workflows/sbom\.yml@refs/tags/cli-v.+$'
```

Full commands, npm provenance checks, and the image-SBOM path are in
[`docs/security/supply-chain.md`](docs/security/supply-chain.md).

## Out of scope (as product bugs)

Please use public issues for:

- bugs that do not affect confidentiality, integrity, or availability;
- feature requests;
- documentation typos;
- dependency updates with no demonstrated impact on this project.

Self-hosted operators remain responsible for their identity provider, network,
backups, and the statutory incident filing to NBSZ NKI (or their competent
authority). We help assemble evidence; we do not file that report for them.
*jogi ellenőrzés szükséges*
