import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Developer agents work in nested git worktrees; their tests belong to their own checkout
    exclude: [...configDefaults.exclude, ".claude/worktrees/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // index.ts only wires tools to the MCP SDK and stdio transport
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
