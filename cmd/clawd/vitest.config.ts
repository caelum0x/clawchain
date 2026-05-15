import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // task-recovery.test.ts uses node:test runner, not vitest
      "src/lib/task-recovery.test.ts",
    ],
  },
});
