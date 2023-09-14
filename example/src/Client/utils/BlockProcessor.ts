import { EventEmitter } from "events";

import { ServiceError } from "@grpc/grpc-js";
import { BlockCache } from "./BlockCache";
import {
  BlockID,
  Empty,
  LightBlock,
  LightStreamerClient,
} from "../../../../src/models/lightstreamer";
import {
  addNotesToMerkleTree,
  getNotesTreeSize,
  revertToNoteSize,
} from "./MerkleTree";
import { logThrottled } from "./logThrottled";
import { AccountsManager } from "./AccountsManager";

const POLL_INTERVAL = 30 * 1000;

export class BlockProcessor {
  private client: LightStreamerClient;
  private pollInterval?: NodeJS.Timer;
  private isProcessingBlocks: boolean = false;
  private blockCache: BlockCache;
  private accountsManager: AccountsManager;
  private events: EventEmitter = new EventEmitter(); // Event emitter for block events

  constructor(
    client: LightStreamerClient,
    blockCache: BlockCache,
    accountsManager: AccountsManager,
  ) {
    this.client = client;
    this.blockCache = blockCache;
    this.accountsManager = accountsManager;
  }

  public async start() {
    if (this.pollInterval !== undefined) {
      console.warn("Process already running");
      return;
    }

    await this._pollForNewBlocks();
    this.events.emit("blocks-processed");

    this.pollInterval = setInterval(
      this._pollForNewBlocks.bind(this),
      POLL_INTERVAL,
    );
  }

  public stop() {
    clearInterval(this.pollInterval);
  }

  public waitForProcessorSync(): Promise<void> {
    console.log("Processor is currently syncing. Waiting for it to finish");
    return new Promise((resolve) => {
      console.log("Finished block syncing processor");
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
      : 99;
    for (let i = cachedHeadSequence + 1; i < headSequence; i += batchSize + 1) {
      await this._processBlockRange(i, Math.min(i + batchSize, headSequence));
    }
    return;
  }

  private _getLatestBlock() {
    return new Promise<[ServiceError | null, BlockID]>((res) => {
      this.client.getLatestBlock(Empty, (error, result) => {
        res([error, result]);
      });
    });
  }

  private _getBlockBySequence(sequence: number) {
    return new Promise<[ServiceError | null, BlockID]>((res) => {
      this.client.getBlock({ sequence }, (error, result) => {
        res([error, result]);
      });
    });
  }
  private async _processBlockRange(startSequence: number, endSequence: number) {
    console.log(`Processing blocks from ${startSequence} to ${endSequence}`);

    let blocksProcessed = startSequence;
    let processingChain = Promise.resolve(); // Initialize a Promise chain

    const stream = this.client.getBlockRange({
      start: {
        sequence: startSequence,
      },
      end: {
        sequence: endSequence,
      },
    });

    const resolveWhenDone = (resolve: (value: unknown) => void) => {
      if (blocksProcessed === endSequence + 1) {
        resolve(true);
        console.log("Finished processing blocks");
      }
    };

    try {
      await new Promise((res, rej) => {
        stream.on("data", (block: LightBlock) => {
          // Append the next block's processing to the promise chain
          processingChain = processingChain
            .then(() => this._processBlock(block))
            .then(() => {
              blocksProcessed++;
              logThrottled(
                `Processed ${blocksProcessed}/${endSequence} blocks`,
                100,
                blocksProcessed,
              );
              resolveWhenDone(res); // Check if all blocks have been processed
            })
            .catch((err) => {
              console.error("Error processing block:", err);
              rej(err);
            });
        });

        stream.on("end", () => {
          resolveWhenDone(res); // Check if all blocks have been processed
        });

        stream.on("error", (err) => {
          rej(err);
        });
      });
    } catch (err) {
      console.error(err);
    }
  }

  private async _processBlock(block: LightBlock) {
    const hasReorg = await this._checkForReorg(block);

    if (hasReorg) {
      return;
    }

    const notes: Buffer[] = [];

    for (const transaction of block.transactions) {
      for (const output of transaction.outputs) {
        notes.push(output.note);
      }
    }

    const prevBlockNoteSize = block.noteSize - notes.length;
    const notesTreeSize = await getNotesTreeSize();

    if (notesTreeSize > prevBlockNoteSize) {
      await revertToNoteSize(prevBlockNoteSize);
    }

    await addNotesToMerkleTree(notes);

    await this.blockCache.cacheBlock(block);
  }

  private async _checkForReorg(block: LightBlock) {
    // If we're not on block 2 or greater, reorgs are impossible.
    if (!(block.sequence > 1)) {
      return false;
    }

    const prevCachedBlock = await this.blockCache.getBlockBySequence(
      block.sequence - 1,
    );

    // If the incoming block's previous block hash matches the previous block's hash,
    // there is no reorg. Note that Buffer.compare returns 0 if the two buffers are equal.
    if (block.previousBlockHash.compare(prevCachedBlock.hash) === 0) {
      return false;
    }

    // Otherwise, we have to walk back the chain until we find the last main chain block.
    let lastMainChainBlock: LightBlock | null = null;
    let currentSequence = block.sequence - 1;

    while (!lastMainChainBlock) {
      // Get block from server
      const [err, block] = await this._getBlockBySequence(currentSequence);

      if (err) {
        throw err;
      }

      // Get block from cache
      const cachedBlock = await this.blockCache.getBlockBySequence(
        currentSequence,
      );

      // If the two blocks' hash matches, we've found the last valid block.
      if (block.hash === cachedBlock.hash) {
        lastMainChainBlock = cachedBlock;
        break;
      }

      currentSequence -= 1;

      // If we've reached the genesis block without finding the last valid block,
      // something is seriously wrong.
      if (currentSequence === 1) {
        throw new Error("Reached genesis block without finding a valid chain");
      }
    }

    const invalidBlocks = await this.blockCache.getBlockRange(
      lastMainChainBlock.sequence + 1,
    );

    await this.accountsManager.handleReorg(invalidBlocks);
    await this.blockCache.handleReorg(lastMainChainBlock);
    await revertToNoteSize(lastMainChainBlock.noteSize);

    return true;
  }
}
