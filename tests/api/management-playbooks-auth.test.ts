import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { getUserFromAuthOrApiKey, listAccessiblePlaybooks, createPlaybook } = vi.hoisted(() => ({
  getUserFromAuthOrApiKey: vi.fn(),
  listAccessiblePlaybooks: vi.fn(),
  createPlaybook: vi.fn(),
}));

vi.mock("@/app/api/_shared/auth", () => ({ getUserFromAuthOrApiKey }));
vi.mock("@/lib/repositories/playbooks", () => ({
  listAccessiblePlaybooks,
  createPlaybook,
}));

import { GET, POST } from "@/app/api/manage/playbooks/route";

describe("management REST account authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts the shared session-or-user-key resolver for listing", async () => {
    getUserFromAuthOrApiKey.mockResolvedValue({ id: "user-1" });
    listAccessiblePlaybooks.mockResolvedValue([{ id: "playbook-1" }]);

    const response = await GET(new Request("https://agentplaybooks.ai/api/manage/playbooks") as NextRequest);

    expect(getUserFromAuthOrApiKey).toHaveBeenCalledWith(expect.any(Request), "playbooks:read");
    expect(listAccessiblePlaybooks).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(200);
  });

  it("accepts the shared session-or-user-key resolver for creation", async () => {
    getUserFromAuthOrApiKey.mockResolvedValue({ id: "user-1" });
    createPlaybook.mockResolvedValue({ id: "playbook-1" });

    const response = await POST(new Request("https://agentplaybooks.ai/api/manage/playbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        tags: ["demo"],
        persona_name: "Tester",
        persona_system_prompt: "Test carefully.",
        persona_metadata: { icon: "check" },
      }),
    }) as NextRequest);

    expect(getUserFromAuthOrApiKey).toHaveBeenCalledWith(expect.any(Request), "playbooks:write");
    expect(createPlaybook).toHaveBeenCalledWith("user-1", expect.objectContaining({
      name: "Test",
      tags: ["demo"],
      persona_name: "Tester",
      persona_system_prompt: "Test carefully.",
      persona_metadata: { icon: "check" },
    }));
    expect(response.status).toBe(201);
  });

  it("rejects requests when neither a session nor a user key is valid", async () => {
    getUserFromAuthOrApiKey.mockResolvedValue(null);

    const response = await GET(new Request("https://agentplaybooks.ai/api/manage/playbooks") as NextRequest);

    expect(response.status).toBe(401);
    expect(listAccessiblePlaybooks).not.toHaveBeenCalled();
  });
});
