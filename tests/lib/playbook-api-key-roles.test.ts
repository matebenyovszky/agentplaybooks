import { describe, expect, it } from "vitest";
import {
  PLAYBOOK_API_KEY_ROLE_PERMISSIONS,
  isPlaybookApiKeyRole,
  playbookApiKeyPermissionsForRole,
} from "@/lib/playbook-api-key-roles";
import { grantsPermission } from "@/app/api/_shared/permissions";

describe("playbookApiKeyPermissionsForRole", () => {
  it("treats an omitted or unknown role as viewer, never as a writer", () => {
    expect(playbookApiKeyPermissionsForRole(undefined)).toEqual([
      ...PLAYBOOK_API_KEY_ROLE_PERMISSIONS.viewer,
    ]);
    expect(playbookApiKeyPermissionsForRole("superuser")).toEqual([
      ...PLAYBOOK_API_KEY_ROLE_PERMISSIONS.viewer,
    ]);
    expect(grantsPermission(playbookApiKeyPermissionsForRole("viewer"), "memory:write")).toBe(false);
    expect(grantsPermission(playbookApiKeyPermissionsForRole(null), "memory:write")).toBe(false);
  });

  it("matches dashboard presets for every known role", () => {
    expect(isPlaybookApiKeyRole("auditor")).toBe(true);
    expect(playbookApiKeyPermissionsForRole("auditor")).toEqual(["audit:read", "playbooks:read"]);
    expect(playbookApiKeyPermissionsForRole("admin")).toEqual(["full"]);
    expect(grantsPermission(playbookApiKeyPermissionsForRole("coworker"), "memory:write")).toBe(true);
  });
});
