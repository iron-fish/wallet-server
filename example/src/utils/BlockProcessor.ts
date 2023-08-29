import { ServiceError } from "@grpc/grpc-js";
import { NoteEncrypted } from "@ironfish/sdk/build/src/primitives/noteEncrypted";
import {
  BlockID,
  Empty,
  LightBlock,
  LightStreamerClient,
} from "../../../src/models/lightstreamer";
import { BlockCache } from "./BlockCache";

function addToMerkleTree(note: NoteEncrypted) {
  return note;
}

const POLL_INTERVAL = 30 * 1000;

export class BlockProcessor {
  private client: LightStreamerClient;
  private pollInterval?: NodeJS.Timer;
  private handleStop?: () => void;
  private isProcessingBlocks: boolean = false;
  private blockCache = new BlockCache();

  constructor(client: LightStreamerClient) {
    this.client = client;
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
    console.log(`Processing blocks from ${startSequence} to ${endSequence}`);

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
        });

        stream.on("end", () => {
          res(true);
        });
      });
    } catch (err) {
      console.error(err);
    }
  }

  private _processBlock(block: LightBlock) {
    this.blockCache.cacheBlock(block);

    for (const transaction of block.transactions) {
      for (const output of transaction.outputs) {
        const note = new NoteEncrypted(output.note);
        addToMerkleTree(note);
      }
    }
  }
}
