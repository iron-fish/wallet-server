import { generateKeyFromPrivateKey, Key } from "@ironfish/rust-nodejs";
import { NoteEncrypted } from "@ironfish/sdk/build/src/primitives/noteEncrypted";
import { LightBlock } from "../../../../src/models/lightstreamer";
import { BlockCache } from "./BlockCache";

interface AccountData {
  key: Key;
  assetBalances: Map<string, bigint>;
}

/**
 * Mapping of private key to account data including keys and asset balances
 */
type TAccounts = Map<
  string,
  {
    key: Key;
    assetBalances: Map<string, bigint>;
  }
>;

export class AccountsManager {
  private blockCache: BlockCache;
  private accounts: TAccounts = new Map();

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
        assetBalances: new Map(),
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

      // Register additional balance for that asset id
      const currentBalance = account.assetBalances.get(assetId) ?? BigInt(0);
      account.assetBalances.set(assetId, currentBalance + amount);
    }
  }
}
