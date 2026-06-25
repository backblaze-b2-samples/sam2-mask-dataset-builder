#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = resolve(REPO_ROOT, ".github/workflows/claude-review.yml");
const workflow = readFileSync(WORKFLOW, "utf8");
const failures = [];
const checkoutSteps =
  workflow.match(/^      - uses: actions\/checkout@[^\s#]+\n(?:        .*\n)*/gm) ?? [];
const installStep =
  workflow.match(/^      - name: Install frontend dependencies\n(?:        .*\n)*/m)?.[0] ?? "";

function assertWorkflow(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

assertWorkflow(
  /^permissions:\s*\n  contents:\s+read\b/m.test(workflow) &&
    !/^\s{2,}permissions:/m.test(workflow),
  "workflow must set permissions: contents: read",
);

assertWorkflow(
  checkoutSteps.length > 0 &&
    checkoutSteps.every((step) => /persist-credentials:\s+false\b/.test(step)),
  "checkout must set persist-credentials: false",
);

assertWorkflow(
  !/(^|\n)\s+cache:\s*["']?pnpm["']?\s*(?:#.*)?(?:\n|$)/.test(workflow),
  "setup-node must not restore pnpm cache before pnpm is available",
);

assertWorkflow(
  /pnpm install\b[^\n]*--frozen-lockfile/.test(installStep) &&
    /(^|[\s;&|])--ignore-scripts(?=$|[\s;&|])/.test(installStep) &&
    !/(^|[\s;&|])--ignore-scripts\s*=/.test(installStep) &&
    !/(^|[\s;&|])--ignore-scripts\s+(?![-;&|]|$)[^\s;&|]+/.test(installStep),
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
