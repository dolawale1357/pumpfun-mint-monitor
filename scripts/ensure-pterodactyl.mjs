import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const rootIndexJs = `import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const distEntry = join(rootDir, "dist", "index.js");

if (!existsSync(distEntry)) {
  console.error("[APP] dist/index.js is missing. Run: npm run build");
  process.exit(1);
}

await import(pathToFileURL(distEntry).href);
`;

const srcIndexJs = `import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = join(rootDir, "dist", "index.js");

if (!existsSync(distEntry)) {
  console.error("[APP] dist/index.js is missing. Run: npm run build");
  process.exit(1);
}

await import(pathToFileURL(distEntry).href);
`;

const rootIndexTs = `await import("./dist/index.js");
`;

const files = [
  [join(rootDir, "index.js"), rootIndexJs],
  [join(rootDir, "index.ts"), rootIndexTs],
  [join(rootDir, "src", "index.js"), srcIndexJs],
  [join(rootDir, "*.js"), rootIndexJs],
];

for (const [filePath, content] of files) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

console.log("[postinstall] Pterodactyl entry files ready (index.js, *.js, index.ts, src/index.js)");
