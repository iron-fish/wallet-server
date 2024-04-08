import { LightBlock } from "../models/lightstreamer";
import { blockFixture } from "../../test/fixtures";
import { lightBlockCache } from ".";

describe("LightBlockCache", () => {
  const fakeHash = "hash1";

  beforeAll(async () => {
    await lightBlockCache.open();
  });

  afterAll(async () => {
    await lightBlockCache.close();
  });

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
    await lightBlockCache.put("head", Buffer.from("deedbeef", "hex"));

    const block = await lightBlockCache.getHead();
    expect(block!.toString("hex")).toEqual("deedbeef");
  });

  it("finality sequence is always behind head sequence by specified amount", async () => {
    const mockedSequence = 100;
    const block = {
      ...blockFixture,
      sequence: mockedSequence,
    };
    await lightBlockCache.cacheBlock(block);
    const finalitySequence = await lightBlockCache.getFinalizedBlockSequence();
    expect(mockedSequence - lightBlockCache.finalityBlockCount).toEqual(
      finalitySequence,
    );
  });
});
