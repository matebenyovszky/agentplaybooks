import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/cron/audit-purge/route";
import { getServiceSupabase } from "@/app/api/_shared/supabase";

vi.mock("@/app/api/_shared/supabase", () => ({
  getServiceSupabase: vi.fn(),
}));

describe("POST /api/cron/audit-purge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUDIT_CRON_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.AUDIT_RETENTION_DAYS;
  });

  it("hides the endpoint when no cron secret is configured", async () => {
    const res = await POST(new Request("http://localhost/api/cron/audit-purge", { method: "POST" }));
    expect(res.status).toBe(404);
  });

  it("keeps forever when retention is unset", async () => {
    process.env.AUDIT_CRON_SECRET = "cron-secret";
    const res = await POST(new Request("http://localhost/api/cron/audit-purge", {
      method: "POST",
      headers: { Authorization: "Bearer cron-secret" },
    }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ purged: 0, kept: "forever" });
    expect(getServiceSupabase).not.toHaveBeenCalled();
  });

  it("calls purge_audit_logs when retention is configured", async () => {
    process.env.AUDIT_CRON_SECRET = "cron-secret";
    process.env.AUDIT_RETENTION_DAYS = "30";
    const rpc = vi.fn().mockResolvedValue({ data: { purged: 9, playbooks: 2 }, error: null });
    vi.mocked(getServiceSupabase).mockReturnValue({ rpc } as never);
    const res = await POST(new Request("http://localhost/api/cron/audit-purge", {
      method: "POST",
      headers: { Authorization: "Bearer cron-secret" },
    }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("purge_audit_logs", expect.objectContaining({
      p_playbook_id: null,
      p_actor_type: "system",
    }));
  });
});
