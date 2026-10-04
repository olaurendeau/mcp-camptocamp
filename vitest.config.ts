import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Developer agents work in nested git worktrees; their tests belong to their own checkout
    exclude: [...configDefaults.exclude, ".claude/worktrees/**"],
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
