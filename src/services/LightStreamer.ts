import { handleUnaryCall, UntypedHandleCall } from "@grpc/grpc-js";
import {
  Empty,
  LightStreamerServer,
  ServerInfo,
  LightStreamerService,
} from "../models/lightstreamer";
import { getIronFishClient } from "../utils/ironfish";

class LightStreamer implements LightStreamerServer {
  [method: string]: UntypedHandleCall;

  public getServerInfo: handleUnaryCall<Empty, ServerInfo> = async (
    _,
    callback
  ) => {
    const rpcClient = await getIronFishClient();
    const nodeStatus = await rpcClient?.node.getStatus();

    callback(
      null,
      ServerInfo.fromJSON({
        version: "0",
        vendor: "IF Labs",
        networkId: nodeStatus?.content.node.networkId ?? "",
        nodeVersion: nodeStatus?.content.node.version ?? "",
        nodeStatus: nodeStatus?.content.node.status ?? "",
        blockHeight: nodeStatus?.content.blockchain.head.sequence ?? 0,
        blockHash: nodeStatus?.content.blockchain.head.hash ?? "",
      })
    );
  };
}

export { LightStreamer, LightStreamerService };
