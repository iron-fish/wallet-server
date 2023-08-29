import { credentials } from "@grpc/grpc-js";
import { LightStreamerClient } from "../../src/models/lightstreamer";
import { BlockProcessor } from "./utils/BlockProcessor";

const client = new LightStreamerClient(
  process.env["WALLET_SERVER_HOST"] || "localhost:50051",
  credentials.createInsecure(),
);

async function main() {
  console.log("Starting block processor");
  const blockProcessor = new BlockProcessor(client);
  await blockProcessor.start();
}

main();
