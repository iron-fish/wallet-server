import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import zlib from "zlib";
import fs from "fs";

import { LightBlockCache, lightBlockCache } from "@/cache";
import { LightBlock } from "@/models/lightstreamer";
import { logger } from "@/utils/logger";

class UploadError extends Error {}

export type BlockRange = {
  start: number;
  end: number;
};

export type BlockFile = {
  blocks: string;
  manifest: string;
  timestamp: number;
};

export class LightBlockUpload {
  private cache: LightBlockCache;
  private s3Client: S3Client;
  private chunkSizeMb: number;
  private maxUploadLagMs: number;
  private bucket: string;
  private latestPath = "latest.json";
  private blockFileName = "blocks";

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
    if (!process.env["MAX_UPLOAD_LAG_MS"]) {
      throw new UploadError("MAX_UPLOAD_LAG_MS not set");
    }

    this.chunkSizeMb = parseInt(
      process.env["UPLOAD_CHUNK_SIZE_MB"] as string,
      10,
    );
    this.maxUploadLagMs = parseInt(
      process.env["MAX_UPLOAD_LAG_MS"] as string,
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
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.uploadInner();
      } catch (error) {
        logger.error(`Upload failed, will retry. Error: ${error}`);
      }
    }
  }

  private async uploadInner(): Promise<void> {
    const latestJson = await this.getObject(this.latestPath);

    let currentUploadSize = 0;
    let lastUploadTimestamp = 0;
    if (!latestJson) {
      console.warn("No latest json, starting upload from beginning...");
    } else {
      const latest: BlockFile = JSON.parse(latestJson);
      currentUploadSize = (await this.getFileSize(latest.blocks)) || 0;
      lastUploadTimestamp = latest.timestamp;
    }

    logger.info(
      `Current file uploaded size: ${this.bytesToMbRounded(
        currentUploadSize,
      )} MB, creating new upload...`,
    );
    const files = await this.createBlockFiles(
      this.blockFileName,
      currentUploadSize,
      lastUploadTimestamp,
    );
    const prefix = String(files.timestamp) + "/";

    logger.info(`Upload: begin...`);

    const uploadedBinary = await this.uploadFile(
      prefix,
      files.blocks,
      "application/octet-stream",
    );
    logger.info(`Upload: binary file complete: ${uploadedBinary}`);

    const gzipManifest = await this.gzipFile(
      files.manifest,
      `${files.manifest}.gz`,
    );
    const uploadedManifest = await this.uploadFile(
      prefix,
      gzipManifest,
      "application/gzip",
    );
    logger.info(`Upload: manifest file complete: ${uploadedManifest}`);

    const uploadedLatest = await this.writeLatestJson(
      uploadedManifest,
      uploadedBinary,
      files.timestamp,
    );
    await this.uploadFile("", uploadedLatest, "application/json");
    logger.info(
      `Upload: updating latest json file complete: ${uploadedLatest}`,
    );

    void this.upload();
  }

  async createBlockFiles(
    outputFileName: string,
    previousSize: number,
    lastUploadTimestamp: number,
  ): Promise<BlockFile> {
    this.deleteFileIfExists(outputFileName);
    const manifestFileName = `${outputFileName}.manifest`;
    this.deleteFileIfExists(manifestFileName);

    let currentSequence = 1;
    let currentByte = 0;
    const nextUploadSize = this.chunkSizeMb * 1024 * 1024 + previousSize;
    const outputFile = fs.createWriteStream(outputFileName);
    const manifestFile = fs.createWriteStream(manifestFileName);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const block = await this.cache.getBlockBySequence(currentSequence);
      // end of chain, initial upload
      if (block == null && previousSize === 0) break;
      if (block == null) {
        const currentTimestamp = Date.now();
        const hoursSinceLastUpload =
          (currentTimestamp - lastUploadTimestamp) / (1000 * 60 * 60);
        logger.info(
          `${this.bytesToMbRounded(
            outputFile.bytesWritten,
          )}/${this.bytesToMbRounded(
            nextUploadSize,
          )} MB written, sequence: ${currentSequence}, hours since last upload: ${hoursSinceLastUpload.toFixed(
            2,
          )}/${
            this.maxUploadLagMs / (1000 * 60 * 60)
          }, waiting for next block...`,
        );
        await this.waitForNextBlock();
        continue;
      }

      const blockBuffer = LightBlock.encode(block).finish();
      outputFile.write(blockBuffer);
      manifestFile.write(
        `${currentSequence},${currentByte},${
          currentByte + blockBuffer.byteLength - 1
        }\n`,
      );
      currentByte += blockBuffer.byteLength;

      if (!!previousSize && outputFile.bytesWritten >= nextUploadSize) {
        logger.info("Chunk size reached, finishing file creation...");
        break;
      }
      if (
        !!lastUploadTimestamp &&
        block.timestamp >= lastUploadTimestamp + this.maxUploadLagMs
      ) {
        logger.info(
          "More than 1 day since last upload, finishing file creation...",
        );
        break;
      }
      currentSequence++;
    }

    outputFile.end();
    manifestFile.end();

    logger.info(
      `New file upload created, size ${this.bytesToMbRounded(
        outputFile.bytesWritten,
      )} MB, blocks: ${currentSequence - 1}`,
    );
    return {
      blocks: outputFileName,
      manifest: manifestFileName,
      timestamp: Date.now(),
    };
  }

  async writeLatestJson(
    manifest: string,
    blocks: string,
    timestamp: number,
  ): Promise<string> {
    const data: BlockFile = {
      manifest,
      blocks,
      timestamp,
    };
    await fs.promises
      .writeFile(this.latestPath, JSON.stringify(data))
      .catch((err) => {
        throw new UploadError(
          `Failed to write to ${this.latestPath}: ${err.message}`,
        );
      });
    return this.latestPath;
  }

  private deleteFileIfExists(fileName: string): void {
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
    }
  }

  private bytesToMbRounded(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(4);
  }

  private async waitForNextBlock(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait for 1 minute
  }

  async gzipFile(inputFile: string, outputFile: string): Promise<string> {
    const writeStream = fs.createWriteStream(outputFile);
    const readStream = fs.createReadStream(inputFile);
    const gzip = zlib.createGzip();
    readStream.pipe(gzip).pipe(writeStream);

    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    readStream.close();
    gzip.end();
    writeStream.end();
    logger.info(`Gzipping file complete: ${outputFile}`);
    return outputFile;
  }

  async uploadFile(
    prefix: string,
    fileName: string,
    contentType: string,
  ): Promise<string> {
    const Key = prefix + fileName;
    const fileStream = fs.createReadStream(fileName);
    const fileSize = fs.statSync(fileName).size;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentType: contentType,
      ContentLength: fileSize,
      Key,
      Body: fileStream,
    });
    await this.s3Client.send(command);
    return Key;
  }

  async getFileSize(key: string): Promise<number | null> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      const { ContentLength } = await this.s3Client.send(command);
      return ContentLength || null;
    } catch (error) {
      if (error instanceof NotFound) {
        return null;
      }
      throw error;
    }
  }

  async getObject(Key: string): Promise<string | undefined> {
    const getObjectCommand = new GetObjectCommand({ Bucket: this.bucket, Key });
    try {
      const response = await this.s3Client.send(getObjectCommand);
      return response.Body?.transformToString();
    } catch (error) {
      if (error instanceof NoSuchKey) {
        return undefined;
      }
      throw error;
    }
  }
}

export const lightBlockUpload = new LightBlockUpload(lightBlockCache);
