#!/usr/bin/env node

import { run } from "../dist/agentplaybooks.mjs";

run(process.argv.slice(2)).catch((error) => {
  console.error(`AgentPlaybooks failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
