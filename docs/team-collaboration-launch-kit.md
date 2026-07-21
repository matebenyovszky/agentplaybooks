# Team Collaboration Launch Kit

Launch only after the production migration, deployment, and invite smoke test have passed. Use the final blog URL:

`https://apbks.com/blog/secure-team-playbook-collaboration`

Primary product URL: `https://apbks.com`

Documentation: `https://apbks.com/docs/team-collaboration`

Repository: `https://github.com/matebenyovszky/agentplaybooks`

## Positioning

**One sentence:** AgentPlaybooks teams can now edit the same playbook through account-bound, revocable editor access—without sharing passwords or agent API keys.

**Three proof points:**

1. A one-time invite is bound to the account that accepts it and expires after 72 hours.
2. Editors can maintain persona, skills, MCP servers, attachments, canvas, and memory.
3. Secrets, API keys, visibility, sharing, ownership, and deletion stay owner-only.

Avoid calling this real-time collaboration, Google-Docs-style co-editing, organization workspaces, version history, or granular RBAC. Those are not part of this release.

## Recommended launch order

| Priority | Channel | When | Angle | Action |
| --- | --- | --- | --- | --- |
| 1 | GitHub Release | Immediately after deployment | Technical changelog and security model | Publish a tagged release and link docs/blog |
| 1 | X | Deployment day | Short product result | Post the short launch copy; add a screenshot or 20–30s demo |
| 1 | LinkedIn | Deployment day | Problem, design decision, business/team value | Publish the founder-style post below |
| 1 | Existing users/community | Deployment day | Useful workflow, not promotion | Email/newsletter/Discord/Slack announcement with docs link |
| 2 | r/SideProject | Day 1–2 | What was built and feedback requested | Use the transparent builder post below |
| 2 | r/selfhosted | Day 1–3, only with self-hosting proof | Open-source, production-ready, documented and self-hostable | Link repository and installation docs, not only SaaS landing page |
| 2 | Indie Hackers | Day 2–3 | Product decision and lessons learned | Explain why human access was separated from bearer keys |
| 2 | DEV Community / Hashnode | Day 3–5 | Engineering article | Republish an expanded technical version with canonical link |
| 3 | r/LocalLLaMA | Only after genuine participation | Agent configuration portability and security | Do not cold-drop a launch link; contribute first and disclose affiliation |
| 3 | Hacker News | When launching the whole usable product or a major overhaul | Technical, open-source, directly testable product | Use Show HN only if it is a substantive product launch, not this feature alone |
| 3 | Product Hunt | A coordinated product launch, not an isolated patch | Complete product and maker story | Prepare gallery/demo and a substantial maker first comment |
| Optional | Bluesky / Mastodon | Same day as X | Open-source and user-control angle | Reuse the X copy with slightly more context |

Before every Reddit post, reread that community's current sidebar and pinned rules. Disclose that you built AgentPlaybooks, do not cross-post identical copy on the same day, and do not ask for upvotes.

Current platform references checked for this plan:

