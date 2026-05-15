import { defineConfig } from "vite";
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
  build: {
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:1317",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/rpc": {
        target: "http://localhost:26657",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, ""),
      },
      "/faucet": {
        target: "http://localhost:8888",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:8891",
        changeOrigin: true,
        ws: true,
      },
      "/notifications": {
        target: "http://localhost:8892",
        changeOrigin: true,
      },
    },
  },
});
