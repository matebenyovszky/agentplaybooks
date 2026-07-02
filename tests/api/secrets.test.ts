import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '@/app/api/playbooks/[guid]/secrets/app';
import { getAuthenticatedUser, validateApiKey } from '@/app/api/_shared/auth';
import { getPlaybookByGuid } from '@/app/api/_shared/guards';
import { getServiceSupabase } from '@/app/api/_shared/supabase';

// Mock dependencies
vi.mock('@/app/api/_shared/auth', () => ({
  getAuthenticatedUser: vi.fn(),
  validateApiKey: vi.fn(),
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
  });

  describe('GET /reveal/:name', () => {
    it('should allow access if API key is present AND allow_api_key_reveal is true', async () => {
      // Simulate API key request (no user session)
      vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
      vi.mocked(validateApiKey).mockResolvedValue({ 
        id: 'key1', 
        playbooks: { id: 'playbook1' },
        key_prefix: 'test' 
      } as any);
      vi.mocked(getPlaybookByGuid).mockResolvedValue({
        id: 'playbook1',
        user_id: 'user1',
      } as any);

      // Mock DB call inside reveal
      const mockEq = vi.fn().mockReturnThis();
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
      } as any);

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
      } as any);
      vi.mocked(getPlaybookByGuid).mockResolvedValue({
        id: 'playbook1',
        user_id: 'user1',
      } as any);

      // Mock DB call inside reveal
      const mockEq = vi.fn().mockReturnThis();
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
      } as any);

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
      vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user1' } as any);
      vi.mocked(getPlaybookByGuid).mockResolvedValue({
        id: 'playbook1',
        user_id: 'user1',
      } as any);

      // Mock DB call inside reveal
      const mockEq = vi.fn().mockReturnThis();
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
      } as any);
      
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
      vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user2' } as any);
      vi.mocked(validateApiKey).mockResolvedValue(null);
      vi.mocked(getPlaybookByGuid).mockResolvedValue({
        id: 'playbook1',
        user_id: 'user1', // owner is user1
      } as any);

      const res = await app.request('/api/playbooks/guid1/secrets/reveal/my-secret', {
        method: 'GET'
      });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('only the owner or playbook API key can reveal secrets');
    });
  });
});
