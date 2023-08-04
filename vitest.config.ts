import { defineConfig } from "vitest/config";

export const baseConfig = {
  include: ["**/*.{test,test.slow}.?(c|m)[jt]s?(x)"],
  alias: {
    "@": "./src",
  },
};

export default defineConfig({
  test: {
    ...baseConfig,
  },
});
