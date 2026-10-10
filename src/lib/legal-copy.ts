/**
 * Privacy and terms copy.
 *
 * The privacy notice was expanded on 10 October 2026 by the owner's decision,
 * for the Claude directory submission: the directory rejects a policy that does
 * not cover collection, use and storage, sharing, retention, and contact. Two
 * rules from the earlier lock still hold, and tests/catalog-listing.test.ts
 * enforces them: no compliance claims we cannot back (certifications or
 * conformance badges), and no email address at all, by the owner's decision —
 * contact goes through the public repository, and most requests need no contact
 * because the dashboard handles them (export, correction, account deletion).
 *
 * Every factual sentence here was checked against the code or the live service.
 * When behaviour changes — a new processor, a new kind of data, a different
 * retention — this file changes in the same pull request.
 */
export const PRIVACY_TITLE = "Privacy";
export const TERMS_TITLE = "Terms";

export const PRIVACY_CONTROLLER = "Máté Benyovszky, Hungary";
export const PRIVACY_CONTACT_URL = "https://github.com/matebenyovszky/agentplaybooks/issues";
export const PRIVACY_LAST_UPDATED = "10 October 2026";

/** A paragraph, or a bulleted list when it is an array. */
export type LegalBlock = string | readonly string[];
export type LegalSection = { heading?: string; blocks: readonly LegalBlock[] };

export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    blocks: [
      `Last updated: ${PRIVACY_LAST_UPDATED}.`,
      "AgentPlaybooks is open-source software under the MIT license. This notice covers the hosted service at agentplaybooks.ai — the website, the API, and the MCP endpoints that Claude, Cursor, and other clients connect to. Software you run yourself (the CLI, editor plugins, a self-hosted server) sends nothing to us unless you point it at agentplaybooks.ai.",
    ],
  },
  {
    heading: "Who is responsible",
    blocks: [
      `The service is operated by ${PRIVACY_CONTROLLER}, who decides how the data described here is used (the data controller). For a question or request about your data, open an issue at ${PRIVACY_CONTACT_URL} — issues are public, so do not put personal details in it; we will reply there and arrange a private channel. Most requests need no contact at all: the dashboard lets you export, correct, and delete your data yourself.`,
    ],
  },
  {
    heading: "What we collect",
    blocks: [
      [
        "Account: your email address, a password hash, and sign-in records, held by our authentication provider.",
        "Profile: a display name, which starts as the part of your email address before the @, and optionally an avatar, website, and description. It can be shown as the publisher of playbooks and skills you make public, and can be changed through the account API.",
        "What you put into the service: playbooks and their persona, instructions, skills and attachments, memory and its version history, canvas documents, runs, connected-server definitions, collaborator invitations, stars, and portable backups you push.",
        "Secrets you store: encrypted with AES-256-GCM under per-user derived keys before they are saved. The service decrypts a secret only to send a request you asked for; the value is never returned through the API or to an AI client.",
        "API keys: we store a hash and a short prefix, never the key itself, plus when each key was last used.",
        "Connected apps: when you connect a client such as Claude or Cursor, a record of that app and your consent, so its access can be checked and revoked.",
        "Security and audit records: for vault and connected-server operations, which operation ran, against which host, by which key or account, when, and whether it succeeded.",
        "Request data: your IP address and request details pass through our hosting provider's network for delivery and abuse protection.",
      ],
      "We do not use analytics, advertising, or tracking cookies. The website keeps your sign-in session and theme in your browser's local storage, and sets one cookie for your language choice. AgentPlaybooks does not run AI models, and your content is not used to train any.",
    ],
  },
  {
    heading: "Why we use it",
    blocks: [
      "To provide the service you signed up for: storing your playbooks, serving them to the clients you connect, running the requests you ask for, and letting the people you share a playbook with use it. This is necessary to perform our agreement with you (GDPR Article 6(1)(b)).",
      "To keep the service and your data secure: authentication, abuse prevention, and the audit records above. This is our legitimate interest in running a secure service, and yours in being able to see what touched your vault (Article 6(1)(f)).",
      "We do not sell personal data, and we do not use it for advertising or profiling.",
    ],
  },
  {
    heading: "Who else sees it",
    blocks: [
      [
        "Supabase stores the database and runs authentication, in the EU (Frankfurt, Germany).",
        "Cloudflare hosts the application and delivers every request through its global network, so requests can be processed in data centres outside the EU.",
        "People you share with: collaborators see the playbooks you invite them to. A public playbook is visible to everyone, and an unlisted one to anyone with its link.",
        "Services you direct us to: when you call a connected server or use a secret against an API, the request — with the secret injected — goes to the destination you chose.",
      ],
      "Supabase and Cloudflare process data on our behalf under their data processing terms, which include the European Commission's standard contractual clauses for transfers outside the EU. We disclose data to authorities only where the law requires it.",
    ],
  },
  {
    heading: "How long we keep it",
    blocks: [
      "Your account and content are kept until you delete them. Deleting a memory entry, skill, or playbook removes it from the live database at once; a playbook takes its skills, memory, canvas, runs, keys, secrets, and audit records with it.",
      "You can delete your whole account under Settings → Delete account. That removes, immediately and in one step, every playbook you own and everything in it, your portable backups, your API keys, your connected-app sign-ins, your profile, stars, and memberships. Changes you made in playbooks other people own stay in their history, no longer linked to any account.",
      "Our hosting provider's network may keep request logs for a limited period under its own policy.",
    ],
  },
  {
    heading: "Your rights",
    blocks: [
      "You can access, correct, export, and delete your data — most of it directly: edit anything in the dashboard, export a playbook as an Agent Plugin or with `apb pull`, and delete playbooks or your account in the dashboard. You can also ask us to restrict or stop a use, or to send you a copy of what we hold, through the repository as described above. We answer within one month.",
      "If you are in the EU or EEA and think we have mishandled your data, you can complain to a data protection authority. In Hungary that is the Nemzeti Adatvédelmi és Információszabadság Hatóság (NAIH, https://naih.hu).",
    ],
  },
  {
    heading: "Security",
    blocks: [
      "Traffic is encrypted in transit. Secrets are encrypted at rest and never returned to clients, API keys are stored only as hashes, and vault operations are recorded in an audit log, refusals included. The code that does all of this is public: https://github.com/matebenyovszky/agentplaybooks",
    ],
  },
  {
    heading: "Children",
    blocks: ["The service is not intended for anyone under 16, and we do not knowingly collect their data."],
  },
  {
    heading: "Changes",
    blocks: [
      "When this notice changes, the date at the top changes with it. For a change that affects how your data is used, we will also say so on the site before it takes effect.",
    ],
  },
];

export const TERMS_PARAGRAPHS = [
  "The software is provided “as is”, without warranty of any kind, express or implied.",
  "You use AgentPlaybooks at your own risk. The maintainers accept no liability for any loss or damage arising from use of the software or the site.",
  "The MIT license in the repository is the agreement. What is in the code is what you get.",
] as const;
