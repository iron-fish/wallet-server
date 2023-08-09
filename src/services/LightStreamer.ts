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
import { lightBlock } from "@/utils/lightBlock";
import { lightBlockCache } from "@/cache";
import { ServiceError, handle } from "@/utils/grpc";

class LightStreamer implements LightStreamerServer {
  [method: string]: UntypedHandleCall;

  public getLatestBlock = handle<Empty, BlockID>(async (_, callback) => {
    const rpcClient = await ifClient.getClient();
    const response = await rpcClient.chain.getChainInfo();
    callback(null, {
      sequence: Number(response.content.currentBlockIdentifier.index),
      hash: Buffer.from(response.content.currentBlockIdentifier.hash, "hex"),
    });
  });

  public getBlock = handle<BlockID, LightBlock>(async (call, callback) => {
    if (!call.request.hash && !call.request.sequence) {
      throw new ServiceError(
        status.INVALID_ARGUMENT,
        "Either hash or sequence must be provided",
      );
    }

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

    if (!response) {
      throw new ServiceError(status.FAILED_PRECONDITION, "Block not found");
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
        networkId: nodeStatus?.content.node.networkId,
        nodeVersion: nodeStatus?.content.node.version,
        nodeStatus: nodeStatus?.content.node.status,
        blockHeight: nodeStatus?.content.blockchain.head.sequence,
        blockHash: nodeStatus?.content.blockchain.head.hash,
      }),
    );
  });
}

export { LightStreamer, LightStreamerService };
