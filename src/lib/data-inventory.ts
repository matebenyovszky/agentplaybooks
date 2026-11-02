/** Describes categories, never a dump of a user's stored values. */
export const DATA_INVENTORY = {
  schema_version: 1,
  scope: "Application data categories; not a personal-data access export or a live infrastructure inventory.",
  categories: [
    { category: "Account and authentication", data: "Email, password hash or external sign-in identity, sessions and sign-in records.", purpose: "Authentication and account access.", storage: "Authentication provider." },
    { category: "Profile and sharing", data: "Display name, optional avatar/website/description, publisher attribution, stars, collaborator identities and invitation metadata.", purpose: "Publishing and access control.", storage: "Application database." },
    { category: "Playbook content", data: "Persona, instructions, skills and attachments, server definitions, memory and history, canvas, runs and portable snapshots.", purpose: "Store and serve user-provided agent configuration and content.", storage: "Application database and configured attachment storage." },
    { category: "Credentials", data: "Encrypted vault values and metadata; API-key hashes, prefixes, permissions and usage metadata; connected-app authorizations and certificate-client metadata.", purpose: "Authorize access and perform user-directed operations.", storage: "Application database. Vault values use AES-256-GCM; API keys are hashed." },
    { category: "Audit trail", data: "Playbook/server IDs, operation, target, status, timestamp, actor type/ID, secret name, latency, error code, request ID and chain hashes.", purpose: "Security investigation and review of recorded operations and configuration/content changes.", storage: "Application database; optional operator-configured SIEM/syslog copies." },
    { category: "Browser and network", data: "Browser session and theme storage, language cookie; IP and request details processed by hosting/network providers.", purpose: "Session continuity, preferences, request delivery and abuse protection.", storage: "User browser and operator/provider infrastructure; not included in this audit bundle." },
  ],
  retention: [
    "Account/content deletion is available in the dashboard. Audit history and chain checkpoints survive playbook/account deletion under the tamper-resistance migration; actor identifiers may remain.",
    "Audit retention is operator-configured. Unset/0/forever keeps rows until an explicit retention purge. A purge retains a chain checkpoint and records the purge operation.",
    "Provider logs, backups and external SIEM copies have separate operator/provider retention. This export does not discover or delete them.",
  ],
  privacy: "Actor IDs and other audit metadata can be personal or confidential data. Restrict access to exports and set an appropriate retention period. The operator must determine legal basis, notices, rights handling and processor arrangements. This inventory does not certify GDPR compliance.",
} as const;
