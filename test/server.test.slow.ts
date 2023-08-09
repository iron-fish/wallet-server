import { describe, expect, it } from "vitest";
import { credentials, status } from "@grpc/grpc-js";
import { Empty, LightStreamerClient } from "@/models/lightstreamer";
import { handle, result, autobind } from "@/utils/grpc";
import "@/server";

const client = autobind(
  new LightStreamerClient("localhost:50051", credentials.createInsecure()),
);

describe("LightStreamerServer", () => {
  it("starts successfully", async () => {
    const [_err, response] = await result(client.getServerInfo, Empty);
    expect(response?.nodeStatus).toBe("started");
  });

  it("catches unhandled errors", async () => {
    const bustedClient = autobind(
      new LightStreamerClient("localhost:50051", credentials.createInsecure()),
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
