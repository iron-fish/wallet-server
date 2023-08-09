import { describe, expect, it } from "vitest";
import { credentials } from "@grpc/grpc-js";
import { Empty, LightBlock, LightStreamerClient } from "@/models/lightstreamer";
import { lightBlockCache } from "@/cache";
import { blockFixture } from "./fixtures";
import { autobind, result } from "@/utils/grpc";
import "@/server";

const client = autobind(
  new LightStreamerClient("localhost:50051", credentials.createInsecure()),
);

describe("LightStreamerServer", () => {
  it("starts successfully", async () => {
    const [_, response] = await result(client.getServerInfo, Empty);

    expect(response.nodeStatus).toBe("started");
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

  it("getLatestBlock gets head from node", async () => {
    const [, response] = await result(client.getLatestBlock, Empty);
    expect(response.hash).toEqual(expect.any(Buffer));
    expect(response.sequence).toBeGreaterThan(1);
  });
});
