import { describe, expect, it } from "vitest";
import { credentials } from "@grpc/grpc-js";
import {
  BlockID,
  Empty,
  LightBlock,
  LightStreamerClient,
  ServerInfo,
} from "@/models/lightstreamer";
import "@/server";
import { lightBlockCache } from "@/cache";
import { blockFixture } from "./fixtures";

const client = new LightStreamerClient(
  "localhost:50051",
  credentials.createInsecure(),
);

describe("LightStreamerServer", () => {
  it("starts successfully", async () => {
    const response = await new Promise<ServerInfo>((resolve, reject) => {
      client.getServerInfo(Empty, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    });

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

    const response = await new Promise<LightBlock>((resolve, reject) => {
      client.getBlock({ hash: blockFixture.hash }, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    });
    expects(response);

    const responseSequence = await new Promise<LightBlock>(
      (resolve, reject) => {
        client.getBlock(
          { sequence: blockFixture.sequence },
          (err, response) => {
            if (err) {
              reject(err);
            }
            resolve(response);
          },
        );
      },
    );
    expects(responseSequence);
  });

  it("uncached blocks are retrieved from node", async () => {
    const uncachedResponse = await new Promise<LightBlock>(
      (resolve, reject) => {
        client.getBlock({ sequence: 555 }, (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        });
      },
    );
    expect(uncachedResponse).toBeDefined();
  });

  it("getLatestBlock gets head from node", async () => {
    const response = await new Promise<BlockID>((resolve, reject) => {
      client.getLatestBlock(Empty, (err, response) => {
        if (err) {
          reject(err);
        }
        resolve(response);
      });
    });

    expect(response.hash).toEqual(expect.any(Buffer));
    expect(response.sequence).toBeGreaterThan(1);
  });
});
