import { gzipSync } from "zlib";
import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { LightBlockCache, lightBlockCache } from "@/cache";
import { LightBlock } from "@/models/lightstreamer";
import { logger } from "@/utils/logger";

class UploadError extends Error {}

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
      throw new UploadError("BUCKET_ENDPOINT not set");
    }
    if (!process.env["BUCKET_ACCESS_KEY_ID"]) {
      throw new UploadError("BUCKET_ACCESS_KEY_ID not set");
    }
    if (!process.env["BUCKET_SECRET_ACCESS_KEY"]) {
      throw new UploadError("BUCKET_SECRET_ACCESS_KEY not set");
    }
    if (!process.env["BUCKET_NAME"]) {
      throw new UploadError("BUCKET_NAME not set");
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

  async upload(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existingUploads = await this.existingUploads();
      const blocks = await this.uploadManifest(existingUploads);
      for (const block of blocks) {
        logger.info(`Gzipping blocks ${block.start} to ${block.end}`);
        const gzip = await this.gzipBlocks(block.start, block.end);

        logger.info(`Uploading blocks ${block.start} to ${block.end}`);
        const key = this.uploadName(block);
        await this.uploadBlocks(gzip, key);
        const uploadHead = await this.cache.getBlockBySequence(block.end);
        if (uploadHead) {
          await this.cache.putUploadHead(uploadHead.hash);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  async gzipBlocks(start: number, end: number): Promise<Buffer> {
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

  async uploadBlocks(buffer: Buffer, key: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentType: "application/gzip",
      ContentLength: buffer.byteLength,
      Key: key,
      Body: buffer,
    });

    await this.s3Client.send(command);
  }

  async existingUploads(): Promise<BlockRange[]> {
    const { Contents } = await this.s3Client.send(
      new ListObjectsV2Command({ Bucket: this.bucket }),
    );

    if (!Contents) return [];
    const keys = Contents.map((item) => item.Key).filter(Boolean) as string[];
    return keys.map((key) => {
      return this.parseUploadName(key);
    });
  }

  uploadName(range: BlockRange): string {
    return `blocks_${range.start.toString().padStart(10, "0")}_${range.end
      .toString()
      .padStart(10, "0")}.gz`;
  }

  parseUploadName(uploadName: string): BlockRange {
    const match = uploadName.match(/blocks_(\d+)_(\d+)\.gz/);
    if (match) {
      return { start: parseInt(match[1], 10), end: parseInt(match[2], 10) };
    }
    throw new UploadError("Invalid upload name: " + uploadName);
  }

  async uploadManifest(existingUploads: BlockRange[]): Promise<BlockRange[]> {
    const head = await this.cache.getHeadSequence();
    if (!head) return [];

    const headBlockSequence = parseInt(head.toString());
    const backfillBlocks = [];
    for (let start = 1; start <= headBlockSequence; start += 1000) {
      if (headBlockSequence - start < 1000) {
        continue;
      }
      const end = Math.min(start + 999, headBlockSequence);
      if (!existingUploads.includes({ start, end })) {
        backfillBlocks.push({ start, end });
      }
    }
    return backfillBlocks;
  }
}

export const lightBlockUpload = new LightBlockUpload(lightBlockCache);
