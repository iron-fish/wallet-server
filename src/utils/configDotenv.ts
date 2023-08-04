import { config } from "dotenv";

export function configDotEnv() {
  config({ path: process.env["DOTENV_PATH"] } || ".env");
}
