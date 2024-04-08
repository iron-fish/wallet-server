import { lightBlockCache } from ".";

function delay(ms = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterAll(async () => {
  await lightBlockCache.close();
});

describe("LightBlockCache creating cache", () => {
  it("cache adds blocks", async () => {
    await lightBlockCache.clear();
    const cacheBlocks = lightBlockCache.cacheBlocks();
    await Promise.race([cacheBlocks, delay()]);
    const head = await lightBlockCache.getHead();
    const block = await lightBlockCache.getBlockByHash(head!.toString("hex"));
    expect(block).toHaveProperty("protoVersion");
    expect(block).toHaveProperty("sequence");
    expect(block).toHaveProperty("hash");
    expect(block).toHaveProperty("previousBlockHash");
    expect(block).toHaveProperty("timestamp");
    expect(block).toHaveProperty("transactions");
  });
});
