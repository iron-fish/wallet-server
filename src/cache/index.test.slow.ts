import { expect, it, describe, afterAll } from "vitest";
import { lightBlockCache } from ".";

function delay(ms = 3000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterAll(async () => {
  await lightBlockCache.close();
});

describe("LightBlockCache creating cache", () => {
  it("creating the cache adds blocks", async () => {
    await lightBlockCache.clear();
    const cacheBlocks = lightBlockCache.cacheBlocks();
    await Promise.race([cacheBlocks, delay()]);
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
