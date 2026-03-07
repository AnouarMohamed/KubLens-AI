import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function walkFiles(dir, predicate, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, out);
      continue;
    }
    if (predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function parseImports(content) {
  const imports = [];
  const pattern = /from\s+["']([^"']+)["']/g;
  let match = pattern.exec(content);
  while (match) {
    imports.push(match[1]);
    match = pattern.exec(content);
  }
  return imports;
}

function resolveImport(sourceFile, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  return path.normalize(path.resolve(path.dirname(sourceFile), specifier));
}

function pathSegmentsFrom(source, target) {
  const rel = path.relative(source, target);
  return rel.split(path.sep).filter(Boolean);
}

function checkViewsContract() {
  const viewsDir = path.join(root, "src", "views");
  if (!exists(viewsDir)) {
    fail("Missing directory: src/views");
    return [];
  }

  const rootEntries = fs.readdirSync(viewsDir, { withFileTypes: true });
  const viewNames = [];
  for (const entry of rootEntries) {
    if (entry.isFile()) {
      if (entry.name !== "README.md") {
        fail(`src/views only allows README.md as a root file, found: ${entry.name}`);
      }
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    const viewDir = path.join(viewsDir, entry.name);
    const indexPath = path.join(viewDir, "index.tsx");
    if (!exists(indexPath)) {
      fail(`View folder must contain index.tsx: src/views/${entry.name}`);
      continue;
    }

    const allowedTopLevelDirs = new Set(["components", "hooks", "api", "__tests__"]);
    const allowedTopLevelFiles = new Set(["index.tsx", "README.md", "types.ts", "utils.ts", "constants.ts"]);
    const viewEntries = fs.readdirSync(viewDir, { withFileTypes: true });
    for (const viewEntry of viewEntries) {
      if (viewEntry.isDirectory() && !allowedTopLevelDirs.has(viewEntry.name)) {
        fail(`Unsupported directory in view ${entry.name}: ${viewEntry.name}`);
      }
      if (viewEntry.isFile() && !allowedTopLevelFiles.has(viewEntry.name)) {
        fail(`Unsupported file in view ${entry.name}: ${viewEntry.name}`);
      }
    }

    viewNames.push(entry.name);
  }

  return viewNames;
}

function checkViewImports() {
  const srcDir = path.join(root, "src");
  const viewsDir = path.join(srcDir, "views");
  const tsFiles = walkFiles(srcDir, (f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  for (const file of tsFiles) {
    const text = fs.readFileSync(file, "utf8");
    const imports = parseImports(text);
    const isInViews = toPosix(file).includes("/src/views/");
    const fileSegments = pathSegmentsFrom(viewsDir, file);
    const currentView = isInViews && fileSegments.length > 1 ? fileSegments[0] : "";

    for (const specifier of imports) {
      const resolved = resolveImport(file, specifier);
      if (!resolved) {
        continue;
      }

      const resolvedPosix = toPosix(resolved);
      const inViewsTarget = resolvedPosix.includes("/src/views/");

      if (isInViews && inViewsTarget) {
        const targetSegments = pathSegmentsFrom(viewsDir, resolved);
        const targetView = targetSegments.length > 0 ? targetSegments[0] : "";
        if (targetView && targetView !== currentView) {
          fail(`Cross-view import is not allowed: ${toPosix(path.relative(root, file))} -> ${specifier}`);
        }
      }

      if (!isInViews && inViewsTarget) {
        const relativeToSrc = toPosix(path.relative(srcDir, file));
        const relativeTarget = pathSegmentsFrom(viewsDir, resolved);
        if (relativeToSrc !== "App.tsx") {
          fail(`Only src/App.tsx can import views directly: ${relativeToSrc} -> ${specifier}`);
          continue;
        }

        if (relativeTarget.length > 1) {
          fail(`src/App.tsx must import only view roots, not internals: ${specifier}`);
        }
      }
    }
  }
}

function checkBackendUsecaseNaming() {
  const clusterDir = path.join(root, "backend", "internal", "cluster");
  const diagnosticsDir = path.join(root, "backend", "internal", "diagnostics");

  if (exists(clusterDir)) {
    const clusterFiles = fs.readdirSync(clusterDir, { withFileTypes: true });
    const allowedClusterPrefixes = ["service_", "query_", "command_", "mapper_", "mock_", "support_"];
    for (const entry of clusterFiles) {
      if (!entry.isFile() || !entry.name.endsWith(".go") || entry.name.endsWith("_test.go")) {
        continue;
      }
      if (entry.name === "doc.go") {
        continue;
      }
      if (!allowedClusterPrefixes.some((prefix) => entry.name.startsWith(prefix))) {
        fail(`backend/internal/cluster file must use use-case prefix: ${entry.name}`);
      }
    }
  }

  if (exists(diagnosticsDir)) {
    const diagnosticsFiles = fs.readdirSync(diagnosticsDir, { withFileTypes: true });
    const allowedDiagnosticsPrefixes = ["analysis_", "present_"];
    for (const entry of diagnosticsFiles) {
      if (!entry.isFile() || !entry.name.endsWith(".go") || entry.name.endsWith("_test.go")) {
        continue;
      }
      if (entry.name === "doc.go") {
        continue;
      }
      if (!allowedDiagnosticsPrefixes.some((prefix) => entry.name.startsWith(prefix))) {
        fail(`backend/internal/diagnostics file must use use-case prefix: ${entry.name}`);
      }
    }
  }
}

checkViewsContract();
checkViewImports();
checkBackendUsecaseNaming();

if (failures.length > 0) {
  console.error("Structure lint failed:");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("Structure lint passed.");
