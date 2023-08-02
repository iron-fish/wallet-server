import { IronfishSdk, RpcTcpClient } from "@ironfish/sdk";

type ClientParams = {
  host: string;
  port: number;
  authToken: string;
};

type ClientRegistry = Map<string, Map<string, RpcTcpClient>>;

class IronFishClient {
  private clientRegistry: ClientRegistry = new Map();
  // private sdk: IronfishSdk | null = null;

  constructor() {
    // this.init();
  }

  // private async init(
  //   { host, port, authToken }: ClientParams = {
  //     host: process.env["NODE_HOST"] ?? "localhost",
  //     port: Number(process.env["NODE_PORT"] ?? 8020),
  //     authToken: process.env["NODE_AUTH_TOKEN"] ?? "",
  //   }
  // ) {
  //   this.sdk = await IronfishSdk.init({
  //     configOverrides: {
  //       enableRpcTls: true,
  //       enableRpcTcp: true,
  //       rpcTcpHost: host,
  //       rpcTcpPort: port,
  //     },
  //     internalOverrides: {
  //       rpcAuthToken: authToken,
  //     },
  //   });
  // }

  private getOrCreateClient({ host, port, authToken }: ClientParams) {
    if (!this.clientRegistry.has(host)) {
      this.clientRegistry.set(host, new Map());
    }

    const hostMap = this.clientRegistry.get(host);

    if (!hostMap) {
      throw new Error("Host map not found");
    }

    const storedClient = hostMap.get(port.toString());

    if (storedClient) {
      return storedClient;
    }

    const client = new RpcTcpClient(host, port, undefined, authToken);

    hostMap.set(port.toString(), client);

    return client;
  }

  async getClient(
    { host, port, authToken }: ClientParams = {
      host: process.env["NODE_HOST"] ?? "localhost",
      port: Number(process.env["NODE_PORT"] ?? 8020),
      authToken: process.env["NODE_AUTH_TOKEN"] ?? "",
    }
  ) {
    await IronfishSdk.init();

    const client = this.getOrCreateClient({ host, port, authToken });

    if (client.isConnected) {
      return client;
    }

    await client.connect();

    return client;
  }
}

export const ifClient = new IronFishClient();
