# Demonstrations

A skill's portable core is its prose. For an agent with a body, the decisive artifact is a **demonstration**: a recording of the task being performed.

Robot foundation models of the [GEN-1.5](https://generalistai.com/blog/gen-1.5) generation learn a task from one or a handful of demonstrations placed directly in their context — no training run — and several demonstrations can be chained into one continuous behaviour. That changes what a recording is. It is not documentation sitting beside the skill; it is part of what the skill *is*, and **the order of the list is the order of execution**.

A playbook is what holds that order.

## Where they live

In the `SKILL.md` frontmatter, under `demonstrations:`.

```yaml
---
name: open-fire-door
description: Opening a fire door by its handle, two-handed
demonstrations:
  - provider: youtube
    ref: dQw4w9WgXcQ
    fidelity: video
    role: demonstration
    title: Two-handed open
    segments:
      - { start: 134, end: 158, label: grip the handle, comment: from below, thumb toward the leaf }
      - { start: 158, end: 171, label: shift your weight, comment: the door is heavy — do not push with the arm }
  - provider: hf_dataset
    ref: example-lab/fire-door-push@a1b2c3d
    fidelity: sensorimotor
---

## Procedure

1. Stand 60 cm from the hinge.
```

Frontmatter rather than a table or a bundled file, because the list is part of the skill's definition: its order is the order of execution, so it belongs in the same document as the procedure it demonstrates. Kept there, the two cannot drift apart. They are reviewed in one diff, versioned together — `rollback_skill` restores a procedure and its demonstrations as one — and covered by the same digest in the manifest. It also costs no migration, no new endpoint and no new MCP tool: a demonstration travels through git, the CLI, `/.well-known/skills/`, and every export exactly the way the rest of the skill does.

## Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `provider` | yes | `youtube`, `hf_dataset`, or `url` |
| `ref` | yes | Video id, `owner/name[@revision]`, or an `https` URL |
| `fidelity` | no | `video` or `sensorimotor`. Defaults to `sensorimotor` for `hf_dataset`, `video` otherwise |
| `role` | no | `demonstration` (default), `reference`, or `warning` |
| `title` | no | What to call this recording |
| `sha256` | no | Hex SHA-256 of the recording's bytes. `url` references only — see [Pinning a recording](#pinning-a-recording) |
| `segments` | no | Moments inside the recording, `{ start, end, label, comment }` in seconds |

`role: warning` marks a recording of a **failure mode**. Exports label it explicitly so an agent is told not to reproduce it — useful precisely because a model that learns from one demonstration will otherwise learn from any demonstration.

A full YouTube URL is accepted anywhere a video id is: `https://www.youtube.com/watch?v=…`, `https://youtu.be/…`, `/embed/`, `/shorts/`, and `/live/` all normalize to the id. Segments are sorted by `start`, so they need not be written in order.

### Limits

Twenty demonstrations per skill, fifty segments per demonstration, 120 characters for a label, 500 for a comment.

## Two levels of fidelity, not two systems

A `video` reference carries pixels; a `sensorimotor` reference carries actions and proprioception as well, typically a [LeRobotDataset](https://huggingface.co/docs/lerobot) episode. They are the same thing at different resolution, which is why they share one block, one validator and one renderer.

Use whichever you have. A phone recording of a person doing the task is a legitimate starting point — demonstrations recorded with a handheld gripper, and sometimes with a bare human hand, transfer to a robot.

## What each reader sees

The design goal is graceful degradation: nothing here is a second product for robots.

- **A model that can watch** follows the links.
- **A text-only agent** gets a rendered, timestamped list. The markdown export writes the demonstrations above the raw document, so the recordings are visible without knowing the YAML key.
- **`get_skill` over MCP** returns a resolved `demonstrations` array alongside the document: ids normalized, defaults filled, segments sorted, and a ready link per recording and per segment.
- **A client that ignores the key** loses nothing. The prose is still the skill.

```jsonc
// get_skill, abridged
{
  "name": "open-fire-door",
  "content": "---\nname: open-fire-door\n…",
  "demonstrations": [
    {
      "provider": "youtube",
      "ref": "dQw4w9WgXcQ",
      "fidelity": "video",
      "role": "demonstration",
      "title": "Two-handed open",
      "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "segments": [
        {
          "start": 134, "end": 158,
          "label": "grip the handle",
          "comment": "from below, thumb toward the leaf",
          "timestamp": "2:14",
          "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=134s"
        }
      ]
    }
  ]
}
```

## Validation

Strict on the way in, lenient on the way out.

`create_skill`, `update_skill` and the dashboard reject a malformed block while the author can still fix it. An export renders whatever validated and skips the rest, because one typo should not take the rest of the skill down with it. Errors name the entry and the field:

```
Invalid demonstrations frontmatter — demonstrations[1].provider: unknown provider "vimeo" (expected youtube, hf_dataset, url)
```

Locally, `apb doctor` reports `skill.demonstrations.invalid` before you push. The dashboard's skill editor shows what the block resolved to, live, using the same parser the server uses — so what the preview shows is what the playbook will publish.

## In the manifest

`apb sync` lists each skill's demonstrations in the playbook manifest, for the same reason it lists `secrets`: **a playbook should say what it needs from outside itself before anyone runs it.**

```yaml
spec:
  skills:
    - source: .claude/skills/open-fire-door/SKILL.md
      platform: claude
      digest: sha256:…
      name: open-fire-door
      demonstrations:
        - { provider: youtube, ref: dQw4w9WgXcQ, fidelity: video, role: demonstration }
        - { provider: hf_dataset, ref: example-lab/fire-door-push@a1b2c3d, fidelity: sensorimotor, role: demonstration }
```

The skill's `digest` covers the `SKILL.md` text, references included — not the bytes behind them. Only the reference, its kind and any `sha256` are carried here — enough to tell an operator which hosts the agent must be able to reach, and what each recording must hash to. Segment detail stays in the skill.

## Pinning a recording

A reference names *where* a recording is, not *what* it is: the file behind a URL can be replaced after the skill is published, and a model that learns from one demonstration learns whatever it is shown. `sha256` pins the bytes.

```yaml
demonstrations:
  - provider: url
    ref: https://media.example.org/demos/fire-door.mp4
    sha256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

The playbook stores and publishes the digest; checking it is the consumer's job, after download and before the recording reaches a model. `get_skill` returns it on the resolved entry, and the markdown export prints it under the link.

It is accepted on `url` references only. YouTube re-encodes what it serves, so there are no stable bytes to hash; a dataset is pinned with `owner/name@revision` instead.

## Recordings on a memory

The same shape describes a recording attached to a memory, under `metadata.recording`. The semantics differ — evidence of what happened, not an instruction to repeat it — which is why the key differs, but the parser and the links are shared.

```json
{
  "key": "2026-08-20-fire-door-B2",
  "value": { "attempts": 2, "note": "handle stiffer than the demo" },
  "summary": "Opened the B2 fire door on the second attempt.",
  "memory_at": "2026-08-20T14:32:00Z",
  "metadata": {
    "episode": {
      "location": "building-B/floor-2",
      "task": "open-fire-door",
      "outcome": "completed"
    },
    "recording": [
      { "provider": "youtube", "ref": "dQw4w9WgXcQ", "role": "reference" }
    ]
  }
}
```

**Where** is `metadata.episode`, a convention rather than a column: `{ location, task, outcome }`. **When** is the memory's own `memory_at` — a real timestamp, the same one every memory has. `get_memory_context` filters on both, with `location` and `task` for where and `after` and `before` for when, and returns any `recording` with its links resolved. `search_memory` bounds `memory_at` the same way.

```jsonc
// "what did I do in building B last week?"
{ "location": "building-B/floor-2", "after": "2026-08-13T00:00:00Z" }
```

An earlier version of this convention put the time in `metadata.episode.time`. A write that still does so has it moved to `memory_at` (unless the write sets `memory_at` itself), so there is only ever one answer to *when*. Everything else under `metadata` is stored untouched.

A successful run recorded this way can be promoted into a skill's `demonstrations` — which is the point of sharing the shape. A memory becomes a skill.

Keep the written summary. It is the interchange format: the full-text index searches it, a text-only agent reads it, and it is what makes the memory portable. The recording is always a pointer beside it, never a replacement.

## Choosing a provider

`youtube` is the zero-setup path and a good default for getting started. Three limits are worth knowing before a fleet depends on it:

- **Unlisted is not private.** Anyone with the link can watch. For footage of building interiors, people, or entry points, that is not enough for many organizations.
- **Quota.** An upload costs 1600 units of a default daily 10,000 — roughly six videos a day.
- **Terms of service.** Using YouTube as machine storage is not something the platform supports; a channel suspension takes the whole archive with it.

Use `url` against your own bucket for anything a deployment depends on. Any store that serves the file over `https` works — S3 or another object store, a Hugging Face file URL, or a Walrus aggregator — and a `sha256` makes the choice of host matter less. The playbook-side data is identical either way, which is the point of the `provider` field.

## Related

- [Skills](./skills.md) — the rest of what a skill carries
- [Memory](./memory.md) — tiers, retention, and the memory tools
- [CLI](./cli.md) — `apb doctor`, `apb sync`, and the manifest
