import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const distEntry = join(rootDir, "dist", "index.js");

function runBuild() {
  console.log("[APP] Building TypeScript (dist/index.js)...");
  const result = spawnSync("npm", ["run", "build"], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });

  return result.status === 0 && existsSync(distEntry);
}

if (!existsSync(distEntry) && !runBuild()) {
  console.error(
    "[APP] Could not start: dist/index.js missing and build failed.",
  );
  console.error("[APP] Run on the server: npm install && npm run build");
  process.exit(1);
}

await import(pathToFileURL(distEntry).href);
