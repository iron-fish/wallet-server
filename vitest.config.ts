import { UserConfig } from "vitest/config";

export const baseConfig: UserConfig["test"] = {
  include: ["**/*.{test,test.slow}.?(c|m)[jt]s?(x)"],
  setupFiles: ["./test/setup.ts"],
  alias: {
    "@": "./src",
  },
  env: {
    BUILD_CACHE: "false",
  },
};
