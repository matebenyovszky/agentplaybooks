import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  beginSecretAudit,
  destinationHostOf,
  flushSecretAudit,
  recordSecretAudit,
  auditActor,
} from "./audit";
import { getServiceSupabase } from "./supabase";

vi.mock("./supabase", () => ({ getServiceSupabase: vi.fn() }));

function mockVault(result: { data?: Record<string, unknown> | null; error: { message: string } | null } = { data: { id: "audit-1" }, error: null }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  vi.mocked(getServiceSupabase).mockReturnValue({
    from: vi.fn().mockReturnValue({ insert }),
  } as unknown as ReturnType<typeof getServiceSupabase>);
  return insert;
}

const context = { playbookId: "playbook1", actor: { type: "owner" as const, id: "user1" } };

describe("auditActor", () => {
  it("prefers the owner session over an API key, matching the handlers' own order", () => {
    expect(auditActor({ id: "user1" }, { key_prefix: "apb_live_abc" })).toEqual({
      type: "owner",
      id: "user1",
    });
  });

  it("identifies an API key by its prefix", () => {
    expect(auditActor(null, { key_prefix: "apb_live_abc" })).toEqual({
      type: "api_key",
      id: "apb_live_abc",
    });
  });

  it("falls back to anonymous when neither credential was accepted", () => {
    expect(auditActor(null, null)).toEqual({ type: "anonymous", id: null });
  });
});

describe("destinationHostOf", () => {
  it("keeps the host and drops the path, query and port-less rest of the URL", () => {
    expect(destinationHostOf("https://API.example.com/v1/users?token=abc123&ssn=1")).toBe(
      "api.example.com",
    );
  });

  it("returns null rather than a fragment when the URL will not parse", () => {
    expect(destinationHostOf("not a url")).toBeNull();
    expect(destinationHostOf(null)).toBeNull();
    expect(destinationHostOf(undefined)).toBeNull();
  });
});

describe("beginSecretAudit", () => {
  it("starts denied, so a throw before the authorization check records a refusal", () => {
    expect(beginSecretAudit("secret.use")).toEqual({ operation: "secret.use", status: "denied" });
  });
});

describe("flushSecretAudit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing when the operation was not a vault operation", async () => {
    const insert = mockVault();
    await flushSecretAudit(context, null, "success");
    expect(insert).not.toHaveBeenCalled();
  });

  it("records success and clears any reason left behind", async () => {
    const insert = mockVault();
    const draft = beginSecretAudit("secret.rotate", { secretName: "DEPLOY_KEY", reason: "stale" });
    await flushSecretAudit(context, draft, "success");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "secret.rotate", status: "success", error_code: null }),
    );
  });

  it("keeps a failure before authorization as denied", async () => {
    const insert = mockVault();
    const draft = beginSecretAudit("secret.use");
    draft.reason = "not_authorized";
    await flushSecretAudit(context, draft, "failure");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "denied", error_code: "not_authorized" }),
    );
  });

  it("keeps a failure after authorization as an error, with a fallback code", async () => {
    const insert = mockVault();
    const draft = beginSecretAudit("secret.use");
    draft.status = "error"; // the handler's key was accepted
    await flushSecretAudit(context, draft, "failure", "tool_error");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", error_code: "tool_error" }),
    );
  });
});

describe("recordSecretAudit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the actor, the operation and the destination host, and nothing else", async () => {
    const insert = mockVault();
    await recordSecretAudit(
      { playbookId: "playbook1", actor: { type: "api_key", id: "apb_live_abc" }, requestId: "ray1" },
      {
        operation: "secret.use",
        status: "success",
        secretName: "OPENAI_API_KEY",
        target: "api.openai.com",
      },
    );
    // The federated columns stay null: a vault event has no MCP server, and the
    // reader tells the two kinds apart by the `secret.` prefix alone.
    expect(insert).toHaveBeenCalledWith({
      playbook_id: "playbook1",
      mcp_server_id: null,
      operation: "secret.use",
      target: "api.openai.com",
      status: "success",
      error_code: null,
      actor_type: "api_key",
      actor_id: "apb_live_abc",
      secret_name: "OPENAI_API_KEY",
      request_id: "ray1",
    });
  });

  it("swallows a failing write: an audit outage must not take the vault down", async () => {
    mockVault({ data: null, error: { message: "relation does not exist" } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordSecretAudit(context, { operation: "secret.delete", status: "success", secretName: "X" }),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("swallows a throwing client too", async () => {
    vi.mocked(getServiceSupabase).mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for privileged database access");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordSecretAudit(context, { operation: "secret.reveal", status: "denied", secretName: "X" }),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
