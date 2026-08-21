import { describe, expect, it } from "vitest";
import {
  PLAYBOOK_TOOLS,
  projectPlaybookToolsForUser,
} from "@/app/api/_shared/playbook-tools";
import { ACCOUNT_TOOLS } from "@/app/api/_shared/account-tools";
import { operationPathsFromTools } from "@/app/api/_shared/operation-openapi";

function schema(toolName: string, tools = PLAYBOOK_TOOLS) {
  const tool = tools.find((candidate) => candidate.name === toolName);
  expect(tool, `${toolName} should be registered`).toBeDefined();
  return tool!.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

describe("playbook operation projections", () => {
  it("publishes the full playbook surface from one canonical catalog", () => {
    const names = PLAYBOOK_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining([
      "create_skill",
      "write_memory",
      "create_run",
      "write_canvas",
      "create_mcp_server",
      "call_connected_tool",
      "store_secret",
    ]));
  });

  it("binds playbook identity in the direct route and lifts it in the user control plane", () => {
    const projected = projectPlaybookToolsForUser();
    expect(projected.map((tool) => tool.name)).toEqual(PLAYBOOK_TOOLS.map((tool) => tool.name));

    for (const tool of projected) {
      const projectedSchema = tool.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(projectedSchema.properties).toHaveProperty("playbook_id");
      expect(projectedSchema.required).toContain("playbook_id");
    }

    for (const tool of PLAYBOOK_TOOLS) {
      expect((tool.inputSchema?.properties as Record<string, unknown> | undefined)?.playbook_id).toBeUndefined();
    }
  });

  it("requires workflow-run identity for individual canvas documents", () => {
    expect(schema("read_canvas").required).toEqual(expect.arrayContaining(["run_id", "slug"]));
    expect(schema("write_canvas").required).toEqual(expect.arrayContaining(["run_id", "slug", "name", "content"]));
    expect(schema("patch_canvas_section").required).toContain("run_id");
  });

  it("generates OpenAPI operation paths from the same catalog", () => {
    const paths = operationPathsFromTools(
      PLAYBOOK_TOOLS,
      (tool) => `/playbooks/demo/operations/${tool.name}`,
      "apiKey",
    );
    expect(Object.keys(paths)).toHaveLength(PLAYBOOK_TOOLS.length);
    expect(paths).toHaveProperty("/playbooks/demo/operations/create_run");
    expect(paths).toHaveProperty("/playbooks/demo/operations/store_secret");
  });
});

