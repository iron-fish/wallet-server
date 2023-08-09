import { afterAll, describe, expect, it } from "vitest";
import { ServiceError, credentials, status } from "@grpc/grpc-js";
import {
  BlockID,
  Empty,
  LightBlock,
  LightStreamerClient,
  SendResponse,
  ServerInfo,
} from "@/models/lightstreamer";
import { lightBlockCache } from "@/cache";
import { blockFixture } from "./fixtures";
import "@/server";

const client = new LightStreamerClient(
  "localhost:50051",
  credentials.createInsecure(),
);

afterAll(async () => {
  await lightBlockCache.close();
});

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

describe("getBlock", () => {
  it("errors if request does not have hash or sequence", async () => {
    const err = await new Promise<ServiceError | null>((res) => {
      client.getBlock({}, (err) => {
        res(err);
      });
    });
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

  it("getBlockRange streams blocks", async () => {
    const numBlocks = 3;

    const response = await new Promise<LightBlock[]>((resolve, reject) => {
      const call = client.getBlockRange({
        start: { sequence: 1 },
        end: { sequence: numBlocks },
      });
      const blocks: LightBlock[] = [];
      call.on("data", (response: LightBlock) => {
        blocks.push(response);
      });

      call.on("end", () => {
        resolve(blocks);
      });

      call.on("error", (error) => {
        reject(error);
      });
    });
    expect(response.length).toEqual(numBlocks);
    for (let i = 0; i < numBlocks; i++) {
      if (i > 0) {
        expect(response[i].previousBlockHash).toEqual(response[i - 1].hash);
      }
    }
  });

  it("getBlockRange errors on inverse input", async () => {
    const promise = new Promise<LightBlock[]>((_, reject) => {
      const call = client.getBlockRange({
        start: { sequence: 5 },
        end: { sequence: 1 },
      });
      call.on("error", (error) => {
        reject(error);
      });
    });
    expect(promise).rejects.toThrow(
      "INVALID_ARGUMENT: End sequence must be greater than start sequence",
    );
  });

  it("getBlockRange errors on non-existent block", async () => {
    const promise = new Promise<LightBlock[]>((_, reject) => {
      const call = client.getBlockRange({
        start: { sequence: 100000000000000 },
        end: { sequence: 1000000000000001 },
      });
      call.on("error", (error) => {
        reject(error);
      });
    });
    expect(promise).rejects.toThrow("INTERNAL: ");
  });

  it("sendTransaction fails with invalid data", async () => {
    const promise = new Promise<SendResponse>((resolve, reject) => {
      client.sendTransaction(
        { data: Buffer.from("invalid transaction", "hex") },
        (err, response) => {
          if (err) {
            reject(err);
          }
          resolve(response);
        },
      );
    });

    expect(promise).rejects.toThrow("INTERNAL: ");
  });
});
