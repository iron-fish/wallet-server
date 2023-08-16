import { credentials } from "@grpc/grpc-js";
import { LightStreamerClient } from "../../src/models/lightstreamer";
import { BlockProcessor } from "./utils/BlockProcessor";

const client = new LightStreamerClient(
  "localhost:50051",
  credentials.createInsecure(),
);

async function main() {
  const blockProcessor = new BlockProcessor(client);
  await blockProcessor.start();
}

main();
