#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildZipStore } from '../packages/cli/scripts/pack-openai-skills-zip.mjs';
import { containsLiteralCredential } from '../packages/cli/src/plugin-package.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function directoryMcp(source) {
  const servers = source.mcpServers;
  if (Object.keys(servers ?? {}).length !== 1) throw new Error('Expected one account MCP server.');
  const server = servers['agentplaybooks-account'];
  if (server?.type !== 'streamable-http' || server.url !== 'https://agentplaybooks.ai/api/mcp/manage' ||
      Object.keys(server).some(key => !['type', 'url'].includes(key))) {
    throw new Error('Expected the public account endpoint without credentials or headers.');
  }
  return { ...source, mcpServers: { 'agentplaybooks-account': {
    ...server, url: server.url + '?toolset=directory', extensions: { 'com.openai': { auth: {
      type: 'oauth', client: { mode: 'dcr' },
      defaultScopes: ['openid', 'email', 'profile', 'offline_access'],
    } } },
  } } };
}

export async function collectDirectoryFiles({ recordingUrl } = {}) {
  const plugin = JSON.parse(await readFile(path.join(root, 'packages/cli/plugin.json'), 'utf8'));
  plugin.name = 'agentplaybooks-hosted';
  plugin.description = 'Manage your portable agent instructions, skills, shared memory and planning documents with AgentPlaybooks.';
  const openai = plugin.extensions['com.openai'];
  openai.interface.longDescription = 'Keep your agents and project knowledge under your control. Manage portable playbooks, agent instructions, skills, shared memory, canvas documents and workflow runs through your AgentPlaybooks account. Sign in with OAuth; access follows your account and playbook permissions. This directory integration exposes each supported operation separately and does not forward calls to other services or handle secret values.';
  openai.interface.supportURL = 'https://github.com/matebenyovszky/agentplaybooks/issues';
  openai.interface.defaultPrompt = [
    'Show my playbooks and their skills.',
    'Find the project decisions in my playbook memory.',
    'Open my team handbook and planning documents.',
  ];
  openai.onboardingSkill = './skills/playbooks/SKILL.md';
  openai.review = {
    test_cases: JSON.parse(await readFile(path.join(root, 'plugins/openai/review-cases.json'), 'utf8')),
    commerce: false,
    commerce_description: 'The plugin manages agent configuration and knowledge; it does not process purchases or payments.',
  };
  if (recordingUrl) {
    const url = new URL(recordingUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a public HTTPS recording URL without credentials.');
    openai.review.demo_recording_url = url.href;
  }
  const mcp = directoryMcp(JSON.parse(await readFile(path.join(root, 'packages/cli/mcp.json'), 'utf8')));
  const files = new Map([
    ['plugin.json', Buffer.from(JSON.stringify(plugin, null, 2) + '\n')],
    ['mcp.json', Buffer.from(JSON.stringify(mcp, null, 2) + '\n')],
    ['LICENSE', await readFile(path.join(root, 'packages/cli/LICENSE'))],
    ['assets/icon.svg', await readFile(path.join(root, 'packages/cli/assets/icon.svg'))],
    ['skills/playbooks/SKILL.md', await readFile(path.join(root, 'plugins/openai/skills/playbooks/SKILL.md'))],
  ]);
  for (const [name, data] of files) {
    if (containsLiteralCredential(data.toString('utf8'))) throw new Error(`Credential-like text in ${name}.`);
  }
  return files;
}

export async function packDirectory(outputPath, options = {}) {
  const files = await collectDirectoryFiles(options);
  const zip = buildZipStore([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, data]) => ({ name, data })));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, zip);
  return { outputPath, bytes: zip.length, names: [...files.keys()] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const target = process.argv.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
  const recordingUrl = process.argv.find(arg => arg.startsWith('--recording-url='))?.slice('--recording-url='.length);
  if (!target) throw new Error('Provide --output=<ZIP path>. This prepares files; it does not submit.');
  console.log(JSON.stringify(await packDirectory(path.resolve(target), { recordingUrl })));
}
