import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // sharp decode of the golden images can take a moment on cold start.
    testTimeout: 20000,
  },
});
