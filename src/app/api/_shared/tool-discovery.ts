import type { McpTool } from "@/lib/supabase/types";

export function shortToolDescription(tool: Pick<McpTool, "name" | "description">): string {
  const description = tool.description || tool.name;
  const sentence = description.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? description;
  return sentence.length <= 220 ? sentence : `${sentence.slice(0, 217)}...`;
}

/** Keep existing input/output contracts and effect annotations; shorten only descriptive copy. */
export function compactTool(tool: McpTool): McpTool {
  return { ...tool, description: shortToolDescription(tool) };
}
