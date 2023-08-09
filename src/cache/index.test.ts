import { describe, expect, it } from "vitest";
import { blockFixture } from "../../test/fixtures";
import { LightBlock } from "../models/lightstreamer";
import { lightBlockCache } from ".";

describe("LightBlockCache", () => {
  const fakeHash = "hash1";

  it("storing and retrieving block is successful", async () => {
    const encoded = LightBlock.encode(blockFixture).finish();
    await lightBlockCache.put(fakeHash, encoded);
    await lightBlockCache.put(blockFixture.sequence.toString(), fakeHash);

    const hashBlock = await lightBlockCache.getBlockByHash(fakeHash);
    expect(hashBlock).toEqual(blockFixture);

    const sequenceBlock = await lightBlockCache.getBlockBySequence(
      blockFixture.sequence,
    );
    expect(sequenceBlock).toEqual(blockFixture);
  });

  it("storing and retrieving hash is successful", async () => {
    await lightBlockCache.put("head", "fakehash");

    const block = await lightBlockCache.get("head");
    expect(block!.toString()).toEqual("fakehash");
  });
});
