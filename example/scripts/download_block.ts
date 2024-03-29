import axios, { AxiosResponse } from "axios";
import zlib from "zlib";
import { Reader } from "protobufjs";
import { LightBlock } from "../../src/models/lightstreamer";

const R2_ENDPOINT = "https://pub-a64f19884be64edaa4f3326fa5c9a39a.r2.dev";

type BlockRange = {
  start: number;
  end: number;
};

type ManifestChunk = {
  blocks: string;
  range: BlockRange;
  byteRangesFile: string;
};

type ManifestFile = {
  chunks: ManifestChunk[];
};

async function downloadAndParseJSON(url: string): Promise<ManifestFile> {
  const response: AxiosResponse<ManifestFile> = await axios.get(url);
  return response.data;
}

async function downloadAndExtractByteRanges(url: string): Promise<string[]> {
  const response = await axios({
    method: "get",
    url: url,
    responseType: "stream",
  });

  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const byteRanges: string[] = [];
    response.data
      .pipe(gunzip)
      .on("data", (data: Buffer) => {
        byteRanges.push(data.toString());
      })
      .on("end", () => {
        resolve(byteRanges.join("").split("\n"));
      })
      .on("error", reject);
  });
}

async function downloadByteRange(
  url: string,
  start: number,
  end: number,
): Promise<Buffer> {
  const response: AxiosResponse<Buffer> = await axios.get(url, {
    responseType: "arraybuffer",
    headers: {
      Range: `bytes=${start}-${end}`,
    },
  });
  return response.data;
}

async function main(startBlock: number, endBlock: number) {
  const manifestUrl: string = `${R2_ENDPOINT}/manifest.json`;

  try {
    const manifest: ManifestFile = await downloadAndParseJSON(manifestUrl);

    for (const chunk of manifest.chunks) {
      if (chunk.range.start <= endBlock && chunk.range.end >= startBlock) {
        const byteRangesUrl: string = `${R2_ENDPOINT}/${chunk.byteRangesFile}`;
        const byteRanges: string[] = await downloadAndExtractByteRanges(
          byteRangesUrl,
        );

        for (const range of byteRanges) {
          const [blockNumber, start, end] = range.split(",").map(Number);
          if (blockNumber >= startBlock && blockNumber <= endBlock) {
            const blockUrl: string = `${R2_ENDPOINT}/${chunk.blocks}`;
            const blockData: Buffer = await downloadByteRange(
              blockUrl,
              start,
              end,
            );
            const reader = new Reader(blockData);

            let sequence = start;
            while (reader.pos < reader.len) {
              const lightBlock = LightBlock.toJSON(LightBlock.decode(reader));
              console.log(`Sequence ${sequence}:`, lightBlock);
              sequence++;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// Example usage of main function
main(150000, 150010); // Replace with desired block numbers
