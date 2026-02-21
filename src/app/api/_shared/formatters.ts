import type { Playbook, Skill, MCPServer, Persona } from "@/lib/supabase/types";
import { PLAYBOOK_TOOLS } from "@/app/api/mcp/[guid]/route";

export type PlaybookWithExports = Playbook & {
    persona?: Persona | null;
    personas?: Persona[];
    skills: Skill[];
    mcp_servers: MCPServer[];
};

export type OpenApiSkillSchema = {
    type: "object";
    description?: string;
    properties?: Record<string, unknown>;
    required?: string[];
};

export function formatAsOpenAPI(playbook: PlaybookWithExports) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agentplaybooks.ai";
    const persona = playbook.persona || (Array.isArray(playbook.personas) ? playbook.personas[0] : null);
    const personaHeader = persona?.name && persona?.system_prompt
        ? `## Persona: ${persona.name}\n\n${persona.system_prompt}\n\n---\n\n`
        : "";

    // Convert skills to OpenAPI-compatible tool definitions
    const tools = playbook.skills.map((skill) => ({
        type: "function",
        function: {
            name: skill.name.toLowerCase().replace(/\s+/g, "_"),
            description: skill.description || skill.name,
            parameters: { type: "object", properties: {} },
        },
    }));

    // Build skill schemas for OpenAPI
    const skillSchemas: Record<string, OpenApiSkillSchema> = {};
    playbook.skills.forEach((skill) => {
        const skillName = skill.name.toLowerCase().replace(/\s+/g, "_");
        skillSchemas[`Skill_${skillName}`] = {
            type: "object",
            description: skill.description || skill.name,
            properties: {},
            required: [],
        };
    });

    return {
        openapi: "3.1.0",
        info: {
            title: playbook.name,
            description: `${personaHeader}${playbook.description || `API for ${playbook.name} playbook`}`,
            version: "1.0.0",
        },
        servers: [{ url: `${baseUrl}/api` }],
        paths: {
            [`/playbooks/${playbook.guid}/memory`]: {
                get: {
                    summary: "Get or search memories",
                    description: "Retrieve all memory entries, search by tags, or get a specific key",
                    operationId: "getMemories",
                    parameters: [
                        { name: "key", in: "query", required: false, schema: { type: "string" }, description: "Get specific memory by key" },
                        { name: "search", in: "query", required: false, schema: { type: "string" }, description: "Search in keys and descriptions" },
                        { name: "tags", in: "query", required: false, schema: { type: "string" }, description: "Filter by tags (comma-separated)" },
                        { name: "tier", in: "query", required: false, schema: { type: "string", enum: ["core", "working_memory", "episodic", "archival"] }, description: "Filter by RLM memory tier" },
                        { name: "memory_type", in: "query", required: false, schema: { type: "string", enum: ["fact", "preference", "task", "observation", "summary"] }, description: "Filter by memory type" },
                        { name: "status", in: "query", required: false, schema: { type: "string", enum: ["active", "completed", "archived", "failed"] }, description: "Filter by memory/task status" },
                    ],
                    responses: {
                        "200": {
                            description: "Memory entries retrieved successfully",
                            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/MemoryEntry" } } } },
                        },
                        "404": { description: "Playbook not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    },
                },
            },
            [`/playbooks/${playbook.guid}/memory/{key}`]: {
                get: {
                    summary: "Get memory by key",
                    description: "Retrieve a specific memory entry by its key",
                    operationId: "getMemoryByKey",
                    parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" }, description: "Memory key to retrieve" }],
                    responses: {
                        "200": { description: "Memory entry", content: { "application/json": { schema: { $ref: "#/components/schemas/MemoryEntry" } } } },
                        "404": { description: "Memory not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    },
                },
                put: {
                    summary: "Write memory",
                    description: "Create or update a memory entry with optional tags and description. Requires API key.",
                    operationId: "writeMemory",
                    parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" }, description: "Memory key to write" }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/MemoryWrite" } } } },
                    responses: {
                        "200": { description: "Memory written successfully", content: { "application/json": { schema: { $ref: "#/components/schemas/MemoryEntry" } } } },
                        "401": { description: "Unauthorized - API key required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    },
                    security: [{ apiKey: [] }],
                },
                delete: {
                    summary: "Delete memory",
                    description: "Delete a memory entry. Requires API key.",
                    operationId: "deleteMemory",
                    parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" }, description: "Memory key to delete" }],
                    responses: {
                        "200": { description: "Memory deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/Success" } } } },
                        "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    },
                    security: [{ apiKey: [] }],
                },
            },
            [`/playbooks/${playbook.guid}/canvas`]: {
                get: {
                    summary: "List canvas documents",
                    description: "Get all collaborative canvas documents for this playbook",
                    operationId: "listCanvasDocuments",
                    responses: {
                        "200": {
                            description: "List of canvas documents",
                            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/CanvasDocument" } } } },
                        },
                    },
                },
                post: {
                    summary: "Create canvas document",
                    description: "Create a new collaborative canvas document",
                    operationId: "createCanvasDocument",
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CanvasWrite" } } } },
                    responses: {
                        "200": { description: "Canvas document created", content: { "application/json": { schema: { $ref: "#/components/schemas/CanvasDocument" } } } },
                    },
                    security: [{ apiKey: [] }],
                },
            },
            [`/playbooks/${playbook.guid}/canvas/{slug}`]: {
                get: {
                    summary: "Read canvas document",
                    description: "Read a specific canvas document by its slug",
                    operationId: "readCanvasDocument",
                    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" }, description: "Canvas document slug" }],
                    responses: {
                        "200": { description: "Canvas document", content: { "application/json": { schema: { $ref: "#/components/schemas/CanvasDocument" } } } },
                    },
                },
                put: {
                    summary: "Update canvas document",
                    description: "Update a canvas document content and metadata",
                    operationId: "updateCanvasDocument",
                    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" }, description: "Canvas document slug" }],
                    requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CanvasWrite" } } } },
                    responses: {
                        "200": { description: "Canvas document updated", content: { "application/json": { schema: { $ref: "#/components/schemas/CanvasDocument" } } } },
                    },
                    security: [{ apiKey: [] }],
                },
                delete: {
                    summary: "Delete canvas document",
                    description: "Delete a canvas document",
                    operationId: "deleteCanvasDocument",
                    parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" }, description: "Canvas document slug" }],
                    responses: {
                        "200": { description: "Document deleted", content: { "application/json": { schema: { $ref: "#/components/schemas/Success" } } } },
                    },
                    security: [{ apiKey: [] }],
                },
            },
            [`/playbooks/${playbook.guid}/skills`]: {
                get: {
                    summary: "List skills",
                    description: "Get all skills (rules/capabilities) defined in this playbook. Skills describe how to solve tasks.",
                    operationId: "listSkills",
                    responses: {
                        "200": {
                            description: "List of skills",
                            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Skill" } } } },
                        },
                    },
                },
            },
            [`/playbooks/${playbook.guid}/skills/{skillId}`]: {
                get: {
                    summary: "Get skill",
                    description: "Get a specific skill definition including its parameters and examples",
                    operationId: "getSkill",
                    parameters: [{ name: "skillId", in: "path", required: true, schema: { type: "string" }, description: "Skill ID or name" }],
                    responses: {
                        "200": { description: "Skill details", content: { "application/json": { schema: { $ref: "#/components/schemas/Skill" } } } },
                        "404": { description: "Skill not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
                    },
                },
            },
            [`/playbooks/${playbook.guid}/personas`]: {
                get: {
                    summary: "List personas",
                    description: "Get the playbook persona (singleton). Returned as an array for backward compatibility.",
                    operationId: "listPersonas",
                    responses: {
                        "200": {
                            description: "List of personas",
                            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Persona" } } } },
                        },
                    },
                },
            },
        },
        components: {
            schemas: {
                MemoryEntry: {
                    type: "object",
                    description: "A memory entry storing persistent data",
                    properties: {
                        key: { type: "string", description: "Unique key identifier" },
                        value: { type: "object", description: "Stored value (any JSON)" },
                        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization and search" },
                        description: { type: "string", description: "Human-readable description" },
                        tier: { type: "string", description: "RLM memory tier (core, working_memory, episodic, archival)" },
                        priority: { type: "integer", description: "Priority level 1-100" },
                        parent_key: { type: "string", description: "Parent memory key for hierarchical storage/tasks" },
                        summary: { type: "string", description: "LLM-generated summary for large memories" },
                        memory_type: { type: "string", description: "Type of memory (fact, preference, task, observation, summary)" },
                        status: { type: "string", description: "Status for task memories (active, completed, archived, failed)" },
                        metadata: { type: "object", description: "Additional custom metadata" },
                        updated_at: { type: "string", format: "date-time", description: "Last update timestamp" },
                    },
                },
                MemoryWrite: {
                    type: "object",
                    description: "Data for creating/updating a memory entry",
                    properties: {
                        value: { type: "object", description: "Value to store (any JSON object)" },
                        tags: { type: "array", items: { type: "string" }, description: "Optional tags for categorization" },
                        description: { type: "string", description: "Optional description" },
                        tier: { type: "string", description: "Optional RLM memory tier" },
                        priority: { type: "integer", description: "Optional priority level 1-100" },
                        parent_key: { type: "string", description: "Optional parent memory key" },
                        summary: { type: "string", description: "Optional summary" },
                        memory_type: { type: "string", description: "Optional type of memory" },
                        status: { type: "string", description: "Optional status" },
                        metadata: { type: "object", description: "Optional additional metadata" },
                    },
                    required: ["value"],
                },
                CanvasSection: {
                    type: "object",
                    description: "A section within a collaborative canvas document",
                    properties: {
                        id: { type: "string", description: "Section ID" },
                        heading: { type: "string", description: "Section heading text" },
                        level: { type: "integer", description: "Markdown heading level (1-6)" },
                        content: { type: "string", description: "Section content" },
                        locked_by: { type: "string", nullable: true, description: "Agent ID holding the lock" },
                        locked_at: { type: "string", format: "date-time", nullable: true, description: "When the lock was acquired" },
                    },
                },
                CanvasDocument: {
                    type: "object",
                    description: "A collaborative canvas document",
                    properties: {
                        id: { type: "string", format: "uuid" },
                        slug: { type: "string", description: "URL-friendly unique identifier" },
                        name: { type: "string", description: "Document name" },
                        content: { type: "string", description: "Full markdown content" },
                        sections: { type: "array", items: { $ref: "#/components/schemas/CanvasSection" }, description: "Parsed document sections for parallel editing" },
                        metadata: { type: "object", description: "Additional metadata" },
                        sort_order: { type: "integer", description: "Display order" },
                        created_at: { type: "string", format: "date-time" },
                        updated_at: { type: "string", format: "date-time" },
                    },
                },
                CanvasWrite: {
                    type: "object",
                    description: "Data for creating/updating a canvas document",
                    properties: {
                        name: { type: "string", description: "Document name" },
                        slug: { type: "string", description: "Document slug" },
                        content: { type: "string", description: "Full markdown content" },
                        metadata: { type: "object", description: "Optional metadata" },
                        sort_order: { type: "integer", description: "Optional display order" },
                    },
                    required: ["name", "slug", "content"],
                },
                Skill: {
                    type: "object",
                    description: "A skill defines a capability or rule for solving tasks",
                    properties: {
                        id: { type: "string", format: "uuid" },
                        name: { type: "string", description: "Skill name (snake_case)" },
                        description: { type: "string", description: "What this skill does" },
                        definition: { type: "object", properties: { parameters: { type: "object" } } },
                        examples: { type: "array", items: { type: "object" } },
                    },
                },
                Persona: {
                    type: "object",
                    description: "An AI personality with a system prompt",
                    properties: {
                        id: { type: "string", format: "uuid" },
                        name: { type: "string", description: "Persona name" },
                        system_prompt: { type: "string", description: "System prompt for the AI" },
                        metadata: { type: "object", description: "Additional metadata" },
                    },
                },
                Success: { type: "object", properties: { success: { type: "boolean" } } },
                Error: { type: "object", properties: { error: { type: "string" } } },
                ...skillSchemas,
            },
            securitySchemes: {
                apiKey: { type: "http", scheme: "bearer", description: "API key starting with apb_live_" },
            },
        },
        "x-playbook": {
            guid: playbook.guid,
            persona,
            personas: playbook.personas,
            skills: tools,
            mcp_servers: playbook.mcp_servers.map((mcp) => ({
                name: mcp.name,
                description: mcp.description,
                tools_count: mcp.tools?.length || 0,
            })),
        },
    };
}

