import axios from "axios";
import fs from "fs";
import zlib from "zlib";
import readline from "readline";
import { LightBlock } from "../../src/models/lightstreamer";
import { promisify } from "util";
import { Readable, finished } from "stream";

const R2_URL = "https://pub-a64f19884be64edaa4f3326fa5c9a39a.r2.dev/";
const BLOCK_NUMBER = 420;

const finishedPromise = promisify(finished); // Convert callback to promise

async function downloadFile(url: string, path: string) {
  const response = await axios.get(url, { responseType: "stream" });
  const writer = fs.createWriteStream(path);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function decompressGzip(inputPath: string, outputPath: string) {
  const gzip = zlib.createGunzip();
  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath);
  input.pipe(gzip).pipe(output);
  await finishedPromise(output);
}

async function findBlockRange(manifestPath: string, blockNumber: number) {
  const fileStream = fs.createReadStream(manifestPath);
  const rl = readline.createInterface({ input: fileStream });
  for await (const line of rl) {
    const [block, start, end] = line.split(",");
    if (parseInt(block) === blockNumber) {
      return { start: parseInt(start), end: parseInt(end) };
    }
  }
  throw new Error(`Block ${blockNumber} not found in manifest`);
}

async function downloadBlock(
  url: string,
  range: { start: number; end: number },
) {
  const response = await axios.get(url, {
    headers: { Range: `bytes=${range.start}-${range.end}` },
    responseType: "stream",
  });
  const data = await streamToBuffer(response.data);
  return data;
}

async function streamToBuffer(readableStream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function main() {
  await downloadFile(R2_URL + "latest.json", "latest.json");
  const latest = JSON.parse(fs.readFileSync("latest.json", "utf-8"));
  await downloadFile(R2_URL + latest.manifest, "blocks.manifest.gz");
  await decompressGzip("blocks.manifest.gz", "blocks.manifest");
  const range = await findBlockRange("blocks.manifest", BLOCK_NUMBER);
  const block = await downloadBlock(R2_URL + latest.blocks, range);
  console.log(JSON.stringify(LightBlock.decode(block), null, 2));
}

main().catch(console.error);
