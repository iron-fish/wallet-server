import { IronfishSdk, RpcClient } from "@ironfish/sdk";
import { logger } from "./logger";

type ClientParams = {
  host: string;
  port: number;
  authToken: string;
};

class IronFishClient {
  private clientRegistry: Map<string, RpcClient> = new Map();

  constructor() {}

  async getClient(
    { host, port, authToken }: ClientParams = {
      host: process.env["NODE_HOST"] ?? "localhost",
      port: Number(process.env["NODE_PORT"] ?? 8020),
      authToken: process.env["NODE_AUTH_TOKEN"] ?? "",
    },
  ) {
    const clientAddress = `${host}:${port}`;
    const storedClient = this.clientRegistry.get(clientAddress);

    if (storedClient) {
      return storedClient;
    }

    const sdk = await IronfishSdk.init({
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

    let client = await sdk.connectRpc(false, true);

    if (!client) {
      // Todo:
      // - Add retry logic
      // - Add error handling
      const error = new Error(
        `Unable to connect to IronFish RPC at ${clientAddress}`,
      );
      logger.error(error.message);
      throw error;
    }

    return client;
  }
}

export const ifClient = new IronFishClient();
