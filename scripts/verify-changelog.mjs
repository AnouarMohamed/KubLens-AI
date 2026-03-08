import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packageJSONPath = path.join(root, "package.json");
const changelogPath = path.join(root, "CHANGELOG.md");

function fail(message) {
  console.error(`changelog-check: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(changelogPath)) {
  fail("CHANGELOG.md is missing");
}

const pkg = JSON.parse(fs.readFileSync(packageJSONPath, "utf8"));
const version = String(pkg.version ?? "").trim();
if (version === "") {
  fail("package.json version is missing");
}

const changelog = fs.readFileSync(changelogPath, "utf8");
const heading = `## v${version}`;
if (!changelog.includes(heading)) {
  fail(`missing changelog section "${heading}"`);
}

console.log(`changelog-check: OK (${heading})`);
