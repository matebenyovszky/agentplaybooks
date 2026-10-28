import { describe, expect, it } from 'vitest';
import { collectDirectoryFiles, directoryMcp } from '../scripts/pack-openai-directory.mjs';
import { buildZipStore, listZipStore } from '../packages/cli/scripts/pack-openai-skills-zip.mjs';

describe('hosted OpenAI directory package', () => {
  it('round-trips OAuth MCP and a self-contained hosted skill together', async () => {
    const files = await collectDirectoryFiles();
    const unpacked = listZipStore(buildZipStore([...files].map(([name, data]) => ({ name, data }))));
    expect(unpacked.map((file: { name: string }) => file.name)).toContain('mcp.json');
    const mcp = JSON.parse(files.get('mcp.json')!.toString());
    expect(mcp.mcpServers['agentplaybooks-account'].url).toBe('https://agentplaybooks.ai/api/mcp/manage?toolset=full');
    expect(mcp.mcpServers['agentplaybooks-account'].headers).toBeUndefined();
    expect(mcp.mcpServers['agentplaybooks-account'].extensions['com.openai'].auth).toEqual({
      type: 'oauth', client: { mode: 'dcr' }, defaultScopes: ['openid', 'email', 'profile', 'offline_access'],
    });
    const plugin = JSON.parse(files.get('plugin.json')!.toString());
    expect(plugin.name).toBe('agentplaybooks-hosted');
    expect(plugin.extensions['com.openai'].review.test_cases.positive).toHaveLength(5);
    expect(plugin.extensions['com.openai'].review.test_cases.negative).toHaveLength(3);
    expect(files.has(plugin.extensions['com.openai'].onboardingSkill.replace(/^\.\//, ''))).toBe(true);
    const skill = files.get('skills/playbooks/SKILL.md')!.toString();
    expect(skill).toContain('find_tools');
    expect(skill).not.toMatch(/CLAUDE_PLUGIN_ROOT|node packages|\/mcp|agentplaybooks-servers/);
  });

  it('refuses credential-bearing headers and unexpected destinations', () => {
    const server = { type: 'streamable-http', url: 'https://agentplaybooks.ai/api/mcp/manage' };
    expect(() => directoryMcp({ mcpServers: { 'agentplaybooks-account': { ...server, headers: { Authorization: 'secret' } } } })).toThrow('without credentials');
    expect(() => directoryMcp({ mcpServers: { 'agentplaybooks-account': { ...server, extensions: { 'com.openai': { auth: { type: 'api_key', value: 'secret' } } } } } })).toThrow('without credentials');
    expect(() => directoryMcp({ mcpServers: { 'agentplaybooks-account': { ...server, url: 'https://other.example/mcp' } } })).toThrow('public account endpoint');
  });

  it('imports an explicitly supplied public review recording without credentials', async () => {
    const files = await collectDirectoryFiles({ recordingUrl: 'https://example.com/review.mp4' });
    expect(JSON.parse(files.get('plugin.json')!.toString()).extensions['com.openai'].review.demo_recording_url).toBe('https://example.com/review.mp4');
    await expect(collectDirectoryFiles({ recordingUrl: 'http://example.com/review.mp4' })).rejects.toThrow('public HTTPS');
    await expect(collectDirectoryFiles({ recordingUrl: 'https://user:password@example.com/review.mp4' })).rejects.toThrow('without credentials');
  });
});
