import { GetBlockResponse, FollowChainStreamResponse } from '@ironfish/sdk'
import { LightBlock, LightOutput, LightSpend, LightTransaction } from "src/models/lightstreamer"

export function lightBlock(response: FollowChainStreamResponse | GetBlockResponse): LightBlock {
	let lightTransactions: LightTransaction[] = []
    let previousBlockHash = 'previous' in response.block ? response.block.previous : response.block.previousBlockHash
	for (let index = 0; index < response.block.transactions.length; index++) {
        const rpcTransaction = response.block.transactions[index]
        let lightSpends: LightSpend[] = []
		let lightOutputs: LightOutput[] = []
		
        // Stubbed until changes in @ironfish/sdk are released
        // const serialized = ''
        // if (rpcTransaction.serialized === undefined) {
        //     throw new Error("Transaction is missing serialized data")
        // }
        // const serialized = rpcTransaction.serialized
        // let transaction	= new Transaction(Buffer.from(serialized, 'hex'))
		// for (const spend of transaction.spends) {
		// 	lightSpends.push({nf: spend.nullifier})
		// }
		// for (const note of transaction.notes) {
		// 	lightOutputs.push({note: note.serialize()})
		// }
		lightTransactions.push(
			{index, hash: Buffer.from(rpcTransaction.hash, 'hex'), spends: lightSpends, outputs: lightOutputs}
		)
	}
	return {
        protoVersion: 1,
        sequence: response.block.sequence,
        hash: Buffer.from(response.block.hash, 'hex'),
        previousBlockHash: Buffer.from(previousBlockHash, 'hex'),
		timestamp: response.block.timestamp,
		transactions: lightTransactions
    }
}
