import { configDotEnv } from "./utils/configDotenv";
configDotEnv();

import request from "supertest";
import { app, server } from "./server";
import { lightBlockCache } from "./cache";
import { LightBlock } from "./models/lightstreamer";

const expectedBlockObject = {
  protoVersion: expect.any(Number),
  sequence: 1,
  hash: expect.any(Buffer),
  previousBlockHash: expect.any(Buffer),
  timestamp: expect.any(Number),
  transactions: expect.arrayContaining([
    expect.objectContaining({
      hash: expect.any(Buffer),
      outputs: expect.arrayContaining([
        expect.objectContaining({
          note: expect.any(Buffer),
        }),
      ]),
    }),
  ]),
  noteSize: expect.any(Number),
};

afterAll(async () => {
  await lightBlockCache.close();
  server.close();
});

describe("GET /block", () => {
  it("should return the correct block for a given identifier", async () => {
    // Assuming an identifier and corresponding block fixture exist

    const response = await request(app).get(`/block?sequence=1`);
    expect(response.statusCode).toBe(200);
    const block = LightBlock.decode(Buffer.from(response.body, "hex"));
    expect(block).toMatchObject(expectedBlockObject);
  });
  it("should handle invalid range parameters", async () => {
    const response = await request(app).get("/block?seqtypo=1");
    expect(response.statusCode).toBe(400);
  });
});

describe("GET /block-range", () => {
  it("should return a range of blocks correctly", async () => {
    // Setup mock to return a range of blocks

    const response = await request(app).get("/block-range?start=1&end=10");
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveLength(10);
    const data = response.body.map((hex: string) =>
      LightBlock.decode(Buffer.from(hex, "hex")),
    );
    expect(data).toEqual(expect.arrayContaining([expectedBlockObject]));
  });

  it("should return binary hex if prompted", async () => {
    // Setup mock to return a range of blocks

    const response = await request(app).get(
      "/block-range?start=1&end=10&binary=true",
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveLength(10);
    const block = LightBlock.decode(Buffer.from(response.body[0], "hex"));
    expect(block).toEqual(expectedBlockObject);
  });

  it("should handle invalid range parameters", async () => {
    const response = await request(app).get("/block-range?starttypo=1&end=10");
    expect(response.statusCode).toBe(400);
  });
});
