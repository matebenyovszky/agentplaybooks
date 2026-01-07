import { vi } from 'vitest';

// Mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

// Mock Supabase client
const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        setSession: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
};

// Mock @/lib/supabase/client
vi.mock('@/lib/supabase/client', () => ({
    createBrowserClient: () => mockSupabase,
    createServerClient: () => mockSupabase,
}));

// Mock next/headers
vi.mock('next/headers', () => ({
    cookies: () => ({
        get: vi.fn().mockReturnValue({ value: 'mock-token' }),
    }),
}));

// Mock next/server
vi.mock('next/server', () => {
    const actual = vi.importActual('next/server');
    return {
        ...actual,
        NextResponse: {
            json: (body: any, options?: any) => ({
                status: options?.status || 200,
                json: async () => body,
            }),
        },
    }
});
