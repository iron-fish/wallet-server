import { describe } from "node:test";
import { expect, it } from "vitest";
import { lightBlockCache } from ".";

describe("LightBlockCache creating cache", () => {
  it("creating the cache adds blocks", async () => {
    const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
    const cacheBlocks = lightBlockCache.cacheBlocks();
    await Promise.race([cacheBlocks, timeout]);

    const head = await lightBlockCache.get("head");
    const block = await lightBlockCache.getBlockByHash(head!.toString());
    expect(block).toHaveProperty("protoVersion");
    expect(block).toHaveProperty("sequence");
    expect(block).toHaveProperty("hash");
    expect(block).toHaveProperty("previousBlockHash");
    expect(block).toHaveProperty("timestamp");
    expect(block).toHaveProperty("transactions");
  });
});
