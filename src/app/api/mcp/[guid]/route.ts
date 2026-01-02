import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

// MCP Protocol implementation for Cloudflare Workers / Next.js
// Supports: tools/list, resources/list, tools/call

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(url, key);
}

// GET /api/mcp/:guid - Return MCP server manifest
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guid: string }> }
) {
  const { guid } = await params;
  const supabase = getSupabase();

  // Get playbook with all related data
  const { data: playbook, error } = await supabase
    .from("playbooks")
    .select("*")
    .eq("guid", guid)
    .eq("is_public", true)
    .single();

  if (error || !playbook) {
    return NextResponse.json({ error: "Playbook not found" }, { status: 404 });
  }

  const [skillsRes, mcpRes, personasRes] = await Promise.all([
    supabase.from("skills").select("*").eq("playbook_id", playbook.id),
    supabase.from("mcp_servers").select("*").eq("playbook_id", playbook.id),
    supabase.from("personas").select("*").eq("playbook_id", playbook.id),
  ]);

  const skills = skillsRes.data || [];
  const mcpServers = mcpRes.data || [];
  const personas = personasRes.data || [];

  // Build tools from skills
  const tools = skills.map((skill) => ({
    name: skill.name.toLowerCase().replace(/\s+/g, "_"),
    description: skill.description || skill.name,
    inputSchema: skill.definition?.parameters || { type: "object", properties: {} },
  }));

  // Add tools from MCP servers
  for (const mcp of mcpServers) {
    if (Array.isArray(mcp.tools)) {
      tools.push(...mcp.tools);
    }
  }

  // Build resources
  const resources = [
    {
      uri: `playbook://${guid}/personas`,
      name: "Personas",
      description: "AI personalities and system prompts",
      mimeType: "application/json",
    },
    {
      uri: `playbook://${guid}/memory`,
      name: "Memory",
      description: "Persistent key-value memory storage",
      mimeType: "application/json",
    },
    {
      uri: `playbook://${guid}/skills`,
      name: "Skills",
      description: "Available capabilities and tasks",
      mimeType: "application/json",
    },
  ];

  // Add resources from MCP servers
  for (const mcp of mcpServers) {
    if (Array.isArray(mcp.resources)) {
      resources.push(...mcp.resources);
    }
  }

  // MCP Server manifest
  const manifest = {
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: playbook.name,
      version: "1.0.0",
      description: playbook.description,
    },
    capabilities: {
      tools: tools.length > 0 ? {} : undefined,
      resources: resources.length > 0 ? {} : undefined,
    },
    tools,
    resources,
    // Extension: include personas for AI context
    _playbook: {
      guid: playbook.guid,
      personas: personas.map((p) => ({
        name: p.name,
        systemPrompt: p.system_prompt,
        metadata: p.metadata,
      })),
    },
  };

  return NextResponse.json(manifest);
}

// POST /api/mcp/:guid - Handle MCP JSON-RPC requests
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guid: string }> }
) {
  const { guid } = await params;
  const body = await request.json();
  
  const { method, params: rpcParams, id } = body;

  const supabase = getSupabase();

  // Get playbook
  const { data: playbook } = await supabase
    .from("playbooks")
    .select("id")
    .eq("guid", guid)
    .eq("is_public", true)
    .single();

  if (!playbook) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "Playbook not found" },
    });
  }

  // Handle MCP methods
  switch (method) {
    case "initialize":
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "AgentPlaybooks", version: "1.0.0" },
          capabilities: { tools: {}, resources: {} },
        },
      });

    case "tools/list": {
      const { data: skills } = await supabase
        .from("skills")
        .select("*")
        .eq("playbook_id", playbook.id);

      const tools = (skills || []).map((skill) => ({
        name: skill.name.toLowerCase().replace(/\s+/g, "_"),
        description: skill.description || skill.name,
        inputSchema: skill.definition?.parameters || { type: "object", properties: {} },
      }));

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: { tools },
      });
    }

    case "resources/list": {
      const resources = [
        {
          uri: `playbook://${guid}/memory`,
          name: "Memory",
          description: "Persistent memory storage",
          mimeType: "application/json",
        },
      ];

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: { resources },
      });
    }

    case "resources/read": {
      const uri = rpcParams?.uri as string;
      
      if (uri?.includes("/memory")) {
        const { data: memories } = await supabase
          .from("memories")
          .select("key, value, updated_at")
          .eq("playbook_id", playbook.id);

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(memories || []),
              },
            ],
          },
        });
      }

      if (uri?.includes("/personas")) {
        const { data: personas } = await supabase
          .from("personas")
          .select("*")
          .eq("playbook_id", playbook.id);

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(personas || []),
              },
            ],
          },
        });
      }

      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32002, message: "Resource not found" },
      });
    }

    case "tools/call": {
      // For now, return a message that tool execution is not supported
      // Real implementation would need the API key for write operations
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: `Tool "${rpcParams?.name}" called with arguments: ${JSON.stringify(rpcParams?.arguments)}. Note: Tool execution requires API key authentication.`,
            },
          ],
        },
      });
    }

    default:
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }
}

