# Grok Bot + Hermes Bot Mode communication pack

Prepared: 2026-08-18

Primary message: **A bot is a runtime. Your agent should remain yours.**

Supporting article:
`https://agentplaybooks.ai/blog/your-bot-is-not-your-agent`

Technical guide:
`https://agentplaybooks.ai/docs/bot-platform-integrations`

## X — single post

Grok Bot and Hermes Bot Mode make persistent AI teammates real.

But after you teach a Bot your workflows, skills and tools — do you own the
agent, or is it trapped in the runtime?

A bot is where an agent runs. The agent should remain yours.

agentplaybooks.ai

## X — launch thread

### 1/5

Grok Bot and Hermes Bot Mode both point to the same future: named, persistent
AI teammates instead of disposable chats.

That is exciting. It also creates a new lock-in problem.

### 2/5

Grok Bot gives each teammate a cloud computer and can work through real apps
and websites.

Hermes Bot Mode gives each open-source profile its own model, soul, memory,
skills, MCPs and routines — even across machines.

### 3/5

The runtime is not the agent.

The agent is the identity, instructions, skills, tool connections and durable
knowledge you spent time building. That should not disappear when you change
platforms.

### 4/5

Our proposed model:

- 1 playbook = 1 portable agent
- 1 deployment = that agent running in Hermes, Grok or elsewhere
- 1 team manifest = roles, groups, handoffs and routines

The runtime can change. The agent remains yours.

### 5/5

We mapped what works today, what still needs an API, and the Hermes profile
adapter we want to build first.

Would you use the same Bot definition across runtimes?

https://agentplaybooks.ai/blog/your-bot-is-not-your-agent

## X — build-in-public version

We were about to add “Grok Bot support” to our integration list, but that would
have been dishonest: xAI has not documented a Bot API or MCP attachment point
yet.

So we wrote down the actual boundary — what works now, what is browser-based,
and what needs a native adapter.

The more interesting discovery: Hermes Bot Mode already has a clean open
primitive. A Bot is a profile with SOUL.md, skills, MCPs, memory and cron.

That gives us a concrete next target:

`apb deploy <playbook> --target=hermes --profile=researcher`

Plan first, no secret copying, no silent overwrite, and drift detection back
to the vendor-neutral playbook.

Would that be useful, or is Hermes' own profile distribution already enough
for your workflow?

## LinkedIn

Grok Bot and Hermes Bot Mode both make the same important product bet:
persistent AI teammates will replace a growing share of disposable chat
sessions.

Grok Bot approaches this with managed, always-on cloud computers that can work
inside real applications and websites. Hermes Bot Mode approaches it with
open-source profiles, each carrying its own model, persona, memory, skills,
MCP configuration and routines.

The execution models are different, but they expose the same unresolved
question:

**After a team has spent weeks teaching and configuring a Bot, who owns the
agent behind it?**

We believe a bot is a runtime, not the canonical agent definition.

Our proposed AgentPlaybooks model is:

- one playbook defines one portable agent;
- one deployment binds it to Hermes, Grok or another runtime;
- one team manifest connects several playbooks through roles, handoffs,
  groups and routines.

This means the runtime may change while the identity, instructions, skills,
tool connections and selected durable knowledge remain under the user's
control.

We also documented the current limitations honestly. Hermes exposes the open
profile primitives needed for a real deployment adapter. Grok Bot is in early
beta and its launch material does not yet document an external Bot API, MCP
attachment point or portable configuration format, so the present bridge is
web/computer-use based rather than native.

The first implementation we are considering is a profile-aware Hermes target:

`apb deploy <playbook> --target=hermes --profile=researcher`

I would value direct feedback from people already running multiple agents:

1. Is one playbook per Bot the right boundary?
2. Should memory travel with the agent, or remain runtime-local by default?
3. Is a portable team manifest useful, or is independent agent deployment
   enough?

Design and current capability map:
https://agentplaybooks.ai/blog/your-bot-is-not-your-agent

## Short Hungarian post

A Grok Bot és a Hermes Bot Mode ugyanabba az irányba mutat: az egyszer
használatos chatek helyett tartós, névvel és szereppel rendelkező AI
csapattársak jönnek.

De ha heteken át tanítasz egy Botot, összerakod a skilljeit, MCP-it és
memóriáját, akkor az agent a tiéd marad — vagy bent ragad a runtime-ban?

A mi modellünk:

- 1 playbook = 1 hordozható agent
- 1 deployment = az agent egy konkrét runtime-ban
- 1 team manifest = szerepek, handoffok, csoportok és rutinok

A bot az a hely, ahol az agent fut. Maga az agent maradjon a tiéd.

https://agentplaybooks.ai/blog/your-bot-is-not-your-agent

## Visual direction

Use a restrained diagram, not a glowing AI character:

```text
                 AgentPlaybooks
          portable source of truth
             /                  \
      Hermes profile         Grok Bot
    open/local/cloud      managed cloud computer
```

Headline: `Your bot is a runtime. Your agent should be yours.`

Keep platform logos secondary. The central object should be the portable
playbook, with arrows to interchangeable runtimes.
