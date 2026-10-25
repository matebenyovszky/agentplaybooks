import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '@/app/api/playbooks/[guid]/secrets/app';
import { getAuthenticatedUser, storedDisplayPrefix, validateApiKey } from '@/app/api/_shared/auth';
import { getPlaybookByGuid } from '@/app/api/_shared/guards';
import { getServiceSupabase } from '@/app/api/_shared/supabase';

// Mock dependencies
vi.mock('@/app/api/_shared/auth', () => ({
  getAuthenticatedUser: vi.fn(),
  validateApiKey: vi.fn(),
  storedDisplayPrefix: vi.fn(),
}));

vi.mock('@/app/api/_shared/guards', () => ({
  getPlaybookByGuid: vi.fn(),
}));

vi.mock('@/app/api/_shared/supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock('@/lib/crypto', () => ({
  decryptSecret: vi.fn().mockResolvedValue('decrypted_value'),
  encryptSecret: vi.fn()
}));

describe('Secrets API - Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storedDisplayPrefix).mockResolvedValue("apb_live_abc");
  });

  describe('GET /reveal/:name', () => {
    it('should allow access if API key is present AND allow_api_key_reveal is true', async () => {
      // Simulate API key request (no user session)
      vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
      vi.mocked(validateApiKey).mockResolvedValue({ 
        id: 'key1', 
        playbooks: { id: 'playbook1' },
        key_prefix: 'test' 
      } as unknown as Awaited<ReturnType<typeof validateApiKey>>);
      vi.mocked(getPlaybookByGuid).mockResolvedValue({
        id: 'playbook1',
        user_id: 'user1',
      } as unknown as Awaited<ReturnType<typeof getPlaybookByGuid>>);

      // Mock DB call inside reveal
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'sec1',
          name: 'my-secret',
          encrypted_value: 'val',
          iv: 'iv',
          auth_tag: 'tag',
          allow_api_key_reveal: true
        },
        error: null
      });
      
      vi.mocked(getServiceSupabase).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            single: mockSingle
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn()
          })
        })
      } as unknown as ReturnType<typeof getServiceSupabase>);

      const res = await app.request('/api/playbooks/guid1/secrets/reveal/my-secret', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer apb_live_test' }
      });
      
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.value).toBe('decrypted_value');
    });

    it('should deny access if API key is present BUT allow_api_key_reveal is false', async () => {
      // Simulate API key request (no user session)
      vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
      vi.mocked(validateApiKey).mockResolvedValue({ 
        id: 'key1', 
        playbooks: { id: 'playbook1' },
        key_prefix: 'test' 
      } as unknown as Awaited<ReturnType<typeof validateApiKey>>);
      vi.mocked(getPlaybookByGuid).mockResolvedValue({
        id: 'playbook1',
        user_id: 'user1',
      } as unknown as Awaited<ReturnType<typeof getPlaybookByGuid>>);

      // Mock DB call inside reveal
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'sec1',
          name: 'my-secret',
          encrypted_value: 'val',
          iv: 'iv',
          auth_tag: 'tag',
          allow_api_key_reveal: false
        },
        error: null
      });
      
      vi.mocked(getServiceSupabase).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            single: mockSingle
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn()
          })
        })
      } as unknown as ReturnType<typeof getServiceSupabase>);

      const res = await app.request('/api/playbooks/guid1/secrets/reveal/my-secret', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer apb_live_test' }
      });
      
      const data = await res.json();
      expect(res.status).toBe(403);
      expect(data.error).toContain('Proxy Only: API keys are not permitted to reveal this secret');
    });

    it('should allow access for playbook owner with valid session regardless of allow_api_key_reveal', async () => {
      // Simulate Owner session
      vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user1' });
      vi.mocked(getPlaybookByGuid).mockResolvedValue({
        id: 'playbook1',
        user_id: 'user1',
      } as unknown as Awaited<ReturnType<typeof getPlaybookByGuid>>);

      // Mock DB call inside reveal
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'sec1',
          name: 'my-secret',
          encrypted_value: 'val',
          iv: 'iv',
          auth_tag: 'tag',
          allow_api_key_reveal: false // owner can still see it
        },
        error: null
      });
      
      vi.mocked(getServiceSupabase).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            single: mockSingle
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn()
          })
        })
      } as unknown as ReturnType<typeof getServiceSupabase>);
      
      const res = await app.request('/api/playbooks/guid1/secrets/reveal/my-secret', {
        method: 'GET',
      });
      
      // If it passes owner check, it hits the DB logic and decrypt
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.value).toBe('decrypted_value');
    });

    it('should deny access for non-owner valid session', async () => {
      // Simulate non-owner session
      vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user2' });
      vi.mocked(validateApiKey).mockResolvedValue(null);
      vi.mocked(getPlaybookByGuid).mockResolvedValue({
        id: 'playbook1',
        user_id: 'user1', // owner is user1
      } as unknown as Awaited<ReturnType<typeof getPlaybookByGuid>>);

      const res = await app.request('/api/playbooks/guid1/secrets/reveal/my-secret', {
        method: 'GET'
      });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('only the owner or playbook API key can reveal secrets');
    });
  });
});

