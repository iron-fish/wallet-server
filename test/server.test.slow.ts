import { describe, expect, it } from "vitest";
import { credentials, status } from "@grpc/grpc-js";
import { Empty, LightStreamerClient } from "@/models/lightstreamer";
import "@/server";
import { handle } from "@/utils/client";

const client = new LightStreamerClient(
  "localhost:50051",
  credentials.createInsecure(),
);

describe("LightStreamerServer", () => {
  it("starts successfully", async () => {
    await new Promise((res) => {
      client.getServerInfo(Empty, (_, response) => {
        expect(response.nodeStatus).toBe("started");
        res(null);
      });
    });
  });

  it("catches unhandled errors", async () => {
    const bustedClient = new LightStreamerClient(
      "localhost:50051",
      credentials.createInsecure(),
    );

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    bustedClient.getServerInfo = handle(async () => {
      throw new Error("something went wrong");
    });

    await new Promise((res) => {
      bustedClient.getServerInfo(Empty, (err) => {
        expect(err?.message).toBe("something went wrong");
        expect(err?.code).toBe(status.INTERNAL);
        res(null);
      });
    });
  });
});
