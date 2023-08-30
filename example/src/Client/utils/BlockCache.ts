import levelup, { LevelUp } from "levelup";
import leveldown from "leveldown";
import path from "path";
import { LightBlock } from "../../../../src/models/lightstreamer";

const KNOWN_KEYS = {
  HEAD_SEQUENCE: "__HEAD_SEQUENCE__",
};

// Storing keys as zero-padded numbers to avoid lexicographic ordering.
// At one minute block times, this gives us ~1,900 years of blocks.
const KEY_LENGTH = 9;

export class BlockCache {
  private db: LevelUp;

  constructor() {
    this.db = levelup(leveldown(path.join(__dirname, "client-block-cache")));
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
      .put(this.encodeKey(sequence), LightBlock.encode(block).finish())
      .put(KNOWN_KEYS.HEAD_SEQUENCE, sequence)
      .write();
  }

  public encodeKey(num: number) {
    return num.toString().padStart(KEY_LENGTH, "0");
  }

  public decodeKey(key: string) {
    if (key in KNOWN_KEYS) {
      return null;
    }

    return Number(key);
  }

  public get createReadStream() {
    return this.db.createReadStream;
  }
}
