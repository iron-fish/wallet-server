import levelup, { LevelUp } from "levelup";
import leveldown from "leveldown";
import path from "path";
import { LightBlock } from "../../../../src/models/lightstreamer";
import { logThrottled } from "./logThrottled";

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
      return 1;
    }
  }

  public async cacheBlock(block: LightBlock) {
    const sequence = block.sequence;

    logThrottled(`Caching block ${sequence}`, 100, block.sequence);

    await this.db
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

  public async getBlockBySequence(sequence: number): Promise<LightBlock> {
    const blockData = await this.db.get(this.encodeKey(sequence));
    return LightBlock.decode(blockData);
  }

  public async handleReorg(lastMainChainBlock: LightBlock) {
    const newHeadSequence = lastMainChainBlock.sequence;
    const prevHeadSequence = await this.getHeadSequence();

    if (newHeadSequence >= prevHeadSequence) {
      return;
    }

    const keysToDelete: string[] = [];

    // We're going to delete all the blocks starting at the new head sequence
    // and going up to the previous head sequence.
    for (let i = newHeadSequence; i <= prevHeadSequence; i++) {
      keysToDelete.push(this.encodeKey(i));
    }

    await this.db.batch(keysToDelete.map((key) => ({ type: "del", key })));

    await this.cacheBlock(lastMainChainBlock);
  }

  public async getBlockRange(
    startSequence: number,
    endSequence: number | null = null,
  ): Promise<LightBlock[]> {
    if (endSequence === null) {
      endSequence = await this.getHeadSequence();
    }

    if (startSequence > endSequence) {
      throw new Error("Start sequence cannot be greater than end sequence");
    }

    const keys: string[] = [];

    for (let i = startSequence; i <= endSequence; i++) {
      keys.push(this.encodeKey(i));
    }

    const blocks: Buffer[] = await this.db.getMany(keys);

    return blocks.map((block) => {
      return LightBlock.decode(block);
    });
  }

  public get createReadStream() {
    return this.db.createReadStream;
  }
}
