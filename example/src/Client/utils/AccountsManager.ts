import { generateKeyFromPrivateKey, Key } from "@ironfish/rust-nodejs";
import { NoteEncrypted } from "@ironfish/sdk/build/src/primitives/noteEncrypted";
import { LightBlock } from "../../../../src/models/lightstreamer";
import { BlockCache } from "./BlockCache";

interface AccountData {
  key: Key;
  assets: Map<
    string,
    {
      balance: bigint;
      notes: NoteEncrypted[];
    }
  >;
}

export class AccountsManager {
  private blockCache: BlockCache;
  /** publicKey => AccountData */
  private accounts: Map<string, AccountData> = new Map();

  constructor(blockCache: BlockCache) {
    this.blockCache = blockCache;
  }

  public addAccount(privateKey: string) {
    this.accounts.set(...this._makeAccountData(privateKey));

    this.blockCache
      .createReadStream()
      .on("data", ({ key, value }: { key: string; value: Buffer }) => {
        const sequenceKey = this.blockCache.decodeKey(key);
        if (!sequenceKey) {
          return;
        }
        this._processBlockForTransactions(value);
      });
  }

  public getPublicAddresses() {
    return Array.from(this.accounts.keys());
  }

  private _makeAccountData(privateKey: string): [string, AccountData] {
    const key = generateKeyFromPrivateKey(privateKey);
    return [
      key.publicAddress,
      {
        key,
        assets: new Map(),
      },
    ];
  }

  private _processBlockForTransactions(block: Buffer) {
    const parsedBlock = LightBlock.fromJSON(JSON.parse(block.toString()));

    parsedBlock.transactions.forEach((tx) => {
      tx.outputs.forEach((output) => {
        this._processNote(new NoteEncrypted(output.note));
      });

      // @todo: Process spends
    });
  }

  private _processNote(note: NoteEncrypted) {
    for (const publicKey of this.accounts.keys()) {
      // Get account data for public key
      const account = this.accounts.get(publicKey);
      if (!account) return;

      // Decrypt note using spending key
      const result = note.decryptNoteForOwner(account.key.spendingKey);
      // If no result, note is not for this account
      if (!result) return;

      // Get asset id and amount for note
      const assetId = result.assetId().toString("hex");
      const amount = result.value();

      // If asset id does not exist, create it
      if (!account.assets.has(assetId)) {
        account.assets.set(assetId, {
          balance: BigInt(0),
          notes: [],
        });
      }

      const assetEntry = account.assets.get(assetId)!;

      // Register note
      assetEntry.notes.push(note);

      // Update balance
      const currentBalance = account.assets.get(assetId)?.balance ?? BigInt(0);
      assetEntry.balance = currentBalance + amount;
    }
  }
}
