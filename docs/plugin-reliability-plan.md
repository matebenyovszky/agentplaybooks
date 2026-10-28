# Plugin reliability delivery — 2026-10-28

Base: origin/main at e5ab04732c3bd116efd53562737c08d4860addb1 (CLI 0.7.0).
Work happens in a separate checkout; the earlier OAuth checkout has unrelated
uncommitted changes and is preserved.

Release integration: merged origin/main b58337c (published CLI 0.8.1), preserving
its compact management views, direct federated-tool routing, per-source Hermes
failure isolation, stdio bridge and registered OpenAI MCP URL. This delivery
prepares CLI 0.9.0 and Hermes memory 0.4.0; package versions are not proof of
publication. Core discovery has 16 tools, including get_profile; full has 53.

## Today's implementation

1. Make Hermes memory registration and initialization offline. Default recall
   to explicit memory tools; retain opt-in automatic recall with bounded request
   fan-out, duplicate-query suppression, and authentication-failure cooldown.
   Reinitialization discards clients and recall state for account/profile changes.
2. Add an on-demand connection self-check: OAuth resource discovery, MCP
   initialize, initialized notification, tools/list, and optional authenticated
   profile. Never run it on a timer or print server error bodies/credentials.
3. Add a credential-scoped, authenticated get_profile MCP tool using OpenAI's
   documented profile schema and marker. Add account switching to OAuth consent
   without signing out other sessions. Document client-owned reconnect flows.
4. Package a separate full remote-MCP OpenAI ZIP with explicit OAuth declaration;
   keep the existing skills-only artifact. Skills detect cloud capabilities and
   use remote tools without assuming a local CLI or filesystem exists.
5. Deliver a reusable Doctor GitHub Action that runs without credentials, has
   JSON output and a job summary, and never mutates the scanned checkout.
6. Record per-file skill sync state and allow updates only when the generated
   destination still matches its previous applied hash; recheck previews before
   any writes and preserve user edits as conflicts.
7. Deliver offline ROS 2 package/launch inventory with an explicit runtime-not-
   checked report and detection of missing emergency-stop declarations.
8. Validate behavior with request-count tests, simulated MCP transport failures,
   account isolation, packaging checks, CLI tests, and application checks.
9. Prioritize hosted chat use: playbooks, skills, memory, canvas, secret-backed
   calls, and federated MCP/OpenAPI tools. Keep the entry skill focused on short
   tool paths; load local configuration/sync guidance only on demand. Add literal
   name search, bounded compact playbook pages, and bounded memory overview pages.
   Preserve full records for existing REST/backup clients and explicit exports.

## Next implementation gates

- Three-way sync extension: skill files are implemented in this change. Extend
  state tracking to custom agents and per-entry MCP configuration; remote deletion
  stays opt-in. MCP updates must merge definitions, not replace client files.
- Robotics pilot: offline ROS 2 inventory is implemented. Next is a simulator
  with a selected robot project. Physical execution needs runtime enforcement;
  manifest fields are declarations, not a safety-certified control system.
- Enterprise: latest main already contains audit-chain verification, audit roles
  and review proposals. Extend those mechanisms with signing and controlled
  promotion after the runtime and key-management contracts are defined.
- Domain: keep agentplaybooks.ai canonical, preserve existing apbks.com API and
  OAuth URLs; new links use agentplaybooks.ai/api. Redirect changes need a
  compatibility inventory first.
- Large-account browsing: replace the deliberately bounded chat offset window
  with cursor/keyset pagination if arbitrary-depth browsing is needed; verify
  query plans and tenant/role filtering before adding indexes or an RPC. Keep
  response bounds and avoid per-playbook count queries.

## Acceptance and rollout

- An unused Hermes provider makes zero network calls.
- Explicit recall makes no automatic search calls. Automatic recall is opt-in.
- Invalid credentials cannot cause repeated background requests.
- Self-check identifies its failing stage and stops; private errors are redacted.
- Two credentials resolve to two distinct stable profile IDs.
- Full and skills-only plugin ZIPs remain separate and reproducible.
- Both ZIPs include the skill's optional local CLI reference; ordinary hosted
  tasks do not load it. Tool discovery retains effect annotations.
- MCP playbook discovery omits instructions, persona prompts, and config;
  owned/shared pagination is merged deterministically before slicing. The
  first 1000 name matches are supported; larger accounts should narrow query.
- Compact get_playbook memory defaults to 20 metadata entries and explicitly
  reports continuation. Full-content export remains an explicit opt-in.
- Cloud documentation describes the registered/published plugin connection;
  packaging alone does not claim a successful hosted end-to-end test.
- Publish/deploy and host-specific account consent are separate from local
  verification. No production credentials or existing links are changed here.

Official references checked on 2026-10-28:
- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://learn.chatgpt.com/docs/extend/mcp
- https://github.com/ros-infrastructure/rep/blob/master/rep-0149.rst

## Verified results

- Application suite after integration: 989 tests passed; production Cloudflare
  Worker build passed. TypeScript, lint (33 existing warnings, no errors) and
  production dependency audit passed.
- CLI suite after review: 248 tests passed (including ROS 2, deleted managed
  files and backup symlink rejection). Node 24 was also verified
  before the ROS 2 extension (239 tests); terminal tests require TERM=xterm
  rather than the tool host's TERM=dumb.
- Hermes provider: 24 tests passed with real upstream
  imports. The complete real-Hermes HTTP contract passed against upstream
  ee7e0f51 (2026-10-28), including A -> B -> A isolation and offline initialize.
- Live anonymous check: OAuth metadata passed; initialize returned HTTP 401,
  as expected without a credential. No private tool or write was invoked.
- Full remote OpenAI ZIP built locally. Host registration, account consent,
  deployment and a real ChatGPT/Codex cloud conversation remain rollout steps.
- Cloud test preparation: the available Chrome ChatGPT Plugins page is signed
  out, and plugin discovery has no available AgentPlaybooks connector. User
  sign-in/consent is required before claiming an actual cloud round-trip.
