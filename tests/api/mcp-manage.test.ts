import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '@/app/api/mcp/manage/route';
import { createMockRequest, mockUser } from '../utils';
import { createServerClient } from '@/lib/supabase/client';

describe('MCP Management API', () => {
    const supabase = createServerClient('', '') as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Mock API Key Validation
    const mockUserApiKey = {
        id: 'key-123',
        user_id: mockUser.id,
        permissions: ['full'], // Full permissions
        is_active: true,
    };

    describe('POST /api/mcp/manage', () => {
        it('should list playbooks', async () => {
            // Mock API key validation
            vi.mocked(supabase.from).mockReturnValue(supabase);
            vi.mocked(supabase.select).mockReturnValue(supabase);
            vi.mocked(supabase.eq).mockReturnValue(supabase);
            vi.mocked(supabase.single).mockResolvedValue({
                data: mockUserApiKey,
                error: null,
            } as any);

            vi.mocked(supabase.update).mockReturnValue(supabase); // For last_used_at update

            // Mock list_playbooks query
            vi.mocked(supabase.order).mockReturnValue({
                data: [],
                error: null,
            } as any);

            const payload = {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: 'list_playbooks',
                    arguments: {},
                },
                id: 1,
            };

            const req = createMockRequest('POST', '/api/mcp/manage', payload, {
                'Authorization': 'Bearer apb_mock_key',
            });
            const res = await app.request(req);

            expect(res.status).toBe(200);
            const body = await res.json();

            // Check success response
            expect(body.error).toBeUndefined();
            expect(body.result).toBeDefined();
        });

        it('should return error if unauthenticated', async () => {
            // Mock API key lookup failure
            vi.mocked(supabase.from).mockReturnValue(supabase);
            vi.mocked(supabase.select).mockReturnValue(supabase);
            vi.mocked(supabase.eq).mockReturnValue(supabase);
            vi.mocked(supabase.single).mockResolvedValue({
                data: null,
                error: null,
            } as any);

            const payload = {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: { name: 'list_playbooks' },
                id: 1,
            };

            const req = createMockRequest('POST', '/api/mcp/manage', payload);
            const res = await app.request(req);

            expect(res.status).toBe(200); // MCP returns 200 with error object
            const body = await res.json();
            expect(body.error).toBeDefined();
            expect(body.error.code).toBe(-32001); // Auth required
        });
    });
});
