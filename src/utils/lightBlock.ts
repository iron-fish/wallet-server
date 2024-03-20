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
  const previousBlockHash = response.block.previousBlockHash;
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
      lightSpends.push({ nf: spend.nullifier.toString("hex") });
    }
    for (const note of transaction.notes) {
      lightOutputs.push({ note: note.serialize().toString("hex") });
    }
    lightTransactions.push({
      index,
      hash: rpcTransaction.hash,
      spends: lightSpends,
      outputs: lightOutputs,
    });
  }
  return {
    protoVersion: 1,
    sequence: response.block.sequence,
    hash: response.block.hash,
    previousBlockHash: previousBlockHash,
    timestamp: response.block.timestamp,
    transactions: lightTransactions,
    noteSize: response.block.noteSize,
  };
}
