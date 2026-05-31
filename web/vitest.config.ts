import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Resolve the `@/…` path alias so tests can import modules that use it
  // internally (e.g. lib/experiment-analysis → @/lib/analysis).
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // sharp decode of the golden images can take a moment on cold start.
    testTimeout: 20000,
  },
});
