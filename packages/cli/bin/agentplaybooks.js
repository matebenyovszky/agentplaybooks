#!/usr/bin/env node

import { run } from "../src/cli.js";

run(process.argv.slice(2)).catch((error) => {
  console.error(`AgentPlaybooks failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
