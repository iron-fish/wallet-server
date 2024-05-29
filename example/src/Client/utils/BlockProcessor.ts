import { EventEmitter } from "events";

import { BlockCache } from "./BlockCache";
import { LightBlock } from "../../../../src/models/lightstreamer";
import {
  addNotesToMerkleTree,
  getNotesTreeSize,
  revertToNoteSize,
} from "./MerkleTree";
import { AccountsManager } from "./AccountsManager";
import { Api } from "example/src/api/Api";

const POLL_INTERVAL = 30 * 1000;

export class BlockProcessor {
  private api: Api<unknown>;
  private pollInterval?: NodeJS.Timer;
  private isProcessingBlocks: boolean = false;
  private blockCache: BlockCache;
  private accountsManager: AccountsManager;
  private events: EventEmitter = new EventEmitter(); // Event emitter for block events

  constructor(
    api: Api<unknown>,
    blockCache: BlockCache,
    accountsManager: AccountsManager,
  ) {
    this.api = api;
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
    const latestBlock = await this._getLatestBlock();

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

  private async _getLatestBlock(): Promise<{
    hash: string;
    sequence: number;
  }> {
    const response = await this.api.latestBlock.getLatestBlock();
    return response.data;
  }

  private async _getBlockBySequence(sequence: number): Promise<LightBlock> {
    const response = await this.api.block.getBlock({ sequence });
    return LightBlock.decode(Buffer.from(response.data, "hex"));
  }
  private async _processBlockRange(startSequence: number, endSequence: number) {
    console.log(`Processing blocks from ${startSequence} to ${endSequence}`);
    const response = await this.api.blockRange.getBlockRange({
      start: startSequence,
      end: endSequence,
    });

    try {
      const blocks = response.data;
      for (const block of blocks) {
        try {
          await this._processBlock(
            LightBlock.decode(Buffer.from(block, "hex")),
          );
        } catch (err) {
          console.error("Error processing block:", err);
          throw err;
        }
      }
    } catch (err) {
      console.error(err);
    }
    console.log(
      `Finished processing blocks from ${startSequence} to ${endSequence}`,
    );
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
    if (block.previousBlockHash == prevCachedBlock.hash) {
      return false;
    }

    // Otherwise, we have to walk back the chain until we find the last main chain block.
    let lastMainChainBlock: LightBlock | null = null;
    let currentSequence = block.sequence - 1;

    while (!lastMainChainBlock) {
      // Get block from server
      const block = await this._getBlockBySequence(currentSequence);

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
