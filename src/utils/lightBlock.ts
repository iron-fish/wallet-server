import {
  GetBlockResponse,
  FollowChainStreamResponse,
  Transaction,
} from "@ironfish/sdk";
import {
  LightBlock,
  LightOutput,
  LightSpend,
  LightTransaction,
} from "src/models/lightstreamer";

export function lightBlock(
  response: FollowChainStreamResponse | GetBlockResponse,
): LightBlock {
  if (!response.block.noteSize) {
    throw new Error("Block is missing noteSize");
  }
  const lightTransactions: LightTransaction[] = [];
  const previousBlockHash =
    "previous" in response.block
      ? response.block.previous
      : response.block.previousBlockHash;
  for (let index = 0; index < response.block.transactions.length; index++) {
    const rpcTransaction = response.block.transactions[index];
    const lightSpends: LightSpend[] = [];
    const lightOutputs: LightOutput[] = [];

    // Stubbed until changes in @ironfish/sdk are released
    let serialized = "";
    if (rpcTransaction.serialized === undefined) {
      throw new Error("Transaction is missing serialized data");
    }
    serialized = rpcTransaction.serialized;
    const transaction = new Transaction(Buffer.from(serialized, "hex"));
    for (const spend of transaction.spends) {
      lightSpends.push({ nf: spend.nullifier });
    }
    for (const note of transaction.notes) {
      lightOutputs.push({ note: note.serialize() });
    }
    lightTransactions.push({
      index,
      hash: Buffer.from(rpcTransaction.hash, "hex"),
      spends: lightSpends,
      outputs: lightOutputs,
    });
  }
  return {
    protoVersion: 1,
    sequence: response.block.sequence,
    hash: Buffer.from(response.block.hash, "hex"),
    previousBlockHash: Buffer.from(previousBlockHash, "hex"),
    timestamp: response.block.timestamp,
    transactions: lightTransactions,
    noteSize: response.block.noteSize,
  };
}
