import { status, UntypedHandleCall } from "@grpc/grpc-js";
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
import { ServiceError } from "@/utils/error";
import { handle } from "@/utils/server";

class LightStreamer implements LightStreamerServer {
  [method: string]: UntypedHandleCall;

  public getBlock = handle<BlockID, LightBlock>(async (call, callback) => {
    if (!call.request.hash && !call.request.sequence) {
      callback(
        new ServiceError(
          status.INVALID_ARGUMENT,
          "Either hash or sequence must be provided",
        ),
        null,
      );
      return;
    }

    const getBlockParams = call.request.hash
      ? { hash: call.request.hash.toString("hex") }
      : { sequence: call.request.sequence };

    const rpcClient = await ifClient.getClient();

    // this line will change to Cache.getBlock once cache is implemented
    const response = await rpcClient?.chain.getBlock(getBlockParams);

    if (!response) {
      callback(
        new ServiceError(status.FAILED_PRECONDITION, "Block not found"),
        null,
      );
    }

    callback(null, lightBlock(response.content));
  });

  public getServerInfo = handle<Empty, ServerInfo>(async (_, callback) => {
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
  });
}

export { LightStreamer, LightStreamerService };
