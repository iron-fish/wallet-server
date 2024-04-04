import fs from "fs";
import leveldown from "leveldown";
import levelup, { LevelUp } from "levelup";
import path from "path";

import { ifClient } from "@/utils/ironfish";
import { lightBlock } from "@/utils/lightBlock";
import { LightBlock } from "@/models/lightstreamer";
import { logger } from "@/utils/logger";
import { RpcClient } from "@ironfish/sdk";

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
  private finalityBlockCount: number;

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
    try {
      const rpc = await ifClient.getClient();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await this.cacheBlocksInner(rpc);
      }
    } catch (error) {
      logger.error(`Caching failed, will retry. Error: ${error}`);
    }
  }

  private async cacheBlocksInner(rpc: RpcClient): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const head = await this.get("head");
      const followChainStreamParams = head ? { head: head.toString() } : {};
      const stream = await rpc.chain.followChainStream({
        ...followChainStreamParams,
        serialized: true,
        limit: 100,
      });

      for await (const content of stream.contentStream()) {
        if (content.type === "connected") {
          if (content.block.sequence % 1000 === 0) {
            logger.info(
              `Caching block ${content.block.sequence}`,
              new Date().toLocaleString(),
            );
          }
          const hash = content.block.hash;
          await this.db.put(
            hash,
            LightBlock.encode(lightBlock(content)).finish(),
          );
          await this.db.put(content.block.sequence.toString(), hash);
          const finalizedSequence = await this.getFinalizedBlockSequence();
          if (
            content.block.sequence - this.finalityBlockCount >
            finalizedSequence
          ) {
            this.putFinalizedBlockSequence(
              content.block.sequence - this.finalityBlockCount,
            );
          }
          await this.db.put("head", hash);
        } else if (content.type === "disconnected") {
          logger.warn(`Removing block ${content.block.sequence}...`);
          await this.db.put("head", content.block.previousBlockHash);
          await this.db.del(content.block.sequence);
          await this.db.del(content.block.hash);
        }
      }
    }
  }

  async getBlockBySequence(sequence: number): Promise<LightBlock | null> {
    const hash = await this.get(sequence.toString());
    return hash ? await this.getBlockByHash(hash.toString()) : null;
  }

  async getFinalizedBlockSequence(): Promise<number> {
    const finalitySequence = await this.get("finalizedBlockSequence");
    return finalitySequence ? Number(finalitySequence) : 1;
  }

  async putFinalizedBlockSequence(sequence: number): Promise<void> {
    await this.db.put("finalizedBlockSequence", sequence.toString());
  }

  async getBlockByHash(hash: string): Promise<LightBlock | null> {
    const block = await this.get(hash);
    if (!block) return null;
    return LightBlock.decode(block);
  }

  async getHeadSequence(): Promise<number> {
    const head = await this.get("head");
    if (!head) return 0;
    const block = await this.getBlockByHash(head.toString());
    if (!block) return 0;
    return block.sequence;
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

  async clear(): Promise<void> {
    await this.db.clear();
  }
}

export const lightBlockCache = new LightBlockCache();
