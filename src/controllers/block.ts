import {
  Route,
  Get,
  Post,
  Body,
  Query,
  Tags,
  TsoaResponse,
  Response,
  Res,
} from "tsoa";
import { ifClient } from "../utils/ironfish"; // Adjust the import path as needed
import { lightBlockCache } from "../cache"; // Adjust the import path as needed
import { LightBlock } from "../models/lightstreamer";

@Route("/")
@Tags("Block Controller")
export class BlockController {
  /**
   * Retrieves the latest block on the remote node, the block hash and sequence number.
   */
  @Get("latest-block")
  public async getLatestBlock() {
    const rpcClient = await ifClient.getClient();
    const response = await rpcClient.chain.getChainInfo();
    return {
      sequence: Number(response.content.currentBlockIdentifier.index),
      hash: response.content.currentBlockIdentifier.hash,
    };
  }

  /**
   * Broadcasts a transaction to the network. Input is a hex encoded string of the `Transaction` to broadcast.
   * @param transaction The hex encoded string `Transaction` to broadcast
   * @returns if the transaction was accepted, the hash of the transaction
   */
  @Post("transaction")
  @Response<Error>("400", "Error broadcasting transaction")
  public async broadcastTransaction(
    @Body() transaction: string,
    @Res() err: TsoaResponse<400, { reason: string }>,
  ) {
    const rpcClient = await ifClient.getClient();
    const response = await rpcClient.chain.broadcastTransaction({
      transaction,
    });
    if (!response.content) {
      return err(400, { reason: "Either hash or sequence must be provided" });
    }
    return {
      accepted: response.content.accepted,
      hash: response.content.hash,
    };
  }

  /**
   * Retrieves a block from the network. The block can be specified by its hash or sequence number.
   * If neither is provided, a 400 error is returned. If the block is not found, a 404 error is returned.
   * @param hash The hash of the block to retrieve
   * @param sequence The sequence number of the block to retrieve
   * @returns The hex encoded string representation of the block
   */
  @Get("block")
  @Response<Error>("400", "Either hash or sequence must be provided")
  @Response<Error>("404", "Block not found")
  public async getBlock(
    @Res() err400: TsoaResponse<400, { reason: string }>,
    @Res() err404: TsoaResponse<404, { reason: string }>,
    @Query() hash?: string,
    @Query() sequence?: number,
  ): Promise<string> {
    if (!hash && !sequence) {
      err400(400, { reason: "Either hash or sequence must be provided" });
    }

    let block = null;
    if (hash) {
      block = await lightBlockCache.getBlockByHash(String(hash));
    } else if (sequence) {
      block = await lightBlockCache.getBlockBySequence(Number(sequence));
    }

    if (block) {
      return Buffer.from(LightBlock.encode(block).finish()).toString("hex");
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
      err404(404, { reason: "Block not found" });
    }

    return Buffer.from(
      LightBlock.encode(LightBlock.fromJSON(response.content)).finish(),
    ).toString("hex");
  }

  /**
   * Retrieves a range of blocks from the network. The range is specified by a start and end sequence number.
   * If either start or end is invalid, a 400 error is returned. If no blocks are found in the specified range, a 404 error is returned.
   * @param start The sequence number of the first block in the range to retrieve
   * @param end The sequence number of the last block in the range to retrieve
   * @returns An array of hex encoded string representations of the blocks
   */
  @Get("block-range")
  @Response<Error>("400", "Invalid start or end parameters")
  @Response<Error>("404", "No blocks found in the specified range")
  public async getBlockRange(
    @Res() err400: TsoaResponse<400, { reason: string }>,
    @Res() err404: TsoaResponse<404, { reason: string }>,
    @Query() start: number,
    @Query() end: number,
  ): Promise<string[]> {
    if (isNaN(start) || isNaN(end)) {
      err400(400, { reason: "Invalid start or end parameters" });
    }

    // Implement the logic to fetch the block range
    // Placeholder logic: Fetch blocks from cache or database
    const blocks: LightBlock[] = [];
    for (let i = start; i <= end; i++) {
      const block = await lightBlockCache.getBlockBySequence(i);
      if (block) {
        blocks.push(block);
      }
    }

    // Handle cases where no blocks are found
    if (blocks.length === 0) {
      err404(404, { reason: "No blocks found in the specified range" });
    }

    return blocks.map((block) => {
      const binaryBlock = LightBlock.encode(block).finish();
      return Buffer.from(binaryBlock).toString("hex");
    });
  }

  /**
   * Retrieves the server information, including the version, vendor, network ID, node version, node status, block height, and block hash.
   */
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
