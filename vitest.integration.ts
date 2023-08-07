import { defineConfig } from "vitest/config";
import { baseConfig } from "./vitest.config";

export default defineConfig({
  test: {
    ...baseConfig,
    include: ["**/*.test.slow.?(c|m)[jt]s?(x)"],
    testTimeout: 60000,
  },
});
