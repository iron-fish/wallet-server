import { lightBlockCache } from "../cache";
import { lightBlockUpload } from "./index";
import {
  PutObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

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
});
