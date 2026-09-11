/**
 * Pterodactyl fallback when the egg runs: ts-node --esm index.ts
 * (Requires dist/ — committed in repo or built via npm run build)
 */
await import("./dist/index.js");
