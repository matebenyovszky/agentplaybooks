import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testApp as app } from '@/app/api/test-app';
import { createMockRequest, mockUser, mockPlaybook } from '../utils';

// Mock Supabase client
const mockSupabase = {
    from: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    in: vi.fn(),
};

// Override the global mock for this specific test if needed,
// but the global setup already mocks @/lib/supabase/client.
// However, since `app` imports `getServiceSupabase` which uses `createServerClient`,
// we rely on the global mock in `tests/setup.ts` which returns a mock object.
// We can access that mock object via the import to assert on it.

import { createServerClient } from '@/lib/supabase/client';

describe('Main API', () => {
    const supabase = createServerClient('', ''); // Get the mock instance

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/playbooks', () => {
        it('should list playbooks for authenticated user', async () => {
            // Mock auth (cookie or header) - we'll use header helper in createMockRequest?
            // Actually `requireAuth` checks cookie then header.
            // We can mock `cookies()` in setup, or just pass Authorization header.

            // Mock User Auth
            vi.mocked(supabase.auth.getUser).mockResolvedValue({
                data: { user: mockUser as any },
                error: null,
            });

            // Mock Database Response
            vi.mocked(supabase.from).mockReturnValue(supabase as any);
            vi.mocked(supabase.select).mockReturnValue(supabase as any);
            vi.mocked(supabase.eq).mockReturnValue(supabase as any);
            vi.mocked(supabase.order).mockReturnValue({
                data: [mockPlaybook],
                error: null,
            } as any);

            const req = createMockRequest('GET', '/api/playbooks', null, {
                'Authorization': 'Bearer mock-token',
            });
            const res = await app.request(req);

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveLength(1);
            expect(data[0].id).toBe(mockPlaybook.id);
        });

        it('should return 401 if not authenticated', async () => {
            // Mock User Auth Fails
            vi.mocked(supabase.auth.getUser).mockResolvedValue({
                data: { user: null },
                error: new Error('Auth error') as any,
            });

            // Ensure legacy cookie mock doesn't return user
            // (Depends on how setup.ts mocks it - giving "mock-token" but `setSession` needs to succeed)
            vi.mocked(supabase.auth.setSession).mockResolvedValue({
                data: { user: null },
                error: new Error("No session") as any
            });


            const req = createMockRequest('GET', '/api/playbooks');
            const res = await app.request(req);
            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/playbooks', () => {
        it('should create a new playbook', async () => {
            vi.mocked(supabase.auth.getUser).mockResolvedValue({
                data: { user: mockUser as any },
                error: null,
            });

            vi.mocked(supabase.from).mockReturnValue(supabase as any);
            vi.mocked(supabase.insert).mockReturnValue(supabase as any);
            vi.mocked(supabase.select).mockReturnValue(supabase as any);
            vi.mocked(supabase.single).mockResolvedValue({
                data: mockPlaybook,
                error: null,
            } as any);

            const payload = {
                name: 'New Playbook',
                description: 'Description',
                is_public: false,
            };

            const req = createMockRequest('POST', '/api/playbooks', payload, {
                'Authorization': 'Bearer mock-token',
            });
            const res = await app.request(req);

            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.name).toBe(mockPlaybook.name); // Mock returns hardcoded playbook
        });
    });
});
