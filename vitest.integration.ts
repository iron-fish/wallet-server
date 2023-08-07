import { defineConfig } from "vitest/config";
import { baseConfig } from "./vitest.config";

console.log(`
Running integration tests...
`);

export default defineConfig({
  test: {
    ...baseConfig,
    include: ["**/*.test.slow.?(c|m)[jt]s?(x)"],
    testTimeout: 60000,
    threads: false,
  },
});
