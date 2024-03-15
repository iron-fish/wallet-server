import { Route, Get, Post, Body, Query, Tags } from "tsoa";
import { ifClient } from "../utils/ironfish"; // Adjust the import path as needed
import { lightBlockCache } from "../cache"; // Adjust the import path as needed
import { LightBlock } from "../models/lightstreamer";

@Route("/")
@Tags("Block Controller")
export class BlockController {
  @Get("latest-block")
  public async getLatestBlock() {
    const rpcClient = await ifClient.getClient();
    const response = await rpcClient.chain.getChainInfo();
    return {
      sequence: Number(response.content.currentBlockIdentifier.index),
      hash: response.content.currentBlockIdentifier.hash,
    };
  }

  @Post("transaction")
  public async postTransaction(@Body() transaction: string) {
    const rpcClient = await ifClient.getClient();
    const response = await rpcClient.chain.broadcastTransaction({
      transaction,
    });
    if (!response.content) {
      throw new Error("Error broadcasting transaction");
    }
    return {
      accepted: response.content.accepted,
      hash: response.content.hash,
    };
  }

  @Get("block")
  public async getBlock(
    @Query() hash?: string,
    @Query() sequence?: number,
  ): Promise<LightBlock> {
    if (!hash && !sequence) {
      throw new Error("Either hash or sequence must be provided");
    }

    let block = null;
    if (hash) {
      block = await lightBlockCache.getBlockByHash(String(hash));
    } else if (sequence) {
      block = await lightBlockCache.getBlockBySequence(Number(sequence));
    }

    if (block) {
      return LightBlock.toJSON(block) as LightBlock;
    }

    // fallback to rpc
    const getBlockParams = hash
      ? { hash: String(hash) }
      : { sequence: Number(sequence) };
    const rpcClient = await ifClient.getClient();
    const response = await rpcClient.chain.getBlock({
      ...getBlockParams,
      serialized: true,
    });

    if (!response) {
      throw new Error("Block not found");
    }

    return LightBlock.toJSON(
      LightBlock.fromJSON(response.content),
    ) as LightBlock;
  }

  @Get("block-range")
  public async getBlockRange(
    @Query() start: number,
    @Query() end: number,
  ): Promise<LightBlock[]> {
    if (isNaN(start) || isNaN(end)) {
      throw new Error("Invalid start or end parameters");
    }

    // Implement the logic to fetch the block range
    // Placeholder logic: Fetch blocks from cache or database
    const blocks = [];
    for (let i = start; i <= end; i++) {
      const block = await lightBlockCache.getBlockBySequence(i);
      if (block) {
        blocks.push(LightBlock.toJSON(block));
      }
    }

    // Handle cases where no blocks are found
    if (blocks.length === 0) {
      throw new Error("No blocks found in the specified range");
    }

    return blocks as LightBlock[];
  }

  @Get("server-info")
  public async getServerInfo() {
    const rpcClient = await ifClient.getClient();
    const nodeStatus = await rpcClient.node.getStatus();
    const serverInfo = {
      version: "0",
      vendor: "IF Labs",
      networkId: nodeStatus?.content.node.networkId,
      nodeVersion: nodeStatus?.content.node.version,
      nodeStatus: nodeStatus?.content.node.status,
      blockHeight: nodeStatus?.content.blockchain.head.sequence,
      blockHash: nodeStatus?.content.blockchain.head.hash,
    };
    return serverInfo;
  }
}
