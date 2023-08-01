import { IronfishSdk, RpcClient } from "@ironfish/sdk";
import { logger } from "./logger";

let sdk: IronfishSdk | null = null;
let rpcClient: RpcClient | null = null;

export async function getIronFishClient(): Promise<RpcClient | null> {
  if (rpcClient) {
    return rpcClient;
  }

  if (!sdk) {
    sdk = await IronfishSdk.init();
  }

  try {
    rpcClient = await sdk.connectRpc(false, true);
  } catch (err) {
    // Todo:
    // - Add retry logic
    // - Add error handling
    logger.error("Error connecting to IronFish RPC", err);
  }

  return rpcClient;
}
