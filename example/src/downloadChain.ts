import { config } from "dotenv";
config();

import axios from "axios";
import zlib from "zlib";
import fs from "fs";
import { promisify } from "util";
import { LightBlock } from "../../src/models/lightstreamer";
import { ManifestFile } from "../../src/upload";
import { Api } from "./api/Api";

// Define the URL for the manifest
const BLOCKS_URL = "https://testnet.lightblocks.ironfish.network/";
const MANIFEST_PATH = BLOCKS_URL + "manifest.json";

// Function to fetch JSON data from a URL
async function fetchJson<T>(url: string): Promise<T> {
  const response = await axios.get(url);
  return response.data as T;
}

// Function to download a file from a URL and save it locally
async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await axios.get(url, { responseType: "stream" });
  const writer = fs.createWriteStream(dest);

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

const gunzip = promisify(zlib.gunzip);

async function readGzippedFile(byteRangesFile: string) {
  const compressedData = fs.readFileSync(byteRangesFile);
  const decompressedData = await gunzip(compressedData);
  const byteRanges = decompressedData
    .toString("utf-8")
    .split("\n")
    .filter((line) => line.trim() !== "");
  return byteRanges;
}

// Function to download finalized blocks and convert them to LightBlock
async function downloadFinalizedBlocks(): Promise<number> {
  const latestFinalizedBlockSequence = 0;
  try {
    // Fetch the manifest file
    const manifest = await fetchJson<ManifestFile>(MANIFEST_PATH);

    for (const chunk of manifest.chunks) {
      if (chunk.finalized) {
        // Download the block binary file
        const blocksUrl = `${BLOCKS_URL}${chunk.blocks}`;
        const blocksFile = `blocks_${chunk.range.start}_${chunk.range.end}`;
        await downloadFile(blocksUrl, blocksFile);

        // Download the byte ranges file
        const byteRangesUrl = `${BLOCKS_URL}${chunk.byteRangesFile}`;
        const byteRangesFile = `byteRanges_${chunk.range.start}_${chunk.range.end}.csv.gz`;
        await downloadFile(byteRangesUrl, byteRangesFile);

        // Read the byte ranges file and convert each block
        const byteRanges = await readGzippedFile(byteRangesFile);
        const blockBuffer = fs.readFileSync(blocksFile);
        for (const range of byteRanges) {
          const [_, start, end] = range.split(",").map(Number);
          const blockBufferSub = blockBuffer.subarray(start, end + 1);
          const lightBlock = LightBlock.decode(blockBufferSub);
          // Process the LightBlock as needed
          console.log(
            `Downloaded LightBlock sequence: ${
              lightBlock.sequence
            }, hash: ${lightBlock.hash.toString("hex")}`,
          );
        }
      }
    }
  } catch (error) {
    console.error(`Failed to download finalized blocks: ${error}`);
  }
  return latestFinalizedBlockSequence;
}

async function main() {
  if (!process.env["WALLET_SERVER_HOST"]) {
    console.error("WALLET_SERVER_HOST environment variable is required");
    process.exit(1);
  }

  // Allows skipping download and only download unfinalized blocks
  let latestFinalizedSequence;
  if (process.env["LATEST_FINALIZED_SEQUENCE"]) {
    latestFinalizedSequence = Number(process.env["LATEST_FINALIZED_SEQUENCE"]);
  } else {
    // Download finalized blocks and returns the latest finalized sequence
    latestFinalizedSequence = await downloadFinalizedBlocks();
  }
  const api = new Api({ baseUrl: process.env["WALLET_SERVER_HOST"] });
  const latestReponse = await api.latestBlock.getLatestBlock();
  const latestBlockSequence = latestReponse.data.sequence;

  const chunkSize = 100;
  for (
    let i = latestFinalizedSequence + 1;
    i < latestBlockSequence;
    i += chunkSize
  ) {
    const start = i;
    const end = Math.min(i + chunkSize - 1, latestBlockSequence);
    console.log(`Downloading blocks from ${start} to ${end}`);
    const blocksResponse = await api.blockRange.getBlockRange({ start, end });
    for (const block of blocksResponse.data) {
      const lightBlock = LightBlock.decode(Buffer.from(block, "hex"));
      // Process the LightBlock as needed
      console.log(
        `API Downloaded LightBlock sequence: ${
          lightBlock.sequence
        }, hash: ${lightBlock.hash.toString("hex")}`,
      );
    }
  }
}

main();
