import { configDotEnv } from "./utils/configDotenv";
configDotEnv();

import request from "supertest";
import { app, server } from "./server";
import { lightBlockCache } from "./cache";

const expectedBlockObject = {
  protoVersion: expect.any(Number),
  sequence: 1,
  hash: expect.any(String),
  previousBlockHash: expect.any(String),
  timestamp: expect.any(Number),
  transactions: expect.arrayContaining([
    expect.objectContaining({
      hash: expect.any(String),
      outputs: expect.arrayContaining([
        expect.objectContaining({
          note: expect.any(String),
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

describe("GET /latest-block", () => {
  it("should return the latest block successfully", async () => {
    const response = await request(app).get("/latest-block");
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      sequence: expect.any(Number),
      hash: expect.any(String),
    });
  });
});

describe("GET /block", () => {
  it("should return the correct block for a given identifier", async () => {
    // Assuming an identifier and corresponding block fixture exist

    const response = await request(app).get(`/block?sequence=1`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject(expectedBlockObject);
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
    expect(response.body).toEqual(
      expect.arrayContaining([expectedBlockObject]),
    );
  });

  it("should handle invalid range parameters", async () => {
    const response = await request(app).get("/block-range?starttypo=1&end=10");
    expect(response.statusCode).toBe(400);
  });
});