export function formatAsMCP(playbook: PlaybookWithExports) {
    const persona = playbook.persona || (Array.isArray(playbook.personas) ? playbook.personas[0] : null);
    const tools = [
        ...PLAYBOOK_TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description || tool.name,
            inputSchema: {
                type: (tool.inputSchema?.type as string) || "object",
                properties: (tool.inputSchema?.properties as Record<string, unknown>) || {},
            },
        })),
        ...playbook.skills.map((skill) => ({
            name: skill.name.toLowerCase().replace(/\s+/g, "_"),
            description: skill.description || skill.name,
            inputSchema: { type: "object", properties: {} },
        }))
    ];

    const resources = [
        { uri: `playbook://${playbook.guid}/personas`, name: "Personas", description: "AI personalities for this playbook", mimeType: "application/json" },
        { uri: `playbook://${playbook.guid}/memory`, name: "Memory (RLM)", description: "Persistent hierarchical memory storage (tiers: core, working, episodic, archival)", mimeType: "application/json" },
        { uri: `playbook://${playbook.guid}/canvas`, name: "Collaborative Canvas", description: "List of all canvas documents available for parallel editing", mimeType: "application/json" },
        { uri: `playbook://${playbook.guid}/guide`, name: "Usage Guide", description: "Comprehensive guide on memory management, canvas editing, and best practices", mimeType: "text/markdown" },
    ];

    for (const mcp of playbook.mcp_servers) {
        const mcpTools = (mcp.tools || []).map((tool) => ({
            name: tool.name,
            description: tool.description || tool.name,
            inputSchema: {
                type: (tool.inputSchema?.type as string) || "object",
                properties: (tool.inputSchema?.properties as Record<string, unknown>) || {},
            },
        }));
        tools.push(...mcpTools);
        const mcpResources = (mcp.resources || []).map((resource) => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description || resource.name,
            mimeType: resource.mimeType || "application/octet-stream",
        }));
        resources.push(...mcpResources);
    }

    return {
        protocolVersion: "2024-11-05",
        serverInfo: { name: playbook.name, version: "1.0.0" },
        capabilities: { tools: {}, resources: {} },
        tools,
        resources,
        persona: persona ? { name: persona.name, systemPrompt: persona.system_prompt } : null,
        personas: Array.isArray(playbook.personas) ? playbook.personas.map((p) => ({ name: p.name, systemPrompt: p.system_prompt })) : [],
    };
}

