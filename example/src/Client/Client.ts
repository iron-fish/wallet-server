import { credentials } from "@grpc/grpc-js";
import { LightStreamerClient } from "../../../src/models/lightstreamer";
import { BlockProcessor } from "./utils/BlockProcessor";
import { AccountsManager } from "./utils/AccountsManager";
import { BlockCache } from "./utils/BlockCache";

const client = new LightStreamerClient(
  process.env["WALLET_SERVER_HOST"] ?? "localhost:50051",
  credentials.createInsecure(),
);

export class Client {
  private blockCache: BlockCache;
  private blockProcessor: BlockProcessor;
  private accountsManager: AccountsManager;
  private handleStop?: () => void;

  constructor() {
    this.blockCache = new BlockCache();
    this.accountsManager = new AccountsManager(this.blockCache);
    this.blockProcessor = new BlockProcessor(
      client,
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
}
