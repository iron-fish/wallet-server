import fs from "fs";
import os from "os";
import path from "path";
import { open } from "fs/promises";
import { Reader } from "protobufjs/minimal";

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
    const firstBlock = (await lightBlockCache.getBlockBySequence(
      1,
    )) as LightBlock;
    const triggerUploadTime =
      firstBlock.timestamp - 1.1 * Number(process.env["MAX_UPLOAD_LAG_MS"]);
    const blockFile = await lightBlockUpload.createChunk(
      tempFile,
      firstBlock.sequence,
      triggerUploadTime,
    );

    const tempGz = path.join(os.tmpdir(), "test.gz");
    const bytesRangeGzip = path.join(os.tmpdir(), "test.bytesRange.gz");
    await lightBlockUpload.gzipFile(blockFile.blocks, tempGz);
    await lightBlockUpload.gzipFile(blockFile.byteRangesFile, bytesRangeGzip);

    const gunzip = createGunzip();
    const inputFile = fs.createReadStream(tempGz);
    let data = Buffer.alloc(0);

    inputFile
      .pipe(gunzip)
      .on("data", (chunk: Buffer) => {
        data = Buffer.concat([data, chunk]);
      })
      .on("end", () => {})
      .on("error", (err) => {
        expect(() => {
          throw new Error(err.message);
        }).not.toThrow();
      });

    await new Promise((resolve, reject) => {
      gunzip.on("end", resolve);
      gunzip.on("error", reject);
    });

    const reader = new Reader(data);
    const blocks: LightBlock[] = [];
    while (reader.pos < reader.len) {
      blocks.push(LightBlock.decode(reader));
    }
    const lastBlock = blocks[blocks.length - 1];

    // Now get blocks via the manifest and raw file
    const tempGunzipped = path.join(os.tmpdir(), "test-gunzipped");
    let lastManifestLine: string | undefined;
    await new Promise((resolve) => {
      fs.createReadStream(bytesRangeGzip)
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
    const lastBlockManifest = LightBlock.decode(buffer);

    // verify block info gotten from binary/manifest is same as gzip
    expect(lastBlock?.sequence).toEqual(lastBlockManifest?.sequence);
    expect(lastBlock?.hash).toEqual(lastBlockManifest?.hash);
  });
});
