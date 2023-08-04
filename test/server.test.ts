import { expect, it } from "vitest";
import { credentials } from "@grpc/grpc-js";
import { Empty, LightStreamerClient } from "@/models/lightstreamer";
import "@/server";

const client = new LightStreamerClient(
  "localhost:50051",
  credentials.createInsecure(),
);

it("starts successfully", async () => {
  await new Promise((res) => {
    client.getServerInfo(Empty, (_, response) => {
      expect(response.nodeStatus).toBe("started");
      res(null);
    });
  });
});
