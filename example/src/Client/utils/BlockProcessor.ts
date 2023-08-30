import { ServiceError } from "@grpc/grpc-js";
import { BlockCache } from "./BlockCache";
import {
  BlockID,
  Empty,
  LightBlock,
  LightStreamerClient,
} from "../../../../src/models/lightstreamer";
import { addNotesToMerkleTree } from "./merkle";

const POLL_INTERVAL = 30 * 1000;

export class BlockProcessor {
  private client: LightStreamerClient;
  private pollInterval?: NodeJS.Timer;
  private isProcessingBlocks: boolean = false;
  private blockCache: BlockCache;

  constructor(client: LightStreamerClient, blockCache: BlockCache) {
    this.client = client;
    this.blockCache = blockCache;
  }

  public async start() {
    if (this.pollInterval !== undefined) {
      console.warn("Process already running");
      return;
    }

    this._pollForNewBlocks();

    this.pollInterval = setInterval(
      this._pollForNewBlocks.bind(this),
      POLL_INTERVAL,
    );
  }

  public stop() {
    clearInterval(this.pollInterval);
  }

  private async _pollForNewBlocks() {
    if (this.isProcessingBlocks) {
      return;
    }

    this.isProcessingBlocks = true;

    const [latestBlockError, latestBlock] = await this._getLatestBlock();

    if (latestBlockError) {
      throw latestBlockError;
    }

    const headSequence = latestBlock.sequence;

    if (!headSequence) {
      throw new Error("Head sequence is undefined");
    }

    const cachedHeadSequence = await this.blockCache.getHeadSequence();

    if (headSequence === cachedHeadSequence) {
      return;
    }

    await this._processBlockRange(cachedHeadSequence + 1, headSequence);

    this.isProcessingBlocks = false;
  }

  private _getLatestBlock() {
    return new Promise<[ServiceError | null, BlockID]>((res) => {
      this.client.getLatestBlock(Empty, (error, result) => {
        res([error, result]);
      });
    });
  }

  private async _processBlockRange(startSequence: number, endSequence: number) {
    let blocksProcessed = startSequence;
    const stream = this.client.getBlockRange({
      start: {
        sequence: startSequence,
      },
      end: {
        sequence: endSequence,
      },
    });

    try {
      await new Promise((res) => {
        stream.on("data", (block: LightBlock) => {
          this._processBlock(block);
          blocksProcessed++;
          if (blocksProcessed % 100 === 0) {
            console.log(`Processed ${blocksProcessed}/${endSequence} blocks`);
          }
        });

        stream.on("end", () => {
          res(true);
        });
      });
    } catch (err) {
      console.error(err);
    }
  }

  private async _processBlock(block: LightBlock) {
    this.blockCache.cacheBlock(block);

    const notes: Buffer[] = [];

    for (const transaction of block.transactions) {
      for (const output of transaction.outputs) {
        notes.push(output.note);
      }
    }

    await addNotesToMerkleTree(notes);
  }
}
