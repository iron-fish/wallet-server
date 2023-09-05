import { EventEmitter } from "events";

import { ServiceError } from "@grpc/grpc-js";
import { BlockCache } from "./BlockCache";
import {
  BlockID,
  Empty,
  LightBlock,
  LightStreamerClient,
} from "../../../../src/models/lightstreamer";
import { addNotesToMerkleTree } from "./merkle";
import { logThrottled } from "./logThrottled";

const POLL_INTERVAL = 30 * 1000;

export class BlockProcessor {
  private client: LightStreamerClient;
  private pollInterval?: NodeJS.Timer;
  private isProcessingBlocks: boolean = false;
  private blockCache: BlockCache;
  private events: EventEmitter = new EventEmitter(); // Event emitter for block events

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

  public waitForProcessorSync(): Promise<void> {
    console.log("Waiting for processor to sync");
    if (!this.isProcessingBlocks) {
      return Promise.resolve();
    }
    console.log("Processor is currently syncing. Waiting for it to finish");
    return new Promise((resolve) => {
      this.events.once("blocks-processed", resolve);
    });
  }

  private async _pollForNewBlocks() {
    if (this.isProcessingBlocks) {
      return;
    }
    const [latestBlockError, latestBlock] = await this._getLatestBlock();

    if (latestBlockError) {
      throw latestBlockError;
    }

    const headSequence = latestBlock.sequence;

    if (!headSequence) {
      throw new Error("Head sequence is undefined");
    }

    const cachedHeadSequence = await this.blockCache.getHeadSequence();

    if (cachedHeadSequence + 1 >= headSequence) {
      return;
    }

    this.isProcessingBlocks = true;

    const batchSize = process.env["BLOCK_PROCESSING_BATCH_SIZE"]
      ? parseInt(process.env["BLOCK_PROCESSING_BATCH_SIZE"])
      : 100;
    for (let i = cachedHeadSequence; i < headSequence; i += batchSize) {
      await this._processBlockRange(i, Math.min(i + batchSize, headSequence));
    }
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
    console.log(`Processing blocks from ${startSequence} to ${endSequence}`);

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

          logThrottled(
            `Processed ${blocksProcessed}/${endSequence} blocks`,
            100,
            blocksProcessed,
          );
        });

        stream.on("end", () => {
          this.events.emit("blocks-processed", endSequence);
          res(true);
        });
      });

      console.log("Finished processing blocks");
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
