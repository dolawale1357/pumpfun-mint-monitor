import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const tsxCli = join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const entry = join(rootDir, "src", "index.ts");

function fail(message) {
  console.error(`[APP] ${message}`);
  process.exit(1);
}

if (!existsSync(entry)) {
  fail("src/index.ts not found — upload the full project to /home/container.");
}

if (!existsSync(tsxCli)) {
  console.log("[APP] tsx not found — running npm install...");
  const install = spawnSync("npm", ["install"], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });
  if (install.status !== 0) {
    fail("npm install failed");
  }
}

if (!existsSync(tsxCli)) {
  fail("tsx is missing. Run: npm install");
}

const result = spawnSync(process.execPath, [tsxCli, entry], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
