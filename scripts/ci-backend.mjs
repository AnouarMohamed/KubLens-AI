import { spawnSync } from "node:child_process";

function run(command) {
  const result = spawnSync(command, {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("npm run fmt:go");
run("git diff --exit-code -- backend/cmd backend/internal");
run("node scripts/go-task.mjs -C backend vet ./...");
run("node scripts/go-task.mjs -C backend run github.com/gordonklaus/ineffassign@v0.2.0 ./...");
run("npm run test:go");
