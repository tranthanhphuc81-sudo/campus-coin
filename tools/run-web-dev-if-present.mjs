#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync("web/package.json")) {
  console.log("web workspace not ready, skipping.");
  process.exit(0);
}

const result = spawnSync("npm", ["run", "dev", "-w", "web", "--if-present"], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
