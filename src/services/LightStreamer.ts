import {
  status,
  handleServerStreamingCall,
  UntypedHandleCall,
} from "@grpc/grpc-js";
import {
  Empty,
  LightStreamerServer,
  ServerInfo,
  LightStreamerService,
  LightBlock,
  BlockID,
  BlockRange,
  Transaction,
  SendResponse,
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
  public sendTransaction = handle<Transaction, SendResponse>(async (
    call,
    callback,
  ) => {
    const rpcClient = await ifClient.getClient();
    const response = await rpcClient.chain.broadcastTransaction({
      transaction: call.request.data.toString("hex"),
    });
    if (!response.content) {
      callback(
        new Error(
          "No data was returned when trying to broadcast the transaction",
        ),
        null,
      );
      return;
    }
    callback(null, {
      accepted: response.content.accepted,
      hash: Buffer.from(response.content.hash, "hex"),
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

  public getBlockRange: handleServerStreamingCall<BlockRange, LightBlock> =
    async (call) => {
      if (!call.request.start?.sequence || !call.request.end?.sequence) {
        call.emit("error", {
          code: status.INVALID_ARGUMENT,
          details: "Must provide sequence for start and end",
        });
        call.end();
        return;
      }
      if (call.request.start.sequence >= call.request.end.sequence) {
        call.emit("error", {
          code: status.INVALID_ARGUMENT,
          details: "End sequence must be greater than start sequence",
        });
        call.end();
        return;
      }
      try {
        for (
          let i = call.request.start.sequence;
          i <= call.request.end.sequence;
          i++
        ) {
          let block = await lightBlockCache.getBlockBySequence(i);
          if (block) {
            call.write(block);
            continue;
          }
          // fallback to rpc
          const rpcClient = await ifClient.getClient();
          const response = await rpcClient.chain.getBlock({ sequence: i });
          block = lightBlock(response.content);
          call.write(block);
        }
      } catch (e) {
        call.emit("error", {
          code: status.INTERNAL,
          details: (e as Error).message,
        });
      }
      call.end();
    };

  public getServerInfo = handle<Empty, ServerInfo>( async (
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
