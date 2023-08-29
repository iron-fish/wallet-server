import levelup, { LevelUp } from "levelup";
import leveldown from "leveldown";
import path from "path";
import { LightBlock } from "../../../src/models/lightstreamer";

const KNOWN_KEYS = {
  HEAD_SEQUENCE: "HEAD_SEQUENCE",
};

export class BlockCache {
  private db: LevelUp;

  constructor() {
    this.db = levelup(
      leveldown(path.join(__dirname, "..", "client-block-cache")),
    );
  }

  public async getHeadSequence() {
    try {
      const headSequence = await this.db.get(KNOWN_KEYS.HEAD_SEQUENCE);
      const asNumber = Number(headSequence);
      if (isNaN(asNumber)) {
        throw new Error("Head sequence is not a number");
      }
      return asNumber;
    } catch (_err) {
      return 0;
    }
  }

  public cacheBlock(block: LightBlock) {
    const sequence = block.sequence;
    console.log(`Caching block ${sequence}`);

    this.db
      .batch()
      .put(sequence, block)
      .put(KNOWN_KEYS.HEAD_SEQUENCE, sequence)
      .write();
  }
}
