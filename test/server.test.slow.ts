import { afterAll, describe, expect, it } from "vitest";
import { credentials, status } from "@grpc/grpc-js";
import { Empty, LightBlock, LightStreamerClient } from "@/models/lightstreamer";
import { lightBlockCache } from "@/cache";
import { blockFixture } from "./fixtures";
import { autobind, result } from "@/utils/grpc";
import "@/server";

const client = autobind(
  new LightStreamerClient("localhost:50051", credentials.createInsecure()),
);

afterAll(async () => {
  await lightBlockCache.close();
});

describe("LightStreamerServer", () => {
  it("starts successfully", async () => {
    const [_, response] = await result(client.getServerInfo, Empty);

    expect(response.nodeStatus).toBe("started");
  });

  it("getLatestBlock gets head from node", async () => {
    const [, response] = await result(client.getLatestBlock, Empty);
    expect(response.hash).toEqual(expect.any(Buffer));
    expect(response.sequence).toBeGreaterThan(1);
  });
});

describe("getBlock", () => {
  it("errors if request does not have hash or sequence", async () => {
    const [err] = await result(client.getBlock, {});
    expect(err?.code).toEqual(status.INVALID_ARGUMENT);
    expect(err?.message).toContain("Either hash or sequence must be provided");
  });

  it("getBlock retrieves data from cache in priority", async () => {
    const hash = blockFixture.hash.toString("hex");
    const sequence = blockFixture.sequence.toString();
    const encodedBlockFixture = LightBlock.encode(blockFixture).finish();
    await lightBlockCache.put(hash, encodedBlockFixture);
    await lightBlockCache.put(sequence, hash);

    expect(lightBlockCache.get(hash)).resolves.toEqual(encodedBlockFixture);

    function expects(response: LightBlock) {
      expect(response.hash).toEqual(blockFixture.hash);
      expect(response.previousBlockHash).toEqual(
        blockFixture.previousBlockHash,
      );
      expect(response.sequence).toEqual(blockFixture.sequence);
      expect(response.transactions.length).toEqual(
        blockFixture.transactions.length,
      );
      expect(response.timestamp).toEqual(blockFixture.timestamp);
      expect(response.protoVersion).toEqual(blockFixture.protoVersion);
    }

    const [, response] = await result(client.getBlock, {
      hash: blockFixture.hash,
    });

    expects(response);

    const [, responseSequence] = await result(client.getBlock, {
      sequence: blockFixture.sequence,
    });
    expects(responseSequence);
  });

  it("uncached blocks are retrieved from node", async () => {
    const [, uncachedResponse] = await result(client.getBlock, {
      sequence: 555,
    });
    expect(uncachedResponse).toBeDefined();
  });
});
