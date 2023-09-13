import { BufferMap } from "buffer-map";

import {
  Transaction as NativeTransaction,
  Note as NativeNote,
  Asset,
} from "@ironfish/rust-nodejs";
import { MerkleWitness, notesTree } from "./MerkleTree";
import { AccountData } from "./AccountsManager";

/*
    This function is meant as example as to how to create a transaction using the core ironfish rust codebase, instead of the sdk.
    For an example of using the sdk, see the ironfish wallet
    In this case, we are using our own ironfish-rust-nodejs bindings, but other languages could be used as well with
    separate bindings to the underlying functions. 
*/
export async function createTransaction(
  account: AccountData,
  to: { publicAddress: string },
  sendAmount: bigint,
  sendAssetId: Buffer,
  fee: bigint, // fee is always in native asset, $IRON
  memo: string,
): Promise<NativeTransaction> {
  const transaction = new NativeTransaction(account.key.spendingKey, 1);
  const amountsNeeded = buildAmountsNeeded(sendAssetId, sendAmount, fee);

  // fund the transaction and calculate the witnesses
  for (const [assetId, amount] of amountsNeeded) {
    const fundNotes = await fundTransaction(account, assetId, amount);
    fundNotes.map(({ note, witness }) => transaction.spend(note, witness));

    const sendNote = new NativeNote(
      to.publicAddress,
      amount,
      memo,
      assetId,
      account.key.publicAddress,
    );
    transaction.output(sendNote);
  }
  // TODO mark notes as spent, not absolutely critical as syncer should catch
  return transaction;
}

function buildAmountsNeeded(
  assetId: Buffer,
  amount: bigint,
  fee: bigint,
): BufferMap<bigint> {
  // add fee
  const amountsNeeded = new BufferMap<bigint>();
  amountsNeeded.set(Asset.nativeId(), fee);

  // add spend
  const currentAmount = amountsNeeded.get(assetId) ?? 0n;
  amountsNeeded.set(assetId, currentAmount + amount);

  return amountsNeeded;
}

async function fundTransaction(
  from: AccountData,
  assetId: Buffer,
  amount: bigint,
): Promise<{ note: NativeNote; witness: MerkleWitness }[]> {
  let currentValue = 0n;
  const notesToSpend: { note: NativeNote; witness: MerkleWitness }[] = [];
  const notes = from.assets.get(assetId);
  if (!notes) {
    throw new Error("No notes found for asset: " + assetId.toString("hex"));
  }
  for (const note of notes.values()) {
    if (currentValue >= amount) {
      break;
    }
    if (
      !note.note.assetId().equals(assetId) ||
      note.spent === true ||
      !note.sequence ||
      !note.merkleIndex
    ) {
      continue;
    }
    const witness = await notesTree.witness(note.merkleIndex);
    console.log(
      note.note.hash().toString("hex"),
      note.sequence,
      note.merkleIndex,
      witness?.treeSize(),
      witness?.rootHash,
      note.note.value(),
    );
    if (!witness) {
      console.warn(
        "Could not calculate witness for note: ",
        note.note.hash().toString("hex"),
      );
      continue;
    }
    currentValue += note.note.value();
    notesToSpend.push({ note: note.note, witness });
  }
  if (currentValue < amount) {
    throw new Error(
      "Insufficient funds for asset: " +
        assetId.toString("hex") +
        " needed: " +
        amount.toString() +
        " have: " +
        currentValue.toString(),
    );
  }
  return notesToSpend;
}
