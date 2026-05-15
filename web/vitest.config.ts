import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "node:child_process": path.resolve(__dirname, "src/lib/node-stub.ts"),
      "node:util": path.resolve(__dirname, "src/lib/node-stub.ts"),
      "node:crypto": path.resolve(__dirname, "src/lib/node-stub.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
  },
});
