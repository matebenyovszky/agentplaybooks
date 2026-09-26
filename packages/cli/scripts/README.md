# CLI package scripts

## OpenAI / ChatGPT Skills-only ZIP

Build a submit-ready **Skills-only** archive for the OpenAI Plugins Directory.
This does **not** submit the listing. Hold upload until Mate yeses listing copy.

```bash
cd packages/cli
node scripts/pack-openai-skills-zip.mjs
```

Output: `packages/cli/dist/agentplaybooks-openai-skills.zip` (gitignored).

Details, file list, and hold notes: [`docs/openai-skills-directory-zip.md`](../../../docs/openai-skills-directory-zip.md).

## Bundled CLI

`node scripts/build.mjs` bundles the published `dist/agentplaybooks.mjs` binary.
That is unrelated to the directory ZIP.
