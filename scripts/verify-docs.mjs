import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

let stalenessDays = null;
let reportFile = "";

for (const arg of args) {
  if (arg.startsWith("--staleness-days=")) {
    const value = Number.parseInt(arg.split("=")[1] ?? "", 10);
    if (Number.isFinite(value) && value > 0) {
      stalenessDays = value;
    }
  } else if (arg.startsWith("--report-file=")) {
    reportFile = arg.split("=")[1] ?? "";
  }
}

const root = process.cwd();
const failures = [];
const staleDocs = [];

const requiredDocs = [
  "ARCHITECTURE.md",
  "FEATURES.md",
  "api.md",
  "SECURITY.md",
  "THREAT_MODEL.md",
  "OPERATIONS_VERIFICATION.md",
  "SUPPLY_CHAIN_POLICY.md",
  "SECRET_ROTATION_RUNBOOK.md",
  "DOCUMENTATION_GOVERNANCE.md",
];

function fail(message) {
  failures.push(message);
}

function readText(filePath) {
  try {
    return fs.readFileSync(path.join(root, filePath), "utf8");
  } catch {
    fail(`Missing file: ${filePath}`);
    return "";
  }
}

function assertIncludes(content, snippet, context) {
  if (!content.includes(snippet)) {
    fail(`${context} is missing required text: ${snippet}`);
  }
}

function getLastCommitDate(relPath) {
  const result = spawnSync("git", ["log", "-1", "--format=%cI", "--", relPath], {
    cwd: root,
    encoding: "utf8",
  });
  const stamp = (result.stdout ?? "").trim();
  if ((result.status ?? 1) === 0 && stamp) {
    return stamp;
  }

  const absolutePath = path.join(root, relPath);
  if (fs.existsSync(absolutePath)) {
    return fs.statSync(absolutePath).mtime.toISOString();
  }

  return "";
}

for (const doc of requiredDocs) {
  const fullPath = path.join(root, "docs", doc);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing required docs file: docs/${doc}`);
  }
}

const readme = readText("README.md");
for (const doc of requiredDocs) {
  assertIncludes(readme, `(docs/${doc})`, "README.md");
}

const contributing = readText("CONTRIBUTING.md");
assertIncludes(contributing, "Update docs when behavior or configuration changes", "CONTRIBUTING.md");
assertIncludes(contributing, "Keep `docs/FEATURES.md` in sync", "CONTRIBUTING.md");

const securityDoc = readText("docs/SECURITY.md");
assertIncludes(securityDoc, "SUPPLY_CHAIN_POLICY.md", "docs/SECURITY.md");
assertIncludes(securityDoc, "SECRET_ROTATION_RUNBOOK.md", "docs/SECURITY.md");
assertIncludes(
  securityDoc,
  "Explicit HTTP security headers (`CSP`, `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`)",
  "docs/SECURITY.md",
);

const threatModel = readText("docs/THREAT_MODEL.md");
assertIncludes(threatModel, "Cross-origin WebSocket upgrade", "docs/THREAT_MODEL.md");
assertIncludes(threatModel, "Unsigned release artifact", "docs/THREAT_MODEL.md");

const opsDoc = readText("docs/OPERATIONS_VERIFICATION.md");
assertIncludes(opsDoc, "Security headers and WebSocket origin checks", "docs/OPERATIONS_VERIFICATION.md");
assertIncludes(opsDoc, "Supply chain and secret-rotation controls", "docs/OPERATIONS_VERIFICATION.md");

if (stalenessDays !== null) {
  const now = Date.now();
  for (const doc of requiredDocs) {
    const relPath = `docs/${doc}`;
    const stamp = getLastCommitDate(relPath);
    if (!stamp) {
      fail(`Unable to determine last commit date for ${relPath}`);
      continue;
    }

    const updatedAt = new Date(stamp);
    if (Number.isNaN(updatedAt.getTime())) {
      fail(`Invalid commit date for ${relPath}: ${stamp}`);
      continue;
    }

    const ageDays = Math.floor((now - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
    if (ageDays > stalenessDays) {
      staleDocs.push({
        path: relPath,
        ageDays,
        updatedOn: updatedAt.toISOString().slice(0, 10),
      });
    }
  }
}

if (reportFile) {
  const lines = [];
  lines.push("# Documentation Governance Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  if (stalenessDays !== null) {
    lines.push(`Staleness threshold: ${stalenessDays} days`);
  }
  lines.push("");

  if (failures.length > 0) {
    lines.push("## Structural failures");
    lines.push("");
    for (const message of failures) {
      lines.push(`- ${message}`);
    }
    lines.push("");
  }

  if (staleDocs.length > 0) {
    lines.push("## Stale docs");
    lines.push("");
    for (const item of staleDocs) {
      lines.push(`- ${item.path} (last updated ${item.updatedOn}, ${item.ageDays} days old)`);
    }
    lines.push("");
  }

  if (failures.length === 0 && staleDocs.length === 0) {
    lines.push("All documentation governance checks passed.");
    lines.push("");
  }

  fs.writeFileSync(path.join(root, reportFile), `${lines.join("\n")}\n`, "utf8");
}

if (failures.length > 0) {
  console.error("docs-check: FAILED");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

if (staleDocs.length > 0) {
  console.error(`docs-check: FAILED (${staleDocs.length} stale docs over ${stalenessDays} days)`);
  for (const item of staleDocs) {
    console.error(`- ${item.path}: ${item.ageDays} days (last updated ${item.updatedOn})`);
  }
  process.exit(2);
}

console.log("docs-check: OK");
