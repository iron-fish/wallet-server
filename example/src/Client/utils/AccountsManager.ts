import {
  generateKeyFromPrivateKey,
  Key,
  NoteEncrypted,
  Note,
} from "@ironfish/rust-nodejs";
import { BlockCache } from "./BlockCache";
import {
  LightBlock,
  LightTransaction,
} from "../../../../src/models/lightstreamer";
import { logThrottled } from "./logThrottled";

export interface DecryptedNoteValue {
  accountId: string;
  note: Note;
  spent: boolean;
  transactionHash: Buffer;
  index: number | null;
  nullifier: Buffer | null;
  blockHash: Buffer | null;
  sequence: number | null;
}

interface AccountData {
  key: Key;
  assets: Map<
    string,
    {
      balance: bigint;
      decryptedNotes: DecryptedNoteValue[];
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

  public async handleReorg(invalidBlocks: LightBlock[]) {
    console.log(invalidBlocks);
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
    const parsedBlock = LightBlock.decode(block);

    parsedBlock.transactions.forEach((tx) => {
      tx.outputs.forEach((output, index) => {
        this._processNote(
          new NoteEncrypted(output.note),
          parsedBlock,
          tx,
          index,
        );
      });

      // @todo: Process spends
    });
  }

  private _processNote(
    note: NoteEncrypted,
    block: LightBlock,
    tx: LightTransaction,
    index: number,
  ) {
    for (const publicKey of this.accounts.keys()) {
      // Get account data for public key
      const account = this.accounts.get(publicKey);
      if (!account) return;

      // Decrypt note using view key
      const decryptedNoteBuffer = note.decryptNoteForOwner(
        account.key.incomingViewKey,
      );

      // If no result, note is not for this account
      if (!decryptedNoteBuffer) return;

      const foundNode = Note.deserialize(decryptedNoteBuffer);

      // Get asset id and amount for note
      const assetId = foundNode.assetId().toString("hex");
      const amount = foundNode.value();

      // If asset id does not exist, create it
      if (!account.assets.has(assetId)) {
        account.assets.set(assetId, {
          balance: BigInt(0),
          decryptedNotes: [],
        });
      }

      const assetEntry = account.assets.get(assetId)!;

      // Register note
      assetEntry.decryptedNotes.push({
        accountId: publicKey,
        note: foundNode,
        spent: false,
        transactionHash: tx.hash,
        index,
        nullifier: null, // @todo: Get nullifier
        blockHash: block.hash,
        sequence: block.sequence,
      });

      // Update balance
      const currentBalance = account.assets.get(assetId)?.balance ?? BigInt(0);
      assetEntry.balance = currentBalance + amount;

      logThrottled(
        `Account ${publicKey} has ${assetEntry.decryptedNotes.length} notes for asset ${assetId}`,
        10,
        assetEntry.decryptedNotes.length,
      );
    }
  }
}
