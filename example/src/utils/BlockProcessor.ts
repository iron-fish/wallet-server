import path from "path";
import levelup, { LevelUp } from "levelup";
import leveldown from "leveldown";
import { ServiceError } from "@grpc/grpc-js";
import { NoteEncrypted } from "@ironfish/sdk/build/src/primitives/noteEncrypted";
import {
  BlockID,
  Empty,
  LightBlock,
  LightStreamerClient,
} from "../../../src/models/lightstreamer";

function addToMerkleTree(note: NoteEncrypted) {
  return note;
}

const POLL_INTERVAL = 30 * 1000;

const CACHE_KEYS = {
  HEAD_SEQUENCE: "HEAD_SEQUENCE",
};

export class BlockProcessor {
  private client: LightStreamerClient;
  private pollInterval?: NodeJS.Timer;
  private handleStop?: () => void;
  private isProcessingBlocks: boolean = false;
  private blockCache: LevelUp;

  constructor(client: LightStreamerClient) {
    this.client = client;
    this.blockCache = levelup(
      leveldown(path.join(__dirname, "..", "client-block-cache")),
    );
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

    const cachedHeadSequence = await this._getHeadSequence();

    if (headSequence === cachedHeadSequence) {
      return;
    }

    await this._processBlockRange(cachedHeadSequence + 1, headSequence);

    this.isProcessingBlocks = false;
  }

  private async _getHeadSequence() {
    try {
      const headSequence = await this.blockCache.get(CACHE_KEYS.HEAD_SEQUENCE);
      const asNumber = Number(headSequence);
      if (isNaN(asNumber)) {
        throw new Error("Head sequence is not a number");
      }
      return asNumber;
    } catch (_err) {
      return 0;
    }
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
    this._cacheBlock(block);

    for (const transaction of block.transactions) {
      for (const output of transaction.outputs) {
        const note = new NoteEncrypted(output.note);
        addToMerkleTree(note);
      }
    }
  }

  private _cacheBlock(block: LightBlock) {
    const sequence = block.sequence;
    console.log(`Caching block ${sequence}`);

    this.blockCache
      .batch()
      .put(sequence, block)
      .put(CACHE_KEYS.HEAD_SEQUENCE, sequence)
      .write();
  }
}
