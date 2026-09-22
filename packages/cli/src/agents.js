import path from "node:path";
import { isMap, parseDocument, stringify } from "yaml";
import { digest, normalizeText } from "./discovery.js";

export const SAFE_AGENT_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

const COMMON_FIELDS = new Set(["name", "description", "tools", "model", "extensions"]);
const TOOL_SCOPE_MARKER = "\n\n[AgentPlaybooks tool scope]\nUse only these tools: ";

function toolsFrom(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function semanticDigest(agent) {
  return digest(JSON.stringify({
    name: agent.name,
    description: agent.description,
    prompt: agent.prompt,
    tools: agent.tools,
    model: agent.model ?? null,
  }));
}

function markdownAgent(item) {
  const match = item.content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { valid: false, values: {}, prompt: item.content };
  const document = parseDocument(match[1], { strict: true, uniqueKeys: true });
  if (document.errors.length > 0 || !isMap(document.contents)) {
    return { valid: false, values: {}, prompt: item.content.slice(match[0].length) };
  }
  const values = document.toJS();
  return {
    valid: values && typeof values === "object" && !Array.isArray(values),
    values: values ?? {},
    prompt: item.content.slice(match[0].length),
  };
}

function tomlValue(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const multiline = content.match(new RegExp(`^${escaped}\\s*=\\s*\"\"\"([\\s\\S]*?)\"\"\"`, "m"));
  if (multiline) return multiline[1];
  const line = content.match(new RegExp(`^${escaped}\\s*=\\s*(\"(?:\\\\.|[^\"\\\\])*\")\\s*$`, "m"));
  if (!line) return undefined;
  try {
    return JSON.parse(line[1]);
  } catch {
    return undefined;
  }
}

function codexAgent(item) {
  let prompt = tomlValue(item.content, "developer_instructions") ?? "";
  let tools = [];
  const marker = prompt.lastIndexOf(TOOL_SCOPE_MARKER);
  if (marker !== -1) {
    tools = prompt.slice(marker + TOOL_SCOPE_MARKER.length).split(",").map((value) => value.trim()).filter(Boolean);
    prompt = prompt.slice(0, marker);
  }
  const values = {
    name: tomlValue(item.content, "name"),
    description: tomlValue(item.content, "description"),
    model: tomlValue(item.content, "model"),
    tools,
  };
  for (const key of ["model_reasoning_effort", "sandbox_mode", "approval_policy"]) {
    const value = tomlValue(item.content, key);
    if (value !== undefined) values[key] = value;
  }
  return {
    valid: Boolean(tomlValue(item.content, "name") && tomlValue(item.content, "description") && prompt),
    values,
    prompt,
  };
}

export function parseAgentDefinition(item) {
  const parsed = item.source.toLowerCase().endsWith(".toml") ? codexAgent(item) : markdownAgent(item);
  const filename = path.basename(item.source);
  const fallbackName = filename.toLowerCase().endsWith(".agent.md")
    ? filename.slice(0, -".agent.md".length)
    : path.basename(filename, path.extname(filename));
  const name = typeof parsed.values.name === "string" && parsed.values.name.length > 0
    ? parsed.values.name
    : fallbackName;
  const description = typeof parsed.values.description === "string" ? parsed.values.description : "";
  const model = typeof parsed.values.model === "string" && parsed.values.model.length > 0 ? parsed.values.model : undefined;
  const extras = Object.fromEntries(Object.entries(parsed.values).filter(([key]) => !COMMON_FIELDS.has(key)));
  const declaredExtensions = parsed.values.extensions && typeof parsed.values.extensions === "object" && !Array.isArray(parsed.values.extensions)
    ? parsed.values.extensions
    : {};
  const extensions = {
    ...declaredExtensions,
    ...(Object.keys(extras).length > 0 ? { [item.platform]: extras } : {}),
  };
  const agent = {
    ...item,
    valid: parsed.valid,
    name,
    description,
    prompt: normalizeText(parsed.prompt).replace(/^\n/, ""),
    tools: toolsFrom(parsed.values.tools),
    ...(model ? { model } : {}),
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
  };
  agent.digest = semanticDigest(agent);
  return agent;
}

function frontmatterFor(agent, target) {
  const targetFields = agent.extensions?.[target];
  const extraFields = targetFields && typeof targetFields === "object" && !Array.isArray(targetFields)
    ? Object.fromEntries(Object.entries(targetFields).filter(([key]) => !COMMON_FIELDS.has(key)))
    : {};
  const values = {
    ...extraFields,
    name: agent.name,
    description: agent.description,
  };
  if (agent.tools.length > 0) values.tools = target === "claude" ? agent.tools.join(", ") : agent.tools;
  if (agent.model) values.model = agent.model;
  return stringify(values, { lineWidth: 0 }).trimEnd();
}

export function serializeAgent(agent, target) {
  const prompt = agent.prompt.endsWith("\n") ? agent.prompt : `${agent.prompt}\n`;
  if (target === "codex") {
    const scopedPrompt = agent.tools.length > 0
      ? `${prompt.replace(/\s*$/, "")}${TOOL_SCOPE_MARKER}${agent.tools.join(", ")}`
      : prompt.replace(/\s*$/, "");
    const lines = [
      `name = ${JSON.stringify(agent.name)}`,
      `description = ${JSON.stringify(agent.description)}`,
      `developer_instructions = ${JSON.stringify(scopedPrompt)}`,
    ];
    if (agent.model) lines.push(`model = ${JSON.stringify(agent.model)}`);
    for (const key of ["model_reasoning_effort", "sandbox_mode", "approval_policy"]) {
      const value = agent.extensions?.codex?.[key];
      if (typeof value === "string") lines.push(`${key} = ${JSON.stringify(value)}`);
    }
    return `${lines.join("\n")}\n`;
  }
  return `---\n${frontmatterFor(agent, target)}\n---\n${prompt}`;
}

export function portableAgentContent(agent) {
  const values = {
    name: agent.name,
    description: agent.description,
    ...(agent.tools.length > 0 ? { tools: agent.tools } : {}),
    ...(agent.model ? { model: agent.model } : {}),
    ...(agent.extensions ? { extensions: agent.extensions } : {}),
  };
  const prompt = agent.prompt.endsWith("\n") ? agent.prompt : `${agent.prompt}\n`;
  return `---\n${stringify(values, { lineWidth: 0 }).trimEnd()}\n---\n${prompt}`;
}
