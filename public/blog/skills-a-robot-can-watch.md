---
title: "Skills a Robot Can Watch: Playbooks for Agents With a Body"
description: A skill can now point at recordings of itself being performed. For robot models that learn a task from one demonstration, that recording is the skill — and a playbook is what keeps them in order.
date: 2026-10-13
author: Mate Benyovszky
---

# Skills a Robot Can Watch

AgentPlaybooks is not another skill store, and it is not another MCP registry.
Skills and MCP connections are parts of a playbook. The playbook is the whole
job: the procedures, the persona, the memory, the connections, and the
credentials an agent uses without ever seeing them — in one place that no
single vendor owns.

That framing has always been about software agents moving between Claude Code,
Cursor, Codex, Hermes and whatever comes next. It turns out to matter even more
for agents with a body.

## Why now

Robot foundation models have converged on one shape: a large vision-language
model plans, and a small, fast policy moves. Every serious one is steered by
language. That already makes a text playbook useful to a robot's planning layer
today.

The newer shift is about demonstrations. Generalist AI's
[GEN-1.5](https://generalistai.com/blog/gen-1.5) learns a dexterous task from a
single demonstration placed in its context window, with no training run. Several
demonstrations can be chained into one continuous behaviour, and a recording made
with a person's own hand can carry over to the robot.

Read that from a storage point of view and two things follow:

- **A demonstration is not documentation beside a skill. It is the skill.** The
  model loads it at run time.
- **The order of the demonstrations is the program.** Something has to hold that
  order, version it, and hand it to whichever robot is running the job.

That something is a playbook.

## What a skill carries now

A skill can point at recordings of itself being performed. They live in the
`SKILL.md` frontmatter, next to the procedure they demonstrate:

```yaml
---
name: open-fire-door
description: Opening a fire door by its handle, two-handed
demonstrations:
  - provider: youtube
    ref: dQw4w9WgXcQ
    title: Two-handed open
    segments:
      - { start: 134, end: 158, label: grip the handle, comment: from below }
      - { start: 158, end: 171, label: shift your weight, comment: the door is heavy }
  - provider: url
    ref: https://example.org/recordings/fire-door-push.mp4
    sha256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
  - provider: hf_dataset
    ref: example-lab/fire-door-push@a1b2c3d
---

## Procedure

1. Stand 60 cm from the hinge.
```

The list is ordered, because the order is the order of execution. Each entry
names where the recording is and, optionally, the moments that matter inside it.

- **Two levels of fidelity, one block.** A `video` reference carries pixels. A
  `sensorimotor` reference — typically a LeRobotDataset episode — carries actions
  and proprioception as well. They are the same thing at two resolutions.
- **A recording of what not to do.** `role: warning` marks a failure mode. A model
  that learns from one demonstration learns from *any* demonstration it is shown,
  so the exports say plainly that this one is not to be repeated.
- **Pinned bytes.** A URL names where a recording is, not what it is. `sha256`
  pins the file, so a recording swapped after publication is detectable.

No new table, no new endpoint, no new MCP tool. The demonstrations sit in the
same document as the procedure, so the two are reviewed in one diff, versioned
together, and rolled back together.

## Every reader gets what it can use

Nothing here is a second product for robots. Each consumer reads the same skill:

- `get_skill` over MCP returns the demonstrations already resolved, with a link
  per recording and per timestamped segment.
- The markdown export renders them as a timestamped list above the document, so a
  text-only agent still learns that the recordings exist and in what order.
- `apb doctor` flags a malformed block before you push it. The dashboard's skill
  editor shows what the block resolved to while you type, using the same parser
  as the server.
- `apb sync` lists each skill's recordings in the playbook manifest, so a playbook
  says which hosts an agent must reach before anyone runs it.
- A client that ignores the key loses nothing: the prose is still the skill.

## Memory that knows where it happened

A robot's memory is episodic: what it did, where, and how it went. A memory can
now carry a recording of the episode in the same shape a skill uses, under
`metadata.recording`, and say where it happened under `metadata.episode`. When is
the memory's own `memory_at`.

That shared shape is deliberate. A successful run, recorded and remembered, can be
promoted into a skill's demonstrations. The memory becomes the skill.

The written summary stays the interchange format. It is what search finds and
what a text-only agent reads. The recording is a pointer beside it, never a
replacement.

## Credentials for a building, not just an API

A deployed robot needs credentials that software agents never think about: lift
and door APIs, building access, fleet tokens, Wi-Fi. They fall into two groups,
and the vault already handles both.

- **Most of them should never reach the robot.** Lift and access-control APIs are
  ordinary HTTPS with OAuth, so the robot calls them through `use_secret`, and the
  token is injected on the server. The robot never holds it.
- **A few must be revealed**, such as a Wi-Fi password the robot has to type into
  its own network stack. Those are the narrow, deliberately marked exception.

A revealed value cannot be taken back, so the protections that matter are a
separate, explicit reveal permission per secret, a full audit trail, rotation —
and an expiry that is actually enforced. An expired secret is now refused by
every path that would use it.

## What we deliberately did not build

We looked hard at an MQTT bridge for VDA 5050 fleets and decided against it.
AgentPlaybooks runs as stateless requests, and holding broker connections would
add the one stateful component in the system, to serve a world that is not the
first audience here.

The pattern instead: **the robot holds the connection; the vault holds the
credential.** The same answer covers ROS 2 DDS and gRPC streams.

## Before you rely on it

- **Unlisted is not private.** A YouTube link is visible to anyone who has it.
  Footage of building interiors, people or entry points usually needs your own
  storage, behind `provider: url` and a `sha256`.
- **A playbook can move a machine.** The manifest already carries policies for
  physical actions, human approval and an emergency stop. Use them, and write the
  safety notes into the skill, where every reader sees them.

## What comes next

An embodiment profile in the manifest, so an export knows which skills fit which
robot. A reveal permission separate from read access. And a robot — or a
simulator — doing a real job from a playbook end to end.

The documentation has the details: [Demonstrations](/docs/demonstrations) and
[Memory](/docs/memory).
