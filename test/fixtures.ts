import { LightBlock } from "@/models/lightstreamer";

export const blockFixture: LightBlock = {
  protoVersion: 1,
  sequence: 5,
  hash: Buffer.from(
    "000000000000002fc133e606b981a3054f0502eef9c4ec473adb7671ef1456ee",
    "hex",
  ),
  previousBlockHash: Buffer.from(
    "0000000000000040f743e57e7854eb639702eaa3af5b5be2b48a4fb2a85d7708",
    "hex",
  ),
  timestamp: 2675919337,
  transactions: [
    {
      index: 0,
      hash: Buffer.from(
        "1945fed3f638be4b22b666b95dc774f36af8e9984fc96fa6a8eb504f67710b06",
        "hex",
      ),
      spends: [],
      outputs: [],
    },
  ],
};
