import { config } from "dotenv";
config();

import { Client } from "./Client/Client";

async function main() {
  const client = new Client();
  await client.start();

  const spendingKey = process.env["SPENDING_KEY"];

  if (!spendingKey) {
    throw new Error("SPENDING_KEY not found");
  }

  client.addAccount(spendingKey);

  await client.waitUntilClose();
}

main();
