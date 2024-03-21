import { gzipSync } from "zlib";
import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { LightBlockCache, lightBlockCache } from "@/cache";
import { LightBlock } from "@/models/lightstreamer";
import { logger } from "@/utils/logger";

class UploaderError extends Error {}

type BlockRange = {
  start: number;
  end: number;
};

export class LightBlockUpload {
  private cache: LightBlockCache;
  private s3Client: S3Client;
  private bucket: string;

  constructor(cache: LightBlockCache) {
    this.cache = cache;
    if (!process.env["BUCKET_ENDPOINT"]) {
      throw new UploaderError("BUCKET_ENDPOINT not set");
    }
    if (!process.env["BUCKET_ACCESS_KEY_ID"]) {
      throw new UploaderError("BUCKET_ACCESS_KEY_ID not set");
    }
    if (!process.env["BUCKET_SECRET_ACCESS_KEY"]) {
      throw new UploaderError("BUCKET_SECRET_ACCESS_KEY not set");
    }
    if (!process.env["BUCKET_NAME"]) {
      throw new UploaderError("BUCKET_NAME not set");
    }
    this.bucket = process.env["BUCKET_NAME"];
    this.s3Client = new S3Client({
      region: "auto",
      endpoint: process.env["BUCKET_ENDPOINT"],
      credentials: {
        accessKeyId: process.env["BUCKET_ACCESS_KEY_ID"],
        secretAccessKey: process.env["BUCKET_SECRET_ACCESS_KEY"],
      },
    });
  }

  async watchAndUpload(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const blocks = await this.blocksToUpload();
      for (const block of blocks) {
        logger.info(`Gzipping blocks ${block.start} to ${block.end}`);
        const gzip = await this.gzipBlocks(block.start, block.end);

        logger.info(`Uploading blocks ${block.start} to ${block.end}`);
        const key = this.uploadName(block.start, block.end);
        await this.uploadBlocks(gzip, key);
        const uploadHead = await this.cache.getBlockBySequence(block.end);
        if (uploadHead) {
          await this.cache.putUploadHead(uploadHead.hash);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  private async gzipBlocks(start: number, end: number): Promise<Buffer> {
    let data = "";
    for (let i = start; i <= end; i++) {
      const block = await this.cache.getBlockBySequence(i);
      if (block) {
        data +=
          Buffer.from(LightBlock.encode(block).finish()).toString("hex") + "\n";
      }
    }

    return gzipSync(data);
  }

  private async uploadBlocks(buffer: Buffer, key: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentType: "application/gzip",
      ContentLength: buffer.byteLength,
      Key: key,
      Body: buffer,
    });

    await this.s3Client.send(command);
  }

  private uploadName(start: number, end: number): string {
    return `blocks_${start.toString().padStart(10, "0")}_${end
      .toString()
      .padStart(10, "0")}.gz`;
  }

  private async blocksToUpload(): Promise<BlockRange[]> {
    const head = await this.cache.getHeadSequence();
    if (!head) return [];

    const headBlockSequence = parseInt(head.toString());

    const { Contents } = await this.s3Client.send(
      new ListObjectsV2Command({ Bucket: this.bucket }),
    );

    if (!Contents) return [];
    const keys = Contents.map((item) => item.Key).filter(Boolean) as string[];
    const backfillBlocks = [];
    for (let i = 0; i <= headBlockSequence; i += 1000) {
      if (headBlockSequence - i < 1000) {
        continue;
      }
      const end = Math.min(i + 999, headBlockSequence);
      const key = this.uploadName(i, end);
      if (!keys.includes(key)) {
        backfillBlocks.push({ start: i, end });
      }
    }
    return backfillBlocks;
  }
}

export const lightBlockUpload = new LightBlockUpload(lightBlockCache);
