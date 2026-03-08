import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const cacheDir = process.env.GOCACHE || path.join(root, ".gocache");
const modCacheDir = process.env.GOMODCACHE || path.join(root, ".gomodcache");
const tmpDir = process.env.GOTMPDIR || path.join(root, ".tmp-go");

for (const dir of [cacheDir, modCacheDir, tmpDir]) {
  mkdirSync(dir, { recursive: true });
}

const args = process.argv.slice(2);
const result = spawnSync("go", args, {
  stdio: "inherit",
  env: {
    ...process.env,
    GOCACHE: cacheDir,
    GOMODCACHE: modCacheDir,
    GOTMPDIR: tmpDir,
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
