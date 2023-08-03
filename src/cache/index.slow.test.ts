import { describe } from "node:test";
import { expect, it } from "vitest";
import { lightBlockCache } from ".";
import { LightBlock } from "../models/lightstreamer";

describe("LightBlockCache creating cache", () => {
  it("creating the cache adds blocks", async () => {
    const cache5Seconds = new Promise(function (resolve, reject) {
      lightBlockCache.cacheBlocks().then(resolve, reject);
      setTimeout(reject, 5000);
    });
    await cache5Seconds;
    const head = await lightBlockCache.get("head");
    const block = await lightBlockCache.getBlockByHash(head!.toString());
    expect(block).instanceOf(LightBlock);
  });
});
