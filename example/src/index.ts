import { config } from "dotenv";
config();

import { Client } from "./Client/Client";
import { send } from "./send";

async function main() {
  const args = process.argv.slice(2);
  const argMap: { [key: string]: string } = {};

  // Parse command line arguments
  const command = args[0];
  args.slice(1).forEach((arg) => {
    const [key, value] = arg.split("=");
    argMap[key] = value;
  });

  const spendingKey = process.env["SPENDING_KEY"];

  if (!spendingKey) {
    throw new Error("SPENDING_KEY not found");
  }

  const client = new Client();
  // void client.start();
  // console.log("Client started")
  // void client.waitForProcessorSync();
  // console.log("Processor synced");

  const publicAddress = client.addAccount(spendingKey);
  console.log("Added account");
  client.syncAccounts();
  console.log("Account sync started");
  await client.waitForAccountSync(publicAddress);
  console.log("Account synced");

  if (command === "send") {
    // If "send" command is provided, then proceed with additional operations.
    await send(argMap, spendingKey, client);
  }

  await client.waitUntilClose();
}

main();
