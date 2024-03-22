import fs from "fs";
import { createGzip } from "zlib";
import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { LightBlockCache, lightBlockCache } from "@/cache";
import { LightBlock } from "@/models/lightstreamer";
import { logger } from "@/utils/logger";

class UploadError extends Error {}

export type BlockRange = {
  start: number;
  end: number;
};

export class LightBlockUpload {
  private cache: LightBlockCache;
  private s3Client: S3Client;
  private chunkSizeMb: number;
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
    if (!process.env["UPLOAD_CHUNK_SIZE_MB"]) {
      throw new UploadError("UPLOAD_CHUNK_SIZE_MB not set");
    }
    this.chunkSizeMb = parseInt(
      process.env["UPLOAD_CHUNK_SIZE_MB"] as string,
      10,
    );
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
    const existingUploads = await this.existingUploads();
    let maxUploaded = existingUploads.reduce((max, range) => {
      return range.end > max ? range.end : max;
    }, 0);
    let head = await this.cache.getHeadSequence();
    if (!head) head = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      logger.info(
        `Gzipping blocks for ${maxUploaded + 1} for ${
          this.chunkSizeMb
        } MB upload`,
      );
      const fileName = "blocks.gz";
      const range = await this.gzipBlocks(
        maxUploaded + 1,
        this.chunkSizeMb * 1024 * 1024,
        fileName,
      );

      logger.info(`Uploading blocks ${range.start} to ${range.end}`);
      const key = this.uploadName(range);
      await this.uploadBlocks(fileName, key);
      maxUploaded = range.end;
    }
  }

  async gzipBlocks(
    start: number,
    chunkSizeBytes: number,
    outputFileName: string,
  ): Promise<BlockRange> {
    const gzip = createGzip();
    const outputFile = fs.createWriteStream(outputFileName);
    gzip.pipe(outputFile);
    let i = start;
    let block;
    let warned = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      block = await this.cache.getBlockBySequence(i);
      if (block == null) {
        if (!warned) {
          logger.warn(
            `At end of chain at block ${i}, filling gzip for upload as blocks are added.`,
          );
          warned = true;
        }
        await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait for 1 minute
        continue;
      }
      const blockBuffer = LightBlock.encode(block).finish();
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeUInt32BE(blockBuffer.byteLength, 0);
      gzip.write(lengthBuffer);
      gzip.write(blockBuffer);
      if (outputFile.bytesWritten >= chunkSizeBytes) {
        break;
      }
      i++;
    }
    gzip.end();
    await new Promise((resolve) => outputFile.on("finish", resolve));
    return { start, end: i };
  }

  async uploadBlocks(fileName: string, key: string): Promise<void> {
    const fileStream = fs.createReadStream(fileName);
    const fileSize = fs.statSync(fileName).size;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentType: "application/gzip",
      ContentLength: fileSize,
      Key: key,
      Body: fileStream,
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
}

export const lightBlockUpload = new LightBlockUpload(lightBlockCache);
