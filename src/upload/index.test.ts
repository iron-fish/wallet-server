import fs from "fs";
import os from "os";
import path from "path";
import { open } from "fs/promises";

import { createGunzip } from "zlib";
import { lightBlockCache } from "../cache";
import { lightBlockUpload } from "./index";
import { LightBlock } from "../models/lightstreamer";
import { createInterface } from "readline";

describe("LightBlockUpload", () => {
  afterAll(async () => {
    jest.resetAllMocks();
    await lightBlockCache.close();
  });

  it("should gzip blocks/manifest, last block should match", async () => {
    const tempFile = path.join(os.tmpdir(), "test");
    const blockFile = await lightBlockUpload.createBlockFiles(tempFile, 0);

    const tempGz = path.join(os.tmpdir(), "test.gz");
    const tempManifestGz = path.join(os.tmpdir(), "test.manifest.gz");
    await lightBlockUpload.gzipFile(blockFile.file, tempGz);
    await lightBlockUpload.gzipFile(blockFile.manifest, tempManifestGz);

    const gunzip = createGunzip();
    const inputFile = fs.createReadStream(tempGz);
    inputFile.pipe(gunzip);

    let lastBlock: LightBlock | undefined;

    // Verify unzipped data is correct
    let leftover = Buffer.alloc(0);
    gunzip.on("data", (chunk) => {
      let data = Buffer.concat([leftover, chunk]);

      while (data.length >= 4) {
        const blockLength = data.readUInt32BE(0);
        if (data.length >= 4 + blockLength) {
          const blockData = data.subarray(4, 4 + blockLength);
          lastBlock = LightBlock.decode(blockData);
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

    // Now get blocks via the manifest and raw file
    const tempGunzipped = path.join(os.tmpdir(), "test-gunzipped");
    let lastManifestLine: string | undefined;
    await new Promise((resolve) => {
      fs.createReadStream(tempManifestGz)
        .pipe(createGunzip())
        .pipe(fs.createWriteStream(tempGunzipped))
        .on("finish", resolve);
    });

    const rl = createInterface({
      input: fs.createReadStream(tempGunzipped),
      output: process.stdout,
      terminal: false,
    });

    for await (const line of rl) {
      lastManifestLine = line;
    }
    const splitLastLine = lastManifestLine!.split(",");
    const byteStart = parseInt(splitLastLine![1]);
    const byteEnd = parseInt(splitLastLine![2]);

    const fileDescriptor = await open(tempFile, "r");
    const buffer = Buffer.alloc(byteEnd - byteStart + 1);
    await fileDescriptor.read(buffer, 0, byteEnd - byteStart + 1, byteStart);
    console.log("biuff", buffer.toString("hex"));
    const lastBlockManifest = LightBlock.decode(buffer);

    // verify block info gotten from binary/manifest is same as gzip
    expect(lastBlock?.sequence).toEqual(lastBlockManifest?.sequence);
    expect(lastBlock?.hash).toEqual(lastBlockManifest?.hash);
  });
});