describe("hosted MCP tool definition quality", () => {
  const manageTools = [...ACCOUNT_TOOLS, ...projectPlaybookToolsForUser()];

  it("keeps the 49-tool control-plane surface", () => {
    // 42nd playbook tool: use_secret_write, the mutating half of use_secret —
    // the Connectors Directory rejects one tool spanning safe and unsafe verbs.
    expect(ACCOUNT_TOOLS).toHaveLength(7);
    expect(PLAYBOOK_TOOLS).toHaveLength(42);
    expect(manageTools).toHaveLength(49);
    expect(new Set(manageTools.map((tool) => tool.name)).size).toBe(49);
  });

  it("declares MCP annotations on every manage tool", () => {
    for (const tool of manageTools) {
      const hints = tool.annotations;
      expect(hints, `${tool.name} is missing annotations`).toBeDefined();
      expect(typeof hints!.readOnlyHint).toBe("boolean");
      expect(typeof hints!.destructiveHint).toBe("boolean");
      expect(typeof hints!.idempotentHint).toBe("boolean");
      expect(typeof hints!.openWorldHint).toBe("boolean");
    }
  });

  it("marks reads as read-only except read_memory, which increments access_count", () => {
    const readOnly = manageTools.filter((tool) =>
      /^(list_|get_|search_)/.test(tool.name) || tool.name === "read_canvas",
    );
    for (const tool of readOnly) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
    }

    const readMemory = manageTools.find((tool) => tool.name === "read_memory");
    expect(readMemory?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    });
  });

  it("marks deletes and other destructive writes", () => {
    for (const name of [
      "delete_playbook",
      "delete_persona",
      "delete_memory",
      "delete_skill",
      "delete_mcp_server",
      "delete_run",
      "delete_secret",
      "rotate_secret",
      "write_memory",
      "write_canvas",
    ]) {
      const tool = manageTools.find((candidate) => candidate.name === name);
      expect(tool?.annotations, name).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      });
    }
  });

  it("sets openWorldHint only on tools that call outside the playbook", () => {
    const openWorld = manageTools.filter((tool) => tool.annotations?.openWorldHint);
    expect(openWorld.map((tool) => tool.name).sort()).toEqual([
      "call_connected_tool",
      "use_secret",
      "use_secret_write",
    ]);
  });

  it("projects playbook tools with a complete playbook_id sentence instead of a run-on suffix", () => {
    const projected = projectPlaybookToolsForUser();
    for (const tool of projected) {
      expect(tool.description).not.toMatch(/playbook Target a playbook/);
      expect(tool.description).not.toContain("Target a playbook with playbook_id.");
      expect(tool.description).toMatch(/\. Pass playbook_id as the UUID or GUID of the playbook this call should target\.$/);
      expect(tool.annotations).toEqual(PLAYBOOK_TOOLS.find((source) => source.name === tool.name)?.annotations);
    }
  });

  it("rewrites C-tier copy so delete vs archive vs reset is explicit", () => {
    const deletePersona = ACCOUNT_TOOLS.find((tool) => tool.name === "delete_persona");
    expect(deletePersona?.description).toMatch(/Despite the delete_\* name, this is not a hard delete/i);
    expect(deletePersona?.description).toMatch(/persona_id must equal playbook_id/i);
    expect(deletePersona?.description).toMatch(/personas:write/i);
    expect(deletePersona?.description).toMatch(/update_persona/);
    expect(deletePersona?.description).not.toMatch(/^Reset the singleton persona to the default assistant\./);

    const projected = projectPlaybookToolsForUser();
    const getSkill = projected.find((tool) => tool.name === "get_skill");
    expect(getSkill?.description).toMatch(/^Return the full definition of one skill/);
    expect(getSkill?.description).toMatch(/list_skills/);
    expect(getSkill?.description).not.toMatch(/skill Target a playbook/);

    const listSkills = projected.find((tool) => tool.name === "list_skills");
    expect(listSkills?.description).toMatch(/^List every skill currently attached/);
    expect(listSkills?.description).toMatch(/list_skill_versions/);
    expect(listSkills?.description).not.toMatch(/playbook Target a playbook/);

    const deleteMemory = projected.find((tool) => tool.name === "delete_memory");
    expect(deleteMemory?.description).toMatch(/Permanently delete/);
    expect(deleteMemory?.description).toMatch(/archive_memories/);
    expect(deleteMemory?.description).toMatch(/memory:write/);
    expect(deleteMemory?.description).not.toMatch(/Delete a memory entry \(requires API key\)/);

    const readMemory = projected.find((tool) => tool.name === "read_memory");
    expect(readMemory?.description).toMatch(/increments access_count/);
    expect(readMemory?.description).toMatch(/Do not pass memory_type/);
    expect(readMemory?.description).toMatch(/search_memory/);
  });

  it("adds outputSchema on simple read and list tools", () => {
    const withOutput = [
      "list_playbooks",
      "list_skills",
      "get_skill",
      "read_memory",
      "get_memory_context",
      "get_memory_tree",
      "list_canvas",
      "get_canvas_toc",
      "list_secrets",
    ];
    for (const name of withOutput) {
      const tool = manageTools.find((candidate) => candidate.name === name);
      expect(tool?.outputSchema, name).toBeDefined();
      expect(Object.keys(tool!.outputSchema!).length, name).toBeGreaterThan(0);
    }
  });
});
