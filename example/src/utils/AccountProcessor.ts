import { generateKeyFromPrivateKey, Key } from "@ironfish/rust-nodejs";
import { NoteEncrypted } from "@ironfish/sdk/build/src/primitives/noteEncrypted";
import { LightBlock } from "../../../src/models/lightstreamer";

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
  private accounts: TAccounts = new Map();

  public addAccount(privateKey: string) {
    this.accounts.set(...this._makeAccountData(privateKey));
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

  public processBlockForTransactions(block: LightBlock) {
    block.transactions.forEach((tx) => {
      tx.outputs.forEach((output) => {
        this._processNote(new NoteEncrypted(output.note));
      });

      // @todo: Process spends
    });
  }

  private _processNote(note: NoteEncrypted) {
    for (const publicKey of this.accounts.keys()) {
      const result = note.decryptNoteForOwner(publicKey);
      if (!result) return;

      const account = this.accounts.get(publicKey);
      if (!account) return;

      const assetId = result.assetId().toString("hex");
      const amount = result.value();

      const currentBalance = account.assetBalances.get(assetId) ?? BigInt(0);
      account.assetBalances.set(assetId, currentBalance + amount);
    }
  }
}
