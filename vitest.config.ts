import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Developer agents work in nested git worktrees; their tests belong to their own checkout.
    // The live API contract tests run only through vitest.contract.config.ts (`npm run test:contract`).
    exclude: [...configDefaults.exclude, ".claude/worktrees/**", "tests/contract/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts is only the stdio bootstrap; createServer() in server.ts is tested in memory
      exclude: ["src/index.ts"],
      reporter: ["text", "text-summary"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
