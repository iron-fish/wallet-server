import { blockFixture } from "../../test/fixtures";
import { lightBlockCache } from ".";

describe("LightBlockCache", () => {
  beforeAll(async () => {
    await lightBlockCache.open();
  });

  afterAll(async () => {
    await lightBlockCache.close();
  });

  it("storing and retrieving block is successful", async () => {
    await lightBlockCache.putLightBlock(blockFixture);

    const hashBlock = await lightBlockCache.getLightBlock(blockFixture.hash);
    expect(hashBlock).toEqual(blockFixture);

    const sequenceBlock = await lightBlockCache.getLightBlockBySequence(
      blockFixture.sequence,
    );
    expect(sequenceBlock).toEqual(blockFixture);
  });

  it("storing and retrieving hash is successful", async () => {
    await lightBlockCache.putHead(Buffer.from("deadbeef", "hex"), 1000);

    const head = await lightBlockCache.getHead();
    expect(head?.toString("hex")).toEqual("deadbeef");

    const sequence = await lightBlockCache.getHeadSequence();
    expect(sequence).toEqual(1000);
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
