import { configDefaults, defineConfig } from "vitest/config";

// `npm run test:contract`: only the live API contract tests, without coverage.
export default defineConfig({
  test: {
    include: ["tests/contract/**/*.contract.test.ts"],
    exclude: [...configDefaults.exclude, ".claude/worktrees/**"],
    // The client gives up after 15 s; leave room for that error to surface
    testTimeout: 30_000,
    coverage: { enabled: false },
  },
});
