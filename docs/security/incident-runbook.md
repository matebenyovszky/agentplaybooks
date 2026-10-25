# Incident response runbook

English. Hungarian: [incident-runbook.hu.md](./incident-runbook.hu.md).
Vulnerability reporting for this repository: [SECURITY.md](../../SECURITY.md).
SBOMs and `cosign verify`: [supply-chain.md](./supply-chain.md).

> **jogi ellenőrzés szükséges.** Every legal interpretation in this runbook
> (who must file, to which authority, whether an event is a “significant
> incident”, whether AgentPlaybooks is a CRA manufacturer, GDPR roles) is a
> first-reading of public sources, not legal advice. A lawyer and the
> customer’s IBF (információbiztonságért felelős személy) must approve the
> live process.

## Purpose and who files

This runbook has two jobs:

1. Help a **customer** (the operator of a hosted or self-hosted
   AgentPlaybooks instance — for example a Hungarian public body) assemble
   the evidence package for statutory incident reporting.
2. Tell **AgentPlaybooks maintainers** how we support that customer and how
   we handle product vulnerabilities, including CRA Art. 14 if we are a
   manufacturer.

**The customer is the reporting entity.** Under NIS2 Art. 23 and 418/2024.
(XII. 23.) Korm. rendelet 77. §, the organisation that operates the
electronic information system files with its competent authority. For
Hungarian **state and municipal bodies** that is typically **NBSZ NKI**
(incidens.nki.gov.hu; if the portal is down, NKI publishes a fallback such
as csirt@nki.gov.hu). *jogi ellenőrzés szükséges*

We are the **supplier**. We do not submit the NKI / NIS2 filing in the
customer’s name. We provide logs, SBOMs, fixed versions, and a filled-in
data package the customer’s IBF can paste into the portal.

**CRA (EU) 2024/2847 Art. 14** is different: if AgentPlaybooks is the
**manufacturer** of a product with digital elements placed on the market in
the course of a commercial activity, *we* notify actively exploited
vulnerabilities and severe incidents affecting product security to the
coordinator CSIRT and ENISA via the Single Reporting Platform. Open-source
made available for free may fall under a different regime; a paid pilot or
support contract may make us a manufacturer. Art. 14 reporting has applied
since 11 September 2026. *jogi ellenőrzés szükséges*

GDPR Art. 33 (72-hour personal-data breach to the supervisory authority) is
the **controller’s** duty. On a self-hosted instance we are generally not
the processor. *jogi ellenőrzés szükséges*

## Roles

| Role | Who | Does |
| --- | --- | --- |
| Customer IBF | Customer’s information-security officer | Decides reportability, files to NKI / the competent authority, owns statutory clocks |
| Customer incident lead | Named on-call on the customer side | Detection, containment on *their* infrastructure, evidence preservation |
| Customer legal / DPO | Customer | NIS2 / Kiberbiztonsági tv. / GDPR classification. *jogi ellenőrzés szükséges* |
| Supplier PSIRT | AgentPlaybooks maintainer (see [SECURITY.md](../../SECURITY.md)) | Product triage, patches, CVE/GHSA, CRA Art. 14 if we are manufacturer, SBOM of the fixed release |
| Supplier engineer | Whoever ships the fix | Reproduce, patch, cut a `cli-v*` tag, do not leak secrets into git or tickets |
| Auditor (once shipped) | Customer-designated read-only role | Reads `audit_logs`; today only the playbook **owner** (session or user API key with `playbooks:read`) can read the trail |

<!-- TODO(mate): name the supplier PSIRT owner and on-call rotation. -->

## Detection

Treat any of the following as a candidate incident. Detection does not by
itself start the 24-hour statutory clock; **awareness by the reporting
entity** does. *jogi ellenőrzés szükséges*

| Source | What to look for |
| --- | --- |
| `audit_logs` | Burst of `denied` / `error` on `secret.use`, `secret.*` reveals, unexpected `actor_type`, new destination hosts |
| Customer IdP / WAF / host logs | Impossible travel, mTLS failures, mass 401/403 on `/api/*` |
| Dependabot, `npm run audit:production`, CodeQL | Exploitable dependency or first-party finding in production |
| [SECURITY.md](../../SECURITY.md) report | Researcher or customer report, especially “actively exploited” |
| Backup / integrity checks | Schema or vault ciphertext that does not match the last known good |
| Human | Lost laptop, leaked `SECRETS_ENCRYPTION_KEY`, leaked service-role key |

## Triage

1. **Is it our product, the customer’s deployment, or a third party?**
   Vault crypto lives in this repo; SSO/MFA, network, and Postgres hosting
   are the customer’s (or Supabase’s) unless we operate the hosted SaaS
   tenant.
2. **Preserve evidence** before rotating keys that would make logs
   unverifiable. Rotation still happens quickly; snapshot first.
3. **Assign severity** (table below). The customer IBF maps that onto
   “significant incident” / “nagykiterjedésű” for the authority.
   *jogi ellenőrzés szükséges*
4. **Actively exploited?** If yes, open the CRA Art. 14 track in parallel
   (supplier) *and* the NIS2 / 77. § track (customer).
