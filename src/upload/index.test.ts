import fs from "fs";
import os from "os";
import path from "path";

import { createGunzip } from "zlib";
import { lightBlockCache } from "../cache";
import { lightBlockUpload } from "./index";
import {
  PutObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { LightBlock } from "../models/lightstreamer";

describe("LightBlockUpload", () => {
  beforeAll(() => {
    jest.spyOn(S3Client.prototype, "send").mockImplementation((command) => {
      if (command instanceof ListObjectsV2Command) {
        return Promise.resolve({
          Contents: [
            { Key: lightBlockUpload.uploadName({ start: 1, end: 1000 }) },
            { Key: lightBlockUpload.uploadName({ start: 1001, end: 2000 }) },
          ],
        });
      } else if (command instanceof PutObjectCommand) {
        return Promise.resolve({
          /* your mock PutObjectCommand response */
        });
      } else {
        throw new Error(
          `Command mock not implemented: ${command.constructor.name}`,
        );
      }
    });
  });

  afterAll(async () => {
    jest.resetAllMocks();
    await lightBlockCache.close();
  });

  it("upload name creation should be reversible", () => {
    const blockRange = { start: 1, end: 1000 };
    const key = lightBlockUpload.uploadName(blockRange);
    const newBlockRange = lightBlockUpload.parseUploadName(key);
    expect(blockRange).toEqual(newBlockRange);
  });

  it("existing uploads should return block ranges", async () => {
    const ranges = await lightBlockUpload.existingUploads();
    expect(ranges).toEqual([
      { start: 1, end: 1000 },
      { start: 1001, end: 2000 },
    ]);
  });

  it("should gzip blocks as expected", async () => {
    const tempFile = path.join(os.tmpdir(), "test.gz");
    await lightBlockUpload.gzipBlocks(1, 0.001, tempFile);

    const gunzip = createGunzip();
    const inputFile = fs.createReadStream(tempFile);

    inputFile.pipe(gunzip);

    let leftover = Buffer.alloc(0);
    gunzip.on("data", (chunk) => {
      let data = Buffer.concat([leftover, chunk]);

      while (data.length >= 4) {
        const blockLength = data.readUInt32BE(0);
        if (data.length >= 4 + blockLength) {
          const blockData = data.subarray(4, 4 + blockLength);
          expect(() => LightBlock.decode(blockData)).not.toThrow();
          data = data.subarray(4 + blockLength);
        } else {
          break;
        }
      }

      leftover = data;
    });

    gunzip.on("end", () => {
      expect(leftover.length).toBe(0);
    });

    gunzip.on("error", (err) => {
      expect(() => {
        throw new Error(err.message);
      }).not.toThrow();
    });
  });
});
