import {
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import * as zlib from "zlib";
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
  file: string;
  manifest: string;
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
    // eslint-disable-next-line no-constant-condition
    const fileName = "blocks";
    const currentUploadSize = (await this.getFileSize(fileName)) || 0;
    logger.info(
      `Current file uploaded size: ${currentUploadSize}, creating new upload...`,
    );
    const files = await this.createBlockFiles(fileName, currentUploadSize);

    logger.info(`Upload: begin...`);
    const gzip = await this.gzipFile(files.file, `${files.file}.gz`);
    await this.uploadFile(gzip, "application/gzip");
    logger.info(`Upload: gzip file complete`);

    await this.uploadFile(files.file, "application/octet-stream");
    logger.info(`Upload: binary file complete`);

    const gzipManifest = await this.gzipFile(
      files.manifest,
      `${files.manifest}.gz`,
    );
    await this.uploadFile(gzipManifest, "application/gzip");
    logger.info(`Upload: manifest file complete`);

    await this.upload();
  }

  async createBlockFiles(
    outputFileName: string,
    previousSize: number,
  ): Promise<BlockFile> {
    this.deleteFileIfExists(outputFileName);
    const manifestFileName = `${outputFileName}.manifest`;
    this.deleteFileIfExists(manifestFileName);

    let i = 1;
    let currentByte = 0;
    const outputFile = fs.createWriteStream(outputFileName);
    const manifestFile = fs.createWriteStream(manifestFileName);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const block = await this.cache.getBlockBySequence(i);
      if (block == null && previousSize === 0) break;
      if (block == null) {
        await this.waitForNextBlock();
        continue;
      }

      const blockBuffer = LightBlock.encode(block).finish();
      outputFile.write(blockBuffer);
      manifestFile.write(
        `${i},${currentByte},${currentByte + blockBuffer.byteLength - 1}\n`,
      );
      currentByte += blockBuffer.byteLength;

      if (
        !!previousSize &&
        outputFile.bytesWritten >=
          Math.max(this.chunkSizeMb * 1024 * 1024 + previousSize)
      ) {
        break;
      }
      i++;
    }

    outputFile.end();
    manifestFile.end();

    logger.info(
      `New file upload created, size ${
        outputFile.bytesWritten / 1024 / 1024
      } MB, blocks: ${i - 1}`,
    );
    return { file: outputFileName, manifest: manifestFileName };
  }

  private deleteFileIfExists(fileName: string): void {
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
    }
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

  async uploadFile(fileName: string, contentType: string): Promise<void> {
    // due to consistentcy model of S3, should be safe to overwrite upload
    const fileStream = fs.createReadStream(fileName);
    const fileSize = fs.statSync(fileName).size;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentType: contentType,
      ContentLength: fileSize,
      Key: fileName,
      Body: fileStream,
    });
    await this.s3Client.send(command);
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
}

export const lightBlockUpload = new LightBlockUpload(lightBlockCache);