5. **Personal data?** If yes, the customer DPO considers GDPR Art. 33.
   *jogi ellenőrzés szükséges*

### Severity (product / operational)

| Severity | Examples | Supplier fix target ([SECURITY.md](../../SECURITY.md)) |
| --- | --- | --- |
| Critical | Secrets vault key leak; remote unauthenticated read of secret values; active exploitation | 24h ack, fix in 7 days |
| High | Auth bypass to another tenant’s playbooks; privilege escalation to service role | 2 business days ack, 30-day fix |
| Medium | Authenticated audit-log injection; CSRF on a state-changing route | 90-day fix |
| Low | Info leak of non-secret metadata; hardening gap | Next regular release |

Statutory **reportability** is not the same as this table. A Medium product
bug can still be a reportable incident at the customer if it degraded a
service they declared as an EIR. *jogi ellenőrzés szükséges*

## Evidence collection

Do **not** copy secret values, `SECRETS_ENCRYPTION_KEY`, service-role keys,
or full request URLs with query strings into tickets or the NKI package.
`audit_logs` is metadata-only by design (`src/app/api/_shared/audit.ts`):
operation, target **host**, status, actor type/id prefix, secret **name**,
request id, timestamps.

### `audit_logs` today

Owner session or a **user** API key with `playbooks:read` (not a playbook
agent key):

```bash
# Last 500 events (API cap)
curl -sS -H "Authorization: Bearer $USER_API_KEY" \
  "$ORIGIN/api/playbooks/$PLAYBOOK_GUID/audit?limit=500" \
  -o audit-logs-$(date -u +%Y%m%dT%H%M%SZ).json

# Vault operations only
curl -sS -H "Authorization: Bearer $USER_API_KEY" \
  "$ORIGIN/api/playbooks/$PLAYBOOK_GUID/audit?operation=secret.&limit=500" \
  -o audit-secrets-$(date -u +%Y%m%dT%H%M%SZ).json
```

`GET /api/mcp/audit/:guid` is the same handler. Store the JSON, the
`Date` response header, the request id if present, and who pulled it.

### Export / verify (once available)

<!-- TODO: replace this subsection when SIEM export, retention, hash-chain, and the auditor role land. -->

The compliance backlog still tracks:

- syslog / SIEM export of `audit_logs`;
- retention and deletion;
- a hash-chain so a forged row is detectable;
- an auditor role.

**Until those ship, there is no product command to export or verify a
hash-chain.** Operators should:

1. Pull the JSON as above and keep it on write-once media.
2. Take a database backup (`supabase db dump` or the vendor’s PITR) that
   includes `audit_logs`, and record the backup id and time.
3. When export/verify exists, re-pull the window and run the verify tool;
   attach both the old JSON and the verify report to the 72h / final
   packages.

Do not wait for those features to start the 24-hour clock.

### Other evidence

- Git SHA or `cli-v*` tag of the running app; image digest if any
- Release SBOM + `cosign verify-blob` output ([supply-chain.md](./supply-chain.md))
- Dependabot / CodeQL / `npm audit` output if a dependency is involved
- WAF, IdP, and reverse-proxy logs (customer)
- Timeline of containment (key rotation, session revoke, `allowed_hosts`)

## Containment (supplier support)

Typical product steps we help the customer execute; the customer still owns
the environment:

1. Revoke leaked API keys and IdP sessions; rotate
   `SECRETS_ENCRYPTION_KEY` only with a plan — rotation currently makes
   existing vault ciphertext unreadable (no re-encryption tool yet).
2. Disable public playbook access if the incident is on a public GUID.
3. Pin `allowed_hosts` / set `SECRETS_REQUIRE_ALLOWED_HOSTS=true` if a
   secret was sent to an unexpected host (`audit_logs.target`).
4. Ship a patched `cli-v*` (and hosted deploy) with SBOM + npm provenance.

## Reporting data packages

Clocks below follow **418/2024. (XII. 23.) Korm. r. 77. §** and **NIS2
Art. 23**. They start when the **reporting entity** becomes aware, not when
a supplier engineer reads Slack. *jogi ellenőrzés szükséges*

