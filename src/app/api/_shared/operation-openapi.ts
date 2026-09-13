import type { McpTool } from "@/lib/supabase/types";

export function operationPathsFromTools(
  tools: McpTool[],
  pathForTool: (tool: McpTool) => string,
  securityScheme = "bearerAuth",
): Record<string, unknown> {
  return Object.fromEntries(tools.map((tool) => [
    pathForTool(tool),
    {
      post: {
        operationId: tool.name,
        summary: tool.description || tool.name,
        description: tool.description,
        security: [{ [securityScheme]: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: tool.inputSchema || { type: "object", properties: {} },
            },
          },
        },
        responses: {
          "200": {
            description: "Operation completed",
            content: {
              "application/json": {
                schema: {},
              },
            },
          },
          "400": { description: "Invalid operation arguments" },
          "401": { description: "Authentication required" },
          "403": { description: "Insufficient permission or playbook access" },
          "404": { description: "Playbook or resource not found" },
        },
        "x-mcp-tool": tool.name,
      },
    },
  ]));
}

/**
 * Describe the direct vault proxy separately from MCP tool projections.
 * Unlike use_secret/use_secret_write, response_mode=stream returns the
 * upstream body itself and therefore needs explicit streaming media types in
 * OpenAPI instead of the normal JSON tool-result envelope.
 */
export function secretProxyOpenApiPath(
  path: string,
  securityScheme = "apiKey",
): Record<string, unknown> {
  return {
    [path]: {
      post: {
        operationId: "proxySecretRequest",
        summary: "Stream or buffer an authenticated upstream REST request",
        description: "Inject a playbook vault secret into an upstream HTTP request without revealing it. Set response_mode to stream to forward SSE, NDJSON, JSON, or binary bytes as they arrive; no MCP session is required. Streaming clients must consume the response body incrementally instead of buffering it.",
        security: [{ [securityScheme]: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["secret_name", "url"],
                properties: {
                  secret_name: { type: "string", description: "Vault secret name" },
                  url: { type: "string", format: "uri", description: "Allowed upstream HTTP or HTTPS URL" },
                  method: { type: "string", enum: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"], default: "GET" },
                  header_name: { type: "string", default: "Authorization" },
                  header_prefix: { type: "string", default: "Bearer " },
                  body: { description: "JSON value serialized as the upstream request body" },
                  extra_headers: {
                    type: "object",
                    additionalProperties: { type: "string" },
                    description: "Additional upstream request headers; cannot override the injected secret header",
                  },
                  timeout_ms: {
                    type: "integer",
                    minimum: 1,
                    maximum: 300000,
                    description: "Overall upstream timeout. Defaults to 300000 in stream mode and 30000 in JSON mode.",
                  },
                  response_mode: {
                    type: "string",
                    enum: ["json", "stream"],
                    default: "json",
                    description: "json returns a buffered envelope; stream forwards the upstream response body and status.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Buffered JSON envelope, or a raw upstream stream when response_mode is stream",
            headers: {
              "X-Accel-Buffering": { description: "no in stream mode", schema: { type: "string" } },
              "Retry-After": { description: "Forwarded from the upstream response when present", schema: { type: "string" } },
            },
            content: {
              "application/json": {
                schema: {
                  description: "Buffered envelope in JSON mode, or raw upstream JSON in stream mode",
                  oneOf: [
                    {
                      type: "object",
                      required: ["status", "status_text", "body"],
                      properties: {
                        status: { type: "integer" },
                        status_text: { type: "string" },
                        body: {},
                      },
                    },
                    {},
                  ],
                },
              },
              "text/event-stream": { schema: { type: "string", description: "Raw upstream SSE stream" } },
              "application/x-ndjson": { schema: { type: "string", description: "Raw upstream newline-delimited JSON stream" } },
              "application/octet-stream": { schema: { type: "string", format: "binary", description: "Raw upstream binary stream" } },
            },
          },
          "400": { description: "Invalid proxy request" },
          "401": { description: "Authentication required" },
          "403": { description: "Insufficient permission, playbook access, or destination allowlist rejection" },
          "404": { description: "Playbook or secret not found" },
          "502": { description: "Upstream connection failed before streaming began" },
          default: { description: "In stream mode, the upstream HTTP status and supported content type are preserved" },
        },
        "x-streaming": true,
        "x-streaming-request-value": { response_mode: "stream" },
      },
    },
  };
}
