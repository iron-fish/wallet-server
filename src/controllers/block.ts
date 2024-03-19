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

  @Get("block")
  @Response<Error>("400", "Either hash or sequence must be provided")
  @Response<Error>("404", "Block not found")
  public async getBlock(
    @Res() err400: TsoaResponse<400, { reason: string }>,
    @Res() err404: TsoaResponse<404, { reason: string }>,
    @Query() hash?: string,
    @Query() sequence?: number,
  ): Promise<LightBlock> {
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
      err404(404, { reason: "Block not found" });
    }

    return LightBlock.toJSON(
      LightBlock.fromJSON(response.content),
    ) as LightBlock;
  }

  @Get("block-range")
  @Response<Error>("400", "Invalid start or end parameters")
  @Response<Error>("404", "No blocks found in the specified range")
  public async getBlockRange(
    @Res() err400: TsoaResponse<400, { reason: string }>,
    @Res() err404: TsoaResponse<404, { reason: string }>,
    @Query() start: number,
    @Query() end: number,
    @Query() binary: boolean = false,
  ): Promise<LightBlock[] | string[]> {
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

    if (binary) {
      return blocks.map((block) => {
        const binaryBlock = LightBlock.encode(block).finish();
        return Buffer.from(binaryBlock).toString("hex");
      });
    }

    return blocks.map((block) => LightBlock.toJSON(block)) as LightBlock[];
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