export function formatAsAnthropic(playbook: PlaybookWithExports) {
    const persona = playbook.persona || (Array.isArray(playbook.personas) ? playbook.personas[0] : null);
    const tools = [
        ...PLAYBOOK_TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description || tool.name,
            input_schema: {
                type: (tool.inputSchema?.type as string) || "object",
                properties: (tool.inputSchema?.properties as Record<string, unknown>) || {},
            },
        })),
        ...playbook.skills.map((skill) => ({
            name: skill.name.toLowerCase().replace(/\s+/g, "_"),
            description: skill.description || skill.name,
            input_schema: { type: "object", properties: {} },
        }))
    ];

    return {
        playbook: { name: playbook.name, description: playbook.description, guid: playbook.guid },
        system_prompt: persona?.name && persona?.system_prompt ? `## ${persona.name}\n\n${persona.system_prompt}` : null,
        tools,
        mcp_servers: playbook.mcp_servers.map((mcp) => ({
            name: mcp.name,
            description: mcp.description,
            tools: mcp.tools,
            resources: mcp.resources,
        })),
    };
}

export function formatAsMarkdown(playbook: PlaybookWithExports): string {
    let md = `# ${playbook.name}\n\n`;
    const persona = playbook.persona || (Array.isArray(playbook.personas) ? playbook.personas[0] : null);

    if (playbook.description) md += `${playbook.description}\n\n`;
    md += `**GUID:** \`${playbook.guid}\`\n\n`;

    if (persona?.name && persona?.system_prompt) {
        md += `## Persona\n\n### ${persona.name}\n\n${persona.system_prompt}\n\n`;
    }

    if (playbook.skills?.length) {
        md += `## Skills\n\n`;
        for (const skill of playbook.skills) {
            md += `### ${skill.name}\n\n`;
            if (skill.description) md += `${skill.description}\n\n`;
            if (skill.licence) md += `**Licence:** ${skill.licence}\n\n`;
            if (skill.content) md += `**Content:**\n\n${skill.content}\n\n`;
        }
    }

    if (playbook.mcp_servers?.length) {
        md += `## MCP Servers\n\n`;
        for (const mcp of playbook.mcp_servers) {
            md += `### ${mcp.name}\n\n`;
            if (mcp.description) md += `${mcp.description}\n\n`;
            if (mcp.tools?.length) md += `**Tools:** ${mcp.tools.map((t) => t.name).join(", ")}\n\n`;
        }
    }

    md += `## Features\n\n### Hierarchical Memory (RLM)\nThis playbook supports RLM memory with four tiers (core, working_memory, episodic, archival).\n\n### Collaborative Canvas\nFeatures section-level locking for parallel editing.\n\n### Usage Guide\nRead \`playbook://${playbook.guid}/guide\` for instructions.\n\n---\n\n## API Endpoints\n\n`;
    md += `- **JSON:** \`GET /api/playbooks/${playbook.guid}\`\n`;
    md += `- **OpenAPI:** \`GET /api/playbooks/${playbook.guid}?format=openapi\`\n`;
    md += `- **MCP Manifesto:** \`GET /api/playbooks/${playbook.guid}?format=mcp\`\n`;
    md += `- **MCP Server (Live):** \`GET /api/mcp/${playbook.guid}\`\n`;
    md += `- **Anthropic:** \`GET /api/playbooks/${playbook.guid}?format=anthropic\`\n`;
    md += `- **Markdown:** \`GET /api/playbooks/${playbook.guid}?format=markdown\`\n`;

    return md;
}
