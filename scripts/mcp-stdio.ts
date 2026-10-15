import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Console } from "node:console";
import { createStdioServer } from "../src/lib/mcp/stdio-server";

// Shared web handlers may log diagnostics. Keep stdout exclusively for the MCP transport.
globalThis.console = new Console(process.stderr, process.stderr);
createStdioServer().connect(new StdioServerTransport()).catch(() => {
  console.error("AgentPlaybooks stdio transport could not start.");
  process.exitCode = 1;
});
