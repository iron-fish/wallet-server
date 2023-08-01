import { IronfishSdk, RpcClient } from "@ironfish/sdk";
import { logger } from "./logger";

let rpcClient: RpcClient | null = null;

export async function getIronFishClient(): Promise<RpcClient | null> {
  if (rpcClient) {
    return rpcClient;
  }

  const sdk = await IronfishSdk.init();

  try {
    rpcClient = await sdk.connectRpc(false, true);
  } catch (err) {
    logger.error("Error connecting to IronFish RPC", err);
  }

  return rpcClient;
}
