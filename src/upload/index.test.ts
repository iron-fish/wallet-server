// import { LightBlockUpload } from './index';
// import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
// import { LightBlockCache } from "../cache";
// import { LightBlock } from "../models/lightstreamer";

// jest.mock("@aws-sdk/client-s3", () => {
//     return {
//       S3Client: jest.fn().mockImplementation(() => {
//         return {
//           send: jest.fn()
//         };
//       })
//     };
//   });
// jest.mock("../cache");
// jest.mock("../models/lightstreamer");

// describe('LightBlockUpload', () => {
//     let lightBlockUpload: LightBlockUpload;
//     let mockCache: jest.Mocked<LightBlockCache>;
//     let mockS3Client: jest.Mocked<S3Client>;

//     beforeAll(() => {
//         process.env["BUCKET_ENDPOINT"] = 'test-endpoint';
//         process.env["BUCKET_ACCESS_KEY_ID"] = 'test-access-key-id';
//         process.env["BUCKET_SECRET_ACCESS_KEY"] = 'test-secret-access-key';
//         process.env["BUCKET_NAME"] = 'test-bucket-name';

//         mockCache = new LightBlockCache() as jest.Mocked<LightBlockCache>;
//         mockS3Client = new S3Client({}) as jest.Mocked<S3Client>;

//         lightBlockUpload = new LightBlockUpload(mockCache);
//     });

//     afterAll(() => {
//         jest.resetAllMocks();
//     });

//     it('should throw an error if environment variables are not set', () => {
//         delete process.env["BUCKET_ENDPOINT"];
//         expect(() => new LightBlockUpload(mockCache)).toThrow('BUCKET_ENDPOINT not set');
//     });

//     it('should upload blocks', async () => {
//         const mockBlock = LightBlock.fromJSON({
//             sequence: 1000,
//             hash: 'test-hash',
//             previousBlockHash: 'test-previous-hash',
//             timestamp: 123456789,
//             transactions: [],
//             noteSize: 0
//         });
//         mockCache.getBlockBySequence.mockResolvedValue(mockBlock);
//         mockCache.getHeadSequence.mockResolvedValue(1001);
//         mockCache.getUploadHead.mockResolvedValue(0);

//         const mockSend = jest.fn();
//         mockS3Client.send = mockSend;

//         await lightBlockUpload.watchAndUpload();

//         expect(mockSend).toHaveBeenCalledWith(expect.any(ListObjectsV2Command));
//         expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand));
//         expect(mockCache.putUploadHead).toHaveBeenCalledWith('test-hash');
//     });
// });
