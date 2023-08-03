import fs from "fs";
import leveldown from "leveldown";
import levelup, { LevelUp } from "levelup";
import path from "path";

import { ifClient } from "../utils/ironfish";
import { lightBlock } from "../utils/light_block";
import { LightBlock } from "../models/lightstreamer";

class LightBlockCache {
  private db: LevelUp;
  private cacheDir: string;

  constructor(
    cacheDir: string = process.env["CACHE_PATH"] ||
      path.join(__dirname, "block-cache"),
  ) {
    this.cacheDir = cacheDir;
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir);
    }

    const dbPath = path.join(this.cacheDir, "leveldb");
    this.db = levelup(leveldown(dbPath));
  }

  async cacheBlocks(): Promise<void> {
    const head = await this.get("head");
    const rpc = await ifClient.getClient();
    const stream = await rpc.chain.followChainStream(
      head ? { head: head.toString() } : undefined,
    );

    for await (const content of stream.contentStream()) {
      if (content.type === "connected") {
        const hash = content.block.hash;
        await this.db.put("head", hash);
        await this.db.put(
          hash,
          LightBlock.encode(lightBlock(content)).finish(),
        );
        await this.db.put(content.block.sequence.toString(), hash);
      } else if (content.type === "disconnected") {
        await this.db.put("head", content.block.previous.toString());
        await this.db.del(content.block.sequence);
        await this.db.del(content.block.hash);
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
      return Promise.resolve(data);
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  async put(key: string, value: unknown): Promise<void> {
    await this.db.put(key, value);
  }

  async del(key: string): Promise<void> {
    await this.db.del(key);
  }
}

export const lightBlockCache = new LightBlockCache();
