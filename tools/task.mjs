#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const taskName = process.argv[2];

if (!taskName) {
  console.error("Usage: npm run task -- <task-name>");
  process.exit(1);
}

const promptPath = resolve(join(".github", "prompts", `${taskName}.prompt.md`));

if (!existsSync(promptPath)) {
  console.error(`Prompt not found: ${promptPath}`);
  process.exit(1);
}

console.log(`Prompt ready: ${promptPath}`);
