import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    root: path.resolve(__dirname),
    include: ["**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    environment: "node",
    setupFiles: ["./helpers/setup-live.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
      "@main": path.resolve(__dirname, "../../src/main"),
      "@shared": path.resolve(__dirname, "../../src/shared"),
    },
  },
});
