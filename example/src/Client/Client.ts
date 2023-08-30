import { credentials } from "@grpc/grpc-js";
import { LightStreamerClient } from "../../../src/models/lightstreamer";
import { BlockProcessor } from "./utils/BlockProcessor";
import { AccountsManager } from "./utils/AccountsManager";
import { BlockCache } from "./utils/BlockCache";

const client = new LightStreamerClient(
  "localhost:50051",
  credentials.createInsecure(),
);

export class Client {
  private blockCache: BlockCache;
  private blockProcessor: BlockProcessor;
  private accountsManager: AccountsManager;
  private handleStop?: () => void;

  constructor() {
    this.blockCache = new BlockCache();
    this.blockProcessor = new BlockProcessor(client, this.blockCache);
    this.accountsManager = new AccountsManager(this.blockCache);
  }

  public addAccount(privateKey: string) {
    this.accountsManager.addAccount(privateKey);
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
