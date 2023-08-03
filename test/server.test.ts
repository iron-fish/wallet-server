import { expect, it } from "vitest";
import { credentials } from "@grpc/grpc-js";
import { Empty, LightStreamerClient } from "@/models/lightstreamer";
import "@/server";
import { until } from "./utils";

const client = new LightStreamerClient(
  "localhost:50051",
  credentials.createInsecure(),
);

it("starts successfully", async () => {
  await until((done) => {
    client.getServerInfo(
      Empty,
      done((_, response) => {
        expect(response.nodeStatus).toBe("started");
      }),
    );
  });
});

it("catches failed errors", async () => {
  await until((done) => {
    client.getServerInfo(
      Empty,
      done((_, response) => {
        try {
          expect(response.nodeStatus).toBe("OTHER");
          throw new Error();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
          expect(err.message).toBeTruthy();
        }
      }),
    );
  });
});
