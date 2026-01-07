import { Hono } from 'hono';
import { vi } from 'vitest';

export function createMockRequest(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
    const reqInit: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    };

    if (body) {
        reqInit.body = JSON.stringify(body);
    }

    // @ts-ignore - Mocking NextRequest/Request
    return new Request(`http://localhost${path}`, reqInit);
}

export const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
};

export const mockPlaybook = {
    id: 'playbook-123',
    guid: 'guid-123',
    user_id: mockUser.id,
    name: 'Test Playbook',
    description: 'A test playbook',
    is_public: true, // Updated property name
    visibility: 'public', // Kept for backward compat in tests if needed, but schema uses enum? Code uses visibility column logic but insert uses is_public? Let's check code.
    // Code insert: is_public: is_public || false
    // Code select: .eq("is_public", true) in some places, .eq("visibility", "public") in others?
    // Re-reading code:
    // GET /mcp/:guid uses .eq("is_public", true)
    // GET /playbooks/:guid uses .eq("visibility", "public") for check?
    // Let's stick to what the code expects. The code seems to be transitioning.
    // We will provide both to be safe in mocks until verified.
    persona_name: 'Test Assistant',
    persona_system_prompt: 'You are a test assistant.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

export const mockApiKey = {
    id: 'key-123',
    playbook_id: mockPlaybook.id,
    key_hash: 'hash-123',
    permissions: ['full'],
    is_active: true,
};
