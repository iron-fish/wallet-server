import fs from "fs";
import leveldown from "leveldown";
import levelup, { LevelUp } from "levelup";
import path from "path";

import { ifClient } from "@/utils/ironfish";
import { lightBlock } from "@/utils/lightBlock";
import { LightBlock } from "@/models/lightstreamer";
import { logger } from "@/utils/logger";

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

class LightBlockCache {
  private db: LevelUp;
  private cacheDir: string;

  constructor() {
    this.cacheDir = getCachePath();

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir);
    }

    const dbPath = path.join(this.cacheDir, "leveldb");
    this.db = levelup(leveldown(dbPath));
  }

  async cacheBlocks(): Promise<void> {
    const rpc = await ifClient.getClient();

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
          await this.db.put("head", hash);
          await this.db.put(
            hash,
            LightBlock.encode(lightBlock(content)).finish(),
          );
          await this.db.put(content.block.sequence.toString(), hash);
        } else if (content.type === "disconnected") {
          logger.warn(`Removing block ${content.block.sequence}...`);
          await this.db.put("head", content.block.previous.toString());
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

  async getBlockByHash(hash: string): Promise<LightBlock | null> {
    const block = await this.get(hash);
    if (!block) return null;
    return LightBlock.decode(block);
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
