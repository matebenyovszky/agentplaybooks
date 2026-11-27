#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { buildZipStore } from '../packages/cli/scripts/pack-openai-skills-zip.mjs';
import { containsLiteralCredential } from '../packages/cli/src/plugin-package.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function directoryMcp(source) {
  const servers = source.mcpServers;
  if (Object.keys(servers ?? {}).length !== 1) throw new Error('Expected one account MCP server.');
  const server = servers['agentplaybooks-account'];
  const expectedExtensions = { 'com.openai': { auth: { type: 'oauth' } } };
  if (server?.type !== 'streamable-http' || server.url !== 'https://agentplaybooks.ai/api/mcp/manage' ||
      Object.keys(server).some(key => !['type', 'url', 'extensions'].includes(key)) ||
      (server.extensions !== undefined && JSON.stringify(server.extensions) !== JSON.stringify(expectedExtensions))) {
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
  plugin.version = '0.10.2';
  plugin.description = 'Open playbooks and work with their agent instructions, skills, shared memory, and planning documents.';
  const openai = plugin.extensions['com.openai'];
  openai.interface.shortDescription = 'Playbooks and shared memory';
  openai.interface.longDescription = 'Open your AgentPlaybooks playbooks in ChatGPT. Read the skill instructions you need, find decisions in shared memory, and work on canvas documents. Sign in to your AgentPlaybooks account to access the playbooks you own or that others have shared with you.';
  openai.interface.supportURL = 'https://github.com/matebenyovszky/agentplaybooks/issues';
  openai.interface.defaultPrompt = [
    'Show me my playbooks.',
    'Find the release policy in my team handbook.',
    'Open the project planning document in my playbook.',
  ];
  // The high-contrast brand mark works on both themes. Rasterize it once
  // for each slot so directory cards and small composer controls use PNGs.
  openai.interface.logo = openai.interface.logoDark = './assets/logo.png';
  openai.interface.composerIcon = openai.interface.composerIconDark = './assets/composer-icon.png';
  openai.publication = {
    release_notes: 'Read only the skill sections you need. This update also brings a sharper icon and clearer labels to the plugin directory and composer.',
  };
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
  const brandMark = await readFile(path.join(root, 'packages/cli/assets/icon.svg'));
  const [logo, composerIcon] = await Promise.all(
    [512, 128].map(size => sharp(brandMark).resize(size, size).png().toBuffer()),
  );
  const files = new Map([
    ['plugin.json', Buffer.from(JSON.stringify(plugin, null, 2) + '\n')],
    ['mcp.json', Buffer.from(JSON.stringify(mcp, null, 2) + '\n')],
    ['LICENSE', await readFile(path.join(root, 'packages/cli/LICENSE'))],
    ['assets/logo.png', logo],
    ['assets/composer-icon.png', composerIcon],
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
