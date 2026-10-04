import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default defineConfig(
  { ignores: ["dist/", "coverage/", "node_modules/", ".claude/worktrees/"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        // The first project that includes a file types it: src/ and the vitest configs get every flag
        // of the build, tests/ its own tsconfig (no noUncheckedIndexedAccess).
        project: ["./tsconfig.typecheck.json", "./tests/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Numbers (IDs, altitudes, page counts) are interpolated into text all the time and print fine.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // eslint.config.js itself is plain JavaScript, outside every tsconfig.
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
