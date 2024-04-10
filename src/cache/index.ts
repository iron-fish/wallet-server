import fs from "fs";
import leveldown from "leveldown";
import levelup, { LevelUp } from "levelup";
import path from "path";

import { ifClient } from "@/utils/ironfish";
import { lightBlock } from "@/utils/lightBlock";
import { LightBlock } from "@/models/lightstreamer";
import { logger } from "@/utils/logger";
import { RpcRequestError } from "@ironfish/sdk";
import { wait } from "@/utils/wait";

function getCachePath(): string {
  if (process.env["CACHE_PATH"] && process.env["CACHE_FOLDER"]) {
    console.warn(
      "Both CACHE_PATH and CACHE_FOLDER are set. CACHE_FOLDER will be ignored.",
    );
  }

  if (process.env["CACHE_PATH"]) {
    return process.env["CACHE_PATH"];
  }

  const folderName = process.env["CACHE_FOLDER"] ?? "block-cache";
  return path.join(".", folderName);
}

export class LightBlockCache {
  private db: LevelUp;
  private cacheDir: string;
  finalityBlockCount: number;

  constructor() {
    this.cacheDir = getCachePath();
    if (!process.env["FINALITY_BLOCK_COUNT"]) {
      throw new Error("FINALITY_BLOCK_COUNT is not set");
    }
    this.finalityBlockCount = Number(process.env["FINALITY_BLOCK_COUNT"]);

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir);
    }

    const dbPath = path.join(this.cacheDir, "leveldb");
    this.db = levelup(leveldown(dbPath));
  }

  async cacheBlocks(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.cacheBlocksInner();
      } catch (error) {
        logger.error(`Caching failed, will retry. Error: ${error}`);
        if (
          error instanceof RpcRequestError &&
          error.message.includes("head not found")
        ) {
          logger.warn("Rolling head back to rebuild cache.");
          await this.rollbackHead();
        }
        wait(10000);
      }
    }
  }

  private async cacheBlocksInner(): Promise<void> {
    const rpc = await ifClient.getClient();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const head = await this.getHead();
      const followChainStreamParams = head
        ? { head: head.toString("hex") }
        : {};
      const stream = await rpc.chain.followChainStream({
        ...followChainStreamParams,
        serialized: true,
        limit: 100,
      });

      for await (const content of stream.contentStream()) {
        if (content.type === "connected") {
          const block = lightBlock(content);
          this.cacheBlock(block);
        } else if (content.type === "disconnected") {
          logger.warn(`Removing block ${content.block.sequence}...`);
          const block = lightBlock(content);
          await this.putHead(block.previousBlockHash, block.sequence - 1);
          await this.del(block.sequence.toString());
          await this.del(block.hash.toString("hex"));
        }
      }
    }
  }

  private async rollbackHead(): Promise<void> {
    let headSequence = (await this.getHeadSequence()) - 1;
    if (!headSequence) {
      logger.error("Head sequence is not set. Cannot rollback.");
      return;
    }
    let block = null;
    while (!block) {
      block = await this.getLightBlockBySequence(headSequence);
      if (!block) {
        headSequence -= 1;
      }
    }
    await this.putHead(block.hash, headSequence);
    logger.info(`Rolled back head to block sequence ${headSequence}`);
  }

  async cacheBlock(block: LightBlock): Promise<void> {
    if (block.sequence % 1000 === 0) {
      logger.info(
        `Caching block ${block.sequence}`,
        new Date().toLocaleString(),
      );
    }
    const hash = block.hash;
    await this.putLightBlock(block);
    const finalizedSequence = await this.getFinalizedBlockSequence();
    if (block.sequence - this.finalityBlockCount > finalizedSequence) {
      this.putFinalizedBlockSequence(block.sequence - this.finalityBlockCount);
    }
    await this.putHead(hash, block.sequence);
  }

  async getFinalizedBlockSequence(): Promise<number> {
    const finalizedSequence = await this.get("finalizedBlockSequence");
    return finalizedSequence
      ? Number(finalizedSequence)
      : this.finalityBlockCount + 1;
  }

  async putFinalizedBlockSequence(sequence: number): Promise<void> {
    await this.put("finalizedBlockSequence", Buffer.from(sequence.toString()));
  }

  async putHead(hash: Buffer, sequence: number): Promise<void> {
    await this.put("head", hash);
    await this.put("headSequence", Buffer.from(sequence.toString()));
  }

  async getLightBlock(hash: Buffer): Promise<LightBlock | null> {
    try {
      const data = await this.get(hash.toString("hex"));
      if (!data) return null;
      return LightBlock.decode(data);
    } catch (e) {
      return null;
    }
  }

  async getLightBlockBySequence(sequence: number): Promise<LightBlock | null> {
    const hash = await this.get(sequence.toString());
    return hash ? await this.getLightBlock(hash) : null;
  }

  async getHead(): Promise<Buffer | null> {
    return this.get("head");
  }

  async getHeadSequence(): Promise<number> {
    const head = await this.get("headSequence");
    if (!head) return 0;
    return Number(head.toString());
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const data = await this.db.get(key);
      return data;
    } catch (e) {
      return null;
    }
  }

  private async put(key: string, value: Buffer): Promise<void> {
    await this.db.put(key, value);
  }

  async putLightBlock(block: LightBlock): Promise<void> {
    const key = block.hash.toString("hex");
    const value = LightBlock.encode(block).finish();
    await this.put(block.sequence.toString(), block.hash);
    await this.put(key, Buffer.from(value));
  }

  async del(key: string): Promise<void> {
    await this.db.del(key);
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async open(): Promise<void> {
    this.db.open();
  }

  async clear(): Promise<void> {
    await this.db.clear();
  }
}

export const lightBlockCache = new LightBlockCache();
