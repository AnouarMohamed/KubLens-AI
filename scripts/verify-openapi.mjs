import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import yaml from "js-yaml";

const root = process.cwd();
const specPath = path.join(root, "backend", "internal", "httpapi", "openapi.yaml");

function fail(message) {
  console.error(`openapi-check: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(specPath)) {
  fail("openapi.yaml is missing");
}

const raw = fs.readFileSync(specPath, "utf8");
let spec;
try {
  spec = yaml.load(raw);
} catch (err) {
  fail(`invalid YAML: ${err instanceof Error ? err.message : String(err)}`);
}

if (!spec || typeof spec !== "object") {
  fail("spec payload is empty");
}

const openapiVersion = String(spec.openapi ?? "").trim();
if (!openapiVersion.startsWith("3.")) {
  fail(`unsupported openapi version "${openapiVersion}"`);
}

const requiredPaths = [
  "/healthz",
  "/readyz",
  "/openapi.yaml",
  "/runtime",
  "/metrics/prometheus",
  "/auth/session",
  "/clusters",
  "/pods",
  "/nodes",
  "/stats",
  "/diagnostics",
  "/predictions",
  "/assistant",
  "/terminal/exec",
];

const paths = spec.paths && typeof spec.paths === "object" ? spec.paths : {};
for (const requiredPath of requiredPaths) {
  if (!(requiredPath in paths)) {
    fail(`missing required path "${requiredPath}"`);
  }
}

const operationIDs = new Set();
for (const [specPathKey, methods] of Object.entries(paths)) {
  if (!methods || typeof methods !== "object") {
    continue;
  }
  for (const [method, operation] of Object.entries(methods)) {
    if (!operation || typeof operation !== "object") {
      continue;
    }
    const id = String(operation.operationId ?? "").trim();
    if (id === "") {
      fail(`missing operationId for ${method.toUpperCase()} ${specPathKey}`);
    }
    if (operationIDs.has(id)) {
      fail(`duplicate operationId "${id}"`);
    }
    operationIDs.add(id);
  }
}

console.log(`openapi-check: OK (${operationIDs.size} operations)`);
