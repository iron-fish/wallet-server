import { handleUnaryCall, UntypedHandleCall } from "@grpc/grpc-js";
import {
  Empty,
  LightStreamerServer,
  ServerInfo,
  LightStreamerService,
  LightBlock,
  BlockID,
} from "@/models/lightstreamer";
import { ifClient } from "@/utils/ironfish";
import { lightBlock } from "@/utils/light_block";

class LightStreamer implements LightStreamerServer {
  [method: string]: UntypedHandleCall;

  public getBlock: handleUnaryCall<BlockID, LightBlock> = async (
    call,
    callback,
  ) => {
    let err = null;
    if (!call.request.hash && !call.request.sequence) {
      err = new Error("Either hash or sequence must be provided");
    }

    const getBlockParams = call.request.hash
      ? { hash: call.request.hash.toString("hex") }
      : { sequence: call.request.sequence };
    const rpcClient = await ifClient.getClient();
    // this line will change to Cache.getBlock once cache is implemented
    const response = await rpcClient?.chain.getBlock(getBlockParams);
    if (response === undefined) {
      err = new Error("Block not found");
    }

    callback(err, response ? lightBlock(response.content) : null);
  };

  public getServerInfo: handleUnaryCall<Empty, ServerInfo> = async (
    _,
    callback,
  ) => {
    const rpcClient = await ifClient.getClient();
    const nodeStatus = await rpcClient.node.getStatus();

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
      }),
    );
  };
}

export { LightStreamer, LightStreamerService };