describe('Secrets API - audit trail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(storedDisplayPrefix).mockResolvedValue("apb_live_abc");
  });

  /**
   * A supabase double that tells the two tables apart, so a test can read what
   * was written to `audit_logs` while `secrets` answers normally.
   */
  function mockSupabaseWithAudit(secretRow: Record<string, unknown> | null) {
    const auditInsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getServiceSupabase).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'audit_logs') return { insert: auditInsert };
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: secretRow,
              error: secretRow ? null : { message: 'not found' },
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn() }),
        };
      }),
    } as unknown as ReturnType<typeof getServiceSupabase>);
    return auditInsert;
  }

  it('records a refused reveal, not just a successful one', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    vi.mocked(validateApiKey).mockResolvedValue({
      id: 'key1',
      playbooks: { id: 'playbook1' },
      key_prefix: 'apb_live_abc',
    } as unknown as Awaited<ReturnType<typeof validateApiKey>>);
    vi.mocked(getPlaybookByGuid).mockResolvedValue({
      id: 'playbook1',
      user_id: 'user1',
    } as unknown as Awaited<ReturnType<typeof getPlaybookByGuid>>);

    const auditInsert = mockSupabaseWithAudit({
      id: 'sec1',
      name: 'my-secret',
      encrypted_value: 'val',
      iv: 'iv',
      auth_tag: 'tag',
      allow_api_key_reveal: false,
    });

    const res = await app.request('/api/playbooks/guid1/secrets/reveal/my-secret', {
      method: 'GET',
      headers: { Authorization: 'Bearer apb_live_test' },
    });

    expect(res.status).toBe(403);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        playbook_id: 'playbook1',
        secret_name: 'my-secret',
        operation: 'secret.reveal',
        status: 'denied',
        actor_type: 'api_key',
        actor_id: 'apb_live_abc',
        error_code: 'reveal_not_permitted_for_api_key',
      }),
    );
  });

  it('records a successful reveal', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user1' });
    vi.mocked(getPlaybookByGuid).mockResolvedValue({
      id: 'playbook1',
      user_id: 'user1',
    } as unknown as Awaited<ReturnType<typeof getPlaybookByGuid>>);

    const auditInsert = mockSupabaseWithAudit({
      id: 'sec1',
      name: 'my-secret',
      encrypted_value: 'val',
      iv: 'iv',
      auth_tag: 'tag',
      allow_api_key_reveal: false,
    });

    const res = await app.request('/api/playbooks/guid1/secrets/reveal/my-secret', { method: 'GET' });

    expect(res.status).toBe(200);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'secret.reveal',
        status: 'success',
        actor_type: 'owner',
        actor_id: 'user1',
      }),
    );
    // The value that was just decrypted must not appear anywhere in the row.
    const row = JSON.stringify(auditInsert.mock.calls[0][0]);
    expect(row).not.toContain('decrypted_value');
  });

  it('never lets an audit write failure break the operation', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user1' });
    vi.mocked(getPlaybookByGuid).mockResolvedValue({
      id: 'playbook1',
      user_id: 'user1',
    } as unknown as Awaited<ReturnType<typeof getPlaybookByGuid>>);
    vi.mocked(getServiceSupabase).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'audit_logs') {
          return { insert: vi.fn().mockRejectedValue(new Error('audit table unavailable')) };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'sec1', name: 'my-secret', encrypted_value: 'v', iv: 'i', auth_tag: 't', allow_api_key_reveal: false },
              error: null,
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn() }),
        };
      }),
    } as unknown as ReturnType<typeof getServiceSupabase>);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await app.request('/api/playbooks/guid1/secrets/reveal/my-secret', { method: 'GET' });

    expect(res.status).toBe(200);
    consoleError.mockRestore();
  });
});
