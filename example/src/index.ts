import { generateKey } from "@ironfish/rust-nodejs";
import { Client } from "./Client/Client";

async function main() {
  const client = new Client();
  await client.start();

  const exampleKey = generateKey();

  client.addAccount(exampleKey.spendingKey);

  await client.waitUntilClose();
}

main();
