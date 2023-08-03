import { IronfishSdk, RpcClient } from "@ironfish/sdk";
import { logger } from "./logger";

type ClientParams = {
  host: string;
  port: number;
  authToken: string;
};

class IronFishClient {
  private sdk: IronfishSdk | null = null;
  private client: RpcClient | null = null;
  private clientAddress: string | null = null;

  constructor() {}

  async updateClient() {}

  async getClient(
    { host, port, authToken }: ClientParams = {
      host: process.env["NODE_HOST"] ?? "localhost",
      port: Number(process.env["NODE_PORT"] ?? 8020),
      authToken: process.env["NODE_AUTH_TOKEN"] ?? "",
    }
  ) {
    const clientAddress = `${host}:${port}`;

    if (this.clientAddress !== clientAddress) {
      this.client = null;
      this.sdk = null;
      this.clientAddress = clientAddress;
    }

    if (this.client) {
      return this.client;
    }

    if (!this.sdk) {
      this.sdk = await IronfishSdk.init({
        configOverrides: {
          enableRpcTls: true,
          enableRpcTcp: true,
          rpcTcpHost: host,
          rpcTcpPort: port,
        },
        internalOverrides: {
          rpcAuthToken: authToken,
        },
      });
    }

    try {
      this.client = await this.sdk.connectRpc(false, true);
    } catch (err) {
      // Todo:
      // - Add retry logic
      // - Add error handling
      logger.error("Error connecting to IronFish RPC", err);
    }

    return this.client;
  }
}

export const ifClient = new IronFishClient();
