import { gzipSync } from "zlib";
import {
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { LightBlockCache, lightBlockCache } from "@/cache";
import { LightBlock } from "@/models/lightstreamer";
import { logger } from "@/utils/logger";

class UploaderError extends Error {}

class LightBlockUpload {
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
    await this.backfill();

    let lastBlockNumber = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const head = await this.cache.getHeadSequence();
      const uploadHead = await this.cache.getUploadHead();
      if (head && head - uploadHead > 1000 && head > 1000) {
        lastBlockNumber = head;
        await this.uploadBlocks(lastBlockNumber - 999, lastBlockNumber);
      }
    }
  }

  private async uploadBlocks(start: number, end: number): Promise<void> {
    logger.info(`Uploading blocks ${start} to ${end}`);

    let data = "";
    for (let i = start; i <= end; i++) {
      const block = await this.cache.getBlockBySequence(i);
      if (block) {
        data +=
          Buffer.from(LightBlock.encode(block).finish()).toString("hex") + "\n";
      }
    }

    const buffer = gzipSync(data);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentType: "application/gzip",
      ContentLength: buffer.byteLength,
      Key: this.uploadName(start, end),
      Body: buffer,
    });

    await this.s3Client.send(command);
  }

  private uploadName(start: number, end: number): string {
    return `blocks_${start.toString().padStart(10, "0")}_${end
      .toString()
      .padStart(10, "0")}.gz`;
  }

  private async backfill(): Promise<void> {
    const head = await this.cache.getHeadSequence();
    if (!head) return;

    const headBlockSequence = parseInt(head.toString());
    for (let i = 0; i <= headBlockSequence; i += 1000) {
      if (headBlockSequence - i < 1000) {
        continue;
      }
      const end = Math.min(i + 999, headBlockSequence);
      const key = this.uploadName(i, end);

      try {
        await this.s3Client.send(
          new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        );
      } catch (error) {
        if (error instanceof NotFound) {
          await this.uploadBlocks(i, end);
        } else {
          throw error;
        }
      }
    }
  }
}

export const lightBlockUpload = new LightBlockUpload(lightBlockCache);
