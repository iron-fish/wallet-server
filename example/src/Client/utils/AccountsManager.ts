import { EventEmitter } from "events";

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
  head: number;
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
  private events: EventEmitter = new EventEmitter();

  constructor(blockCache: BlockCache) {
    this.blockCache = blockCache;
  }

  public addAccount(privateKey: string) {
    const accountData = this._makeAccountData(privateKey);
    this.accounts.set(...accountData);

    this.blockCache
      .createReadStream()
      .on("data", ({ key, value }: { key: string; value: Buffer }) => {
        const sequenceKey = this.blockCache.decodeKey(key);
        if (!sequenceKey) {
          return;
        }
        this._processBlockForTransactions(value);
        this.events.emit("accounts-updated");
      });

    return accountData[0];
  }

  public waitForAccountSync(
    publicAddress: string,
    sequence: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkSequence = () => {
        const accountData = this.accounts.get(publicAddress);
        if (!accountData) {
          this.events.removeListener("accounts-updated", checkSequence);
          return reject(
            new Error(`Account with public address ${publicAddress} not found`),
          );
        }
        logThrottled(
          `Waiting for account sync to complete, ${accountData.head}/${sequence}`,
          1000,
          accountData.head,
        );
        if (accountData.head >= sequence) {
          this.events.removeListener("accounts-updated", checkSequence);
          return resolve();
        }
      };

      // Check initially
      checkSequence();

      // Listen for account updates
      this.events.on("accounts-updated", checkSequence);
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
        head: 0,
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

    for (const [_, account] of this.accounts) {
      account.head = parsedBlock.sequence;
    }
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
