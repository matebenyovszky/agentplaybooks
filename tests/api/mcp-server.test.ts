import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '@/app/api/mcp/[guid]/route';
import { createMockRequest, mockPlaybook } from '../utils';
import { createServerClient } from '@/lib/supabase/client';

describe('MCP Server API', () => {
    const supabase = createServerClient('', '') as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/mcp/:guid', () => {
        it('should return the MCP manifest', async () => {
            // Mock playbook lookup
            vi.mocked(supabase.from).mockReturnValue(supabase);
            vi.mocked(supabase.select).mockReturnValue(supabase);
            vi.mocked(supabase.eq).mockReturnValue(supabase);
            vi.mocked(supabase.single).mockResolvedValue({
                data: { ...mockPlaybook, is_public: true },
                error: null,
            } as any);

            // Mock related data (skills, mcp_servers) which are fetched via Promise.all
            // The implementation calls select() multiple times.
            // We can mock the responses based on the call order or just return empty arrays for now.
            // Since `single()` is called for playbook first, then `Promise.all` calls `select` twice.
            // But we are returning `this` (supabase) for select.
            // We need to be careful about `single()` vs list results.
            // Actually `mockSupabase.select` returns `this`. The usage is `await supabase...`.
            // For `Promise.all` it calls `.then`. Does our mock support that?
            // `vi.fn().mockReturnThis()` returns the object.
            // But `supabase.select()` returns `this`.
            // `await` expects a Promise.
            // If `mockSupabase` methods return `this`, and `this` is NOT a promise, `await` just resolves to `this`.
            // But the code expects `{ data, error }`.
            // If we don't return a Promise that resolves to `{ data }`, we might have issues if the code does `.then()`.
            // BUT `supabase-js` returns a `PostgrestBuilder` which is thenable.
            // Our mock returns `this`.
            // If we simply treat `supabase` as the result, it needs `data` property.
            // Let's add `data` property to the mock object or use `mockResolvedValue` for specific chains?
            // `vi.fn().mockReturnThis()` is synchronous.

            // In `setup.ts`:
            // `select: vi.fn().mockReturnThis()`
            // `single: vi.fn().mockResolvedValue(...)`

            // The code does:
            // const [skillsRes, mcpRes] = await Promise.all([
            //   supabase.from("skills").select("*").eq("playbook_id", playbook.id),
            //   ...
            // ]);
            // `supabase.from(...).select(...).eq(...)` returns the builder.
            // `await builder` works if builder has `.then`.
            // Our mock returns `this`. Does `this` have `.then` (is it a Promise)? No.
            // So `await` resolves immediately to the builder object.
            // The code then reads `skillsRes.data`. So the builder object must have `data`.
            // We should attach `data: []` to the mock object in `beforeEach` or setup.
            supabase.data = [];

            const req = createMockRequest('GET', `/api/mcp/${mockPlaybook.guid}`);
            const res = await app.request(req);

            expect(res.status).toBe(200);
            const manifest = await res.json();
            expect(manifest.serverInfo.name).toBe(mockPlaybook.name);
        });
    });

    describe('POST /api/mcp/:guid', () => {
        it('should list tools', async () => {
            // Mock playbook
            vi.mocked(supabase.from).mockReturnValue(supabase);
            vi.mocked(supabase.select).mockReturnValue(supabase);
            vi.mocked(supabase.eq).mockReturnValue(supabase);
            vi.mocked(supabase.single).mockResolvedValue({
                data: { ...mockPlaybook, is_public: true },
                error: null,
            } as any);

            // Mock skills list
            supabase.data = [];

            const payload = {
                jsonrpc: '2.0',
                method: 'tools/list',
                id: 1,
            };

            const req = createMockRequest('POST', `/api/mcp/${mockPlaybook.guid}`, payload);
            const res = await app.request(req);

            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.result.tools).toBeDefined();
            expect(body.result.tools.some((t: any) => t.name === 'read_memory')).toBe(true);
        });
    });
});
