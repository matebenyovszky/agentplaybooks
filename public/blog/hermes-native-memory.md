---
title: Give Hermes a memory you can inspect and share
description: AgentPlaybooks is now a native Hermes memory provider. Keep durable facts in a private playbook, correct them across sessions, and connect shared knowledge explicitly.
date: 2026-09-22
author: Mate Benyovszky
---

# Give Hermes a memory you can inspect and share

An agent becomes more useful when you can stop repeating yourself. The project
uses Hungarian. The deployment target changed last week. A decision from the
previous session still matters today. Those facts should survive a fresh chat,
and you should be able to see what was saved and fix it when it becomes wrong.

AgentPlaybooks now includes a **native memory provider for Hermes Agent**.
Select it in Hermes's memory settings and connect a private playbook. Hermes can
save durable facts there, read them in later sessions, and expose their history.
You can inspect and correct those memories in AgentPlaybooks, using the same
memory API available to your other authorized agents.

Our earlier [Hermes integration](/blog/using-hermes-agent-with-playbooks) brings
personas, skills, and MCP configuration into a Hermes profile. This addition
connects the profile's ongoing memory to AgentPlaybooks.

## From a remembered fact to an editable record

Suppose you ask Hermes to save your project's preferred language under the key
`project_language`. In a later session, it can read that key without relying on
the previous conversation. If the team changes languages, edit the memory in
AgentPlaybooks and ask Hermes to read it again. The current value changes while
the previous version remains available in history.

The provider adds tools for search, reading, writing, history, archiving, and
permanent deletion. It also mirrors new successful additions, replacements, and
removals made through Hermes's built-in memory tool. Replacing a mirrored fact
keeps the same remote key, so its history stays together.

Archiving removes a record from normal search while retaining its content.
Deleting removes the remote entry and its history. Hermes's local `MEMORY.md`
and `USER.md` remain active: if a fact exists in both places, a remote edit does
not update the local copy. Correct or remove both copies when necessary.

## Private memory, explicitly shared knowledge

Start with **one private playbook per Hermes profile** and a playbook-scoped key
with memory read/write permissions. The provider rejects personal writes to
public or unlisted playbooks. Keep the memory playbook private throughout use.

A profile is also the sharing boundary. Everyone allowed to use it shares its
memory, including people talking to it through a messaging gateway. Recorded
author and session metadata helps explain where a memory came from; separate
profiles and private playbooks provide isolation between users.

You can add shared playbooks as read-only knowledge sources and select them
explicitly through the memory tools. Private shared sources use their own keys.
For example, a project handbook can be available to several agents while each
agent keeps its personal working memory in a separate playbook.

## Try it in Hermes

With Hermes 0.21.4 or later, install the plugin directly from our repository:

```bash
hermes plugins install matebenyovszky/agentplaybooks/packages/hermes-memory/agentplaybooks
hermes memory setup
hermes memory status
```

Choose **agentplaybooks**, enter your private playbook GUID, and supply its key
through Hermes's secret setup. Hermes Desktop also offers native configuration
fields. The [setup guide](/docs/hermes-memory) covers profile selection, shared
sources, source-built CLI installation, and a short save/read/correct test.

We have also [submitted AgentPlaybooks to the Hermes plugin catalog](https://github.com/NousResearch/hermes-agent/pull/119450).
As of September 22, that submission is awaiting maintainer review. The direct
repository command above is available now; installation by the short catalog
name depends on that entry being merged and published.

## What this first version does

Recall currently uses AgentPlaybooks' literal text search. A full question may
not match a stored sentence, so short search terms or a known memory key work
best. Semantic retrieval and improved ranking remain outside this release.

The provider does not upload entire conversations, extract facts automatically,
or bulk-import existing local memories. Caching, retries, and offline queues are
also outside this version; failed operations are reported rather than saved for
later delivery.

We verified the provider's REST behavior and exercised the real Hermes loader,
Desktop settings schema, tool registration, memory-write hooks, and switching
between profiles against a local HTTP test server. The checks run in the
repository's [Hermes compatibility workflow](https://github.com/matebenyovszky/agentplaybooks/blob/main/.github/workflows/hermes-memory.yml).
They are automated integration checks, not a live-account production test.

## Help shape the next version

Try it with a small private playbook and tell us what worked, what surprised you,
and what you would want next. Setup questions, memory-policy questions, and bug
reports are all welcome. You can also reach us on
[LinkedIn](https://www.linkedin.com/company/agentplaybooksai/); questions and
feedback are welcome there as well as on GitHub.

The implementation and documentation are open in our
[GitHub repository](https://github.com/matebenyovszky/agentplaybooks). For a
reproducible bug, [open an issue](https://github.com/matebenyovszky/agentplaybooks/issues)
with your Hermes version and the steps that triggered it, leaving out API keys
and private memory contents.
