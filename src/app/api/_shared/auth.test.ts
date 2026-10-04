import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getServiceSupabaseMock,
  hashApiKeyMock,
} = vi.hoisted(() => ({
  getServiceSupabaseMock: vi.fn(),
  hashApiKeyMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn() })),
}));

vi.mock("@/lib/utils", () => ({
  hashApiKey: hashApiKeyMock,
}));

vi.mock("./supabase", () => ({
  getServiceSupabase: getServiceSupabaseMock,
  getSupabase: vi.fn(),
}));

import { validateApiKey, validateUserApiKey } from "./auth";

type QueryResult = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};

function createTableQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("API key authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashApiKeyMock.mockResolvedValue("hashed-key");
  });

  it("validates a playbook API key through the service client", async () => {
    const apiKeyQuery = createTableQuery({
      data: {
        id: "key-1",
        playbook_id: "playbook-1",
        key_hash: "hashed-key",
        key_prefix: "apb_test",
        name: "Automation",
        role: "viewer",
        permissions: ["playbooks:read"],
        last_used_at: null,
        expires_at: null,
        rotated_at: null,
        is_active: true,
        created_at: "2026-07-24T00:00:00.000Z",
      },
      error: null,
    });
    const playbookQuery = createTableQuery({
      data: { id: "playbook-1", guid: "public-guid" },
      error: null,
    });
    const supabase = {
      from: vi.fn((table: string) => (
        table === "api_keys" ? apiKeyQuery : playbookQuery
      )),
    };
    getServiceSupabaseMock.mockReturnValue(supabase);

    const request = new Request("https://apbks.com/api/playbooks/public-guid", {
      headers: { Authorization: "Bearer apb_secret" },
    });

    await expect(validateApiKey(request, "playbooks:read")).resolves.toMatchObject({
      id: "key-1",
      playbooks: { id: "playbook-1", guid: "public-guid" },
    });
    expect(hashApiKeyMock).toHaveBeenCalledWith("apb_secret");
    expect(apiKeyQuery.update).toHaveBeenCalledWith({
      last_used_at: expect.any(String),
    });
  });

  it("shares a request's key lookup without sharing permissions or later requests", async () => {
    const apiKeyQuery = createTableQuery({
      data: {
        id: "key-1",
        playbook_id: "playbook-1",
        key_prefix: "apb_test",
        role: "viewer",
        permissions: ["memory:read"],
        last_used_at: null,
        expires_at: null,
        is_active: true,
      },
      error: null,
    });
    const playbookQuery = createTableQuery({
      data: { id: "playbook-1", guid: "private-guid" },
      error: null,
    });
    getServiceSupabaseMock.mockReturnValue({
      from: vi.fn((table: string) => table === "api_keys" ? apiKeyQuery : playbookQuery),
    });

    const request = new Request("https://apbks.com/api/mcp/private-guid", {
      headers: { Authorization: "Bearer apb_secret" },
    });
    await expect(validateApiKey(request, "memory:read")).resolves.toMatchObject({ id: "key-1" });
    await expect(validateApiKey(request, "tools:call")).resolves.toBeNull();
    await expect(validateApiKey(request, "memory:read")).resolves.toMatchObject({ id: "key-1" });
    expect(hashApiKeyMock).toHaveBeenCalledTimes(1);
    expect(apiKeyQuery.maybeSingle).toHaveBeenCalledTimes(1);
    expect(playbookQuery.maybeSingle).toHaveBeenCalledTimes(1);
    expect(apiKeyQuery.update).toHaveBeenCalledTimes(1);

    const nextRequest = new Request(request.url, { headers: request.headers });
    await expect(validateApiKey(nextRequest, "memory:read")).resolves.toMatchObject({ id: "key-1" });
    expect(apiKeyQuery.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("avoids a database write when last use was recorded in the past minute", async () => {
    const userKeyQuery = createTableQuery({
      data: {
        id: "user-key-1",
        user_id: "user-1",
        key_prefix: "apb_test",
        permissions: ["playbooks:read"],
        last_used_at: new Date().toISOString(),
        expires_at: null,
        is_active: true,
      },
      error: null,
    });
    getServiceSupabaseMock.mockReturnValue({ from: vi.fn(() => userKeyQuery) });
    const request = new Request("https://apbks.com/api/mcp/manage", {
      headers: { Authorization: "Bearer apb_secret" },
    });
    await expect(validateUserApiKey(request, "playbooks:read")).resolves.toMatchObject({ id: "user-key-1" });
    expect(userKeyQuery.update).not.toHaveBeenCalled();
  });

  it("rejects expired user API keys without updating last use", async () => {
    const userKeyQuery = createTableQuery({
      data: {
        id: "user-key-1",
        user_id: "user-1",
        key_hash: "hashed-key",
        key_prefix: "apb_test",
        name: null,
        permissions: ["playbooks:read"],
        last_used_at: null,
        expires_at: "2020-01-01T00:00:00.000Z",
        is_active: true,
        created_at: "2020-01-01T00:00:00.000Z",
      },
      error: null,
    });
    getServiceSupabaseMock.mockReturnValue({
      from: vi.fn(() => userKeyQuery),
    });

    const request = new Request("https://apbks.com/api/manage/playbooks", {
      headers: { Authorization: "Bearer apb_expired" },
    });

    await expect(validateUserApiKey(request, "playbooks:read")).resolves.toBeNull();
    expect(userKeyQuery.update).not.toHaveBeenCalled();
  });
});
