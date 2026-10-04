import { readFileSync } from "node:fs";

// package.json sits one level above both src/ (tsx, vitest) and dist/ (npm package, Docker image),
// and npm always ships it, so the version never needs a manual edit
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export const VERSION: string = packageJson.version;