- [X posting limits](https://help.x.com/en/using-x/how-to-post): standard posts allow 280 characters; links are shortened by X.
- [LinkedIn post limits](https://www.linkedin.com/help/linkedin/answer/a528176/): posts allow up to 3,000 characters.
- [Show HN guidelines](https://news.ycombinator.com/showhn.html): the product must be directly usable, and ordinary feature updates are generally not substantive enough.
- [Product Hunt launch guide](https://www.producthunt.com/launch): launch a usable product or substantive update, use a personal maker account, and prepare the full launch package.
- [Reddit guidance for businesses](https://www.business.reddit.com/learning-hub/articles/smb-how-to-use-reddit): each community has its own rules; contribute as a person before acting as a salesperson.

## X post (English, standard-length)

AgentPlaybooks now supports secure team editing. Invite a teammate with a one-time link—no shared password or API key. Editors update persona, skills, MCP, canvas & memory; secrets, keys, visibility and deletion stay owner-only. https://apbks.com/blog/secure-team-playbook-collaboration

## X post (Hungarian)

Megérkezett a biztonságos közös playbook-szerkesztés. Egyszer használható linkkel hívhatsz szerkesztőt, API-kulcs átadása nélkül. A tartalmon együtt dolgoztok, a titkok, kulcsok, láthatóság és törlés tulajdonosi kézben marad. https://apbks.com/blog/secure-team-playbook-collaboration

## Optional X thread

**1/3** AgentPlaybooks now supports human editor collaboration. The key design decision: a person should never need an agent's bearer API key to work on a playbook.

**2/3** Editors can maintain persona, skills, MCP servers, attachments, canvas and memory. They cannot access secrets or API keys, change visibility, invite others, transfer ownership or delete the playbook.

**3/3** Invitations are single-use, expire after 72 hours and are stored only as SHA-256 digests. The accepting account gets independently revocable access. Details: https://apbks.com/blog/secure-team-playbook-collaboration

## LinkedIn post (English)

Sharing an Admin API key with a teammate is convenient—until you need to know who used it, revoke one person's access, or rotate it without breaking an agent integration.

We have launched secure team editing in AgentPlaybooks.

An owner creates a one-time invite. The teammate accepts it with their own account, and the playbook appears on their dashboard as a shared playbook.

Editors can maintain the parts that make an agent useful:

• persona and system instructions
• skills and attachments
• MCP server definitions
• canvas documents and memory

The owner keeps the security boundary:

• secrets and API keys
• visibility and publication
• collaborator management
• ownership and deletion

We deliberately started with one collaborator role—Editor—instead of a large RBAC matrix. The invitation is single-use, expires after 72 hours, and only its SHA-256 digest is stored.

The result is simple: people get account-bound, revocable access; agents keep using scoped machine credentials.

The feature is live and the project is open source. I would especially value feedback from teams maintaining agent instructions and MCP setups together.

https://apbks.com/blog/secure-team-playbook-collaboration

#AIagents #MCP #OpenSource #Security #Collaboration

## LinkedIn post (Hungarian)

Egy Admin API-kulcs átadása kényelmesnek tűnik — egészen addig, amíg tudni szeretnéd, ki használta, csak egy ember hozzáférését vonnád vissza, vagy úgy rotálnád a kulcsot, hogy közben ne álljanak le az agent-integrációk.

Elindult a biztonságos közös szerkesztés az AgentPlaybooksban.

A tulajdonos egyszer használható meghívót készít. A csapattag a saját fiókjával fogadja el, a playbook pedig megosztott elemként megjelenik a dashboardján.

A szerkesztő karbantarthatja a personát, skilleket, MCP-szervereket, mellékleteket, canvas dokumentumokat és memóriát. A titkok, API-kulcsok, láthatóság, megosztás, ownership és törlés továbbra is kizárólag a tulajdonos kezében marad.

Szándékosan egyetlen közreműködői szerepkörrel, az Editorral indultunk, nem egy nehezen átlátható RBAC-mátrixszal. A link egyszer használható, 72 óra után lejár, és csak az SHA-256 lenyomatát tároljuk.

Az eredmény: az emberek fiókhoz kötött, önállóan visszavonható hozzáférést kapnak, az agentek pedig továbbra is elkülönített gépi hitelesítő adatokat használnak.

Már éles, a projekt pedig nyílt forráskódú. Különösen azok visszajelzésére vagyok kíváncsi, akik csapatban tartanak karban agent-utasításokat és MCP-beállításokat.

https://apbks.com/blog/secure-team-playbook-collaboration

#AIagents #MCP #OpenSource #Security #Collaboration

## Reddit: r/SideProject

**Title:** I added secure team editing to my open-source AI agent playbook manager

**Body:**

I built AgentPlaybooks to keep an agent's persona, skills, MCP definitions, memory and working docs portable across AI platforms.

The latest problem was collaboration. Technically, an Admin API key could let another person edit a playbook, but that is a bearer credential—not a human identity. It is hard to attribute and awkward to revoke for one person without affecting integrations.

I implemented a deliberately small model: one owner, one editor role, and account-bound invitations.

Editors can change persona, skills, MCP servers, attachments, canvas and memory. They cannot access secrets/API keys, change visibility, invite others or delete the playbook. Invite links are single-use, expire after 72 hours and are stored only as SHA-256 hashes.

The project is open source: https://github.com/matebenyovszky/agentplaybooks

Feature walkthrough: https://apbks.com/blog/secure-team-playbook-collaboration

I would value feedback on the permission boundary: is this simple owner/editor split enough for small teams, or which missing role would become necessary first?

## Reddit: r/selfhosted

Post only after confirming the public repository contains complete self-hosting steps and the production release is downloadable.

**Title:** AgentPlaybooks: self-hosted agent personas, skills, MCP and memory — now with secure team editing

**Body:**

I maintain AgentPlaybooks, an open-source Next.js/Supabase application for storing portable agent personas, skills, MCP server definitions, canvas documents and memory.

This release adds human collaboration without sharing bearer API keys. Owners create a single-use, 72-hour invite that binds editor access to the accepting account. Editors can maintain content; secrets, keys, visibility, sharing and deletion remain owner-only.

Stack: Next.js, Supabase/Postgres with RLS, and Cloudflare Workers via OpenNext. The migration and self-hosting documentation are in the repository.

Repository: https://github.com/matebenyovszky/agentplaybooks

Self-hosting guide: https://apbks.com/docs/self-hosting

Collaboration security model: https://apbks.com/docs/team-collaboration

I would appreciate feedback on the deployment docs and whether the owner/editor boundary fits self-hosted team use.

## Indie Hackers post

**Title:** Why I separated human collaboration from API-key permissions in AgentPlaybooks

Use the first four sections of the English blog post, then add:

The product lesson was that fewer roles can be safer and easier to explain. I nearly reused the existing Viewer/Coworker/Admin machine roles for people, but human identity, invitation, attribution and revocation are different concerns. Keeping two small models produced a clearer UX and a smaller escalation surface.

Question for other builders: when did a simple Owner/Editor model stop being enough for your product?

## Hacker News

Do not submit this feature by itself as `Show HN`. If AgentPlaybooks has not previously had a real Show HN and the deployed product is directly usable, launch the entire project:

**Title:** Show HN: AgentPlaybooks – portable skills, memory and MCP configuration for AI agents

**Opening comment:**

I built AgentPlaybooks because I was repeatedly recreating the same persona, skills and memory across AI platforms. It stores those parts in one portable playbook and exposes them through JSON, Markdown, OpenAPI and MCP.

The latest release adds account-bound team editing. I intentionally separated human membership from agent API keys: editors can maintain content, but secrets, keys, publication and deletion remain owner-only.

The project is open source. I would love feedback on the data model, permission boundary and interoperability approach. Repository: https://github.com/matebenyovszky/agentplaybooks

## Product Hunt package

Use this only for a coordinated AgentPlaybooks product launch or a genuinely substantive relaunch.

**Name:** AgentPlaybooks

**Tagline:** Portable skills, memory and tools for every AI agent

**Short description:** Build an agent once and carry its persona, skills, MCP tools, memory and team-maintained working context across AI platforms.

**Maker first comment:**

I built AgentPlaybooks after getting tired of rebuilding the same agent setup in every AI product. A playbook keeps persona, skills, MCP server definitions, memory, canvas documents and secure credentials together, with JSON, Markdown, OpenAPI and MCP access.

The latest release makes playbooks collaborative without turning machine credentials into human logins. Owners invite editors with single-use links; editors improve content; sensitive controls remain owner-only.

I would love to learn which platform integration and team workflow would make AgentPlaybooks most useful for you.

**Gallery:**

1. Dashboard showing owned and Shared playbooks.
2. Playbook editor with persona, skills, MCP, memory and canvas tabs.
3. Sharing panel and one-time invite warning.
4. Permission diagram: Editor content access vs Owner security controls.
5. Integration slide: ChatGPT, Claude, Cursor, Gemini, local agents.

## GitHub Release notes

**Title:** Secure team playbook collaboration

**Highlights:**

- Invite signed-in editors with one-time, 72-hour links.
- Show shared playbooks directly on collaborator dashboards.
- Allow editor changes to persona, skills, MCP servers, attachments, canvas and memory.
- Keep secrets, API keys, visibility, sharing, ownership and deletion owner-only.
- Store invite tokens only as SHA-256 hashes and accept them atomically.
- Add collaboration API tests, access-guard tests, documentation and four localized blog posts.

**Upgrade:** Apply `supabase/migrations/20260720_add_playbook_collaboration.sql` before enabling the feature in production.

## Launch assets checklist

- 1200×630 social card with “Secure team playbook editing” and the owner/editor boundary.
- 16:9 screenshot of the Sharing tab with any live invite URL redacted.
- 20–30 second silent demo: create invite → accept as another account → Shared badge → owner-only tabs absent.
- 5 Product Hunt gallery images if doing a full launch.
- UTM links per channel, without putting invite tokens or user identifiers into analytics.
- Someone available to answer comments for the first 2–4 hours after each launch post.

## Success metrics

- Invite links created.
- Invite acceptance rate before expiry.
- Number of playbooks with at least one active editor.
- Editor seven-day retention.
- Revocation failures or permission-denied errors by endpoint.
- Qualified feedback and GitHub stars, not only impressions.
