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
import { lightBlockCache } from "@/cache";
import { lightBlock } from "@/utils/light_block";

class LightStreamer implements LightStreamerServer {
  [method: string]: UntypedHandleCall;

  public getBlock: handleUnaryCall<BlockID, LightBlock> = async (
    call,
    callback,
  ) => {
    if (!call.request.hash && !call.request.sequence) {
      callback(new Error("Must provide either hash or sequence"), null);
      return;
    }
    try {
      // attempt cache first
      let block = null;
      if (call.request.hash) {
        block = await lightBlockCache.getBlockByHash(
          call.request.hash.toString("hex"),
        );
      } else if (call.request.sequence) {
        block = await lightBlockCache.getBlockBySequence(call.request.sequence);
      }
      if (block) {
        callback(null, block);
        return;
      }

      // fallback to rpc
      const getBlockParams = call.request.hash
        ? { hash: call.request.hash.toString("hex") }
        : { sequence: call.request.sequence };
      const rpcClient = await ifClient.getClient();
      const response = await rpcClient.chain.getBlock(getBlockParams);
      callback(null, lightBlock(response.content));
    } catch (e) {
      callback(e as Error, null);
    }
  };

  public getServerInfo: handleUnaryCall<Empty, ServerInfo> = async (
    _,
    callback,
  ) => {
    try {
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
    } catch (e) {
      callback(e as Error, null);
    }
  };
}

export { LightStreamer, LightStreamerService };
