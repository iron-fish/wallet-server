import fs from "fs";
import leveldown from "leveldown";
import levelup, { LevelUp } from "levelup";
import path from "path";

import { ifClient } from "@/utils/ironfish";
import { lightBlock } from "@/utils/lightBlock";
import { LightBlock } from "@/models/lightstreamer";
import { logger } from "@/utils/logger";
import { RpcRequestError } from "@ironfish/sdk";

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
          await this.db.put("head", block.previousBlockHash);
          await this.db.put("headSequence", (block.sequence - 1).toString());
          await this.db.del(block.sequence);
          await this.db.del(block.hash);
        }
      }
    }
  }

  private async rollbackHead(): Promise<void> {
    let head = (await this.getHeadSequence()) - 1;
    if (!head) {
      logger.error("Head sequence is not set. Cannot rollback.");
      return;
    }
    let block = null;
    while (!block) {
      block = await this.getBlockBySequence(head);
      if (!block) {
        head -= 1;
      }
    }
    await this.db.put("headSequence", head.toString());
    await this.db.put("head", block.hash);
    logger.info(`Rolled back head to block sequence ${head}`);
  }

  async cacheBlock(block: LightBlock): Promise<void> {
    if (block.sequence % 1000 === 0) {
      logger.info(
        `Caching block ${block.sequence}`,
        new Date().toLocaleString(),
      );
    }
    const hash = block.hash;
    await this.db.put(hash, LightBlock.encode(block).finish());
    await this.db.put(block.sequence.toString(), hash);
    const finalizedSequence = await this.getFinalizedBlockSequence();
    if (block.sequence - this.finalityBlockCount > finalizedSequence) {
      this.putFinalizedBlockSequence(block.sequence - this.finalityBlockCount);
    }
    await this.db.put("head", hash);
    await this.db.put("headSequence", block.sequence.toString());
  }

  async getFinalizedBlockSequence(): Promise<number> {
    const finalizedSequence = await this.get("finalizedBlockSequence");
    return finalizedSequence
      ? Number(finalizedSequence)
      : this.finalityBlockCount + 1;
  }

  async getHead(): Promise<Buffer | null> {
    const head = await this.get("head");
    return head ? Buffer.from(head) : null;
  }

  async putFinalizedBlockSequence(sequence: number): Promise<void> {
    await this.db.put("finalizedBlockSequence", sequence.toString());
  }

  async getBlockByHash(hash: string): Promise<LightBlock | null> {
    const block = await this.get(hash);
    return block ? LightBlock.decode(block) : null;
  }

  async getBlockBySequence(sequence: number): Promise<LightBlock | null> {
    const hash = await this.get(sequence.toString());
    return hash ? await this.getBlockByHash(hash.toString()) : null;
  }

  async getHeadSequence(): Promise<number> {
    const head = await this.get("headSequence");
    if (!head) return 0;
    return Number(head.toString());
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const data = await this.db.get(key);
      return data;
    } catch (e) {
      return null;
    }
  }

  async put(key: string, value: Uint8Array | string): Promise<void> {
    await this.db.put(key, value);
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
