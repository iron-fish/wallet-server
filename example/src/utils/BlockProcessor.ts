import { NoteEncrypted } from "@ironfish/sdk/build/src/primitives/noteEncrypted";
import {
  BlockID,
  Empty,
  LightBlock,
  LightStreamerClient,
} from "../../../src/models/lightstreamer";
import { ServiceError } from "@grpc/grpc-js";
import { addNotesToMerkleTree } from "../merkle/merkle";

const POLL_INTERVAL = 30 * 1000;

/**
 * @todo:
 * Reorgs =>
 *   To determine if re-org happened, when querying new blocks, check that each block's prev block hash
 *   matches the previous block's block hash. If it does not, walk back until you find a block that matches.
 * Store transactions =>
 *   Add simple DB to store transactions so we don't have to start querying from block 1 when restarting or
 *   importing a new account.
 * Account balances =>
 *   Add example of processing notes to deterine account balances.
 * Add error handling to server if unable to connect to node.
 */

export class BlockProcessor {
  private client: LightStreamerClient;
  private pollInterval?: NodeJS.Timer;
  private handleStop?: () => void;
  private isProcessingBlocks: boolean = false;
  private lastProcessedBlock: number = 0;

  constructor(client: LightStreamerClient) {
    this.client = client;
  }

  public start() {
    if (this.pollInterval !== undefined) {
      console.warn("Process already running");
      return;
    }

    this._pollForNewBlocks();
    this.pollInterval = setInterval(
      this._pollForNewBlocks.bind(this),
      POLL_INTERVAL,
    );

    return new Promise<void>((res) => {
      this.handleStop = res;
    });
  }

  public async stop() {
    clearInterval(this.pollInterval);
    this.handleStop?.();
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

    if (headSequence === this.lastProcessedBlock) {
      return;
    }

    await this._processBlockRange(this.lastProcessedBlock + 1, headSequence);

    this.isProcessingBlocks = false;
  }

  private _getLatestBlock() {
    return new Promise<[ServiceError | null, BlockID]>((res) => {
      this.client.getLatestBlock(Empty, (error, result) =>
        res([error, result]),
      );
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
    const notes: NoteEncrypted[] = [];
    for (const transaction of block.transactions) {
      for (const output of transaction.outputs) {
        const note = new NoteEncrypted(output.note);
        notes.push(note);
      }
    }
    await addNotesToMerkleTree(notes);

    this.lastProcessedBlock = block.sequence;
  }
}
