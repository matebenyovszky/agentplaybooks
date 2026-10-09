# Claude Connectors Directory notes (submission prep)

This is an in-repo checklist for submitting the hosted MCP server to the
[Claude Connectors Directory](https://claude.com/docs/connectors/building/submission).
It does **not** claim a listing. Submission happens in the claude.ai submission
portal, by a person with directory access — not from this repository.

Everything below was checked against the live service or `main`; the parts
that are not code are listed at the end as blockers.

## Where this stands (10 October 2026)

Paused here, to be picked up later. The public summary is the *Claude Plugin &
Directory Listing* section of `public/docs/ROADMAP.md`. Nothing about this work
lives only on a local machine: everything below is on `main`.

**Done (PR #173, merged):**

- `plugins/agentplaybooks` — the lean Claude plugin; `.claude-plugin/marketplace.json`
  points at it. `claude plugin validate` passes for the plugin and the marketplace.
- Integrations tab: Claude steps (custom connector, OAuth), one-click Cursor and
  VS Code links; the dead `claude_desktop_config.json` advice removed from docs.
- `/docs/claude` (+ Hungarian), a blog post dated 2026-09-30.
- Settings → Delete account (`public.delete_account`, one transaction), and the
  fix for playbook deletion, which a delete trigger had been rolling back in
  production. Both migrations deploy automatically on merge.
- A complete privacy notice (`src/lib/legal-copy.ts`), with no email address by
  the owner's decision: contact goes through the repository's issues.
- `npm run seed:reviewer` to populate a reviewer account.
- The 2026-08 Claude Desktop extension (`.mcpb`) experiment is deleted; OAuth
  and the directory's end of MCPB listings made it pointless.

**Continue here — the OAuth sign-in is not working yet.** There is a known
OAuth bug when the database runs on OrioleDB (the production Supabase project
does, `17-oriole`), being fixed separately. Until it is fixed, everything from
step 1 down waits on it.

1. Fix the OAuth bug on OrioleDB, then test the connector from claude.ai
   (*Customize → Connectors → Add custom connector*,
   `https://agentplaybooks.ai/api/mcp/manage`) and from Claude Code (`/mcp`).
2. Confirm that deleting a throwaway playbook and a throwaway account works in
   production.
3. Sign up the reviewer account and run `npm run seed:reviewer`.
4. Add the plugin on claude.ai through *Customize → Plugins → Add marketplace*
   (`matebenyovszky/agentplaybooks`), connect it, try each skill and command.
5. Submit both in the portal — **MCP connector** first, then **Plugin bundle** —
   from the account that should own the listings for good.

**Open decisions:** whether to mark the 17 non-destructive writes destructive
(only if the portal's Tools step flags them, see the tool table above); a UI for
the profile display name; whether a repository link is enough as the privacy
contact once the directory reviews it.

## What gets submitted

- **Server:** `https://agentplaybooks.ai/api/mcp/manage`
- **Transport:** Streamable HTTP
- **Every user connects to the same URL.** The per-playbook endpoint
  (`/api/mcp/<guid>`) is a different URL per playbook and is not what gets
  listed; the manage endpoint reaches every playbook a user can access through
  `playbook_id`.

## Portal step by step

**Connection** — the URL above, Streamable HTTP, same URL for everyone.

**Tools** — the portal syncs these from the live server and groups them by
annotation. All 50 carry a `title` and both `readOnlyHint` and
`destructiveHint`, so none land in the "no annotations" group:

| Group | Count | Preset |
|---|---|---|
| Read-only | 17 | `READ_CLOSED` ×16, `OPEN_WORLD_READ` ×1 (`use_secret`) |
| Write, non-destructive | 17 | `WRITE_CLOSED` ×8, `IDEMPOTENT_WRITE_CLOSED` ×9 |
| Write, destructive | 16 | `DESTRUCTIVE_CLOSED` ×14, `OPEN_WORLD_CALL` ×2 |

`tests/api/tool-schema-conformance.test.ts` fails CI if a tool loses its title
or a hint, so this stays true.

**Listing** — name (≤100), tagline (≤55), description (≤2000), 1–5
categories, icon, and a permanent slug. The copy is the maintainer's call.
URLs that fill the remaining fields:

- Documentation: `https://agentplaybooks.ai/docs/management-api` (has a
  "For Claude" setup section)
- Privacy policy: `https://agentplaybooks.ai/privacy` — see blockers
- Icon: `https://agentplaybooks.ai/icon.svg`

**Use cases** — reads *and* writes: the connector manages the user's own
playbooks (skills, memory, canvas documents, runs, federated servers,
secrets). Before connecting, a user needs an AgentPlaybooks account.

**Authentication** — both modes work, and the portal supports both:

- **OAuth 2.1 with PKCE (default).** An unauthenticated call returns `401` with
  `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/mcp/manage"`.
  The protected-resource metadata names the Supabase Auth authorization
  server, whose metadata advertises a `registration_endpoint` — so Claude can
  **register automatically** (dynamic client registration). Grants:
  `authorization_code` and `refresh_token`; `S256` PKCE; `none` client auth for
  public clients; `offline_access` scope. The user approves on
  `/oauth/consent`.
- **API key.** A User API Key (`apb_live_…`) as `Authorization: Bearer`, set
  under "Request headers" with "No sign in" — for shared or automated setups.

**Data handling** — first-party API (our own service, our own domain). No
personal health data, no sponsored content.

**Test & launch** — needs a *fully populated* test account (see blockers).
Every tool should be exercised through MCP Inspector or as a custom connector
before submitting.

## Pre-empting reviewer questions

- **"Memory" is the playbook's, not Claude's.** The criteria reject tools that
  query Claude's memory, chat history or files. `read_memory`,
  `write_memory`, `search_memory` and friends operate on the playbook's own
  key-value store in our database — data the user put there through this
  service. It is worth saying so in the description field.
- **`use_secret` is split.** Safe methods (`GET`, `HEAD`) on `use_secret`
  (read-only), mutating ones on `use_secret_write` (destructive). One tool
  spanning both is a listed rejection reason; the split is enforced by tests.
  Both accept a caller-chosen URL, and both descriptions point to the target
  API's own documentation, as the rule for freeform-URL tools requires.
- **`call_connected_tool`** calls a tool on a server the user federated into
  their own playbook. It is annotated destructive and open-world, so Claude
  always asks before running it.
- **Tool descriptions** were scanned for instruction-to-the-model patterns;
  the only "system prompt" mentions describe the persona *field* being edited.

## Test cases for the reviewer

Positive (OAuth or API key):

1. `list_playbooks` — no arguments. Returns the account's playbooks.
2. `get_playbook` with a `playbook_id`. Returns persona, skills summary,
   servers and memory.
3. `list_skills` with the same `playbook_id`.
4. `search_memory` with the same `playbook_id` and a `search` string.
5. `find_tools` with `query: "memory"`. Returns catalog entries with schemas.

Negative:

1. No credential → `401` with the OAuth challenge; nothing runs.
2. `Authorization: Bearer apb_live_not-a-real-key` → rejected.
3. `use_secret` with `method: "POST"` → refused, naming `use_secret_write`.

## Blockers (not code)

- **Privacy policy — written.** `src/lib/legal-copy.ts` covers what the
  directory lists: collection, use and legal basis, processors (Supabase in
  Frankfurt, Cloudflare), sharing, retention, rights, contact, and account
  deletion. The contact is the repository's issue tracker, not an email
  address — the owner's decision. The directory asks for "contact
  information"; if a reviewer finds a repository link insufficient, that is the
  thing to revisit.
- **Who submits.** Pro, Max, Team, or Enterprise; Free cannot. On Pro and Max you
  submit from your own account; on Team and Enterprise an Owner does, or on
  Enterprise a member with the Directory permission. The first account or
  organization to submit a repository folder owns that listing for good.
- **Test account — script ready.** Sign up a dedicated reviewer account, create a
  user API key with full access under Settings, then run
  `AGENTPLAYBOOKS_API_KEY=… npm run seed:reviewer` (try `-- --dry-run` first).
  It creates two private playbooks with a persona, instructions, skills, memory,
  a run with a canvas document, and a demo secret whose value is not a real
  credential. Give reviewers that account's credentials through the portal's
  Test & launch step only.
- **Public documentation by the publish date** — the docs above are live, and
  `/docs/claude` once #173 is deployed.

## The plugin bundle (second submission)

The directory has two submission kinds, and the plugin is the other one. A
plugin that references a remote server we run should be submitted alongside
that server as a connector, so do both.

**Source** — repository `matebenyovszky/agentplaybooks`, plugin path
`plugins/agentplaybooks`, tracked branch `main`. Not `packages/cli`: claude.ai
chat and Cowork refuse a plugin with a top-level `bin/` directory, and its
lockfile and bundled CLI would be held for manual review.

**Validate** — `claude plugin validate plugins/agentplaybooks` passes locally;
the portal runs more checks. What it will see:

- `.claude-plugin/plugin.json` with `name`, `displayName`, `version`,
  `description`, `author`, `license`, and the account connector as a remote
  `http` server with a fixed `https://` URL and no credential;
- `README.md` well over 40 words, with what the plugin runs and connects to and
  a privacy section; `LICENSE`;
- two skills and two commands, plain markdown with valid front matter;
- no hooks, no executables, no lockfile, no package-manager config. The
  commands tell Claude to run `npx --yes @agentplaybooks/cli@<version>`, pinned;
  that is an instruction to Claude, not a hook or MCP server command, so the
  launcher rules do not apply to it. `release:check` keeps every pin equal to
  the CLI version.

**Listing details** — read from `plugin.json` and the README, so edit those,
not the portal.

**Data handling** — reads and stores the user's own playbook data on our
service through the declared connector; sends nothing to other services (the
commands download the CLI from the npm registry, which the README names);
retention follows the service, as the privacy policy says. Whether it is
intended for people under 18 is the maintainer's answer to give.

**After approval** — keep **GitHub push webhook** on, so merging to `main`
publishes the next version. Raise `version` in `plugin.json` with every
release; `release:check` already ties it to the CLI version.

The privacy policy blocker above applies to this submission too.
