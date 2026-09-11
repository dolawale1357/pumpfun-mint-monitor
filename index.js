import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const distEntry = join(rootDir, "dist", "index.js");

if (!existsSync(distEntry)) {
  console.error("[APP] dist/index.js is missing.");
  console.error("[APP] On the server run: npm install && npm run build");
  console.error("[APP] Or git pull the latest repo (includes pre-built dist).");
  process.exit(1);
}

await import(pathToFileURL(distEntry).href);
