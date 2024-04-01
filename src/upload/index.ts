import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "fs";
import zlib from "zlib";

import { LightBlockCache, lightBlockCache } from "@/cache";
import { LightBlock } from "@/models/lightstreamer";
import { logger } from "@/utils/logger";

class UploadError extends Error {}

export type BlockRange = {
  start: number;
  end: number;
};

export type ManifestChunk = {
  blocks: string;
  range: BlockRange;
  byteRangesFile: string;
  timestamp: number;
  finalized: boolean;
};

export type ManifestFile = {
  chunks: ManifestChunk[];
};

export class LightBlockUpload {
  private cache: LightBlockCache;
  private s3Client: S3Client;
  private chunkSizeBytes: number;
  private maxUploadLagMs: number;
  private bucket: string;
  private manifestPath = "manifest.json";
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
    if (!process.env["UPLOAD_CHUNK_SIZE_BYTES"]) {
      throw new UploadError("UPLOAD_CHUNK_SIZE_BYTES not set");
    }
    if (!process.env["MAX_UPLOAD_LAG_MS"]) {
      throw new UploadError("MAX_UPLOAD_LAG_MS not set");
    }

    this.chunkSizeBytes = parseInt(
      process.env["UPLOAD_CHUNK_SIZE_BYTES"] as string,
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
    const manifestJson = await this.getObject(this.manifestPath);

    let lastUploadTimestamp = 0;
    let startSequence = 1;
    let manifest: ManifestFile | null = null;
    if (!manifestJson) {
      console.warn("No manifest.json, starting upload from beginning...");
    } else {
      manifest = JSON.parse(manifestJson) as ManifestFile;
      const latestBlock = manifest.chunks[manifest.chunks.length - 1];
      startSequence = latestBlock.finalized
        ? latestBlock.range.end + 1
        : latestBlock.range.start;
      lastUploadTimestamp = latestBlock.timestamp;
    }

    logger.info(`Creating new upload, beginning at block ${startSequence}...`);
    const chunk = await this.createChunk(
      this.blockFileName,
      startSequence,
      lastUploadTimestamp,
    );
    const prefix = String(chunk.timestamp) + "/";

    logger.info(`Upload: begin...`);

    const uploadedBinary = await this.uploadFile(
      prefix,
      chunk.blocks,
      "application/octet-stream",
    );
    logger.info(`Upload: binary file complete: ${uploadedBinary}`);

    const bytesRangeGzip = await this.gzipFile(
      chunk.byteRangesFile,
      `${chunk.byteRangesFile}.gz`,
    );
    const uploadedBytesRange = await this.uploadFile(
      prefix,
      bytesRangeGzip,
      "application/gzip",
    );
    logger.info(`Upload: bytes range file complete: ${uploadedBytesRange}`);

    const updatedManifest = await this.updateManifest(
      manifest,
      chunk,
      uploadedBinary,
      uploadedBytesRange,
    );
    await this.uploadFile("", updatedManifest, "application/json");
    logger.info(
      `Upload: updating manifest json file complete: ${updatedManifest}`,
    );
  }

  async createChunk(
    outputFileName: string,
    startSequence: number,
    lastUploadTimestamp: number,
  ): Promise<ManifestChunk> {
    this.deleteFileIfExists(outputFileName);
    const byteRangesFileName = `${outputFileName}.byteRanges.csv`;
    this.deleteFileIfExists(byteRangesFileName);

    let currentSequence = startSequence;
    let currentByte = 0;
    let finalized = false;
    const outputFile = fs.createWriteStream(outputFileName);
    const byteRangesFile = fs.createWriteStream(byteRangesFileName);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const block = await this.cache.getBlockBySequence(currentSequence);
      if (block == null) {
        const currentTimestamp = Date.now();
        const hoursSinceLastUpload =
          (currentTimestamp - lastUploadTimestamp) / (1000 * 60 * 60);
        logger.info(
          `${this.bytesToMbRounded(
            outputFile.bytesWritten,
          )}/${this.bytesToMbRounded(
            this.chunkSizeBytes,
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
      byteRangesFile.write(
        `${currentSequence},${currentByte},${
          currentByte + blockBuffer.byteLength - 1
        }\n`,
      );
      currentByte += blockBuffer.byteLength;

      if (outputFile.bytesWritten >= this.chunkSizeBytes) {
        logger.info("Chunk size reached, finishing file creation...");
        finalized = true;
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
    byteRangesFile.end();

    logger.info(
      `New file upload created, size ${this.bytesToMbRounded(
        outputFile.bytesWritten,
      )} MB, blocks: ${currentSequence - 1}`,
    );
    return {
      blocks: outputFileName,
      byteRangesFile: byteRangesFileName,
      timestamp: Date.now(),
      range: {
        start: startSequence,
        end: currentSequence,
      },
      finalized,
    };
  }

  async updateManifest(
    manifest: ManifestFile | null,
    chunk: ManifestChunk,
    blocksGz: string,
    byteRangesGz: string,
  ): Promise<string> {
    const relativeChunk = {
      ...chunk,
      blocks: blocksGz,
      byteRangesFile: byteRangesGz,
    };
    let chunks = [relativeChunk];
    if (manifest !== null) {
      const lastChunkFinalized =
        manifest.chunks[manifest.chunks.length - 1].finalized;
      chunks = lastChunkFinalized
        ? manifest.chunks.concat([relativeChunk])
        : manifest.chunks.slice(0, -1).concat([relativeChunk]);
    }
    const updatedManifest: ManifestFile = { chunks: chunks };
    await fs.promises
      .writeFile(this.manifestPath, JSON.stringify(updatedManifest, null, 2))
      .catch((err) => {
        throw new UploadError(
          `Failed to write to ${this.manifestPath}: ${err.message}`,
        );
      });
    return this.manifestPath;
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

  async gzipFile(inputFile: string, outputFile: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(outputFile);
      const readStream = fs.createReadStream(inputFile);
      const gzip = zlib.createGzip();

      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on("error", reject)
        .on("finish", () => {
          logger.info(`Gzipping file complete: ${outputFile}`);
          resolve(outputFile);
        });
    });
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