Hungarian state bodies file electronically to **NBSZ NKI**
([incidens.nki.gov.hu](https://incidens.nki.gov.hu)); if the EIR is
defence-related, a different centre may apply (418/2024. 78. §). Significant
or large-scale incidents are also reported by phone without delay (78. §
(2)). *jogi ellenőrzés szükséges*

Fill every unknown field with `unknown` rather than deleting it. Mark TLP
(WHITE/GREEN/AMBER/RED) on the package. IoCs (77. § (1) 2.) are sent **as
soon as they exist**, not only at 72 hours.

### 24-hour early warning (első bejelentés)

Deadline: without undue delay, at the latest **24 hours** after awareness
(77. § (1) 1.; NIS2 23(4)(a)).

```text
TLP:
Reporting entity (legal name, tax / org id):
IBF name and 24/7 contact:
Supplier contact (AgentPlaybooks): https://github.com/matebenyovszky/agentplaybooks/security/advisories/new
Authority / portal: NBSZ NKI / incidens.nki.gov.hu  (or other: ________)
Time we became aware (UTC):
Time this package was produced (UTC):

a) Affected EIR / system:
   AgentPlaybooks instance origin:
   Playbook GUID(s) if known:
   Hosted by customer / hosted SaaS / unknown:
b) Short description (and whether it is an operational / “üzemeltetési” incident):
c) Status (ongoing / contained / recovered / unknown):
d) Duration (start–end or ongoing):
e) Estimated service restoration (if estimable):
f) Data types affected (playbook content, vault metadata, personal data? — no secret values):
g) Users affected (count or unknown):
h) Degree of service disturbance:
i) Operator contact (name, org, phone, email):
j) Intermediary / central service provider if any (e.g. Cloudflare, Supabase):
k) Believed intentional? (yes / no / unknown):
l) Geographic scope:
m) Possible cross-border impact? (yes / no / unknown):
n) Anything the centre needs to assess cross-border impact:

Attachments:
- audit_logs JSON (metadata only) and how it was pulled
- running version / git SHA / cli-v* tag
- SBOM filenames + cosign verify result (if a release exists)
```

### 72-hour incident notification (eseménybejelentés)

Deadline: without undue delay, at the latest **72 hours** after awareness
(77. § (1) 3.; NIS2 23(4)(b)). Update every 24h field. Add the first
assessment of **severity and impact**. Attach IoCs if they exist (and send
them earlier if they arrived earlier).

```text
TLP:
Reference of the 24h filing (portal id / ticket):
Updates to 24h fields (a–n):
First assessment:
- Severity (customer classification): 
- Impact on availability / integrity / confidentiality of the EIR:
- Likely vector (credential leak, dependency CVE, misconfig, unknown):
- Containment taken:
- Residual risk:

IoCs (also file separately as soon as available — 77. § (1) 2.):
- hashes, hostnames, IPs, request ids, actor_id prefixes (no secrets)

Attachments: updated audit extract; patch status; supplier GHSA id if any.
```

### One-month final report (zárójelentés)

Deadline: at the latest **one month after the 72-hour notification**
(77. § (1) 5.; NIS2 23(4)(c)). If the incident is still open at that
point, file a progress report (77. § (1) 6.) and the final report **one
month after handling ends** (77. § (1) 7.). The centre may ask for
intermediate updates (77. § (1) 4.).

```text
TLP:
References of 24h and 72h filings:
a) Detailed description, severity, and impact:
b) Likely threat type or root cause:
c) Mitigations applied and still in progress (patches, key rotation, detection rules):
d) Cross-border impact (if any):

Supplier appendix:
- GHSA / CVE:
- Fixed versions and cli-v* tag:
- SBOM + cosign verify:
- What we will change in SDLC (test, CodeQL rule, dependency pin):

If still ongoing: progress against the 72h plan; why it is not closed.
```

### CRA Art. 14 — manufacturer (AgentPlaybooks), not the customer

Use this **in addition to** the customer packages when we are a
manufacturer and we become aware of an **actively exploited vulnerability**
in the product, or a **severe incident** affecting product security.
File via the ENISA Single Reporting Platform to the coordinator CSIRT
(main EU establishment) and ENISA. Notify users of corrective measures.
*jogi ellenőrzés szükséges*

| Step | Actively exploited vulnerability | Severe incident affecting product security |
| --- | --- | --- |
| Early warning | 24h after we become aware | 24h |
| Notification | 72h | 72h |
| Final report | 14 days after a corrective or mitigating measure is available | 1 month after the 72h notification |
| Intermediate | On CSIRT request | On CSIRT request |

```text
TLP:
Manufacturer (legal name, EU main establishment): TODO(mate) — jogi ellenőrzés szükséges
SRP filing id:
Product name / version / cli-v* / SBOM:
Member States where we know the product was made available:
Nature of exploit / incident (no exploit code unless the CSIRT asks):
Corrective or mitigating measures for users:
Sensitivity of this notification:
```

## Tabletop (minimum)

Once per major release, walk a leaked `SECRETS_ENCRYPTION_KEY` or an
actively exploited dependency CVE through: detect → freeze evidence → 24h
package in under 24 hours → patch + signed SBOM → customer IBF mock-files
to NKI. Record gaps (missing export, missing auditor role)
as product work, not as a passed test.

## References (primary)

- NIS2 (EU) 2022/2555 Art. 21, 23 — https://eur-lex.europa.eu/eli/dir/2022/2555/oj
- CRA (EU) 2024/2847 Art. 14, 16 — https://eur-lex.europa.eu/eli/reg/2024/2847/oj
- 2024. évi LXIX. tv. — https://njt.jog.gov.hu/jogszabaly/2024-69-00-00
- 418/2024. (XII. 23.) Korm. r. 77–80. § — https://njt.jog.gov.hu/jogszabaly/2024-418-20-22
- NKI portal — https://incidens.nki.gov.hu
- ENISA CRA SRP FAQ — https://www.enisa.europa.eu/topics/product-security/vulnerability-services/eu-incident-response-and-cyber-crisis-management/single-reporting-platform-srp/frequently-asked-questions
