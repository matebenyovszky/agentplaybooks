export function createMockRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
): Request {
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
  is_public: true,
  visibility: 'public',
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
