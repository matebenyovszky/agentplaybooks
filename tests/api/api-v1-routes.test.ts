import { beforeEach, describe, expect, it, vi } from "vitest";
const { account, playbook } = vi.hoisted(() => ({ account: vi.fn(), playbook: vi.fn() }));
vi.mock("@/app/api/control/[operation]/route", () => ({ POST: account }));
vi.mock("@/app/api/playbooks/[guid]/operations/[operation]/route", () => ({ POST: playbook }));
import { POST as accountV1 } from "@/app/api/v1/control/[operation]/route";
import { POST as playbookV1 } from "@/app/api/v1/playbooks/[guid]/operations/[operation]/route";
import { API_MAJOR_HEADER, API_REVISION_HEADER, API_VERSION } from "@/lib/api-contract";

beforeEach(() => {
  vi.clearAllMocks();
  account.mockImplementation(async (request: Request) => Response.json({ arguments: await request.json() }));
  playbook.mockImplementation(async (request: Request) => Response.json({ arguments: await request.json() }));
});

describe("explicit v1 REST routes", () => {
  it("pins the shared account handler without redirecting or replacing credentials", async () => {
    const response = await accountV1(new Request("https://agentplaybooks.ai/api/v1/control/get_secret_status", {
      method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
      body: JSON.stringify({ playbook_id: "pb", secret_name: "LOGIN" }),
    }), { params: Promise.resolve({ operation: "get_secret_status" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ arguments: { playbook_id: "pb", secret_name: "LOGIN" } });
    const forwarded = account.mock.calls[0][0] as Request;
    expect(forwarded.headers.get("Authorization")).toBe("Bearer fixture");
    expect(forwarded.headers.get(API_MAJOR_HEADER)).toBe("1");
    expect(response.headers.get(API_REVISION_HEADER)).toBe(API_VERSION);
  });

  it("uses the same playbook handler and argument shape as the unversioned endpoint", async () => {
    const context = { params: Promise.resolve({ guid: "demo", operation: "read_memory" }) };
    const response = await playbookV1(new Request("https://agentplaybooks.ai/api/v1/playbooks/demo/operations/read_memory", {
      method: "POST", body: JSON.stringify({ key: "decision" }),
    }), context);
    expect(await response.json()).toEqual({ arguments: { key: "decision" } });
    expect(playbook.mock.calls[0][1]).toBe(context);
  });

  it("rejects conflicting path/header versions before reaching authorization or execution", async () => {
    const response = await accountV1(new Request("https://agentplaybooks.ai/api/v1/control/write_memory", {
      method: "POST", headers: { [API_MAJOR_HEADER]: "2" }, body: "{}",
    }), { params: Promise.resolve({ operation: "write_memory" }) });
    expect(response.status).toBe(400);
    expect((await response.json()).data.reason).toBe("api_version_conflict");
    expect(account).not.toHaveBeenCalled();
  });
});
