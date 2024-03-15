import { BlockProcessor } from "./utils/BlockProcessor";
import { AccountData, AccountsManager } from "./utils/AccountsManager";
import { BlockCache } from "./utils/BlockCache";

import {
  Transaction as NativeTransaction,
  Note as NativeNote,
  Asset,
} from "@ironfish/rust-nodejs";
import { MerkleWitness, notesTree } from "./utils/MerkleTree";
import { BufferMap } from "buffer-map";
import { Api } from "../api/Api";

const api = new Api({ baseUrl: process.env["WALLET_SERVER_HOST"] });

export class Client {
  private blockCache: BlockCache;
  private blockProcessor: BlockProcessor;
  private accountsManager: AccountsManager;
  private handleStop?: () => void;

  constructor() {
    this.blockCache = new BlockCache();
    this.accountsManager = new AccountsManager(this.blockCache);
    this.blockProcessor = new BlockProcessor(
      api,
      this.blockCache,
      this.accountsManager,
    );
  }

  public addAccount(privateKey: string) {
    return this.accountsManager.addAccount(privateKey);
  }

  public async waitForProcessorSync() {
    await this.blockProcessor.waitForProcessorSync();
  }

  public syncAccounts() {
    this.accountsManager.syncAccounts();
  }

  public async waitForAccountSync(publicAddress: string) {
    const head = await this.blockCache.getHeadSequence();
    await this.accountsManager.waitForAccountSync(publicAddress, head);
    console.log(`Account ${publicAddress} synced to head ${head}`);
  }

  public getAccount(publicKey: string) {
    return this.accountsManager.getAccount(publicKey);
  }

  public async start() {
    await this.blockProcessor.start();
  }

  public async waitUntilClose() {
    return new Promise<void>((res) => {
      this.handleStop = res;
    });
  }

  public stop() {
    this.blockProcessor.stop();
    this.handleStop?.();
  }

  /*
    This function is meant as example as to how to create a transaction using the core ironfish rust codebase, instead of the sdk.
    For an example of using the sdk, see the ironfish wallet
    In this case, we are using our own ironfish-rust-nodejs bindings, but other languages could be used as well with
    separate bindings to the underlying functions. 
  */
  public async createTransaction(
    account: AccountData,
    to: { publicAddress: string },
    sendAmount: bigint,
    sendAssetId: Buffer,
    fee: bigint, // fee is always in native asset, $IRON
    memo: string,
  ): Promise<NativeTransaction> {
    const transaction = new NativeTransaction(account.key.spendingKey, 1);
    const amountsNeeded = this.buildAmountsNeeded(sendAssetId, sendAmount, fee);

    // fund the transaction and calculate the witnesses
    for (const [assetId, amount] of amountsNeeded) {
      const fundNotes = await this.fundTransaction(account, assetId, amount);
      fundNotes.map(({ note, witness }) => transaction.spend(note, witness));

      const sendNote = new NativeNote(
        to.publicAddress,
        sendAmount,
        memo,
        assetId,
        account.key.publicAddress,
      );
      transaction.output(sendNote);
    }
    // TODO mark notes as spent, not absolutely critical as syncer should catch
    return transaction;
  }

  private buildAmountsNeeded(
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

  private async fundTransaction(
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

  public async sendTransaction(transaction: Buffer) {
    return api.transaction.postTransaction(transaction.toString("hex"));
  }
}
