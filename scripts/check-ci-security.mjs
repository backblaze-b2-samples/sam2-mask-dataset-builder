#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKFLOW = resolve(".github/workflows/claude-review.yml");
const workflow = readFileSync(WORKFLOW, "utf8");
const failures = [];
const checkoutStep =
  workflow.match(/^      - uses: actions\/checkout@v4\n(?:        .*\n)*/m)?.[0] ?? "";
const installStep =
  workflow.match(/^      - name: Install frontend dependencies\n(?:        .*\n)*/m)?.[0] ?? "";

function assertWorkflow(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

assertWorkflow(
  /permissions:\s*\n\s+contents:\s+read\b/.test(workflow),
  "workflow must set permissions: contents: read",
);

assertWorkflow(
  /persist-credentials:\s+false\b/.test(checkoutStep),
  "checkout must set persist-credentials: false",
);

assertWorkflow(
  !/cache:\s+pnpm\b/.test(workflow),
  "setup-node must not restore pnpm cache before pnpm is available",
);

assertWorkflow(
  /pnpm install\b[^\n]*--frozen-lockfile[^\n]*--ignore-scripts/.test(installStep),
  "frontend install must use pnpm install --frozen-lockfile --ignore-scripts",
);

if (failures.length > 0) {
  console.error("CI workflow security check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("CI workflow security check passed");
